// clearance-api's shapes (clearance api.py, contract/clearance-api.json). Every field is as Clearance returns it.

export type Tier = 'T0' | 'T1' | 'T2' | 'T3';
export type SessionState = 'live' | 'closed' | 'expired';
export type Decision = 'allow' | 'deny';

export interface SessionLimits {
  tier_ceiling: Tier;
  ttl_minutes: number;
  tool_calls: number;
  github_calls: number;
  open_prs: number;
  model_tokens: number;
  children: number;
  tools: string[];
  models: string[];
  network: string;
  compute: string;
}

export interface Session {
  id: string;
  principal: string;
  agent: string;
  limits: SessionLimits;
  created_at: string;
  expires_at: string;
  parent_id: string | null;
  depth: number;
  task_id: string;
  used: Record<string, number>;
  reserved: Record<string, number>;
  children: string[];
  tripped: boolean;
  trip_reason: string | null;
  denials: number;
  closed: boolean;
  run: string | null;
  /** What an in-cluster run was asked (clearance v0.25.0); absent for a client session or an older Clearance. */
  input?: { prompt?: string; started_by?: string } | null;
  /** How the session ended (clearance v0.25.0), once it has. */
  outcome?: SessionOutcome | null;
  /** Computed by the API from closed and expires_at. */
  state: SessionState;
}

/**
 * How a session ended (clearance v0.25.0). status is the runtime's (done, budget, expired, error), or no-result (the
 * run ended without handing one back; run_phase says how), or expired (its deadline came first). `result` describes the
 * kept answer (GET /v1/sessions/{id}/result), null when none was kept.
 */
export interface SessionOutcome {
  status: 'done' | 'budget' | 'expired' | 'error' | 'no-result' | string;
  finished_at: string;
  turns?: number;
  tool_calls?: number;
  not_ok?: number;
  reason?: string;
  run_phase?: string;
  result: { bytes: number; sha256: string; truncated: boolean; expires_at: string } | null;
  via: 'runtime' | 'run' | 'deadline' | string;
}

/** A finished run's answer (GET /v1/sessions/{id}/result), kept 30 days. */
export interface RunResult {
  session: string;
  task_id: string;
  agent: string;
  status: string;
  final_text: string;
  truncated: boolean;
  turns: number;
  tool_calls: { tool: string; ok: boolean; rule: string | null }[];
  reason: string;
  written_at: string;
  expires_at: string;
}

export interface EvidenceRecord {
  seq: number;
  ts: string;
  task_id: string | null;
  session: string | null;
  parent: string | null;
  principal: string;
  agent: string | null;
  tool: string;
  tier: number | null;
  decision: Decision;
  rule: string | null;
  target: string | null;
  args_sha256: string;
  result: string;
  effect?: Record<string, unknown>;
  app?: string;
  schema: string;
  boundary: string;
  coverage: string;
  verified: string[];
  claimed: string[];
  prev_hash: string;
  hash: string;
  /** From the ledger: checkpointed, recorded-not-checkpointed or not-recorded. */
  assurance?: string;
}

export interface AgentDefinitionView {
  name: string;
  /** One line: what the agent is for (clearance v0.23.0). Absent on older servers. */
  description?: string | null;
  /** Where its loop runs (clearance v0.23.0): `cluster` = an AgentRun with its runtime image; `client` = no runtime, a
   *  person's own MCP client is the loop and Clearance enforces the envelope. Absent on older servers: see runsInOf. */
  runsIn?: RunsIn;
  kind: string;
  owner: string | null;
  identity: { type: string; serviceAccount: string | null };
  tierCeiling: Tier;
  tools: string[];
  models: string[];
  limits: { ttl_minutes: number; tool_calls: number; github_calls: number; open_prs: number; model_tokens: number; children: number };
  network: string;
  compute: string;
  repos: { allow: string[] };
  triggers: Array<Record<string, unknown>>;
  runtime: { framework: string; sandbox: string; image: string | null };
  scopes: Record<string, unknown>;
  instructions?: string | null;
  /** The active hold on its triggers (clearance control.py, v0.16.0), or null/absent. */
  hold?: { agent: string; by: string; via: string | null; reason: string; since: string; until: string } | null;
  /** Where the definition came from (clearance definitions.py, v0.18.0): bundled in the gateway's image, or pinned by an
   *  Agent XR. null/absent on a deployment whose definitions are a plain directory. */
  source?: AgentSource | null;
}

