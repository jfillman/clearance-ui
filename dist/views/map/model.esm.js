const WINDOWS = [
  { id: "15m", label: "15 m", ms: 15 * 6e4 },
  { id: "1h", label: "1 h", ms: 60 * 6e4 },
  { id: "24h", label: "24 h", ms: 24 * 60 * 6e4 },
  { id: "7d", label: "7 d", ms: 7 * 24 * 60 * 6e4 }
];
const MATRIX_THRESHOLD = 40;
const ROW_CAP = 12;
const WIDTH = 860;
const GATE = { x: 0, w: 230, h: 88, gap: 12 };
const GROUP = { x: 330, w: 290, head: 60, row: 28, pad: 10, gap: 12 };
const OBSERVER = { x: 720, w: 140, h: 52, gap: 12 };
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
const edgeWidth = (volume) => Math.min(9, 1.5 + 0.7 * Math.log2(1 + Math.max(0, volume)));
function orthogonal(x0, y0, x1, y1, lane) {
  const span = x1 - x0;
  const xm = x0 + span * (0.28 + 0.09 * (lane % 6));
  return y0 === y1 ? `M${x0} ${y0}H${x1}` : `M${x0} ${y0}H${xm}V${y1}H${x1}`;
}
const matchCount = (q, groupHit, mine, hits) => {
  if (!q) return 0;
  return groupHit ? mine.length : mine.filter(hits).length;
};
const shownRows = (q, groupHit, mine, hits) => q ? mine.filter((t) => groupHit || hits(t)) : mine;
function buildTopology(map, filters, expanded) {
  const all = map.nodes.targets;
  const q = filters.query.trim();
  const targets = filters.registry === "all" ? all : all.filter((t) => t.registry === filters.registry);
  const matrix = all.length > MATRIX_THRESHOLD;
  const filteringTargets = filters.registry !== "all";
  const byGroup = /* @__PURE__ */ new Map();
  for (const t of targets) byGroup.set(t.group, [...byGroup.get(t.group) ?? [], t]);
  const hits = (t) => !q || targetMatches(t, q);
  const guardedTypes = new Set(targets.flatMap((t) => t.gates.map((g) => g.type)));
  const gateNodes = map.nodes.gate_types.filter((g) => !filteringTargets || guardedTypes.has(g.type));
  const gateHit = (g) => !q || norm(g.type).includes(norm(q)) || targets.some((t) => hits(t) && t.gates.some((x) => x.type === g.type));
  const gates = gateNodes.map((node, i) => ({
    node,
    ...place(GATE.x, i * (GATE.h + GATE.gap), GATE.w, GATE.h),
    dim: filters.attentionOnly && node.status === "ok" || !gateHit(node)
  }));
  const groups = [];
  let y = 0;
  for (const node of map.nodes.groups) {
    const mine = byGroup.get(node.group) ?? [];
    if (filteringTargets && mine.length === 0) continue;
    const groupHit = !!q && norm(node.group).includes(norm(q));
    const matches = matchCount(q, groupHit, mine, hits);
    const open = !matrix && (expanded.includes(node.group) || !!q && matches > 0 && matches < mine.length);
    const showable = open ? shownRows(q, groupHit, mine, hits) : [];
    const ordered = [...showable].sort((a, b) => statusRank(b.status) - statusRank(a.status) || a.name.localeCompare(b.name));
    const drawn = ordered.slice(0, ROW_CAP);
    const h = open ? GROUP.head + GROUP.pad + drawn.length * GROUP.row + (ordered.length > drawn.length ? GROUP.row : 0) + GROUP.pad : GROUP.head;
    const top = y;
    const rows = drawn.map((target, i) => ({
      target,
      ...place(GROUP.x + 10, top + GROUP.head + GROUP.pad + i * GROUP.row, GROUP.w - 20, GROUP.row - 2),
      dim: filters.attentionOnly && target.status === "ok"
    }));
    groups.push({
      node,
      ...place(GROUP.x, y, GROUP.w, h),
      expanded: open,
      targets: mine,
      rows,
      hiddenRows: ordered.length - drawn.length,
      dim: filters.attentionOnly && node.status === "ok" || !!q && !groupHit && matches === 0,
      matches
    });
    y += h + GROUP.gap;
  }
  const observers = map.nodes.observers.map((node, i) => ({
    node,
    ...place(OBSERVER.x, i * (OBSERVER.h + OBSERVER.gap), OBSERVER.w, OBSERVER.h),
    dim: filters.attentionOnly && node.status === "ok"
  }));
  const gateById = new Map(gates.map((g) => [g.node.id, g]));
  const obsById = new Map(observers.map((o) => [o.node.id, o]));
  const groupById = new Map(groups.map((g) => [g.node.id, g]));
  const rowById = new Map(groups.flatMap((g) => g.rows.map((r) => [`target:${r.target.id}`, { row: r, group: g }])));
  const edges = [];
  map.edges.forEach((edge, i) => {
    const end = rowById.get(edge.to);
    const group = groupById.get(edge.to) ?? end?.group;
    if (!group) return;
    const toY = end ? end.row.cy : group.y + GROUP.head / 2;
    const src = edge.kind === "guards" ? gateById.get(edge.from) : obsById.get(edge.from);
    if (!src) return;
    const d = edge.kind === "guards" ? orthogonal(src.x + src.w, src.cy, group.x, toY, i) : orthogonal(src.x, src.cy, group.x + group.w, toY, i);
    const dim = src.dim || (end ? end.row.dim : group.dim) || filters.attentionOnly && edge.status === "ok";
    edges.push({ id: `${edge.from}>${edge.to}`, edge, d, width: edge.kind === "guards" ? edgeWidth(edge.volume) : 1.5, dim });
  });
  const bottom = (xs) => xs.reduce((m, p) => Math.max(m, p.y + p.h), 0);
  return { width: WIDTH, height: Math.max(bottom(gates), bottom(groups), bottom(observers), 60), gates, groups, observers, edges, matrix, targets };
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

export { COVERAGE_ORDER, MATRIX_THRESHOLD, NO_FILTERS, ROW_CAP, WIDTH, WINDOWS, buildMatrix, buildTopology, edgeWidth, groupsOf, lanePartials, orthogonal, otherPartials, registryEmpty, registryTiers, soleTarget, statusRank, targetMatches, visibleAttention };
//# sourceMappingURL=model.esm.js.map
