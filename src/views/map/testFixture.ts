import type { GateRef, Lanes, MapEdge, MapResponse, ObserverRef, TargetNode } from './types';

// A small registry shaped like the API doc's example: two groups, three gate types, one flag-mode gate, one blind observer.
export const lanes = (over: Partial<Lanes> = {}): Lanes => ({ requested: 10, tiered: 10, decided: 9, applied: 8, applied_matched: 7, observed: 30, verified: 28, ...over });
export const gate = (type: string, over: Partial<GateRef> = {}): GateRef => ({ type, instance: `${type}-1`, mode: 'enforce', attributed: true, silent: false, decisions: 20, refused: 1, exceptions: 0, holding: 0, coverage: {}, lanes: lanes(), ...over });
export const target = (id: string, group: string, over: Partial<TargetNode> = {}): TargetNode => ({
  id,
  source: group,
  name: id.replace(/-prod$/, ''),
  kind: 'k8s-namespace',
  group,
  env: 'prod',
  app: id.replace(/-prod$/, ''),
  owner: 'group:default/team-a',
  registry: 'flight',
  scope: group,
  status: 'ok',
  coverage: { 'authorized-and-verified': 15, 'observed-not-attributed': 1, unassessed: 0 },
  verified_pct: 97.1,
  lanes: lanes(),
  holding: 0,
  gates: [gate('glidepath'), gate('g-argo', { mode: 'flag', refused: 2 })],
  observers: [{ provider: 'observe-k8s', source: 'observe-k8s', state: 'healthy', last_ts: '2026-11-13T11:59:30Z', stale: false, failed_checks: [] }],
  ...over,
});

export function fixture(over: Partial<MapResponse> = {}): MapResponse {
  const targets = [
    target('gate-api-prod', 'hangar-prod', { holding: 1, status: 'attention' }),
    target('flight-api-prod', 'hangar-prod', { verified_pct: 100 }),
    target('acct-prod', 'aws', {
      kind: 'aws-account',
      registry: 'ground',
      status: 'down',
      verified_pct: null,
      gates: [gate('g-tf')],
      observers: [{ provider: 'observe-aws', source: 'observe-aws', state: 'blind', last_ts: null, stale: true, failed_checks: ['lag'] }],
    }),
  ];
  const mix = { enforce: 3, flag: 1, silent: 0 };
  return {
    from: '2026-11-13T11:00:00Z',
    to: '2026-11-13T12:00:00Z',
    registry: { sources: [{ source: 'hangar-prod', digest: 'x', targets: 3, updated_at: '2026-11-13T09:00:00Z' }], conflicts: [], targets: 3 },
    nodes: {
      gate_types: [
        { id: 'gate:glidepath', type: 'glidepath', instances: 2, targets: 2, mix, status: 'ok', decisions: 412, refused: 9, exceptions: 0, holding: 0, coverage: { 'authorized-and-verified': 10 }, lanes: lanes() },
        { id: 'gate:g-argo', type: 'g-argo', instances: 2, targets: 2, mix: { enforce: 0, flag: 2, silent: 0 }, status: 'attention', decisions: 3000, refused: 4, exceptions: 1, holding: 1, coverage: {}, lanes: lanes() },
        { id: 'gate:g-tf', type: 'g-tf', instances: 1, targets: 1, mix: { enforce: 1, flag: 0, silent: 0 }, status: 'down', decisions: 0, refused: 0, exceptions: 0, holding: 0, coverage: {}, lanes: lanes({ observed: 0, verified: 0 }) },
      ],
      groups: [
        { id: 'group:hangar-prod', group: 'hangar-prod', targets: 2, kinds: { 'k8s-namespace': 2 }, status: 'attention', mix, no_gate: 0, holding: 1, coverage: { 'authorized-and-verified': 30 }, verified_pct: 98.5, observers: { healthy: 2 } },
        { id: 'group:aws', group: 'aws', targets: 1, kinds: { 'aws-account': 1 }, status: 'down', mix: { enforce: 1, flag: 0, silent: 0 }, no_gate: 0, holding: 0, coverage: {}, verified_pct: null, observers: { blind: 1 } },
      ],
      targets,
      observers: [
        { id: 'observer:observe-k8s/observe-k8s', provider: 'observe-k8s', source: 'observe-k8s', targets: 2, states: { healthy: 2 }, status: 'ok' },
        { id: 'observer:observe-aws/observe-aws', provider: 'observe-aws', source: 'observe-aws', targets: 1, states: { blind: 1 }, status: 'down' },
      ],
    },
    edges: [
      { from: 'gate:glidepath', to: 'group:hangar-prod', kind: 'guards', targets: 2, volume: 412, refused: 9, holding: 0, status: 'ok' },
      { from: 'gate:g-argo', to: 'group:hangar-prod', kind: 'guards', targets: 2, volume: 3000, refused: 4, holding: 1, status: 'attention' },
      { from: 'gate:g-tf', to: 'group:aws', kind: 'guards', targets: 1, volume: 0, refused: 0, holding: 0, status: 'down' },
      { from: 'observer:observe-k8s/observe-k8s', to: 'group:hangar-prod', kind: 'watches', targets: 2, volume: 0, refused: 0, holding: 0, status: 'ok' },
      { from: 'observer:observe-aws/observe-aws', to: 'group:aws', kind: 'watches', targets: 1, volume: 0, refused: 0, holding: 0, status: 'down' },
    ],
    attention: [
      { kind: 'flag-mode', severity: 'attention', title: 'g-argo on hangar-prod', detail: '2 of 2 instances in flag mode', count: 2, targets: ['gate-api-prod', 'flight-api-prod'], gate_type: 'g-argo' },
      { kind: 'blind-observer', severity: 'down', title: 'observe-aws/observe-aws is blind on acct-prod', detail: 'lag', count: 1, targets: ['acct-prod'] },
      { kind: 'gate-silent', severity: 'info', title: 'glidepath-9 is silent', detail: 'no record names it', count: 1, targets: [] },
    ],
    partial: [{ field: 'lanes.observed,lanes.verified', reason: 'counted from the target scope, not joined to each change' }],
    truncated: false,
    ...over,
  };
}

