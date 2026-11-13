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

// The viewBox is about the width the page gives the diagram, so a 12px label is drawn at about 12px.
export const WIDTH = 860;
const GATE = { x: 0, w: 230, h: 88, gap: 12 };
const GROUP = { x: 330, w: 290, head: 60, row: 28, pad: 10, gap: 12 };
const OBSERVER = { x: 720, w: 140, h: 52, gap: 12 };

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

export interface GateView extends Placed {
  node: GateTypeNode;
  dim: boolean;
}
export interface RowView extends Placed {
  target: TargetNode;
  dim: boolean;
}
export interface GroupView extends Placed {
  node: GroupNode;
  expanded: boolean;
  /** The targets this group holds after the filters (what its count says). */
  targets: TargetNode[];
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
export interface EdgeView {
  id: string;
  edge: MapEdge;
  /** An orthogonal path: out, across to a staggered column, down or up, then in. */
  d: string;
  width: number;
  dim: boolean;
}

export interface Topology {
  width: number;
  height: number;
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
export const edgeWidth = (volume: number): number => Math.min(9, 1.5 + 0.7 * Math.log2(1 + Math.max(0, volume)));

/** Orthogonal path from (x0,y0) to (x1,y1): across to a column staggered by `lane`, vertical, across again. */
export function orthogonal(x0: number, y0: number, x1: number, y1: number, lane: number): string {
  const span = x1 - x0;
  const xm = x0 + span * (0.28 + 0.09 * (lane % 6));
  return y0 === y1 ? `M${x0} ${y0}H${x1}` : `M${x0} ${y0}H${xm}V${y1}H${x1}`;
}

const matchCount = (q: string, groupHit: boolean, mine: TargetNode[], hits: (t: TargetNode) => boolean): number => {
  if (!q) return 0;
  return groupHit ? mine.length : mine.filter(hits).length;
};
const shownRows = (q: string, groupHit: boolean, mine: TargetNode[], hits: (t: TargetNode) => boolean): TargetNode[] => (q ? mine.filter(t => groupHit || hits(t)) : mine);

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

  // Gate types: with a registry filter, only the types that guard a remaining target.
  const guardedTypes = new Set(targets.flatMap(t => t.gates.map(g => g.type)));
  const gateNodes = map.nodes.gate_types.filter(g => !filteringTargets || guardedTypes.has(g.type));
  const gateHit = (g: GateTypeNode) => !q || norm(g.type).includes(norm(q)) || targets.some(t => hits(t) && t.gates.some(x => x.type === g.type));
  const gates: GateView[] = gateNodes.map((node, i) => ({
    node,
    ...place(GATE.x, i * (GATE.h + GATE.gap), GATE.w, GATE.h),
    dim: (filters.attentionOnly && node.status === 'ok') || !gateHit(node),
  }));

  // Groups: a group the registry filter emptied is not drawn; a group name that matches the search matches all its targets.
  const groups: GroupView[] = [];
  let y = 0;
  for (const node of map.nodes.groups) {
    const mine = byGroup.get(node.group) ?? [];
    if (filteringTargets && mine.length === 0) continue;
    const groupHit = !!q && norm(node.group).includes(norm(q));
    const matches = matchCount(q, groupHit, mine, hits);
    const open = !matrix && (expanded.includes(node.group) || (!!q && matches > 0 && matches < mine.length));
    const showable = open ? shownRows(q, groupHit, mine, hits) : [];
    // Worst first so the cap hides the quiet ones.
    const ordered = [...showable].sort((a, b) => statusRank(b.status) - statusRank(a.status) || a.name.localeCompare(b.name));
    const drawn = ordered.slice(0, ROW_CAP);
    const h = open ? GROUP.head + GROUP.pad + drawn.length * GROUP.row + (ordered.length > drawn.length ? GROUP.row : 0) + GROUP.pad : GROUP.head;
    const top = y;
    const rows: RowView[] = drawn.map((target, i) => ({
      target,
      ...place(GROUP.x + 10, top + GROUP.head + GROUP.pad + i * GROUP.row, GROUP.w - 20, GROUP.row - 2),
      dim: filters.attentionOnly && target.status === 'ok',
    }));
    groups.push({
      node,
      ...place(GROUP.x, y, GROUP.w, h),
      expanded: open,
      targets: mine,
      rows,
      hiddenRows: ordered.length - drawn.length,
      dim: (filters.attentionOnly && node.status === 'ok') || (!!q && !groupHit && matches === 0),
      matches,
    });
    y += h + GROUP.gap;
  }

  const observers: ObserverView[] = map.nodes.observers.map((node, i) => ({
    node,
    ...place(OBSERVER.x, i * (OBSERVER.h + OBSERVER.gap), OBSERVER.w, OBSERVER.h),
    dim: filters.attentionOnly && node.status === 'ok',
  }));

  // Edges. A group edge ends on the group's header; a target edge ends on its row when the row is drawn.
  const gateById = new Map(gates.map(g => [g.node.id, g]));
  const obsById = new Map(observers.map(o => [o.node.id, o]));
  const groupById = new Map(groups.map(g => [g.node.id, g]));
  const rowById = new Map<string, { row: RowView; group: GroupView }>(groups.flatMap(g => g.rows.map((r): [string, { row: RowView; group: GroupView }] => [`target:${r.target.id}`, { row: r, group: g }])));
  const edges: EdgeView[] = [];
  map.edges.forEach((edge, i) => {
    const end = rowById.get(edge.to);
    const group = groupById.get(edge.to) ?? end?.group;
    if (!group) return;
    const toY = end ? end.row.cy : group.y + GROUP.head / 2;
    const src = edge.kind === 'guards' ? gateById.get(edge.from) : obsById.get(edge.from);
    if (!src) return;
    const d = edge.kind === 'guards' ? orthogonal(src.x + src.w, src.cy, group.x, toY, i) : orthogonal(src.x, src.cy, group.x + group.w, toY, i);
    const dim = src.dim || (end ? end.row.dim : group.dim) || (filters.attentionOnly && edge.status === 'ok');
    edges.push({ id: `${edge.from}>${edge.to}`, edge, d, width: edge.kind === 'guards' ? edgeWidth(edge.volume) : 1.5, dim });
  });

  const bottom = (xs: Placed[]) => xs.reduce((m, p) => Math.max(m, p.y + p.h), 0);
  return { width: WIDTH, height: Math.max(bottom(gates), bottom(groups), bottom(observers), 60), gates, groups, observers, edges, matrix, targets };
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
