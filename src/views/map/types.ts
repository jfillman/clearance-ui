import type { EvidenceRecord } from '../../kit';

// clearance-api's coverage Map (GET /v1/map, clearance docs/clearance-api.md "The coverage Map and the target registry",
// Clearance 0.45.0). Every field is as Clearance returns it; nothing here is computed client-side except the layout.

export type MapStatus = 'ok' | 'attention' | 'down';
export type Counts = Record<string, number>;

export interface GateMix {
  enforce: number;
  flag: number;
  silent: number;
}

/** The six steps a change takes through a gate: distinct changes at each (observed and verified are counted from the target's scope). */
export interface Lanes {
  requested: number;
  tiered: number;
  decided: number;
  applied: number;
  applied_matched: number;
  observed: number;
  verified: number;
}

export interface GateTypeNode {
  id: string;
  type: string;
  instances: number;
  targets: number;
  mix: GateMix;
  status: MapStatus;
  decisions: number;
  refused: number;
  exceptions: number;
  holding: number;
  coverage: Counts;
  lanes: Lanes;
}

export interface GroupNode {
  id: string;
  group: string;
  targets: number;
  kinds: Counts;
  status: MapStatus;
  mix: GateMix;
  no_gate: number;
  holding: number;
  coverage: Counts;
  verified_pct: number | null;
  observers: Counts;
}

export interface GateRef {
  type: string;
  instance: string;
  mode: string;
  attributed: boolean;
  silent: boolean;
  decisions: number;
  refused: number;
  exceptions: number;
  holding: number;
  coverage: Counts;
  lanes: Lanes;
}

export interface ObserverRef {
  provider: string;
  source: string;
  state: string;
  last_ts: string | null;
  stale: boolean;
  failed_checks: string[];
}

export interface TargetNode {
  id: string;
  source: string;
  name: string;
  kind: string;
  group: string;
  env?: string;
  app?: string;
  owner?: string;
  registry?: string;
  scope?: string;
  status: MapStatus;
  coverage: Counts;
  verified_pct: number | null;
  lanes: Lanes;
  holding: number;
  gates: GateRef[];
  observers: ObserverRef[];
}

export interface ObserverNode {
  id: string;
  provider: string;
  source: string;
  targets: number;
  states: Counts;
  status: MapStatus;
}

export interface MapEdge {
  from: string;
  to: string;
  kind: 'guards' | 'watches';
  targets: number;
  volume: number;
  refused: number;
  holding: number;
  status: MapStatus;
}

export interface AttentionItem {
  kind: string;
  severity: 'down' | 'attention' | 'info';
  title: string;
  detail: string;
  count: number;
  targets: string[];
  gate_type?: string;
  instance?: string;
}

export interface PartialNote {
  field: string;
  reason: string;
}

export interface MapChange {
  id: string;
  repo: string;
  pr: number;
  tier: number;
  state: string;
  owner?: string;
  cleared_by?: string;
  age_seconds: number;
  updated_at: string;
}

export interface TargetDetail {
  changes: MapChange[];
  exceptions: EvidenceRecord[];
  evidence: EvidenceRecord[];
}

export interface MapResponse {
  from: string;
  to: string;
  registry: { sources: Array<{ source: string; digest: string; targets: number; updated_at: string }>; conflicts: string[]; targets: number };
  nodes: { gate_types: GateTypeNode[]; groups: GroupNode[]; targets: TargetNode[]; observers: ObserverNode[] };
  edges: MapEdge[];
  attention: AttentionItem[];
  partial: PartialNote[];
  truncated: boolean;
  target?: TargetDetail | null;
}