const obs = (provider: string, state = 'healthy', over: Partial<ObserverRef> = {}): ObserverRef => ({ provider, source: provider, state, last_ts: state === 'blind' ? null : '2026-11-13T11:59:30Z', stale: state === 'blind', failed_checks: [], ...over });

/** What a live two-publisher hangar-dev returns now: hangar-prod publishes gate-api-prod, hangar-dev a namespace and an AWS account (placeholder names, no real ids). */
export function liveFixture(): MapResponse {
  const targets: TargetNode[] = [
    target('gate-api-prod', 'hangar-prod', {
      name: 'gate-api',
      source: 'hangar-prod',
      registry: 'flight',
      verified_pct: 98.6,
      coverage: { 'authorized-and-verified': 71, 'observed-not-attributed': 1 },
      gates: [gate('glidepath', { instance: 'glidepath-gate-api', decisions: 212, refused: 3 }), gate('g-argo', { instance: 'g-argo-prod', mode: 'flag', decisions: 96, refused: 1 })],
      status: 'attention',
      holding: 1,
      observers: [obs('observe-k8s'), obs('observe-aws')],
    }),
    target('dev-namespace', 'hangar-dev', { name: 'dev-namespace', source: 'hangar-dev', env: 'dev', registry: 'flight', verified_pct: 100, coverage: { 'authorized-and-verified': 12 }, gates: [], observers: [obs('observe-k8s')], status: 'attention' }),
    target('dev-aws-account', 'hangar-dev', { name: 'dev-aws-account', source: 'hangar-dev', kind: 'aws-account', env: 'dev', registry: 'ground', verified_pct: 100, coverage: { 'authorized-and-verified': 4 }, gates: [gate('g-tf', { instance: 'g-tf-dev', decisions: 9 })], observers: [obs('observe-aws')] }),
  ];
  return {
    from: '2026-11-13T11:00:00Z',
    to: '2026-11-13T12:00:00Z',
    registry: { sources: [{ source: 'hangar-prod', digest: 'a', targets: 1, updated_at: '2026-11-13T09:00:00Z' }, { source: 'hangar-dev', digest: 'b', targets: 2, updated_at: '2026-11-13T09:00:00Z' }], conflicts: [], targets: 3 },
    nodes: {
      gate_types: [
        { id: 'gate:glidepath', type: 'glidepath', instances: 1, targets: 1, mix: { enforce: 1, flag: 0, silent: 0 }, status: 'ok', decisions: 212, refused: 3, exceptions: 0, holding: 1, coverage: { 'authorized-and-verified': 71 }, lanes: lanes() },
        { id: 'gate:g-argo', type: 'g-argo', instances: 1, targets: 1, mix: { enforce: 0, flag: 1, silent: 0 }, status: 'attention', decisions: 96, refused: 1, exceptions: 0, holding: 0, coverage: {}, lanes: lanes() },
        { id: 'gate:g-tf', type: 'g-tf', instances: 1, targets: 1, mix: { enforce: 1, flag: 0, silent: 0 }, status: 'ok', decisions: 9, refused: 0, exceptions: 0, holding: 0, coverage: {}, lanes: lanes() },
      ],
      groups: [
        { id: 'group:hangar-prod', group: 'hangar-prod', targets: 1, kinds: { 'k8s-namespace': 1 }, status: 'attention', mix: { enforce: 1, flag: 1, silent: 0 }, no_gate: 0, holding: 1, coverage: { 'authorized-and-verified': 71, 'observed-not-attributed': 1 }, verified_pct: 98.6, observers: { healthy: 2 } },
        { id: 'group:hangar-dev', group: 'hangar-dev', targets: 2, kinds: { 'k8s-namespace': 1, 'aws-account': 1 }, status: 'attention', mix: { enforce: 1, flag: 0, silent: 0 }, no_gate: 1, holding: 0, coverage: { 'authorized-and-verified': 16 }, verified_pct: 100, observers: { healthy: 2 } },
      ],
      targets,
      observers: [
        { id: 'observer:observe-k8s/observe-k8s', provider: 'observe-k8s', source: 'observe-k8s', targets: 2, states: { healthy: 2 }, status: 'ok' },
        { id: 'observer:observe-aws/observe-aws', provider: 'observe-aws', source: 'observe-aws', targets: 2, states: { healthy: 2 }, status: 'ok' },
      ],
    },
    edges: [
      { from: 'gate:glidepath', to: 'group:hangar-prod', kind: 'guards', targets: 1, volume: 212, refused: 3, holding: 1, status: 'attention' },
      { from: 'gate:g-argo', to: 'group:hangar-prod', kind: 'guards', targets: 1, volume: 96, refused: 1, holding: 0, status: 'attention' },
      { from: 'gate:g-tf', to: 'group:hangar-dev', kind: 'guards', targets: 1, volume: 9, refused: 0, holding: 0, status: 'ok' },
      { from: 'observer:observe-k8s/observe-k8s', to: 'group:hangar-prod', kind: 'watches', targets: 1, volume: 0, refused: 0, holding: 0, status: 'ok' },
      { from: 'observer:observe-k8s/observe-k8s', to: 'group:hangar-dev', kind: 'watches', targets: 1, volume: 0, refused: 0, holding: 0, status: 'ok' },
      { from: 'observer:observe-aws/observe-aws', to: 'group:hangar-prod', kind: 'watches', targets: 1, volume: 0, refused: 0, holding: 0, status: 'ok' },
      { from: 'observer:observe-aws/observe-aws', to: 'group:hangar-dev', kind: 'watches', targets: 1, volume: 0, refused: 0, holding: 0, status: 'ok' },
    ],
    attention: [
      { kind: 'holding', severity: 'attention', title: '1 change waiting on a person', detail: 'tier 2 on gate-api', count: 1, targets: ['gate-api-prod'] },
      { kind: 'flag-mode', severity: 'attention', title: 'g-argo on hangar-prod', detail: '1 of 1 instances in flag mode', count: 1, targets: ['gate-api-prod'], gate_type: 'g-argo' },
      { kind: 'no-gate', severity: 'attention', title: 'dev-namespace has no gate', detail: 'declared, nothing guards it', count: 1, targets: ['dev-namespace'] },
    ],
    partial: [],
    truncated: false,
  };
}

