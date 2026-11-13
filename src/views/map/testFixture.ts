import type { GateRef, Lanes, MapResponse, TargetNode } from './types';

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
