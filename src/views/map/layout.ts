// Geometry for the Map's topology: attach points spread along a node edge, lanes for the vertical runs between columns, rounded
// orthogonal paths, and where a popover may sit. Pure and framework-free so the layout is tested without a browser.

export interface Pt {
  x: number;
  y: number;
}
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Seg {
  a: Pt;
  b: Pt;
}

/** `k` attach points centred on `mid`, `gap` apart; squeezed (never past `lo`..`hi`) when the node edge is short. */
export function fan(k: number, lo: number, hi: number, gap = 10): number[] {
  if (k <= 0) return [];
  const mid = (lo + hi) / 2;
  if (k === 1) return [mid];
  const g = Math.min(gap, (hi - lo) / (k - 1));
  return Array.from({ length: k }, (_, i) => mid + (i - (k - 1) / 2) * g);
}

/** Consecutive points as H/V segments only; zero-length steps and collinear middles are dropped. */
export function simplify(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    out.push(p);
  }
  return out.filter((p, i) => {
    if (i === 0 || i === out.length - 1) return true;
    const a = out[i - 1];
    const b = out[i + 1];
    return !((a.x === p.x && p.x === b.x) || (a.y === p.y && p.y === b.y));
  });
}

export const segments = (points: Pt[]): Seg[] => points.slice(1).map((b, i) => ({ a: points[i], b }));

const round = (n: number) => Math.round(n * 100) / 100;

/** An SVG path through orthogonal points with every elbow rounded by up to `r` (less where a run is short). */
export function roundedPath(points: Pt[], r = 7): string {
  const p = simplify(points);
  if (p.length < 2) return '';
  let d = `M${round(p[0].x)} ${round(p[0].y)}`;
  for (let i = 1; i < p.length - 1; i++) {
    const prev = p[i - 1];
    const cur = p[i];
    const next = p[i + 1];
    const inLen = Math.abs(cur.x - prev.x) + Math.abs(cur.y - prev.y);
    const outLen = Math.abs(next.x - cur.x) + Math.abs(next.y - cur.y);
    const rr = Math.min(r, inLen / 2, outLen / 2);
    const ux = Math.sign(cur.x - prev.x);
    const uy = Math.sign(cur.y - prev.y);
    const vx = Math.sign(next.x - cur.x);
    const vy = Math.sign(next.y - cur.y);
    d += `L${round(cur.x - ux * rr)} ${round(cur.y - uy * rr)}Q${round(cur.x)} ${round(cur.y)} ${round(cur.x + vx * rr)} ${round(cur.y + vy * rr)}`;
  }
  const end = p[p.length - 1];
  return `${d}L${round(end.x)} ${round(end.y)}`;
}

const between = (v: number, a: number, b: number) => v > Math.min(a, b) && v < Math.max(a, b);

/** An axis-aligned segment against a box. `strict`: only the interior counts (touching the border, where an edge ends, is not a crossing). */
export function segHitsRect(s: Seg, r: Rect, strict = true): boolean {
  const x0 = Math.min(s.a.x, s.b.x);
  const x1 = Math.max(s.a.x, s.b.x);
  const y0 = Math.min(s.a.y, s.b.y);
  const y1 = Math.max(s.a.y, s.b.y);
  if (strict) return x1 > r.x && x0 < r.x + r.w && y1 > r.y && y0 < r.y + r.h;
  return x1 >= r.x && x0 <= r.x + r.w && y1 >= r.y && y0 <= r.y + r.h;
}

/** Two axis-aligned segments that cross or overlap (a shared end point on a node border is not passed in here). */
export function segsCross(p: Seg, q: Seg): boolean {
  const pv = p.a.x === p.b.x;
  const qv = q.a.x === q.b.x;
  if (pv === qv) {
    if (pv) return p.a.x === q.a.x && Math.max(Math.min(p.a.y, p.b.y), Math.min(q.a.y, q.b.y)) < Math.min(Math.max(p.a.y, p.b.y), Math.max(q.a.y, q.b.y));
    return p.a.y === q.a.y && Math.max(Math.min(p.a.x, p.b.x), Math.min(q.a.x, q.b.x)) < Math.min(Math.max(p.a.x, p.b.x), Math.max(q.a.x, q.b.x));
  }
  const v = pv ? p : q;
  const h = pv ? q : p;
  return between(v.a.x, h.a.x, h.b.x) && between(h.a.y, v.a.y, v.b.y);
}

/** One edge crossing a gutter: it leaves at (xs, sy), runs vertically at its lane x, and arrives at (xe, ty). */
export interface Route {
  xs: number;
  sy: number;
  xe: number;
  ty: number;
}

const crossesOther = (a: Route, xa: number, b: Route, xb: number): number => {
  // a's runs against b's vertical
  const lo = Math.min(b.sy, b.ty);
  const hi = Math.max(b.sy, b.ty);
  let n = 0;
  if (between(xb, a.xs, xa) && a.sy > lo && a.sy < hi) n++;
  if (between(xb, xa, a.xe) && a.ty > lo && a.ty < hi) n++;
  return n;
};
const pairCrossings = (a: Route, xa: number, b: Route, xb: number) => crossesOther(a, xa, b, xb) + crossesOther(b, xb, a, xa);

/**
 * A lane (vertical run x) per route inside the gutter (x0, x1), each distinct, ordered to cross as little as possible.
 * Routes that are already level need no lane (NaN). Starts from the order of their mid heights, then swaps neighbours
 * while that removes a crossing.
 */
export function assignLanes(routes: Route[], x0: number, x1: number): number[] {
  const need = routes.map((r, i) => ({ r, i })).filter(({ r }) => r.sy !== r.ty);
  const order = [...need].sort((a, b) => a.r.sy + a.r.ty - (b.r.sy + b.r.ty) || a.i - b.i);
  const m = order.length;
  const lane = (k: number) => x0 + ((k + 1) * (x1 - x0)) / (m + 1);
  for (let pass = 0; pass < 60; pass++) {
    let swapped = false;
    for (let k = 0; k + 1 < m; k++) {
      const a = order[k].r;
      const b = order[k + 1].r;
      const before = pairCrossings(a, lane(k), b, lane(k + 1));
      const after = pairCrossings(a, lane(k + 1), b, lane(k));
      if (after < before) {
        [order[k], order[k + 1]] = [order[k + 1], order[k]];
        swapped = true;
      }
    }
    if (!swapped) break;
  }
  const out = routes.map(() => NaN);
  order.forEach(({ i }, k) => {
    out[i] = lane(k);
  });
  return out;
}

export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/**
 * Where a popover sits so that it never covers the node it describes: to its right, else its left, else below it.
 * Coordinates are in the diagram's own box, in CSS pixels.
 */
export function placePopover(anchor: Box, canvasWidth: number, popWidth: number, gap = 10): { left: number; top: number; side: 'right' | 'left' | 'below' } {
  if (anchor.right + gap + popWidth <= canvasWidth) return { left: anchor.right + gap, top: anchor.top, side: 'right' };
  if (anchor.left - gap - popWidth >= 0) return { left: anchor.left - gap - popWidth, top: anchor.top, side: 'left' };
  return { left: Math.max(0, Math.min(anchor.left, canvasWidth - popWidth)), top: anchor.bottom + gap, side: 'below' };
}
