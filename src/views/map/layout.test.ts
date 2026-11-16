import { assignLanes, fan, placePopover, roundedPath, segHitsRect, segsCross, simplify, type Rect } from './layout';

describe('layout geometry', () => {
  it('fans attach points around the middle of a node edge, and squeezes them when the edge is short', () => {
    expect(fan(1, 0, 100)).toEqual([50]);
    expect(fan(3, 0, 100, 10)).toEqual([40, 50, 60]);
    const squeezed = fan(5, 0, 20, 10);
    expect(squeezed[0]).toBeGreaterThanOrEqual(0);
    expect(squeezed[4]).toBeLessThanOrEqual(20);
    expect(new Set(squeezed).size).toBe(5);
    expect(fan(0, 0, 10)).toEqual([]);
  });

  it('drops repeated and collinear points, and rounds each elbow without leaving the orthogonal grid', () => {
    expect(simplify([{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 8 }])).toEqual([{ x: 0, y: 0 }, { x: 9, y: 0 }, { x: 9, y: 8 }]);
    expect(roundedPath([{ x: 0, y: 5 }, { x: 40, y: 5 }])).toBe('M0 5L40 5');
    const d = roundedPath([{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 30 }, { x: 80, y: 30 }], 8);
    expect(d).toBe('M0 0L32 0Q40 0 40 8L40 22Q40 30 48 30L80 30');
    // a short run limits the radius to half of it
    expect(roundedPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }], 8)).toContain('Q10 0 10 2');
  });

  it('separates a crossing from a touch and from running along', () => {
    const h = { a: { x: 0, y: 5 }, b: { x: 10, y: 5 } };
    expect(segsCross(h, { a: { x: 5, y: 0 }, b: { x: 5, y: 10 } })).toBe(true);
    expect(segsCross(h, { a: { x: 10, y: 0 }, b: { x: 10, y: 10 } })).toBe(false); // ends on it
    expect(segsCross(h, { a: { x: 4, y: 5 }, b: { x: 14, y: 5 } })).toBe(true); // lies along it
    expect(segsCross(h, { a: { x: 4, y: 6 }, b: { x: 14, y: 6 } })).toBe(false);
    const box = { x: 10, y: 0, w: 10, h: 10 };
    expect(segHitsRect({ a: { x: 0, y: 5 }, b: { x: 10, y: 5 } }, box)).toBe(false); // ends on the border
    expect(segHitsRect({ a: { x: 0, y: 5 }, b: { x: 12, y: 5 } }, box)).toBe(true);
  });

  it('gives each routed edge its own lane inside the gutter, and none to a level one', () => {
    const lanes = assignLanes(
      [
        { xs: 0, sy: 10, xe: 100, ty: 80 },
        { xs: 0, sy: 40, xe: 100, ty: 40 },
        { xs: 0, sy: 60, xe: 100, ty: 20 },
        { xs: 0, sy: 90, xe: 100, ty: 30 },
      ],
      10,
      90,
    );
    expect(Number.isNaN(lanes[1])).toBe(true);
    const real = lanes.filter(x => !Number.isNaN(x));
    expect(new Set(real).size).toBe(3);
    for (const x of real) {
      expect(x).toBeGreaterThan(10);
      expect(x).toBeLessThan(90);
    }
  });

  it('orders lanes so two lines that can avoid crossing do not', () => {
    // two downward lines: the lower-starting one must turn at the lane nearer the groups, or they cross
    const lanes = assignLanes([{ xs: 0, sy: 10, xe: 100, ty: 50 }, { xs: 0, sy: 30, xe: 100, ty: 70 }], 0, 100);
    const [a, b] = lanes;
    // a (higher) turns first only if its right run at y=50 clears b's vertical (30..70): it does not, so b's lane is the nearer to the source
    expect(b).toBeLessThan(a);
  });
});

describe('placePopover', () => {
  const view = { w: 1280, h: 800 };
  const pop = { w: 360, h: 240 };
  const hits = (a: Rect, b: Rect) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const rectOf = (p: { x: number; y: number }): Rect => ({ x: p.x, y: p.y, w: pop.w, h: pop.h });

  it('opens beside the node, 8 px clear, never over it, wherever the node is', () => {
    for (const x of [0, 300, 700, 940, 1180]) {
      for (const y of [0, 300, 700]) {
        const node = { x, y, w: 100, h: 60 };
        const p = placePopover(node, pop, view);
        expect(hits(rectOf(p), node)).toBe(false);
      }
    }
  });

  it('prefers the right, then the left, then below, then above', () => {
    expect(placePopover({ x: 100, y: 100, w: 100, h: 60 }, pop, view).side).toBe('right');
    expect(placePopover({ x: 1100, y: 100, w: 100, h: 60 }, pop, view).side).toBe('left');
    expect(placePopover({ x: 100, y: 100, w: 1000, h: 60 }, pop, view).side).toBe('below');
    expect(placePopover({ x: 100, y: 600, w: 1000, h: 60 }, pop, view).side).toBe('above');
  });

  it('keeps an 8 px gap on its side and stays inside the viewport on the other axis', () => {
    const r = placePopover({ x: 100, y: 780, w: 100, h: 60 }, pop, view);
    expect(r.x).toBe(208);
    expect(r.y + pop.h).toBeLessThanOrEqual(view.h - 8);
    const l = placePopover({ x: 1100, y: 10, w: 100, h: 60 }, pop, view);
    expect(l.x + pop.w).toBe(1092);
    expect(l.y).toBeGreaterThanOrEqual(8);
  });

  it('with no room anywhere it still stays off the node', () => {
    const node = { x: 20, y: 20, w: 300, h: 200 };
    expect(hits(rectOf(placePopover(node, { w: 360, h: 240 }, { w: 400, h: 260 })), node)).toBe(false);
  });
});
