import { assignLanes, fan, roundedPath, segHitsRect, segments, simplify, type Pt, type Rect } from './layout';
import type { AttentionItem, GateTypeNode, GroupNode, MapEdge, MapResponse, MapStatus, ObserverNode, TargetNode } from './types';

// The Map's data -> layout model (boards C9 and C6): which nodes are drawn where, which edges join them and how wide, and
// what a filter dims. Pure: no React, no fetching, so it is tested on its own. The numbers are Clearance's; this only
// groups, filters and places them.

export const WINDOWS = [
  { id: '15m', label: '15 m', ms: 15 * 60_000 },
  { id: '1h', label: '1 h', ms: 60 * 60_000 },
  { id: '24h', label: '24 h', ms: 24 * 60 * 60_000 },
  { id: '7d', label: '7 d', ms: 7 * 24 * 60 * 60_000 },
] as const;
export type WindowId = (typeof WINDOWS)[number]['id'];

/** Past this many declared targets the target rows give way to the gates x targets matrix (board C9 inset). */
export const MATRIX_THRESHOLD = 40;
/** Rows drawn inside an expanded group before "+ n more: search to find one". */
export const ROW_CAP = 12;

// Column geometry (the diagram's own units; the SVG scales to the page). Gate types, then the gutter the Clearance core sits
// in, then the target groups, then the gutter the observers' watch lines run in, then the observers. Gutters widen with the
// number of lines they carry, so a line always has its own lane.
/** Clear space between the Clearance core band and the columns either side of it. */
const CORE_INSET = 44;
const GATE = { x: 0, w: 232, minH: 100, gap: 14 };
const GROUP = { w: 270, minHead: 92, row: 46, pad: 10, gap: 16 };
const OBSERVER = { w: 160, minH: 84, gap: 14 };
const TOP = 44;
export const EDGE_PITCH = 9;
const MAX_STROKE = 6;

export const statusRank = (s: string | undefined): number => ({ down: 2, attention: 1 }[s as 'down' | 'attention'] ?? 0);
export const worseOf = (a: MapStatus, b: MapStatus): MapStatus => (statusRank(b) > statusRank(a) ? b : a);

export interface MapFilters {
  attentionOnly: boolean;
  query: string;
  /** 'all' or a registry tier a declared target names (Ground, Flight). */
  registry: string;
}
export const NO_FILTERS: MapFilters = { attentionOnly: false, query: '', registry: 'all' };

const norm = (s: string | undefined) => (s ?? '').toLowerCase();

/** A target matches a search when its name, app, id, group, owner, env or one of its gates' types or instances does. */
export function targetMatches(t: TargetNode, query: string): boolean {
  const q = norm(query).trim();
  if (!q) return true;
  return [t.name, t.id, t.app, t.group, t.owner, t.env, t.kind, ...t.gates.flatMap(g => [g.type, g.instance])].some(v => norm(v).includes(q));
}

/** The registry tiers the declared targets name, for the filter pills (empty when fewer than two: nothing to choose). */
export function registryTiers(targets: TargetNode[]): string[] {
  const tiers = [...new Set(targets.map(t => t.registry).filter((r): r is string => !!r))].sort();
  return tiers.length > 1 ? tiers : [];
}

export interface Placed {
  x: number;
  y: number;
  w: number;
  h: number;
  cx: number;
  cy: number;
}
const place = (x: number, y: number, w: number, h: number): Placed => ({ x, y, w, h, cx: x + w / 2, cy: y + h / 2 });

/** What a gate type is, in words a person recognises: the clearance's own name and what it guards. Unknown types show as they are. */
const GATE_WORDS: Record<string, { name: string; kind: string }> = {
  glidepath: { name: 'Glidepath clearance-gate', kind: 'PR check' },
  'g-argo': { name: 'G-ARGO', kind: 'Argo CD sync' },
  'g-tf': { name: 'G-TF', kind: 'Terraform plan' },
  autopilot: { name: 'Autopilot tool gate', kind: 'runtime' },
  github: { name: 'GitHub deployment protection', kind: 'GitHub App' },
};
export const gateWords = (type: string): { name: string; kind: string } => GATE_WORDS[type] ?? { name: type, kind: 'gate' };

