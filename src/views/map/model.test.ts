import { buildMatrix, buildTopology, edgeWidth, gateWords, groupsOf, MATRIX_THRESHOLD, NO_FILTERS, registryEmpty, registryTiers, ROW_CAP, soleTarget, targetMatches, visibleAttention } from './model';
import { fixture, liveFixture, scaledFixture, target } from './testFixture';
import { segHitsRect, segments, segsCross } from './layout';
import type { MapResponse } from './types';

describe('the Map layout model', () => {
  it('draws one node per gate type and per group, observers beside, and an edge for every API edge', () => {
    const topo = buildTopology(fixture(), NO_FILTERS, []);
    expect(topo.gates.map(g => g.node.type)).toEqual(['glidepath', 'g-argo', 'g-tf']);
    expect(topo.groups.map(g => [g.node.group, g.targets.length, g.expanded])).toEqual([['hangar-prod', 2, false], ['aws', 1, false]]);
    expect(topo.observers).toHaveLength(2);
    expect(topo.edges).toHaveLength(5);
    expect(topo.matrix).toBe(false);
    // columns do not overlap: gates left of the core gutter left of groups left of observers
    expect(topo.gates[0].x + topo.gates[0].w).toBeLessThan(topo.groups[0].x);
    expect(topo.groups[0].x + topo.groups[0].w).toBeLessThan(topo.observers[0].x);
    expect(topo.columns.map(c => c.key)).toEqual(['gates', 'core', 'targets', 'observers']);
  });

  it('names every gate type in words, with what it guards, and keeps an unknown one as it is', () => {
    expect(gateWords('glidepath')).toEqual({ name: 'Glidepath clearance-gate', kind: 'PR check' });
    expect(gateWords('g-argo').name).toBe('G-ARGO');
    expect(gateWords('mystery')).toEqual({ name: 'mystery', kind: 'gate' });
    const topo = buildTopology(fixture(), NO_FILTERS, []);
    expect(topo.gates.map(g => g.name)).toEqual(['Glidepath clearance-gate', 'G-ARGO', 'G-TF']);
  });

  it('an edge is orthogonal and its width follows its decisions: more volume is thicker, none is the thinnest', () => {
    const topo = buildTopology(fixture(), NO_FILTERS, []);
    for (const e of topo.edges) expect(e.d).toMatch(/^M[\d.]+ [\d.]+(L[\d.]+ [\d.]+Q[\d.]+ [\d.]+ [\d.]+ [\d.]+)*L[\d.]+ [\d.]+$/);
    const w = (from: string) => topo.edges.find(e => e.edge.from === from)!.width;
    expect(w('gate:g-argo')).toBeGreaterThan(w('gate:glidepath'));
    expect(w('gate:g-tf')).toBe(edgeWidth(0));
    expect(edgeWidth(1e9)).toBeLessThanOrEqual(6);
  });

  it('expanding a group draws its targets worst first, as rows the target edges can end on', () => {
    const m = fixture();
    m.edges.push({ from: 'gate:g-argo', to: 'target:gate-api-prod', kind: 'guards', targets: 1, volume: 5, refused: 0, holding: 1, status: 'attention' });
    const topo = buildTopology(m, NO_FILTERS, ['hangar-prod']);
    const g = topo.groups[0];
    expect(g.expanded).toBe(true);
    expect(g.rows.map(r => r.target.id)).toEqual(['gate-api-prod', 'flight-api-prod']); // attention before ok
    expect(topo.groups[1].y).toBeGreaterThan(g.y + g.h - 1); // the next group moved down
    expect(topo.edges).toHaveLength(6);
    const toRow = topo.edges.find(e => e.edge.to === 'target:gate-api-prod')!;
    const end = toRow.points[toRow.points.length - 1];
    expect(end.x).toBe(g.x);
    expect(end.y).toBeGreaterThan(g.rows[0].y);
    expect(end.y).toBeLessThan(g.rows[0].y + g.rows[0].h);
  });

  it('caps the rows of a big group and says how many are hidden', () => {
    const many = Array.from({ length: ROW_CAP + 5 }, (_, i) => target(`t${i}-prod`, 'hangar-prod'));
    const m = fixture();
    m.nodes.targets = many;
    const g = buildTopology(m, NO_FILTERS, ['hangar-prod']).groups[0];
    expect(g.rows).toHaveLength(ROW_CAP);
    expect(g.hiddenRows).toBe(5);
  });

  it('needs-attention-only dims what is healthy, nodes and edges both, and keeps what is not', () => {
    const topo = buildTopology(fixture(), { ...NO_FILTERS, attentionOnly: true }, []);
    expect(topo.gates.map(g => [g.node.type, g.dim])).toEqual([['glidepath', true], ['g-argo', false], ['g-tf', false]]);
    expect(topo.observers.map(o => o.dim)).toEqual([true, false]);
    expect(topo.edges.find(e => e.edge.from === 'gate:glidepath')!.dim).toBe(true);
    expect(topo.edges.find(e => e.edge.from === 'gate:g-argo')!.dim).toBe(false);
  });

  it('a search dims groups and gates with no match, opens a group with matches and shows only them', () => {
    const topo = buildTopology(fixture(), { ...NO_FILTERS, query: 'flight-api' }, []);
    const hp = topo.groups.find(g => g.node.group === 'hangar-prod')!;
    expect(hp.matches).toBe(1);
    expect(hp.expanded).toBe(true);
    expect(hp.rows.map(r => r.target.id)).toEqual(['flight-api-prod']);
    expect(topo.groups.find(g => g.node.group === 'aws')!.dim).toBe(true);
    expect(topo.gates.find(g => g.node.type === 'g-tf')!.dim).toBe(true);
    expect(targetMatches(fixture().nodes.targets[0], 'g-argo')).toBe(true); // by the gate on it
  });

  it('the registry filter removes groups and gate types that no remaining target belongs to', () => {
    const m = fixture();
    expect(registryTiers(m.nodes.targets)).toEqual(['flight', 'ground']);
    const topo = buildTopology(m, { ...NO_FILTERS, registry: 'ground' }, []);
    expect(topo.groups.map(g => g.node.group)).toEqual(['aws']);
    expect(topo.gates.map(g => g.node.type)).toEqual(['g-tf']);
    expect(topo.edges.every(e => e.edge.to === 'group:aws')).toBe(true);
  });

  it('past about 40 targets the rows give way to the matrix: no group expands, and the matrix has every target worst first', () => {
    const m = fixture();
    m.nodes.targets = Array.from({ length: MATRIX_THRESHOLD + 1 }, (_, i) => target(`t${i}-prod`, i % 2 ? 'aws' : 'hangar-prod', { status: i === 7 ? 'down' : 'ok', gates: i === 3 ? [] : [target('x', 'x').gates[1]] }));
    const topo = buildTopology(m, NO_FILTERS, ['hangar-prod']);
    expect(topo.matrix).toBe(true);
    expect(topo.groups.every(g => !g.expanded && g.rows.length === 0)).toBe(true);
    const mx = buildMatrix(m, topo.targets);
    expect(mx.targets).toHaveLength(MATRIX_THRESHOLD + 1);
    expect(mx.targets[0].id).toBe('t7-prod');
    expect(mx.cell('g-argo', mx.targets[0])).toBe('flag');
    expect(mx.cell('glidepath', mx.targets[0])).toBe('none');
    const silent = target('s', 'x', { gates: [{ ...target('x', 'x').gates[0], silent: true }] });
    expect(mx.cell('glidepath', silent)).toBe('silent');
  });

  it('orders the attention list down before attention before info, and a search keeps what names a match', () => {
    const m = fixture();
    const all = visibleAttention(m.attention, NO_FILTERS, m.nodes.targets);
    expect(all.map(a => a.severity)).toEqual(['down', 'attention', 'info']);
    expect(visibleAttention(m.attention, { ...NO_FILTERS, query: 'acct-prod' }, m.nodes.targets).map(a => a.kind)).toEqual(['blind-observer']);
    expect(visibleAttention(m.attention, { ...NO_FILTERS, registry: 'ground' }, m.nodes.targets.filter(t => t.registry === 'ground')).map(a => a.kind)).toEqual(['blind-observer', 'gate-silent']);
  });

  it('an attention item points at its target when it names one, else at its groups', () => {
    const m = fixture();
    expect(soleTarget(m.attention[1], m.nodes.targets)?.id).toBe('acct-prod');
    expect(soleTarget(m.attention[0], m.nodes.targets)).toBeUndefined();
    expect(groupsOf(m.attention[0], m.nodes.targets)).toEqual(['hangar-prod']);
  });

  it('knows an empty registry: no declared targets, not an empty filter', () => {
    const empty = fixture({ registry: { sources: [], conflicts: [], targets: 0 }, nodes: { gate_types: [], groups: [], targets: [], observers: [] }, edges: [], attention: [] });
    expect(registryEmpty(empty)).toBe(true);
    expect(registryEmpty(fixture())).toBe(false);
    expect(buildTopology(empty, NO_FILTERS, []).height).toBeGreaterThan(0);
  });
});

