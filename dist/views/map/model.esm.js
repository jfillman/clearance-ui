import { fan, assignLanes, simplify, roundedPath, segments, segHitsRect } from './layout.esm.js';

const WINDOWS = [
  { id: "15m", label: "15 m", ms: 15 * 6e4 },
  { id: "1h", label: "1 h", ms: 60 * 6e4 },
  { id: "24h", label: "24 h", ms: 24 * 60 * 6e4 },
  { id: "7d", label: "7 d", ms: 7 * 24 * 60 * 6e4 }
];
const MATRIX_THRESHOLD = 40;
const ROW_CAP = 12;
const GATE = { x: 0, w: 232, minH: 100, gap: 14 };
const GROUP = { w: 270, minHead: 92, row: 46, pad: 10, gap: 16 };
const OBSERVER = { w: 160, minH: 84, gap: 14 };
const TOP = 44;
const EDGE_PITCH = 9;
const MAX_STROKE = 6;
const statusRank = (s) => ({ down: 2, attention: 1 })[s] ?? 0;
const NO_FILTERS = { attentionOnly: false, query: "", registry: "all" };
const norm = (s) => (s ?? "").toLowerCase();
function targetMatches(t, query) {
  const q = norm(query).trim();
  if (!q) return true;
  return [t.name, t.id, t.app, t.group, t.owner, t.env, t.kind, ...t.gates.flatMap((g) => [g.type, g.instance])].some((v) => norm(v).includes(q));
}
function registryTiers(targets) {
  const tiers = [...new Set(targets.map((t) => t.registry).filter((r) => !!r))].sort();
  return tiers.length > 1 ? tiers : [];
}
const place = (x, y, w, h) => ({ x, y, w, h, cx: x + w / 2, cy: y + h / 2 });
const GATE_WORDS = {
  glidepath: { name: "Glidepath clearance-gate", kind: "PR check" },
  "g-argo": { name: "G-ARGO", kind: "Argo CD sync" },
  "g-tf": { name: "G-TF", kind: "Terraform plan" },
  autopilot: { name: "Autopilot tool gate", kind: "runtime" },
  github: { name: "GitHub deployment protection", kind: "GitHub App" }
};
const gateWords = (type) => GATE_WORDS[type] ?? { name: type, kind: "gate" };
const edgeWidth = (volume) => Math.min(MAX_STROKE, 1.5 + 0.4 * Math.log2(1 + Math.max(0, volume)));
const matchCount = (q, groupHit, mine, hits) => {
  if (!q) return 0;
  return groupHit ? mine.length : mine.filter(hits).length;
};
const shownRows = (q, groupHit, mine, hits) => q ? mine.filter((t) => groupHit || hits(t)) : mine;
const textWidth = (s) => s.length * 6.6 + 8;
const labelText = (e) => {
  if (e.kind === "watches") return { down: "blind", attention: "stale" }[e.status];
  if (e.holding > 0) return `${e.holding} holding`;
  if (e.refused > 0) return `${e.refused} refused`;
  return void 0;
};
function buildTopology(map, filters, expanded) {
  const all = map.nodes.targets;
  const q = filters.query.trim();
  const targets = filters.registry === "all" ? all : all.filter((t) => t.registry === filters.registry);
  const matrix = all.length > MATRIX_THRESHOLD;
  const filteringTargets = filters.registry !== "all";
  const byGroup = /* @__PURE__ */ new Map();
  for (const t of targets) byGroup.set(t.group, [...byGroup.get(t.group) ?? [], t]);
  const hits = (t) => !q || targetMatches(t, q);
  const pre = [];
  for (const node of map.nodes.groups) {
    const mine = byGroup.get(node.group) ?? [];
    if (filteringTargets && mine.length === 0) continue;
    const groupHit = !!q && norm(node.group).includes(norm(q));
    const matches = matchCount(q, groupHit, mine, hits);
    const open = !matrix && (expanded.includes(node.group) || !!q && matches > 0 && matches < mine.length);
    const showable = open ? shownRows(q, groupHit, mine, hits) : [];
    const ordered = [...showable].sort((a, b) => statusRank(b.status) - statusRank(a.status) || a.name.localeCompare(b.name));
    pre.push({ node, mine, open, drawn: ordered.slice(0, ROW_CAP), hidden: Math.max(0, ordered.length - ROW_CAP), matches, groupHit });
  }
  const preById = new Map(pre.map((p) => [p.node.id, p]));
  const rowOwner = new Map(pre.flatMap((p) => p.drawn.map((t) => [`target:${t.id}`, p])));
  const usable = map.edges.map((edge, index) => ({ edge, index, owner: preById.get(edge.to) ?? rowOwner.get(edge.to) })).filter((e) => !!e.owner);
  const inCount = /* @__PURE__ */ new Map();
  const outCount = /* @__PURE__ */ new Map();
  const bump = (m, k) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const { edge, owner } of usable) {
    bump(edge.kind === "guards" ? inCount : outCount, owner.node.id);
    bump(edge.kind === "guards" ? outCount : inCount, edge.from);
  }
  const need = (id, min) => Math.max(min, 28 + Math.max(inCount.get(id) ?? 0, outCount.get(id) ?? 0) * EDGE_PITCH);
  const groups = [];
  let y = TOP;
  const guardEdges = usable.filter((e) => e.edge.kind === "guards");
  const watchEdges = usable.filter((e) => e.edge.kind === "watches");
  const gutterA = Math.min(260, Math.max(150, 60 + guardEdges.length * 12));
  const gutterB = Math.min(200, Math.max(110, 50 + watchEdges.length * 10));
  const groupX = GATE.x + GATE.w + gutterA;
  const observerX = groupX + GROUP.w + gutterB;
  for (const p of pre) {
    const head = need(p.node.id, GROUP.minHead);
    const h = p.open ? head + GROUP.pad + p.drawn.length * GROUP.row + (p.hidden > 0 ? 24 : 0) + GROUP.pad : head;
    const top = y;
    const rows = p.drawn.map((target, i) => ({
      target,
      ...place(groupX + 10, top + head + GROUP.pad + i * GROUP.row, GROUP.w - 20, GROUP.row - 4),
      dim: filters.attentionOnly && target.status === "ok"
    }));
    groups.push({
      node: p.node,
      ...place(groupX, top, GROUP.w, h),
      expanded: p.open,
      head,
      targets: p.mine,
      registries: [...new Set(p.mine.map((t) => t.registry).filter((r) => !!r))],
      envs: [...new Set(p.mine.map((t) => t.env).filter((r) => !!r))],
      rows,
      hiddenRows: p.hidden,
      dim: filters.attentionOnly && p.node.status === "ok" || !!q && !p.groupHit && p.matches === 0,
      matches: p.matches
    });
    y += h + GROUP.gap;
  }
  const groupById = new Map(groups.map((g) => [g.node.id, g]));
  const rowById = new Map(groups.flatMap((g) => g.rows.map((r) => [`target:${r.target.id}`, r])));
  const guardedTypes = new Set(targets.flatMap((t) => t.gates.map((g) => g.type)));
  const gateNodes = map.nodes.gate_types.filter((g) => !filteringTargets || guardedTypes.has(g.type));
  const gateHit = (g) => !q || norm(g.type).includes(norm(q)) || targets.some((t) => hits(t) && t.gates.some((x) => x.type === g.type));
  const centreOf = (id, kind) => {
    const ys = usable.filter((e) => e.edge.kind === kind && e.edge.from === id).map((e) => (rowById.get(e.edge.to) ?? groupById.get(e.owner.node.id)).cy);
    return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : void 0;
  };
  const byCentre = (items, id, kind) => items.map((item, i) => ({ item, i, c: centreOf(id(item), kind) })).sort((a, b) => (a.c ?? Infinity) - (b.c ?? Infinity) || a.i - b.i).map((s) => s.item);
  const stack = (items, id, minH, gap, make) => {
    let at = TOP;
    return items.map((item) => {
      const h = need(id(item), minH);
      const p = place(0, at, 0, h);
      at += h + gap;
      return make(item, p);
    });
  };
  const gates = stack(byCentre(gateNodes, (g) => g.id, "guards"), (g) => g.id, GATE.minH, GATE.gap, (node, p) => ({
    node,
    ...place(GATE.x, p.y, GATE.w, p.h),
    ...gateWords(node.type),
    dim: filters.attentionOnly && node.status === "ok" || !gateHit(node)
  }));
  const observers = stack(byCentre(map.nodes.observers, (o) => o.id, "watches"), (o) => o.id, OBSERVER.minH, OBSERVER.gap, (node, p) => ({
    node,
    ...place(observerX, p.y, OBSERVER.w, p.h),
    dim: filters.attentionOnly && node.status === "ok"
  }));
  const gateById = new Map(gates.map((g) => [g.node.id, g]));
  const obsById = new Map(observers.map((o) => [o.node.id, o]));
  const resolved = [];
  for (const { edge, index, owner } of usable) {
    const src = edge.kind === "guards" ? gateById.get(edge.from) : obsById.get(edge.from);
    if (!src) continue;
    resolved.push({ edge, index, src, group: groupById.get(owner.node.id), row: rowById.get(edge.to) });
  }
  const attachSrc = /* @__PURE__ */ new Map();
  const attachDst = /* @__PURE__ */ new Map();
  const byNode = /* @__PURE__ */ new Map();
  for (const r of resolved) byNode.set(r.edge.from, [...byNode.get(r.edge.from) ?? [], r]);
  for (const list of byNode.values()) {
    const src = list[0].src;
    const dest = (r) => r.row ? r.row.cy : r.group.y + r.group.head / 2;
    const sorted = [...list].sort((a, b) => dest(a) - dest(b) || a.index - b.index);
    fan(sorted.length, src.y + 12, src.y + src.h - 12, EDGE_PITCH).forEach((v, i) => attachSrc.set(sorted[i].index, v));
  }
  for (const g of groups) {
    for (const side of ["guards", "watches"]) {
      const mine = resolved.filter((r) => r.group === g && r.edge.kind === side);
      const head = mine.filter((r) => !r.row).sort((a, b) => a.src.cy - b.src.cy || a.index - b.index);
      fan(head.length, g.y + 12, g.y + g.head - 12, EDGE_PITCH).forEach((v, i) => attachDst.set(head[i].index, v));
      for (const row of g.rows) {
        const hit = mine.filter((r) => r.row === row).sort((a, b) => a.src.cy - b.src.cy || a.index - b.index);
        fan(hit.length, row.y + 6, row.y + row.h - 6, 6).forEach((v, i) => attachDst.set(hit[i].index, v));
      }
    }
  }
  const gate = { x0: GATE.x + GATE.w, x1: groupX };
  const watch = { x0: groupX + GROUP.w, x1: observerX };
  const laneFor = /* @__PURE__ */ new Map();
  const guards = resolved.filter((r) => r.edge.kind === "guards");
  const watches = resolved.filter((r) => r.edge.kind === "watches");
  const pad = 14;
  assignLanes(guards.map((r) => ({ xs: gate.x0, sy: attachSrc.get(r.index), xe: gate.x1, ty: attachDst.get(r.index) })), gate.x0 + pad, gate.x1 - pad).forEach((x, i) => laneFor.set(guards[i].index, x));
  assignLanes(watches.map((r) => ({ xs: watch.x1, sy: attachSrc.get(r.index), xe: watch.x0, ty: attachDst.get(r.index) })), watch.x0 + pad, watch.x1 - pad).forEach((x, i) => laneFor.set(watches[i].index, x));
  const edges = resolved.map((r) => {
    const g = r.edge.kind === "guards";
    const sy = attachSrc.get(r.index);
    const ty = attachDst.get(r.index);
    const xs = g ? gate.x0 : watch.x1;
    const xe = g ? gate.x1 : watch.x0;
    const lane = laneFor.get(r.index);
    const raw = sy === ty ? [{ x: xs, y: sy }, { x: xe, y: ty }] : [{ x: xs, y: sy }, { x: lane, y: sy }, { x: lane, y: ty }, { x: xe, y: ty }];
    const points = simplify(raw);
    const dim = r.src.dim || (r.row ? r.row.dim : r.group.dim) || filters.attentionOnly && r.edge.status === "ok";
    return { id: `${r.edge.from}>${r.edge.to}`, edge: r.edge, points, d: roundedPath(points), width: g ? Math.min(edgeWidth(r.edge.volume), MAX_STROKE) : 1.5, dim };
  });
  const boxes = [...gates, ...groups, ...observers];
  const allSegs = edges.map((e) => segments(e.points));
  edges.forEach((e, ei) => {
    const text = labelText(e.edge);
    if (!text) return;
    const w = textWidth(text);
    const segs = segments(e.points).filter((s) => s.a.y === s.b.y);
    for (const s of [segs[0], segs[segs.length - 1]]) {
      if (!s) continue;
      const lo = Math.min(s.a.x, s.b.x);
      const hi = Math.max(s.a.x, s.b.x);
      if (hi - lo < w + 10) continue;
      const startAtLeft = s === segs[0] ? s.a.x <= s.b.x : s.b.x <= s.a.x;
      const x = startAtLeft ? lo + 5 : hi - 5 - w;
      const box = { x, y: s.a.y - 16, w, h: 14 };
      const clear = allSegs.every((ss, i) => i === ei || ss.every((o) => !segHitsRect(o, box, false))) && boxes.every((b) => !(box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y));
      if (clear) {
        e.label = { text, x: x + w / 2, y: s.a.y - 5, anchor: "start", w };
        break;
      }
    }
  });
  const bottom = (xs) => xs.reduce((m, p) => Math.max(m, p.y + p.h), 0);
  const height = Math.max(bottom(gates), bottom(groups), bottom(observers), 60) + 6;
  const instances = gateNodes.reduce((n, g) => n + g.instances, 0);
  const shown = groups.reduce((n, g) => n + g.targets.length, 0);
  const columns = [
    { key: "gates", x: GATE.x, w: GATE.w, label: "Gate types", sub: `${instances} instances` },
    { key: "core", x: gate.x0, w: gate.x1 - gate.x0, label: "Clearance core", sub: "decides \xB7 records" },
    { key: "targets", x: groupX, w: GROUP.w, label: "Protected targets", sub: `${shown} in ${groups.length} ${groups.length === 1 ? "group" : "groups"}` },
    { key: "observers", x: observerX, w: OBSERVER.w, label: "Observers", sub: "watch the targets" }
  ];
  return {
    width: observerX + OBSERVER.w,
    height,
    columns,
    core: { x: gate.x0 + 6, y: TOP - 8, w: gate.x1 - gate.x0 - 12, h: height - TOP + 8 },
    gates,
    groups,
    observers,
    edges,
    matrix,
    targets
  };
}
function visibleAttention(items, filters, targets) {
  const q = filters.query.trim();
  const reg = filters.registry === "all" ? void 0 : new Set(targets.map((t) => t.id));
  const order = { down: 0, attention: 1, info: 2 };
  const bySeverity = [...items].sort((a, b) => order[a.severity] - order[b.severity]);
  return bySeverity.filter((item) => {
    if (reg && item.targets.length > 0 && !item.targets.some((id) => reg.has(id))) return false;
    if (!q) return true;
    const names = targets.filter((t) => item.targets.includes(t.id) || item.targets.includes(t.name));
    return [item.title, item.detail, item.gate_type, item.instance, item.kind].some((v) => norm(v).includes(norm(q))) || names.some((t) => targetMatches(t, q));
  });
}
function groupsOf(item, targets) {
  const ids = new Set(item.targets);
  return [...new Set(targets.filter((t) => ids.has(t.id) || ids.has(t.name)).map((t) => t.group))];
}
function soleTarget(item, targets) {
  if (item.targets.length !== 1) return void 0;
  return targets.find((t) => t.id === item.targets[0] || t.name === item.targets[0]);
}
function buildMatrix(map, targets) {
  const gateTypes = map.nodes.gate_types.map((g) => g.type);
  const sorted = [...targets].sort((a, b) => statusRank(b.status) - statusRank(a.status) || a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  return {
    gateTypes,
    targets: sorted,
    cell: (type, t) => {
      const g = t.gates.find((x) => x.type === type);
      if (!g) return "none";
      if (g.silent) return "silent";
      return g.mode === "flag" ? "flag" : "enforce";
    }
  };
}
const registryEmpty = (map) => map.registry.targets === 0 && map.nodes.targets.length === 0;
const COVERAGE_ORDER = ["authorized-and-verified", "observed-not-attributed", "out-of-band-detected", "coverage-unavailable", "break-glass", "attempted-refused", "unassessed"];
const lanePartials = (p) => p.filter((n) => n.field.startsWith("lanes"));
const otherPartials = (p) => p.filter((n) => !n.field.startsWith("lanes"));

export { COVERAGE_ORDER, EDGE_PITCH, MATRIX_THRESHOLD, NO_FILTERS, ROW_CAP, WINDOWS, buildMatrix, buildTopology, edgeWidth, gateWords, groupsOf, lanePartials, otherPartials, registryEmpty, registryTiers, soleTarget, statusRank, targetMatches, visibleAttention };
//# sourceMappingURL=model.esm.js.map