export interface GateView extends Placed {
  node: GateTypeNode;
  dim: boolean;
  name: string;
  kind: string;
}
export interface RowView extends Placed {
  target: TargetNode;
  dim: boolean;
}
export interface GroupView extends Placed {
  node: GroupNode;
  expanded: boolean;
  /** Height of the always-drawn header (the rows of an expanded group sit under it). */
  head: number;
  /** The targets this group holds after the filters (what its count says). */
  targets: TargetNode[];
  /** Registry tiers and environments its targets name, for the subtitle. */
  registries: string[];
  envs: string[];
  rows: RowView[];
  hiddenRows: number;
  dim: boolean;
  /** Search hits inside it: the count shows when the group is collapsed. */
  matches: number;
}
export interface ObserverView extends Placed {
  node: ObserverNode;
  dim: boolean;
}
export interface EdgeLabel {
  text: string;
  x: number;
  y: number;
  anchor: 'start' | 'end';
  w: number;
}
export interface EdgeView {
  id: string;
  edge: MapEdge;
  /** Orthogonal points, source to destination: out, across to the line's own lane, vertical, in. Horizontal and vertical runs only. */
  points: Pt[];
  /** The same path with rounded elbows, for drawing. */
  d: string;
  width: number;
  dim: boolean;
  /** Only where it adds meaning (refusals, a holding change, a blind observer) and only where it fits clear of everything else. */
  label?: EdgeLabel;
}
export interface Column {
  key: 'gates' | 'core' | 'targets' | 'observers';
  x: number;
  w: number;
  label: string;
  sub: string;
}

export interface Topology {
  width: number;
  height: number;
  columns: Column[];
  /** The Clearance core, drawn behind the lines that run through its gutter. */
  core: Rect;
  gates: GateView[];
  groups: GroupView[];
  observers: ObserverView[];
  edges: EdgeView[];
  /** Past MATRIX_THRESHOLD declared targets: rows are not drawn, the matrix is. */
  matrix: boolean;
  /** Targets after the registry filter. */
  targets: TargetNode[];
}

/** An edge's line width from its decisions: log-scaled so 9 and 9,000 are both readable on one page. */
export const edgeWidth = (volume: number): number => Math.min(MAX_STROKE, 1.5 + 0.4 * Math.log2(1 + Math.max(0, volume)));

const matchCount = (q: string, groupHit: boolean, mine: TargetNode[], hits: (t: TargetNode) => boolean): number => {
  if (!q) return 0;
  return groupHit ? mine.length : mine.filter(hits).length;
};
const shownRows = (q: string, groupHit: boolean, mine: TargetNode[], hits: (t: TargetNode) => boolean): TargetNode[] => (q ? mine.filter(t => groupHit || hits(t)) : mine);

/** A resolved edge: which node it leaves or enters, and (for a target edge into an open group) which row it ends on. */
interface Resolved {
  edge: MapEdge;
  index: number;
  src: GateView | ObserverView;
  group: GroupView;
  row?: RowView;
}

const textWidth = (s: string) => s.length * 6.6 + 8;
const labelText = (e: MapEdge): string | undefined => {
  if (e.kind === 'watches') return ({ down: 'blind', attention: 'stale' } as Record<string, string>)[e.status];
  if (e.holding > 0) return `${e.holding} holding`;
  if (e.refused > 0) return `${e.refused} refused`;
  return undefined;
};