export type RunsIn = 'cluster' | 'client';

/** clearance definitions.Source.view(): `bundled`, or a cluster pin with its coordinates. `pin` is the one line. */
export interface AgentSource {
  kind: 'bundled' | 'cluster';
  repo?: string;
  path?: string;
  commit?: string;
  namespace?: string;
  xr?: string;
  loaded_at?: string;
  pin: string;
}

/** An Agent XR pin Clearance could not load, and why (GET /v1/agents `rejected`). */
export interface RejectedPin {
  name: string;
  source: AgentSource;
  reason: string;
}

/** GET /v1/agents: the definitions, and the pins that did not load. */
export interface AgentsList {
  items: AgentDefinitionView[];
  rejected?: RejectedPin[];
}

export interface Page<T> {
  items: T[];
  next: string | number | null;
}

export interface TaskTree {
  task_id: string;
  sessions: Session[];
  used: Record<string, number>;
}

/** A question an agent asked a person (clearance inbox.py HumanRequest.view), from /v1/human/requests. */
export interface HumanRequest {
  id: string;
  task_id: string;
  session: string;
  agent: string;
  /** The session's principal. */
  owner: string;
  /** The definition's owner group, if any. */
  group: string | null;
  question: string;
  options: string[];
  created_at: string;
  expires_at: string;
  status: 'pending' | 'answered' | 'expired';
  answer: string | null;
  answered_by: string | null;
  answered_via: string | null;
  answered_at: string | null;
}

/** One event the trigger bridge received and what it did with it (clearance events.py), from /v1/events (v0.15.0). */
export interface EventHistory {
  id: string;
  received_at: string;
  source: string;
  routing_key: string | null;
  type: string | null;
  app: string | null;
  /** The event's subject: for a Glidepath pipeline event, the PipelineRun's name and a few of its fields. */
  subject: { id?: string | null; content?: Record<string, unknown> };
  /** Per agent whose trigger matched: launched, deduped, braked, refused or launch-failed. */
  outcomes: Array<{ agent: string; result: string; session?: string; run?: string; rule?: string }>;
}

/** The deployment gate (clearance gate.py, v0.19.0): a change to a protected environment, as GET /v1/clearances carries it. */
export type ChangeState = 'holding' | 'cleared' | 'denied' | 'expired' | 'superseded';

export interface ChangeReason {
  subject: string;
  /** kind:Secret | field:secretKeyRef | path:clearance.yaml | image-bump | metadata-only | non-runtime | checks:ci | provenance:agent ... */
  rule: string;
  tier: number;
}

export interface ChangeRequirement {
  owner: number;
  outside: number;
  ownerGroup: string;
  outsideGroups: string[];
}

export interface ChangeApproval {
  person: string;
  via: string | null;
  role: 'owner' | 'outside';
  at: string;
}

export interface ChangeObject {
  apiVersion: string;
  kind: string;
  namespace: string;
  name: string;
  op: 'added' | 'changed' | 'removed';
  fields: string[];
  images: string[];
  digest: string;
}

export interface Change {
  id: string;
  app: string;
  env: string;
  cluster: string;
  repo: string;
  pr: number;
  head: string;
  base: string;
  target: string;
  proposer: string;
  proposer_kind: 'person' | 'agent' | 'unknown';
  agent: string | null;
  owner: string;
  tree_digest: string;
  paths: string[];
  lines_changed: number;
  objects: ChangeObject[];
  checks: Record<string, string>;
  policy_version: string;
  repo_policy_digest: string | null;
  tier: number;
  reasons: ChangeReason[];
  requirement: ChangeRequirement | null;
  state: ChangeState;
  approvals: ChangeApproval[];
  cleared_by: 'policy' | 'people' | null;
  deny_reason: string | null;
  denied_by: string | null;
  superseded_by: string | null;
  created_at: string;
  updated_at: string;
  expires_at: string;
  decided_at: string | null;
  registered_by: string;
  /** Since clearance v0.45.0 (absent on an older Clearance): the change's first deploy.request, its outcome and its signed attestation. */
  request?: RecordRef | null;
  outcome?: ChangeOutcome | null;
  attestation?: ChangeAttestation | null;
}