// The layout proofs: on the fixtures the app is built against (what live hangar-dev returns, and about 40 gate instances over
// 25 targets), whatever the filters and whichever groups are open.
const layouts: Array<[string, () => MapResponse, string[]]> = [
  ['the live two-publisher registry', liveFixture, []],
  ['the live registry, a group open', liveFixture, ['hangar-dev']],
  ['the scaled registry', scaledFixture, []],
  ['the scaled registry, groups open', scaledFixture, ['hangar-prod', 'aws-accounts']],
];

describe.each(layouts)('the topology layout of %s', (_name, make, open) => {
  const topo = buildTopology(make(), NO_FILTERS, open);
  const boxes = [...topo.gates, ...topo.groups, ...topo.observers];

  it('puts each kind of node in its own column, and every edge it is given on the page', () => {
    expect(topo.edges).toHaveLength(make().edges.length);
    expect(topo.gates.every(g => g.x === topo.gates[0].x)).toBe(true);
    expect(topo.groups.every(g => g.x === topo.groups[0].x)).toBe(true);
    expect(topo.observers.every(o => o.x === topo.observers[0].x)).toBe(true);
    expect(topo.gates[0].x + topo.gates[0].w).toBeLessThan(topo.groups[0].x);
    expect(topo.groups[0].x + topo.groups[0].w).toBeLessThan(topo.observers[0].x);
    for (const col of topo.columns) expect(col.label.length).toBeGreaterThan(0);
  });

  it('draws only horizontal and vertical runs', () => {
    for (const e of topo.edges) {
      expect(e.points.length).toBeGreaterThanOrEqual(2);
      for (const s of segments(e.points)) expect(s.a.x === s.b.x || s.a.y === s.b.y).toBe(true);
    }
  });

  it('never runs a line through a box: it ends on the border of the node it joins and is clear of every other', () => {
    for (const e of topo.edges) {
      for (const s of segments(e.points)) for (const b of boxes) expect(segHitsRect(s, b)).toBe(false);
    }
  });

  it('gives every line its own attach point on a node, and its own lane, so no two strokes lie on each other', () => {
    const starts = topo.edges.map(e => `${e.points[0].x},${e.points[0].y}`);
    const ends = topo.edges.map(e => `${e.points[e.points.length - 1].x},${e.points[e.points.length - 1].y}`);
    expect(new Set(starts).size).toBe(starts.length);
    expect(new Set(ends).size).toBe(ends.length);
    const all = topo.edges.map(e => segments(e.points));
    all.forEach((a, i) => all.slice(i + 1).forEach(b => a.forEach(s => b.forEach(o => {
      // a crossing at right angles is allowed; running along one another is not
      const parallel = (s.a.x === s.b.x) === (o.a.x === o.b.x);
      if (parallel) expect(segsCross(s, o)).toBe(false);
    }))));
    // attach points sit on the node's edge, spread (not stacked) where a node has several lines
    for (const e of topo.edges) {
      const first = e.points[0];
      const owner = [...topo.gates, ...topo.observers].find(n => first.y >= n.y && first.y <= n.y + n.h && (first.x === n.x + n.w || first.x === n.x))!;
      expect(owner).toBeTruthy();
    }
  });

  it('is wide enough for its lines: stroke widths never reach the pitch between neighbouring attach points', () => {
    for (const e of topo.edges) expect(e.width).toBeLessThanOrEqual(6);
    expect(topo.width).toBeGreaterThan(0);
    expect(topo.height).toBeGreaterThan(boxes.reduce((m, b) => Math.max(m, b.y + b.h), 0) - 1);
  });

  it('labels an edge only where it says something and the label fits clear of every line and box', () => {
    for (const e of topo.edges) {
      if (!e.label) continue;
      expect(e.edge.refused + e.edge.holding > 0 || e.edge.kind === 'watches').toBe(true);
      const box = { x: e.label.x - e.label.w / 2, y: e.label.y - 11, w: e.label.w, h: 12 };
      for (const b of boxes) expect(!(box.x < b.x + b.w && box.x + box.w > b.x && box.y < b.y + b.h && box.y + box.h > b.y)).toBe(true);
    }
  });
});

describe('the scaled registry is a page, not a wall', () => {
  it('is about 40 gate instances over 25 targets in five groups, drawn as five gate types and rows, not a matrix', () => {
    const m = scaledFixture();
    expect(m.nodes.gate_types.reduce((n, g) => n + g.instances, 0)).toBe(40);
    expect(m.nodes.targets).toHaveLength(25);
    const topo = buildTopology(m, NO_FILTERS, []);
    expect(topo.matrix).toBe(false);
    expect(topo.gates).toHaveLength(5);
    expect(topo.groups).toHaveLength(5);
    expect(topo.observers).toHaveLength(3);
    expect(topo.width).toBeLessThan(1150);
  });
});