/** What is drawn for this response under these filters, with `expanded` groups opened into their target rows. */
export function buildTopology(map: MapResponse, filters: MapFilters, expanded: string[]): Topology {
  const all = map.nodes.targets;
  const q = filters.query.trim();
  const targets = filters.registry === 'all' ? all : all.filter(t => t.registry === filters.registry);
  const matrix = all.length > MATRIX_THRESHOLD;
  const filteringTargets = filters.registry !== 'all';

  const byGroup = new Map<string, TargetNode[]>();
  for (const t of targets) byGroup.set(t.group, [...(byGroup.get(t.group) ?? []), t]);
  const hits = (t: TargetNode) => !q || targetMatches(t, q);

  // Which groups are drawn and which rows are open, before anything is placed.
  interface Pre {
    node: GroupNode;
    mine: TargetNode[];
    open: boolean;
    drawn: TargetNode[];
    hidden: number;
    matches: number;
    groupHit: boolean;
  }
  const pre: Pre[] = [];
  for (const node of map.nodes.groups) {
    const mine = byGroup.get(node.group) ?? [];
    if (filteringTargets && mine.length === 0) continue;
    const groupHit = !!q && norm(node.group).includes(norm(q));
    const matches = matchCount(q, groupHit, mine, hits);
    const open = !matrix && (expanded.includes(node.group) || (!!q && matches > 0 && matches < mine.length));
    const showable = open ? shownRows(q, groupHit, mine, hits) : [];
    // Worst first so the cap hides the quiet ones.
    const ordered = [...showable].sort((a, b) => statusRank(b.status) - statusRank(a.status) || a.name.localeCompare(b.name));
    pre.push({ node, mine, open, drawn: ordered.slice(0, ROW_CAP), hidden: Math.max(0, ordered.length - ROW_CAP), matches, groupHit });
  }
  const preById = new Map(pre.map(p => [p.node.id, p]));
  const rowOwner = new Map<string, Pre>(pre.flatMap(p => p.drawn.map((t): [string, Pre] => [`target:${t.id}`, p])));

  // Edges that can be drawn: they end on a drawn group, or on a drawn row of an open one.
  const usable = map.edges
    .map((edge, index) => ({ edge, index, owner: preById.get(edge.to) ?? rowOwner.get(edge.to) }))
    .filter((e): e is { edge: MapEdge; index: number; owner: Pre } => !!e.owner);
  const inCount = new Map<string, number>();
  const outCount = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  for (const { edge, owner } of usable) {
    bump(edge.kind === 'guards' ? inCount : outCount, owner.node.id);
    bump(edge.kind === 'guards' ? outCount : inCount, edge.from);
  }
  const need = (id: string, min: number) => Math.max(min, 28 + (Math.max(inCount.get(id) ?? 0, outCount.get(id) ?? 0)) * EDGE_PITCH);

  // Groups: stacked, each as tall as its header and open rows need.
  const groups: GroupView[] = [];
  let y = TOP;
  // Gutter widths come first: x positions of the groups depend on them.
  const guardEdges = usable.filter(e => e.edge.kind === 'guards');
  const watchEdges = usable.filter(e => e.edge.kind === 'watches');
  // The core band sits inset from both columns (CORE_INSET of clear run on each side), so a line leaves its gate and reaches
  // its target on a straight stretch before and after the band, and the arrowheads have room.
  const gutterA = Math.min(360, Math.max(240, 2 * CORE_INSET + 80 + guardEdges.length * 12));
  const gutterB = Math.min(200, Math.max(110, 50 + watchEdges.length * 10));
  const groupX = GATE.x + GATE.w + gutterA;
  const observerX = groupX + GROUP.w + gutterB;
  for (const p of pre) {
    const head = need(p.node.id, GROUP.minHead);
    const h = p.open ? head + GROUP.pad + p.drawn.length * GROUP.row + (p.hidden > 0 ? 24 : 0) + GROUP.pad : head;
    const top = y;
    const rows: RowView[] = p.drawn.map((target, i) => ({
      target,
      ...place(groupX + 10, top + head + GROUP.pad + i * GROUP.row, GROUP.w - 20, GROUP.row - 4),
      dim: filters.attentionOnly && target.status === 'ok',
    }));
    groups.push({
      node: p.node,
      ...place(groupX, top, GROUP.w, h),
      expanded: p.open,
      head,
      targets: p.mine,
      registries: [...new Set(p.mine.map(t => t.registry).filter((r): r is string => !!r))],
      envs: [...new Set(p.mine.map(t => t.env).filter((r): r is string => !!r))],
      rows,
      hiddenRows: p.hidden,
      dim: (filters.attentionOnly && p.node.status === 'ok') || (!!q && !p.groupHit && p.matches === 0),
      matches: p.matches,
    });
    y += h + GROUP.gap;
  }
  const groupById = new Map(groups.map(g => [g.node.id, g]));
  const rowById = new Map<string, RowView>(groups.flatMap(g => g.rows.map((r): [string, RowView] => [`target:${r.target.id}`, r])));

  // Gate types and observers: ordered by where their lines go (barycentre of the groups they touch), then stacked.
  const guardedTypes = new Set(targets.flatMap(t => t.gates.map(g => g.type)));
  const gateNodes = map.nodes.gate_types.filter(g => !filteringTargets || guardedTypes.has(g.type));
  const gateHit = (g: GateTypeNode) => !q || norm(g.type).includes(norm(q)) || targets.some(t => hits(t) && t.gates.some(x => x.type === g.type));
  const centreOf = (id: string, kind: MapEdge['kind']): number | undefined => {
    const ys = usable.filter(e => e.edge.kind === kind && e.edge.from === id).map(e => (rowById.get(e.edge.to) ?? groupById.get(e.owner.node.id)!).cy);
    return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : undefined;
  };
  const byCentre = <T,>(items: T[], id: (t: T) => string, kind: MapEdge['kind']): T[] =>
    items
      .map((item, i) => ({ item, i, c: centreOf(id(item), kind) }))
      .sort((a, b) => (a.c ?? Infinity) - (b.c ?? Infinity) || a.i - b.i)
      .map(s => s.item);
  const stack = <T,>(items: T[], id: (t: T) => string, minH: number, gap: number, make: (t: T, p: Placed) => unknown) => {
    let at = TOP;
    return items.map(item => {
      const h = need(id(item), minH);
      const p = place(0, at, 0, h);
      at += h + gap;
      return make(item, p);
    });
  };
  const gates = stack(byCentre(gateNodes, g => g.id, 'guards'), g => g.id, GATE.minH, GATE.gap, (node, p): GateView => ({
    node,
    ...place(GATE.x, p.y, GATE.w, p.h),
    ...gateWords(node.type),
    dim: (filters.attentionOnly && node.status === 'ok') || !gateHit(node),
  })) as GateView[];
  const observers = stack(byCentre(map.nodes.observers, o => o.id, 'watches'), o => o.id, OBSERVER.minH, OBSERVER.gap, (node, p): ObserverView => ({
    node,
    ...place(observerX, p.y, OBSERVER.w, p.h),
    dim: filters.attentionOnly && node.status === 'ok',
  })) as ObserverView[];
  const gateById = new Map(gates.map(g => [g.node.id, g]));
  const obsById = new Map(observers.map(o => [o.node.id, o]));

  const resolved: Resolved[] = [];
  for (const { edge, index, owner } of usable) {
    const src = edge.kind === 'guards' ? gateById.get(edge.from) : obsById.get(edge.from);
    if (!src) continue;
    resolved.push({ edge, index, src, group: groupById.get(owner.node.id)!, row: rowById.get(edge.to) });
  }

  // Attach points. On a gate or observer, a node's lines leave in the order of where they land; on a group they arrive in the
  // order of where they come from, the header's lines fanned across the header and a row's lines across that row.
  const attachSrc = new Map<number, number>();
  const attachDst = new Map<number, number>();
  const byNode = new Map<string, Resolved[]>();
  for (const r of resolved) byNode.set(r.edge.from, [...(byNode.get(r.edge.from) ?? []), r]);
  for (const list of byNode.values()) {
    const src = list[0].src;
    const dest = (r: Resolved) => (r.row ? r.row.cy : r.group.y + r.group.head / 2);
    const sorted = [...list].sort((a, b) => dest(a) - dest(b) || a.index - b.index);
    fan(sorted.length, src.y + 12, src.y + src.h - 12, EDGE_PITCH).forEach((v, i) => attachSrc.set(sorted[i].index, v));
  }
  for (const g of groups) {
    for (const side of ['guards', 'watches'] as const) {
      const mine = resolved.filter(r => r.group === g && r.edge.kind === side);
      const head = mine.filter(r => !r.row).sort((a, b) => a.src.cy - b.src.cy || a.index - b.index);
      fan(head.length, g.y + 12, g.y + g.head - 12, EDGE_PITCH).forEach((v, i) => attachDst.set(head[i].index, v));
      for (const row of g.rows) {
        const hit = mine.filter(r => r.row === row).sort((a, b) => a.src.cy - b.src.cy || a.index - b.index);
        fan(hit.length, row.y + 6, row.y + row.h - 6, 6).forEach((v, i) => attachDst.set(hit[i].index, v));
      }
    }
  }

  // Lanes: guards run in the gutter between gates and groups, watches in the one between groups and observers.
  const gate = { x0: GATE.x + GATE.w, x1: groupX };
  const watch = { x0: groupX + GROUP.w, x1: observerX };
  const laneFor = new Map<number, number>();
  const guards = resolved.filter(r => r.edge.kind === 'guards');
  const watches = resolved.filter(r => r.edge.kind === 'watches');
  const pad = 14;
  assignLanes(guards.map(r => ({ xs: gate.x0, sy: attachSrc.get(r.index)!, xe: gate.x1, ty: attachDst.get(r.index)! })), gate.x0 + CORE_INSET + pad, gate.x1 - CORE_INSET - pad).forEach((x, i) => laneFor.set(guards[i].index, x));
  assignLanes(watches.map(r => ({ xs: watch.x1, sy: attachSrc.get(r.index)!, xe: watch.x0, ty: attachDst.get(r.index)! })), watch.x0 + pad, watch.x1 - pad).forEach((x, i) => laneFor.set(watches[i].index, x));

  const edges: EdgeView[] = resolved.map(r => {
    const g = r.edge.kind === 'guards';
    const sy = attachSrc.get(r.index)!;
    const ty = attachDst.get(r.index)!;
    const xs = g ? gate.x0 : watch.x1;
    const xe = g ? gate.x1 : watch.x0;
    const lane = laneFor.get(r.index)!;
    const raw: Pt[] = sy === ty ? [{ x: xs, y: sy }, { x: xe, y: ty }] : [{ x: xs, y: sy }, { x: lane, y: sy }, { x: lane, y: ty }, { x: xe, y: ty }];
    const points = simplify(raw);
    const dim = r.src.dim || (r.row ? r.row.dim : r.group.dim) || (filters.attentionOnly && r.edge.status === 'ok');
    return { id: `${r.edge.from}>${r.edge.to}`, edge: r.edge, points, d: roundedPath(points), width: g ? Math.min(edgeWidth(r.edge.volume), MAX_STROKE) : 1.5, dim };
  });

  // Labels: only where the edge says something, and only on a run long enough to hold the text clear of every other line and box.
  const boxes: Rect[] = [...gates, ...groups, ...observers];
  const allSegs = edges.map(e => segments(e.points));
  edges.forEach((e, ei) => {
    const text = labelText(e.edge);
    if (!text) return;
    const w = textWidth(text);
    const segs = segments(e.points).filter(s => s.a.y === s.b.y);
    for (const s of [segs[0], segs[segs.length - 1]]) {
      if (!s) continue;
      const lo = Math.min(s.a.x, s.b.x);
      const hi = Math.max(s.a.x, s.b.x);
      if (hi - lo < w + 10) continue;
      // beside the node end for a guard (the gate's side), at the group's end for a watch
      const startAtLeft = s === segs[0] ? s.a.x <= s.b.x : s.b.x <= s.a.x;
      const x = startAtLeft ? lo + 5 : hi - 5 - w;
      const box: Rect = { x, y: s.a.y - 16, w, h: 14 };
      const clear = allSegs.every((ss, i) => i === ei || ss.every(o => !segHitsRect(o, box, false))) && boxes.every(b => !(box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y));
      if (clear) {
        e.label = { text, x: x + w / 2, y: s.a.y - 5, anchor: 'start', w };
        break;
      }
    }
  });

  const bottom = (xs: Placed[]) => xs.reduce((m, p) => Math.max(m, p.y + p.h), 0);
  const height = Math.max(bottom(gates), bottom(groups), bottom(observers), 60) + 6;
  const instances = gateNodes.reduce((n, g) => n + g.instances, 0);
  const shown = groups.reduce((n, g) => n + g.targets.length, 0);
  const columns: Column[] = [
    { key: 'gates', x: GATE.x, w: GATE.w, label: 'Gate types', sub: `${instances} instances` },
    { key: 'core', x: gate.x0, w: gate.x1 - gate.x0, label: 'Clearance core', sub: 'decides · records' },
    { key: 'targets', x: groupX, w: GROUP.w, label: 'Protected targets', sub: `${shown} in ${groups.length} ${groups.length === 1 ? 'group' : 'groups'}` },
    { key: 'observers', x: observerX, w: OBSERVER.w, label: 'Observers', sub: 'watch the targets' },
  ];
  return {
    width: observerX + OBSERVER.w,
    height,
    columns,
    core: { x: gate.x0 + CORE_INSET, y: TOP - 8, w: gate.x1 - gate.x0 - 2 * CORE_INSET, h: height - TOP + 8 },
    gates,
    groups,
    observers,
    edges,
    matrix,
    targets,
  };
}