/** A record on the evidence chain by its sequence number and hash. */
export interface RecordRef {
  seq: number;
  hash: string;
}

/** The last answer of the server-side verify (GET /v1/clearances/{id}/attestation/verify), or null when none was asked. */
export interface VerificationBrief {
  verified: boolean;
  checked_at: string;
}

/** The deploy's outcome on a cleared change (clearance gate.md "The outcome on the change"). */
export interface ChangeOutcome {
  seq: number;
  hash?: string;
  applied: boolean;
  matched: boolean;
  at: string;
  digest?: string;
  plan_digest?: string;
  provider?: string;
  release?: string;
  exception?: number | null;
}

/** The change's signed attestation as GET /v1/clearances/{id} shows it. */
export interface ChangeAttestation {
  digest: string;
  backend: string;
  key_id?: string;
  outcome_seq: number;
  record_seq: number;
  rekor_log_index: number | null;
  rekor_uuid?: string;
  created_at: string;
  verification: VerificationBrief | null;
}

/** One record of a change's history (GET /v1/clearances/{id}/records): the deploy.* record as GET /v1/evidence/{seq} serves it. */
export interface ChangeRecordItem {
  seq: number;
  hash: string;
  tool: string;
  ts: string;
  principal: string | null;
  record: Record<string, unknown>;
}

/** One row of GET /v1/attestations. */
export interface AttestationRow {
  change_id: string;
  app: string;
  env: string;
  cluster: string;
  release_id: string | null;
  tree_digest: string;
  signed_at: string;
  digest: string;
  backend: string;
  key_id?: string;
  rekor_log_index: number | null;
  rekor_uuid?: string;
  outcome_seq: number;
  record_seq: number;
  verification: VerificationBrief | null;
}

/** GET /v1/clearances/{id}/attestation/verify: only `verified: true` may be shown as verified. */
export interface VerifyAnswer {
  verified: boolean;
  cached: boolean;
  checked_at: string;
  digest: string;
  subject: string;
  mode?: string;
  key_id?: string;
  identity?: string;
  issuer?: string;
  rekor: { log_index: number | null; integrated_time: string | null; verified: boolean };
  errors: string[];
}

/** GET /v1/attestation-config: public values only. `verifiable` is false when this Clearance has no trust configured. */
export interface AttestationConfig {
  verifiable: boolean;
  modes: string[];
  rekor_url: string;
  /** With `{log_index}` to fill. */
  rekor_entry_url: string;
  identity?: string;
  issuer?: string;
  key_ids: string[];
  verify_commands: string[];
}

/** A runtime catalog entry (clearance runtimes.py, GET /v1/runtimes): an image a definition may run, or a base image. */
export interface RuntimeEntry {
  name: string;
  image: string | null;
  kind: 'runtime' | 'base';
  framework: string;
  summary: string;
  status: 'available' | 'planned';
}

/** GET /v1/runtimes: the catalog, and the globs an image built for an agent's own repo (custom) must match.
 * custom_images is absent before Clearance v0.25.0; empty means this deployment allows catalog images only. */
export interface RuntimeCatalog {
  items: RuntimeEntry[];
  custom_images?: string[];
}

/** GET /api/clearance/drift: whether the definition file on the repo's main moved past the pinned commit. */
export interface DefinitionDrift {
  repo: string;
  path: string;
  pinned: string;
  latest: string | null;
  latestAt: string | null;
  /** Commits on main that changed the file after the pinned one (capped at `limit`). */
  behind: number;
  limit: number;
}

// -- observations and the coverage statement (O-1, O-5; clearance contract/clearance-api.json, ObserveStatement) ----------

export type CoverageHealth = 'healthy' | 'degraded' | 'blind';

