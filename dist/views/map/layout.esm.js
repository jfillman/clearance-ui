function fan(k, lo, hi, gap = 10) {
  if (k <= 0) return [];
  const mid = (lo + hi) / 2;
  if (k === 1) return [mid];
  const g = Math.min(gap, (hi - lo) / (k - 1));
  return Array.from({ length: k }, (_, i) => mid + (i - (k - 1) / 2) * g);
}
function simplify(points) {
  const out = [];
  for (const p of points) {
    const last = out[out.length - 1];
    if (last && last.x === p.x && last.y === p.y) continue;
    out.push(p);
  }
  return out.filter((p, i) => {
    if (i === 0 || i === out.length - 1) return true;
    const a = out[i - 1];
    const b = out[i + 1];
    return !(a.x === p.x && p.x === b.x || a.y === p.y && p.y === b.y);
  });
}
const segments = (points) => points.slice(1).map((b, i) => ({ a: points[i], b }));
const round = (n) => Math.round(n * 100) / 100;
function roundedPath(points, r = 7) {
  const p = simplify(points);
  if (p.length < 2) return "";
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
const between = (v, a, b) => v > Math.min(a, b) && v < Math.max(a, b);
function segHitsRect(s, r, strict = true) {
  const x0 = Math.min(s.a.x, s.b.x);
  const x1 = Math.max(s.a.x, s.b.x);
  const y0 = Math.min(s.a.y, s.b.y);
  const y1 = Math.max(s.a.y, s.b.y);
  if (strict) return x1 > r.x && x0 < r.x + r.w && y1 > r.y && y0 < r.y + r.h;
  return x1 >= r.x && x0 <= r.x + r.w && y1 >= r.y && y0 <= r.y + r.h;
}
const crossesOther = (a, xa, b, xb) => {
  const lo = Math.min(b.sy, b.ty);
  const hi = Math.max(b.sy, b.ty);
  let n = 0;
  if (between(xb, a.xs, xa) && a.sy > lo && a.sy < hi) n++;
  if (between(xb, xa, a.xe) && a.ty > lo && a.ty < hi) n++;
  return n;
};
const pairCrossings = (a, xa, b, xb) => crossesOther(a, xa, b, xb) + crossesOther(b, xb, a, xa);
function assignLanes(routes, x0, x1) {
  const need = routes.map((r, i) => ({ r, i })).filter(({ r }) => r.sy !== r.ty);
  const order = [...need].sort((a, b) => a.r.sy + a.r.ty - (b.r.sy + b.r.ty) || a.i - b.i);
  const m = order.length;
  const lane = (k) => x0 + (k + 1) * (x1 - x0) / (m + 1);
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
function placePopover(anchor, canvasWidth, popWidth, gap = 10) {
  if (anchor.right + gap + popWidth <= canvasWidth) return { left: anchor.right + gap, top: anchor.top, side: "right" };
  if (anchor.left - gap - popWidth >= 0) return { left: anchor.left - gap - popWidth, top: anchor.top, side: "left" };
  return { left: Math.max(0, Math.min(anchor.left, canvasWidth - popWidth)), top: anchor.bottom + gap, side: "below" };
}

export { assignLanes, fan, placePopover, roundedPath, segHitsRect, segments, simplify };
//# sourceMappingURL=layout.esm.js.map