/** The attention list after the filters: attention-only is already what it is; a search keeps the items that name a match. */
export function visibleAttention(items: AttentionItem[], filters: MapFilters, targets: TargetNode[]): AttentionItem[] {
  const q = filters.query.trim();
  const reg = filters.registry === 'all' ? undefined : new Set(targets.map(t => t.id));
  const order = { down: 0, attention: 1, info: 2 };
  const bySeverity = [...items].sort((a, b) => order[a.severity] - order[b.severity]);
  return bySeverity.filter(item => {
    if (reg && item.targets.length > 0 && !item.targets.some(id => reg.has(id))) return false;
    if (!q) return true;
    const names = targets.filter(t => item.targets.includes(t.id) || item.targets.includes(t.name));
    return [item.title, item.detail, item.gate_type, item.instance, item.kind].some(v => norm(v).includes(norm(q))) || names.some(t => targetMatches(t, q));
  });
}

/** The groups holding the targets an attention item names, for "Show": open exactly those. */
export function groupsOf(item: AttentionItem, targets: TargetNode[]): string[] {
  const ids = new Set(item.targets);
  return [...new Set(targets.filter(t => ids.has(t.id) || ids.has(t.name)).map(t => t.group))];
}

/** The single target an item points at (its detail is one click away), when it names exactly one. */
export function soleTarget(item: AttentionItem, targets: TargetNode[]): TargetNode | undefined {
  if (item.targets.length !== 1) return undefined;
  return targets.find(t => t.id === item.targets[0] || t.name === item.targets[0]);
}