const status = (warn: boolean, down = false): 'ok' | 'attention' | 'down' => {
  if (down) return 'down';
  return warn ? 'attention' : 'ok';
};
const pctOf = (bad: boolean, warn: boolean, aws: boolean): number | null => {
  if (bad) return aws ? null : 70;
  return warn ? 90 : 100;
};

/** About 40 gate instances and 25 targets, as the C9 board: five gate types, five groups, three observers, every pair guarded that should be. */
export function scaledFixture(): MapResponse {
  const types = [
    { type: 'autopilot', instances: 5, flag: 0, volume: 4800, refused: 12 },
    { type: 'glidepath', instances: 14, flag: 2, volume: 2600, refused: 41 },
    { type: 'github', instances: 9, flag: 0, volume: 900, refused: 0 },
    { type: 'g-argo', instances: 8, flag: 3, volume: 640, refused: 22 },
    { type: 'g-tf', instances: 4, flag: 2, volume: 38, refused: 3 },
  ];
  const plan: Array<{ group: string; n: number; kind: string; registry: string; gates: string[]; observer: string; env: string }> = [
    { group: 'hangar-prod', n: 12, kind: 'k8s-namespace', registry: 'flight', gates: ['autopilot', 'glidepath', 'g-argo'], observer: 'observe-k8s', env: 'prod' },
    { group: 'eks-prod-a', n: 4, kind: 'k8s-namespace', registry: 'flight', gates: ['autopilot', 'glidepath', 'g-argo'], observer: 'observe-k8s', env: 'prod' },
    { group: 'eks-prod-b', n: 3, kind: 'k8s-namespace', registry: 'flight', gates: ['glidepath', 'g-argo'], observer: 'observe-k8s', env: 'prod' },
    { group: 'aws-accounts', n: 3, kind: 'aws-account', registry: 'ground', gates: ['g-tf', 'glidepath'], observer: 'observe-aws', env: 'prod' },
    { group: 'github-envs', n: 3, kind: 'github-environment', registry: 'ground', gates: ['github'], observer: 'observe-github', env: 'prod' },
  ];
  const targets: TargetNode[] = plan.flatMap(p =>
    Array.from({ length: p.n }, (_, i): TargetNode => {
      const bad = (p.group === 'aws-accounts' && i === 0) || (p.group === 'hangar-prod' && i === 3);
      const warn = (p.group === 'hangar-prod' && i === 4) || (p.group === 'eks-prod-a' && i === 1);
      const noGate = p.group === 'github-envs' && i === 2;
      const id = `${p.group.replace(/[^a-z]/g, '')}-${i + 1}`;
      return target(id, p.group, {
        name: id,
        source: p.group,
        kind: p.kind,
        env: p.env,
        registry: p.registry,
        status: bad ? 'down' : status(warn || noGate),
        verified_pct: pctOf(bad, warn, p.kind === 'aws-account'),
        holding: warn ? 1 : 0,
        gates: noGate ? [] : p.gates.map((t, k) => gate(t, { instance: `${t}-${id}`, mode: k === 1 && i % 5 === 0 ? 'flag' : 'enforce' })),
        observers: [obs(p.observer, bad && p.kind === 'aws-account' ? 'blind' : 'healthy')],
      });
    }),
  );
  const m = (g: { enforce: number; flag: number; silent: number }) => g;
  const gate_types = types.map(t => ({
    id: `gate:${t.type}`,
    type: t.type,
    instances: t.instances,
    targets: new Set(targets.filter(x => x.gates.some(g => g.type === t.type)).map(x => x.id)).size,
    mix: m({ enforce: t.instances - t.flag, flag: t.flag, silent: 0 }),
    status: status(t.flag > 0, t.type === 'g-tf'),
    decisions: t.volume,
    refused: t.refused,
    exceptions: 0,
    holding: t.type === 'glidepath' ? 2 : 0,
    coverage: { 'authorized-and-verified': t.volume },
    lanes: lanes(),
  }));
  const groups = plan.map(p => {
    const mine = targets.filter(t => t.group === p.group);
    const worst = status(mine.some(t => t.status === 'attention'), mine.some(t => t.status === 'down'));
    return {
      id: `group:${p.group}`,
      group: p.group,
      targets: mine.length,
      kinds: { [p.kind]: mine.length },
      status: worst,
      mix: { enforce: mine.length * p.gates.length, flag: 1, silent: 0 },
      no_gate: mine.filter(t => t.gates.length === 0).length,
      holding: mine.reduce((n, t) => n + t.holding, 0),
      coverage: { 'authorized-and-verified': 80 * mine.length, 'observed-not-attributed': 3 * mine.length, 'out-of-band-detected': worst === 'down' ? 6 : 0, unassessed: p.group === 'aws-accounts' ? 30 : 0 },
      verified_pct: p.group === 'aws-accounts' ? 62 : 96,
      observers: { [p.observer === 'observe-aws' ? 'blind' : 'healthy']: 1 },
    };
  });
  const edges: MapEdge[] = [];
  for (const p of plan) {
    for (const t of p.gates) {
      const ty = types.find(x => x.type === t)!;
      edges.push({ from: `gate:${t}`, to: `group:${p.group}`, kind: 'guards', targets: p.n, volume: Math.round(ty.volume * (p.n / 25)), refused: p.group === 'hangar-prod' ? Math.round(ty.refused / 2) : 0, holding: t === 'glidepath' && p.group === 'eks-prod-a' ? 1 : 0, status: status(t === 'g-argo' && p.group === 'hangar-prod', t === 'g-tf') });
    }
    edges.push({ from: `observer:${p.observer}/${p.observer}`, to: `group:${p.group}`, kind: 'watches', targets: p.n, volume: 0, refused: 0, holding: 0, status: p.observer === 'observe-aws' ? 'down' : 'ok' });
  }
  return {
    from: '2026-11-13T11:00:00Z',
    to: '2026-11-13T12:00:00Z',
    registry: { sources: plan.map(p => ({ source: p.group, digest: 'x', targets: p.n, updated_at: '2026-11-13T09:00:00Z' })), conflicts: [], targets: targets.length },
    nodes: {
      gate_types,
      groups,
      targets,
      observers: ['observe-k8s', 'observe-aws', 'observe-github'].map(o => ({ id: `observer:${o}/${o}`, provider: o, source: o, targets: targets.filter(t => t.observers[0].provider === o).length, states: { [o === 'observe-aws' ? 'blind' : 'healthy']: 1 }, status: (o === 'observe-aws' ? 'down' : 'ok') as 'ok' | 'down' })),
    },
    edges,
    attention: [
      { kind: 'no-gate', severity: 'down', title: '1 target with no gate', detail: 'github-envs-3', count: 1, targets: ['githubenvs-3'] },
      { kind: 'blind-observer', severity: 'down', title: 'observe-aws is blind on awsaccounts-1', detail: 'applies cannot be verified', count: 1, targets: ['awsaccounts-1'] },
      { kind: 'flag-mode', severity: 'attention', title: 'g-argo on hangar-prod', detail: '3 of 8 instances in flag mode, refusals not enforced', count: 3, targets: [], gate_type: 'g-argo' },
      { kind: 'holding', severity: 'attention', title: '3 changes waiting on a person', detail: 'tier 3 · tier 2 · tier 2', count: 3, targets: [] },
    ],
    partial: [],
    truncated: false,
  };
}