export interface ObserveItem {
  seq: number;
  ts: string;
  source: string;
  coverage: string;
  resource?: string;
  api?: string;
  tier: number | null;
  assessment: number | null;
  cause: string | null;
  resolution: string | null;
  resolution_seq: number | null;
  resolved_at: string | null;
  resolved_by: string | null;
  source_verified: boolean;
  monitoring_protection?: boolean;
  succeeded?: boolean | null;
}

export interface ObservePart {
  count: number;
  by_coverage: Record<string, number>;
  items: ObserveItem[];
  truncated: boolean;
}

export interface ObserveSourceHealth {
  source: string;
  state: CoverageHealth;
  now: string;
  stale: boolean;
  failed_checks: string[];
  last_seq: number | null;
  last_ts: string | null;
  blind_seconds: number;
  degraded_seconds: number;
}

export interface ObserveSegment {
  source: string;
  state: string;
  reason: string;
  from: string;
  to: string;
  seconds: number;
  seq: number | null;
}

export interface CoverageStatement {
  scope: string;
  from: string;
  to: string;
  state: CoverageHealth;
  clean: boolean;
  truncated: boolean;
  text: string;
  cleared_and_verified: ObservePart;
  seen_not_cleared: ObservePart;
  could_not_see: { seconds: number; segments: ObserveSegment[]; audit_gaps: Array<{ seq: number; source: string; state: string; reason: string; ts: string }> };
  health: { sources: ObserveSourceHealth[] };
  source_integrity: { observations: number; verified: number; unverified: number; verified_by_record: number; verified_later: number };
}

/** The observation records (listObservations): a stored evidence record, read loosely, the way Clearance writes it. */
export interface ObservationRecord {
  seq: number;
  ts: string;
  scope?: string;
  source?: { name?: string; event_id?: string };
  resource?: Record<string, unknown>;
  actor?: { subject?: string; chain?: string[]; issuer?: string; client?: string };
  action?: { verb?: string; api?: string; succeeded?: boolean; protects_monitoring?: boolean };
  state_change?: { before?: unknown; after?: unknown };
  coverage?: string;
  /** On a resolution record: what was set, by whom, and about which observation. */
  resolution?: { state?: string; cause?: string | null; note?: string; by?: string };
  about?: { seq?: number };
  /** The fields whose secret-bearing values Clearance replaced with [redacted] for this reader (v0.41.0): `state_change`, `exception`. */
  redacted?: string[];
  [key: string]: unknown;
}

export const RESOLUTION_STATES = ['reverted', 'ratified', 'declared-break-glass', 'still-live'] as const;
export const RESOLUTION_CAUSES = [
  'agent-caused',
  'policy-triggered',
  'human-initiated',
  'automated-remediation',
  'requirement-changed',
  'external-dependency',
  'unattributed',
] as const;
export type ResolutionState = (typeof RESOLUTION_STATES)[number];
export type ResolutionCause = (typeof RESOLUTION_CAUSES)[number];

export interface Resolution {
  state: ResolutionState;
  cause?: ResolutionCause;
  note?: string;
}

export interface ResolutionRecorded {
  seq: number;
  about: number;
  scope: string;
  state: ResolutionState;
  cause: ResolutionCause | null;
  note: string | null;
  by: string;
  via: string | null;
  ts: string;
}

/** POST /v1/observations/resolutions: the batch id every record carries and each item's outcome. */
export interface BulkResolutionRecorded {
  batch: string;
  state: ResolutionState;
  cause: ResolutionCause | null;
  note: string | null;
  by: string;
  via: string | null;
  ts: string;
  recorded: Array<{ seq: number; record_seq: number; scope: string }>;
  skipped: Array<{ seq: number; reason: string }>;
  failed: Array<{ seq: number; error: string }>;
}

export interface ScopeList {
  scopes: string[];
  source: 'coverage' | 'config' | 'none';
}

/** GET /v1/clearance-policy: the deployment gate's policy in force (the part the tier legend reads). */
export interface GatePolicy {
  version: string;
  /** What each tier above 1 needs: how many from the app's owner group and from outside it. */
  approvers: Record<string, { owner: number; outside: number }>;
  maxLinesTier1: number;
  outsideGroups: string[];
  ttlDays: number;
  repoPolicy: string | null;
}