export type CellMode = 'enforce' | 'flag' | 'silent' | 'none';
export interface Matrix {
  gateTypes: string[];
  targets: TargetNode[];
  cell: (type: string, t: TargetNode) => CellMode;
}

/** The gates x targets matrix: each cell is that gate type's mode on that target, a dashed one a type that does not guard it. Worst targets first. */
export function buildMatrix(map: MapResponse, targets: TargetNode[]): Matrix {
  const gateTypes = map.nodes.gate_types.map(g => g.type);
  const sorted = [...targets].sort((a, b) => statusRank(b.status) - statusRank(a.status) || a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
  return {
    gateTypes,
    targets: sorted,
    cell: (type, t) => {
      const g = t.gates.find(x => x.type === type);
      if (!g) return 'none';
      if (g.silent) return 'silent';
      return g.mode === 'flag' ? 'flag' : 'enforce';
    },
  };
}

/** What the registry's emptiness means: no targets published at all (not a filter's empty result). */
export const registryEmpty = (map: MapResponse): boolean => map.registry.targets === 0 && map.nodes.targets.length === 0;

/** The six coverage states in the order the mix is drawn, and the one unassessed bucket the Map adds. */
export const COVERAGE_ORDER = ['authorized-and-verified', 'observed-not-attributed', 'out-of-band-detected', 'coverage-unavailable', 'break-glass', 'attempted-refused', 'unassessed'] as const;

/** Partial notes that concern the lanes, and the rest (they are shown in the place they affect). */
export const lanePartials = <T extends { field: string }>(p: T[]): T[] => p.filter(n => n.field.startsWith('lanes'));
export const otherPartials = <T extends { field: string }>(p: T[]): T[] => p.filter(n => !n.field.startsWith('lanes'));
