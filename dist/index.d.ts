import * as react from 'react';
import { ReactNode, ButtonHTMLAttributes, ReactElement } from 'react';

type Tier = 'T0' | 'T1' | 'T2' | 'T3';
type SessionState = 'live' | 'closed' | 'expired';
type Decision = 'allow' | 'deny';
interface SessionLimits {
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
interface Session {
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
    input?: {
        prompt?: string;
        started_by?: string;
    } | null;
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
interface SessionOutcome {
    status: 'done' | 'budget' | 'expired' | 'error' | 'no-result' | string;
    finished_at: string;
    turns?: number;
    tool_calls?: number;
    not_ok?: number;
    reason?: string;
    run_phase?: string;
    result: {
        bytes: number;
        sha256: string;
        truncated: boolean;
        expires_at: string;
    } | null;
    via: 'runtime' | 'run' | 'deadline' | string;
}
/** A finished run's answer (GET /v1/sessions/{id}/result), kept 30 days. */
interface RunResult {
    session: string;
    task_id: string;
    agent: string;
    status: string;
    final_text: string;
    truncated: boolean;
    turns: number;
    tool_calls: {
        tool: string;
        ok: boolean;
        rule: string | null;
    }[];
    reason: string;
    written_at: string;
    expires_at: string;
}
interface EvidenceRecord {
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
interface AgentDefinitionView {
    name: string;
    /** One line: what the agent is for (clearance v0.23.0). Absent on older servers. */
    description?: string | null;
    /** Where its loop runs (clearance v0.23.0): `cluster` = an AgentRun with its runtime image; `client` = no runtime, a
     *  person's own MCP client is the loop and Clearance enforces the envelope. Absent on older servers: see runsInOf. */
    runsIn?: RunsIn;
    kind: string;
    owner: string | null;
    identity: {
        type: string;
        serviceAccount: string | null;
    };
    tierCeiling: Tier;
    tools: string[];
    models: string[];
    limits: {
        ttl_minutes: number;
        tool_calls: number;
        github_calls: number;
        open_prs: number;
        model_tokens: number;
        children: number;
    };
    network: string;
    compute: string;
    repos: {
        allow: string[];
    };
    triggers: Array<Record<string, unknown>>;
    runtime: {
        framework: string;
        sandbox: string;
        image: string | null;
    };
    scopes: Record<string, unknown>;
    instructions?: string | null;
    /** The active hold on its triggers (clearance control.py, v0.16.0), or null/absent. */
    hold?: {
        agent: string;
        by: string;
        via: string | null;
        reason: string;
        since: string;
        until: string;
    } | null;
    /** Where the definition came from (clearance definitions.py, v0.18.0): bundled in the gateway's image, or pinned by an
     *  Agent XR. null/absent on a deployment whose definitions are a plain directory. */
    source?: AgentSource | null;
}
type RunsIn = 'cluster' | 'client';
/** clearance definitions.Source.view(): `bundled`, or a cluster pin with its coordinates. `pin` is the one line. */
interface AgentSource {
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
interface RejectedPin {
    name: string;
    source: AgentSource;
    reason: string;
}
/** GET /v1/agents: the definitions, and the pins that did not load. */
interface AgentsList {
    items: AgentDefinitionView[];
    rejected?: RejectedPin[];
}
interface Page<T> {
    items: T[];
    next: string | number | null;
}
interface TaskTree {
    task_id: string;
    sessions: Session[];
    used: Record<string, number>;
}
/** A question an agent asked a person (clearance inbox.py HumanRequest.view), from /v1/human/requests. */
interface HumanRequest {
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
interface EventHistory {
    id: string;
    received_at: string;
    source: string;
    routing_key: string | null;
    type: string | null;
    app: string | null;
    /** The event's subject: for a Glidepath pipeline event, the PipelineRun's name and a few of its fields. */
    subject: {
        id?: string | null;
        content?: Record<string, unknown>;
    };
    /** Per agent whose trigger matched: launched, deduped, braked, refused or launch-failed. */
    outcomes: Array<{
        agent: string;
        result: string;
        session?: string;
        run?: string;
        rule?: string;
    }>;
}
/** The deployment gate (clearance gate.py, v0.19.0): a change to a protected environment, as GET /v1/clearances carries it. */
type ChangeState = 'holding' | 'cleared' | 'denied' | 'expired' | 'superseded';
interface ChangeReason {
    subject: string;
    /** kind:Secret | field:secretKeyRef | path:clearance.yaml | image-bump | metadata-only | non-runtime | checks:ci | provenance:agent ... */
    rule: string;
    tier: number;
}
interface ChangeRequirement {
    owner: number;
    outside: number;
    ownerGroup: string;
    outsideGroups: string[];
}
interface ChangeApproval {
    person: string;
    via: string | null;
    role: 'owner' | 'outside';
    at: string;
}
interface ChangeObject {
    apiVersion: string;
    kind: string;
    namespace: string;
    name: string;
    op: 'added' | 'changed' | 'removed';
    fields: string[];
    images: string[];
    digest: string;
}
interface Change {
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
interface RecordRef {
    seq: number;
    hash: string;
}
/** The last answer of the server-side verify (GET /v1/clearances/{id}/attestation/verify), or null when none was asked. */
interface VerificationBrief {
    verified: boolean;
    checked_at: string;
}
/** The deploy's outcome on a cleared change (clearance gate.md "The outcome on the change"). */
interface ChangeOutcome {
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
interface ChangeAttestation {
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
interface ChangeRecordItem {
    seq: number;
    hash: string;
    tool: string;
    ts: string;
    principal: string | null;
    record: Record<string, unknown>;
}
/** One row of GET /v1/attestations. */
interface AttestationRow {
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
interface VerifyAnswer {
    verified: boolean;
    cached: boolean;
    checked_at: string;
    digest: string;
    subject: string;
    mode?: string;
    key_id?: string;
    identity?: string;
    issuer?: string;
    rekor: {
        log_index: number | null;
        integrated_time: string | null;
        verified: boolean;
    };
    errors: string[];
}
/** GET /v1/attestation-config: public values only. `verifiable` is false when this Clearance has no trust configured. */
interface AttestationConfig {
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
interface RuntimeEntry {
    name: string;
    image: string | null;
    kind: 'runtime' | 'base';
    framework: string;
    summary: string;
    status: 'available' | 'planned';
}
/** GET /v1/runtimes: the catalog, and the globs an image built for an agent's own repo (custom) must match.
 * custom_images is absent before Clearance v0.25.0; empty means this deployment allows catalog images only. */
interface RuntimeCatalog {
    items: RuntimeEntry[];
    custom_images?: string[];
}
/** GET /api/clearance/drift: whether the definition file on the repo's main moved past the pinned commit. */
interface DefinitionDrift {
    repo: string;
    path: string;
    pinned: string;
    latest: string | null;
    latestAt: string | null;
    /** Commits on main that changed the file after the pinned one (capped at `limit`). */
    behind: number;
    limit: number;
}
type CoverageHealth = 'healthy' | 'degraded' | 'blind';
interface ObserveItem {
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
interface ObservePart {
    count: number;
    by_coverage: Record<string, number>;
    items: ObserveItem[];
    truncated: boolean;
}
interface ObserveSourceHealth {
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
interface ObserveSegment {
    source: string;
    state: string;
    reason: string;
    from: string;
    to: string;
    seconds: number;
    seq: number | null;
}
interface CoverageStatement {
    scope: string;
    from: string;
    to: string;
    state: CoverageHealth;
    clean: boolean;
    truncated: boolean;
    text: string;
    cleared_and_verified: ObservePart;
    seen_not_cleared: ObservePart;
    could_not_see: {
        seconds: number;
        segments: ObserveSegment[];
        audit_gaps: Array<{
            seq: number;
            source: string;
            state: string;
            reason: string;
            ts: string;
        }>;
    };
    health: {
        sources: ObserveSourceHealth[];
    };
    source_integrity: {
        observations: number;
        verified: number;
        unverified: number;
        verified_by_record: number;
        verified_later: number;
    };
}
/** The observation records (listObservations): a stored evidence record, read loosely, the way Clearance writes it. */
interface ObservationRecord {
    seq: number;
    ts: string;
    scope?: string;
    source?: {
        name?: string;
        event_id?: string;
    };
    resource?: Record<string, unknown>;
    actor?: {
        subject?: string;
        chain?: string[];
        issuer?: string;
        client?: string;
    };
    action?: {
        verb?: string;
        api?: string;
        succeeded?: boolean;
        protects_monitoring?: boolean;
    };
    state_change?: {
        before?: unknown;
        after?: unknown;
    };
    coverage?: string;
    /** On a resolution record: what was set, by whom, and about which observation. */
    resolution?: {
        state?: string;
        cause?: string | null;
        note?: string;
        by?: string;
    };
    about?: {
        seq?: number;
    };
    /** The fields whose secret-bearing values Clearance replaced with [redacted] for this reader (v0.41.0): `state_change`, `exception`. */
    redacted?: string[];
    [key: string]: unknown;
}
declare const RESOLUTION_STATES: readonly ["reverted", "ratified", "declared-break-glass", "still-live"];
declare const RESOLUTION_CAUSES: readonly ["agent-caused", "policy-triggered", "human-initiated", "automated-remediation", "requirement-changed", "external-dependency", "unattributed"];
type ResolutionState = (typeof RESOLUTION_STATES)[number];
type ResolutionCause = (typeof RESOLUTION_CAUSES)[number];
interface Resolution {
    state: ResolutionState;
    cause?: ResolutionCause;
    note?: string;
}
interface ResolutionRecorded {
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
interface BulkResolutionRecorded {
    batch: string;
    state: ResolutionState;
    cause: ResolutionCause | null;
    note: string | null;
    by: string;
    via: string | null;
    ts: string;
    recorded: Array<{
        seq: number;
        record_seq: number;
        scope: string;
    }>;
    skipped: Array<{
        seq: number;
        reason: string;
    }>;
    failed: Array<{
        seq: number;
        error: string;
    }>;
}
interface ScopeList {
    scopes: string[];
    source: 'coverage' | 'config' | 'none';
}
/** GET /v1/clearance-policy: the deployment gate's policy in force (the part the tier legend reads). */
interface GatePolicy {
    version: string;
    /** What each tier above 1 needs: how many from the app's owner group and from outside it. */
    approvers: Record<string, {
        owner: number;
        outside: number;
    }>;
    maxLinesTier1: number;
    outsideGroups: string[];
    ttlDays: number;
    repoPolicy: string | null;
}

interface ClearanceTokens {
    bg: string;
    panel: string;
    panelAlt: string;
    line: string;
    lineSoft: string;
    textHi: string;
    textLo: string;
    textFaint: string;
    /** Strokes, dots, bars, underlines: anything amber that is not a fill behind text and not text. */
    amber: string;
    /** Fill behind text (the primary button). Text on it is `onAmber`; its edge is `amber`. */
    amberFill: string;
    amberFillHover: string;
    amberFillPress: string;
    /** Amber words on a panel (an eyebrow, a slow time). `amber` itself fails AA as text in light. */
    amberText: string;
    amberInk: string;
    /** Text on a solid amber fill. */
    onAmber: string;
    amberSoft: string;
    amberLine: string;
    sky: string;
    skySoft: string;
    skyLine: string;
    good: string;
    goodSoft: string;
    bad: string;
    badSoft: string;
}
/** The tokens of a MUI theme: makeStyles callbacks use this, so a sheet is built once per theme (a sheet whose values are
 *  functions of props is rebuilt for every component instance, which made a form of 30 Fields run a test out of time). */
declare function tokensForTheme(theme: {
    palette: {
        type: string;
    };
}): ClearanceTokens;
declare function useClearanceTokens(): ClearanceTokens;
declare const fontDisplay = "\"IBM Plex Sans Condensed\", \"IBM Plex Sans\", sans-serif";
declare const fontBody = "\"IBM Plex Sans\", -apple-system, \"Segoe UI\", sans-serif";
declare const fontMono = "\"IBM Plex Mono\", \"SFMono-Regular\", Consolas, monospace";
/** Tower's type scale: nothing under 11px. */
declare const fontScale: {
    readonly xs: 11;
    readonly sm: 12;
    readonly md: 13;
    readonly lg: 15;
    readonly xl: 18;
    readonly x2: 22;
    readonly x3: 32;
};

/** `user:jfillman` -> `jfillman`; `autopilot-runs/triage-agent` stays; `group:default/x` -> `x`. */
declare const shortPrincipal: (p: string | null | undefined) => string;
/** A workload principal (`<namespace>/<serviceaccount>`), as opposed to a person (`user:`). */
declare const isWorkload: (p: string | null | undefined) => boolean;
declare function relativeTime(iso: string | null | undefined, now?: number): string;
declare function clock(iso: string | null | undefined): string;
/** `2026-10-31 01:13Z`: the day and minute, UTC, so a run or record can be placed in time (relativeTime says how long ago). */
declare function dateTime(iso: string | null | undefined): string;
/** 182000 -> 182k; 2100000 -> 2.1M. */
declare function compact(n: number | undefined): string;
/** The ratio used of limit, clamped to [0, 1]; 0 when there is no limit. */
declare function ratio(used: number | undefined, limit: number | undefined): number;
/** Where an agent's loop runs: the server's `runsIn` (clearance v0.23.0), else from the runtime image an older server
 *  shows (none, or the all-zero placeholder digest the first bundled definitions carried, means the person's client). */
declare function runsInOf(d: {
    runsIn?: 'cluster' | 'client';
    runtime?: {
        image?: string | null;
    } | null;
}): 'cluster' | 'client';
/** The words for where a run's loop runs, and the one-line why. */
declare const RUNS_IN_TEXT: Record<'cluster' | 'client', {
    label: string;
    why: string;
}>;
/** onMouseDown for a clickable control inside Tower's nested-scroll page: a native click-to-focus there scrolls the
 *  wrong ancestor to the top. The click still fires; keyboard focus is untouched. */
declare const preventFocusScroll: (e: {
    preventDefault: () => void;
}) => void;

interface Polled<T> {
    data?: T;
    error?: string;
    /** The error as thrown (a ReadError carries its HTTP status), for a view that tells 403 from 503. */
    failure?: unknown;
    loading: boolean;
    updatedAt?: number;
    refresh: () => void;
}
/**
 * Calls `fetcher` now and every `intervalMs` while the page is visible, keeping the last good data on a failure.
 * `key` restarts the loop when what is fetched changes. `intervalMs` 0 fetches once.
 */
declare function usePoll<T>(key: string, fetcher: () => Promise<T>, intervalMs: number): Polled<T>;

/**
 * The clock a view computes its time windows from: the `now` a test passes, else the moment the view mounted.
 * A default of `Date.now()` in a component's parameters is a new value on every render, and anything derived from
 * it (a `since` filter, a poll key) changes every render: the fetch restarts, sets state, renders, and so on
 * forever (the Evidence page's 2026-10-31 loop: "Loading…" that never ends, a row that never opens).
 */
declare function useMountedNow(now?: number): number;

/** Detail that blocks nothing (what a chip means, why a value is what it is): opens 300 ms after hover, at once on focus. */
declare function Tooltip({ title, children }: {
    title: ReactNode;
    children: ReactElement;
}): react.JSX.Element;
/** Why a primary action is unavailable, as a visible line under the action bar (never only a tooltip). */
declare function ActionReason({ id, children }: {
    id?: string;
    children: ReactNode;
}): react.JSX.Element;
declare function PageHeader({ title, subtitle, eyebrow, actions }: {
    title: string;
    subtitle?: ReactNode;
    eyebrow?: ReactNode;
    actions?: ReactNode;
}): react.JSX.Element;
declare const Panel: react.ForwardRefExoticComponent<{
    accent?: boolean;
    className?: string;
    children?: ReactNode;
} & react.HTMLAttributes<HTMLDivElement> & react.RefAttributes<HTMLDivElement>>;
declare function SectionLabel({ children }: {
    children: ReactNode;
}): react.JSX.Element;
declare function ColumnLabel({ children }: {
    children?: ReactNode;
}): react.JSX.Element;
type ButtonVariant = 'default' | 'primary' | 'danger';
/** An action: it changes something. One amber `primary` per view, and only when it is the next step. */
declare function Button({ variant, small, className, type, title, ...rest }: {
    variant?: ButtonVariant;
    small?: boolean;
} & ButtonHTMLAttributes<HTMLButtonElement>): react.JSX.Element;
/** A checkbox for picking rows: amber when on (a filter-like choice, not an action). Give it an aria-label. */
declare function Checkbox({ className, ...rest }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>): react.JSX.Element;
/** A small square icon button (a ✕ that removes a row). Give it an aria-label. */
declare function IconButton({ className, type, ...rest }: ButtonHTMLAttributes<HTMLButtonElement>): react.JSX.Element;
/** A label chip's tone: `amber` is attention (a tier that needs a person), `sky` motion or identity, `ok`/`bad` verdicts. */
type Tone = 'neutral' | 'sky' | 'amber' | 'ok' | 'bad';
/** A label (what it is): a tier, a kind, a tool, an app, a pack. Square. A state is a StatusChip. */
declare function Chip({ tone, title, className, children }: {
    tone?: Tone;
    title?: string;
    className?: string;
    children: ReactNode;
}): react.JSX.Element;
/** ok: done or healthy · warn: waiting on a person or out of step · bad: failed or denied · info: in motion (blue) · neutral: none. */
type StatusTone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';
/** A state (what it is in): allow, deny, live, tripped, holding. Rounded with a soft tint. */
declare function StatusChip({ tone, dot, title, className, children }: {
    tone: StatusTone;
    dot?: boolean;
    title?: string;
    className?: string;
    children: ReactNode;
}): react.JSX.Element;
interface FilterOption<T extends string> {
    id: T;
    label: string;
    count?: number;
    title?: string;
}
type PillProps = {
    on: boolean;
    count?: number;
    title?: string;
    onClick: () => void;
    children: ReactNode; /** The pill opens a popover: `expanded` says whether it is open. */
    expanded?: boolean;
};
/** One filter: a labelled row of pills, exactly one on (amber). Changes what the view shows, nothing else. */
declare function FilterChips<T extends string>({ label, hideLabel, options, value, onChange, }: {
    label: string;
    hideLabel?: boolean;
    options: Array<FilterOption<T>>;
    value: T;
    onChange: (id: T) => void;
}): react.JSX.Element;
/** A single filter pill, for a filter where several can be on at once (wrap them in a `FilterGroup`). */
declare function FilterChip(props: PillProps): react.JSX.Element;
/** A labelled group of `FilterChip`s (multi-select, or a single on/off such as "Unresolved only"). */
declare function FilterGroup({ label, hideLabel, children }: {
    label: string;
    hideLabel?: boolean;
    children: ReactNode;
}): react.JSX.Element;
/** A filter with too many values for pills (an agent, a scope, a window, page size): a labelled select styled like a pill. */
declare function FilterSelect<T extends string>({ label, value, options, onChange, disabled, }: {
    label: string;
    value: T;
    options: Array<{
        value: T;
        label: string;
    }>;
    onChange: (value: T) => void;
    disabled?: boolean;
}): react.JSX.Element;
/** A filter that is typed (a tool name, a rule id), labelled like the others. */
declare function FilterInput({ label, placeholder, value, onChange, width }: {
    label: string;
    placeholder?: string;
    value: string;
    onChange: (value: string) => void;
    width?: number;
}): react.JSX.Element;
/** Search: a field in the filter row. */
declare function SearchField({ label, placeholder, value, onChange }: {
    label: string;
    placeholder?: string;
    value: string;
    onChange: (value: string) => void;
}): react.JSX.Element;
/** The row of filters above a list: filters and search first, `end` (a count, a hint) at the right. Page actions stay in the PageHeader. */
declare function FilterBar({ children, end }: {
    children?: ReactNode;
    end?: ReactNode;
}): react.JSX.Element;
/** The class of a link, for a router `<Link className=…>` (this package has no router): sky mono text, no box. */
declare function useTextLinkClass(): string;
/** Text that goes somewhere (→ another tab, ↗ another site) or shows/hides a detail (`expanded`). Never a box. */
declare function TextLink({ href, onClick, title, expanded, disabled, 'aria-label': ariaLabel, 'aria-controls': ariaControls, children, }: {
    href?: string;
    onClick?: () => void;
    title?: string;
    expanded?: boolean;
    disabled?: boolean;
    'aria-label'?: string;
    'aria-controls'?: string;
    children: ReactNode;
}): react.JSX.Element;
declare function Subtabs<T extends string>({ label, tabs, value, onChange }: {
    label: string;
    tabs: Array<{
        id: T;
        label: string;
    }>;
    value: T;
    onChange: (id: T) => void;
}): react.JSX.Element;
/** A labelled input, select or textarea: the label, then the control with the kit's input class. */
declare function Field({ label, children }: {
    label: ReactNode;
    children: (props: {
        className: string;
    }) => ReactNode;
}): react.JSX.Element;
/** The input class alone, for a control that sits in a row (a reason box beside its buttons). */
declare function useInputClass(): {
    input: string;
    textarea: string;
    problem: string;
};
/** A block inside a tab: a 15px title (`level={2}` 13px, inside a card), `meta` after it, `count` and `actions` at the right. `framed` draws a panel. */
declare function Section({ title, meta, count, actions, framed, level, className, children, ...rest }: {
    title: ReactNode;
    meta?: ReactNode;
    count?: ReactNode;
    actions?: ReactNode;
    framed?: boolean;
    level?: 1 | 2;
    className?: string;
    children?: ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, 'title'>): react.JSX.Element;
declare function SectionTitle({ level, children }: {
    level?: 1 | 2;
    children: ReactNode;
}): react.JSX.Element;
/** "Nothing here". `inset` adds the panel padding, for a note straight inside a framed Section. */
declare function EmptyNote({ inset, className, ...rest }: {
    inset?: boolean;
} & React.HTMLAttributes<HTMLParagraphElement>): react.JSX.Element;
/** A line that explains. Not italic: it is not an empty state. */
declare function Hint({ inset, className, ...rest }: {
    inset?: boolean;
} & React.HTMLAttributes<HTMLParagraphElement>): react.JSX.Element;
/** A count or range next to a title or at the end of a filter bar. */
declare function Count({ children }: {
    children: ReactNode;
}): react.JSX.Element;
/** A label over its value, or `inline`: label left, value right on one ruled row. Put stacked facts in a FactGrid. */
declare function Fact({ label, inline, title, children }: {
    label: ReactNode;
    inline?: boolean;
    title?: string;
    children: ReactNode;
}): react.JSX.Element;
/** Facts in one wrapping row, each as wide as its value; `min` gives equal columns instead. */
declare function FactGrid({ min, row, className, children }: {
    min?: number;
    row?: boolean;
    className?: string;
    children: ReactNode;
}): react.JSX.Element;
/** The kit's table classes: `table`, `th`, `td`, `meta` (a mono secondary line in a cell), `rowLink`, `rowSelected`, `dense`. */
declare function useTableKit(): {
    table: string;
    th: string;
    td: string;
    meta: string;
    rowLink: string;
    rowSelected: string;
    dense: string;
};
/** A Panel with the kit padding and an optional head: `title` and `meta` at the left, `actions` at the right. */
declare const Card: react.ForwardRefExoticComponent<{
    title?: ReactNode;
    meta?: ReactNode;
    actions?: ReactNode;
    level?: 1 | 2;
    accent?: boolean;
    className?: string;
    children?: ReactNode;
} & Omit<react.HTMLAttributes<HTMLDivElement>, "title"> & react.RefAttributes<HTMLDivElement>>;
/** An item inside a card (a fact box, a question): panelAlt, radius 4. */
declare function Tile({ className, children, ...rest }: {
    className?: string;
    children: ReactNode;
} & React.HTMLAttributes<HTMLDivElement>): react.JSX.Element;
type CalloutTone = 'info' | 'warn' | 'bad' | 'ok' | 'neutral';
/** A banner in a status tone: `info` (in motion), `warn` (needs someone, or may be stale), `bad` (failed), `ok`, `neutral`. */
declare function Callout({ tone, label, title, actions, className, children, ...rest }: {
    tone: CalloutTone;
    label?: ReactNode;
    title?: ReactNode;
    actions?: ReactNode;
    className?: string;
    children?: ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>): react.JSX.Element;
/** A headline number: label, a 22px value, an optional caption. `tone` colours the value (`info` is motion). */
declare function Stat({ label, value, caption, tone, title }: {
    label: ReactNode;
    value: ReactNode;
    caption?: ReactNode;
    tone?: 'ok' | 'info' | 'warn' | 'bad';
    title?: string;
}): react.JSX.Element;
/** A row of Stats, each in a Card. */
declare function StatRow({ children }: {
    children: ReactNode;
}): react.JSX.Element;
declare function Skeleton({ width, height }: {
    width?: number | string;
    height?: number;
}): react.JSX.Element;
/** One panel loading inside a tab: a few rows (and the label as a caption). */
declare function PanelSkeleton({ rows, label, announce }: {
    rows?: number;
    label?: string;
    announce?: boolean;
}): react.JSX.Element;
/** A whole tab loading: a header, three tiles and a panel of rows. */
declare function TabSkeleton({ label }: {
    label?: string;
}): react.JSX.Element;
/** A tab or panel that could not load: what failed, the first line of the error, Retry where there is one, the rest behind Details. */
declare function TabError({ error, what, onRetry }: {
    error: unknown;
    what?: string;
    onRetry?: () => void;
}): react.JSX.Element;
/** Copies `text`; `copied` is true for a moment so the button can say so. */
declare function CopyButton({ text }: {
    text: string;
}): react.JSX.Element;
/** A file or a record as it is: mono on the base background in a soft-line box, keys sky, numbers and booleans amber, Copy at the top right. Never a bare `<pre>`. */
declare function YamlBlock({ text, title, actions, copy, lineNumbers, maxHeight, 'aria-label': ariaLabel, }: {
    text: string;
    title?: ReactNode;
    actions?: ReactNode;
    copy?: boolean;
    lineNumbers?: boolean;
    maxHeight?: number | string;
    'aria-label'?: string;
}): react.JSX.Element;

declare const tierTone: (tier: Tier | number | null | undefined) => Tone;
/** A tool tier: T0 read, T1 reversible write, T2 propose only, T3 tripwire. */
declare function TierChip({ tier }: {
    tier: Tier | number | null | undefined;
}): react.JSX.Element | null;
/** A decision as Clearance recorded it (a state, so a StatusChip): allow, or deny with its rule. */
declare function DecisionChip({ decision, rule }: {
    decision: Decision | string;
    rule?: string | null;
}): react.JSX.Element;
/** What kind of agent or caller something is (event, scheduled, session, task...): a label, so a square neutral Chip. */
declare function KindChip({ kind }: {
    kind: string;
}): react.JSX.Element;
/** How an ended session's outcome reads (clearance v0.25.0): a run that answered finished; one that stopped short failed. */
declare function outcomeLabel(o: SessionOutcome): {
    label: string;
    tone: StatusTone;
    why: string;
};
/** A session's state; a tripped live session is what waits on a person. An ended one says how it ended when it can. */
declare function StateChip({ state, tripped, reason, outcome }: {
    state: SessionState;
    tripped?: boolean;
    reason?: string | null;
    outcome?: SessionOutcome | null;
}): react.JSX.Element;
declare function BudgetBar({ label, used, limit, format }: {
    label: string;
    used: number | undefined;
    limit: number | undefined;
    format?: (n: number) => string;
}): react.JSX.Element;
/** Every budget a session has, used against its limits, as bars. Time is elapsed against the session's TTL. */
declare function BudgetBars({ used, limits, createdAt, expiresAt, now }: {
    used: Record<string, number>;
    limits: SessionLimits;
    createdAt?: string;
    expiresAt?: string;
    now?: number;
}): react.JSX.Element;
/** The budgets a Session carries, as BudgetBars. */
declare function SessionBudgets({ session, now }: {
    session: Session;
    now?: number;
}): react.JSX.Element;
/** One record field by field, each marked verified (Clearance checked it) or claimed (an integration said so). */
declare function VerifiedClaimed({ record }: {
    record: EvidenceRecord;
}): react.JSX.Element;

/** The flight log's own scroll height, so a long run never pushes the page; the caller's header and footer stay put. */
declare const FLIGHT_LOG_MAX_HEIGHT = 480;
/** The one-line account of a record: the tool, and what it acted on or produced. */
declare function summarize(r: EvidenceRecord): {
    title: string;
    detail?: string;
};
/**
 * The log. `onSelect` makes each row a button; with `detail`, the selected record's detail opens in place directly
 * below its row (aria-expanded on the row). `maxHeight` (px) bounds the list, which then scrolls on its own; pass 0 for
 * an unbounded list.
 */
declare function FlightLog({ records, selected, onSelect, detail, empty, maxHeight }: {
    records: EvidenceRecord[];
    selected?: number;
    onSelect?: (r: EvidenceRecord) => void;
    detail?: (r: EvidenceRecord) => ReactNode;
    empty?: ReactNode;
    maxHeight?: number;
}): react.JSX.Element;

type Query = Record<string, string | number | undefined>;
/**
 * A request the answer refused. `status` is the HTTP status; `body` is the parsed JSON body when there was one (`get`
 * leaves it undefined on a non-JSON body, `post`/`delete` an empty object, as the kit always has); `text` is the raw
 * body for `getText`.
 */
declare class TransportError extends Error {
    readonly path: string;
    readonly status: number;
    readonly body?: any | undefined;
    readonly text?: string | undefined;
    constructor(path: string, status: number, body?: any | undefined, text?: string | undefined);
}
interface ClearanceTransport {
    /** GET `path` and parse the JSON answer. Undefined and empty query values are left out. Throws TransportError when not ok. */
    get<T>(path: string, query?: Query): Promise<T>;
    /** GET `path` and return the body exactly as served: nothing is re-encoded (the attestation bundle). */
    getText(path: string): Promise<string>;
    /** POST `body` as JSON (the JSON content type is set when there is a body); `headers` are added. */
    post<T>(path: string, body?: Record<string, unknown>, headers?: Record<string, string>): Promise<T>;
    /** DELETE `path`, answering the JSON body. */
    delete<T>(path: string): Promise<T>;
    /** Optional: the answer's body as a stream, for a host that can serve one (not used by the views yet). */
    stream?(path: string): Promise<ReadableStream<Uint8Array>>;
}
declare function ClearanceTransportProvider({ transport, children }: {
    transport: ClearanceTransport;
    children?: ReactNode;
}): react.JSX.Element;
declare function useClearanceTransport(): ClearanceTransport;

type FetchLike = (url: string, init?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
}) => Promise<Response>;
interface FetchTransportOptions {
    fetch: FetchLike;
    /** Where `path` (clearance-api's `/v1/...`) is served: reads (GET) and writes (POST, DELETE) may differ. */
    url: (path: string, kind: 'read' | 'write') => string | Promise<string>;
}
declare function createFetchTransport({ fetch, url }: FetchTransportOptions): ClearanceTransport;

interface FakeCall {
    method: 'GET' | 'GET_TEXT' | 'POST' | 'DELETE';
    path: string;
    query?: Query;
    body?: Record<string, unknown>;
    headers?: Record<string, string>;
}
/** What answers a call: the JSON (or text) to serve, `undefined` for not found, or a TransportError-shaped refusal. */
type FakeAnswer = unknown | {
    refuse: number;
    body?: unknown;
};
interface FakeTransport extends ClearanceTransport {
    calls: FakeCall[];
}
declare function createFakeTransport(answer: (call: FakeCall) => FakeAnswer | Promise<FakeAnswer>): FakeTransport;

type Params = Query;
/** A read Clearance (or the proxy) refused or failed: `status` is the HTTP status, so a view can tell 403 from 503. */
declare class ReadError extends Error {
    readonly status: number;
    constructor(message: string, status: number);
}
interface ClearanceRead {
    get<T>(path: string, params?: Params): Promise<T>;
    /** The answer's body exactly as served, for a file the person saves (the attestation bundle): nothing is re-encoded. */
    getText(path: string): Promise<string>;
}
declare function useClearanceRead(): ClearanceRead;

interface ControlRefusal {
    status: number;
    error: string;
    rule?: string;
    hint?: string;
}
declare class ControlError extends Error {
    readonly refusal: ControlRefusal;
    constructor(refusal: ControlRefusal);
}
interface ClearanceWrite {
    /** Trip the session's breaker: every further call of the run is refused; it stays to be read. */
    freeze(sessionId: string, reason: string): Promise<{
        session: string;
        tripped: boolean;
        trip_reason: string;
    }>;
    /** Close the session and its children. */
    end(sessionId: string, reason: string): Promise<{
        session: string;
        closed: boolean;
    }>;
    /** Hold the agent's triggers for `hours` (24 by default, 336 at most); renewing replaces the hold. */
    hold(agent: string, reason: string, hours?: number): Promise<Hold>;
    /** Lift a hold early. */
    release(agent: string): Promise<{
        agent: string;
        released: boolean;
    }>;
    /** Clear a change holding for people (the deployment gate): one approval in the role the person qualifies for. */
    clearChange(id: string): Promise<Change>;
    /** Deny a change holding for people, with a reason. */
    denyChange(id: string, reason: string): Promise<Change>;
    /** Run a task agent in-cluster as the signed-in person (clearance v0.23.0): a session and an AgentRun with `input`. */
    runAgent(agent: string, input?: string): Promise<AgentRunStarted>;
    /** An admin's resolution of an observed change (O-5), on the Clearance core: append-only, the newest wins. */
    resolveObservation(seq: number, resolution: Resolution): Promise<ResolutionRecorded>;
    /** The same for up to BULK_RESOLUTION_LIMIT items at once: one record each, one batch id, skips reported per item. */
    resolveObservations(items: number[], resolution: Resolution): Promise<BulkResolutionRecorded>;
}
/** The most items one bulk resolution call takes; a larger selection goes in chunks of this size. */
declare const BULK_RESOLUTION_LIMIT = 200;
/** What POST /v1/agents/{name}/runs answers: the person's session, the AgentRun and the task. */
interface AgentRunStarted {
    agent: string;
    session: string;
    run: string | null;
    task_id: string;
}
/** The active hold on an agent's triggers, as /v1/agents carries it. */
interface Hold {
    agent: string;
    by: string;
    via: string | null;
    reason: string;
    since: string;
    until: string;
}
declare function useClearanceWrite(): ClearanceWrite;

type Product = 'autopilot' | 'clearance';
declare function ProductMark({ product, size }: {
    product: Product;
    size?: number;
}): react.JSX.Element;

declare const healthTone: (s: CoverageHealth | string) => StatusTone;
interface BannerSummary {
    state: CoverageHealth;
    headline: string;
    /** The failing feeds: `source: check, check` (the checks that did not pass), or why it is stale. */
    failing: string[];
    /** When the current state began, or undefined when healthy or when no record says. */
    since?: string;
}
/** What a coverage statement says about a scope's health now, for the banner. */
declare function summarizeCoverage(st: CoverageStatement): BannerSummary;
/** Why a coverage read failed, in words. 403 is the Clearance release that opens these reads to people (owner decision O-5). */
declare const statusOf: (e: unknown) => number | undefined;
declare function readDeniedText(e: unknown): string;
declare function CoverageBanner({ scope, statement, error, now }: {
    scope: string;
    statement?: CoverageStatement;
    error?: unknown;
    now?: number;
}): react.JSX.Element;
/** Reads the scope list (the backend's GET /scopes) once. */
declare function useScopes(): Polled<ScopeList>;
/** The coverage statement of one scope, refreshed every minute (the last day unless `from` says otherwise). */
declare function useCoverage(api: ClearanceRead, scope: string | undefined, from?: string): Polled<CoverageStatement | undefined>;
/** A banner for each scope Clearance names (or `only`, to show one app's). Nothing when there is no scope to show. */
declare function CoverageStrip({ only }: {
    only?: string[];
}): react.JSX.Element | null;

/** Rows per page, the house set (Evidence and Tower use the same four). */
declare const PAGE_SIZES: readonly [10, 25, 50, 100];
declare const DEFAULT_PAGE_SIZE = 50;
/** The rows a page shows, with the page clamped into range (a filter can leave fewer pages than the one asked for). */
declare function pageSlice<T>(items: T[], page: number, pageSize: number): {
    rows: T[];
    page: number;
    pages: number;
};
/** Previous / Next with "x-y of n" and the rows-per-page choice. `page` is zero-based. */
declare function Pager({ total, page, pageSize, onPage, onPageSize, label }: {
    total: number;
    page: number;
    pageSize: number;
    onPage: (page: number) => void;
    onPageSize: (size: number) => void;
    label?: string;
}): react.JSX.Element;

/** The baseline when the policy cannot be read: the gate's built-in defaults (Clearance internal/gate/policy.go). */
declare const BASELINE_POLICY: Pick<GatePolicy, 'approvers' | 'maxLinesTier1'>;
type TierPolicy = Pick<GatePolicy, 'approvers' | 'maxLinesTier1'> & Partial<Pick<GatePolicy, 'version' | 'repoPolicy'>>;
interface TierDef {
    tier: 0 | 1 | 2 | 3;
    /** The short name, in the docs' own words. */
    name: string;
    /** What it covers (gate.md's "What it covers (baseline)"). */
    covers: string;
    /** The same in a few words, for the key. */
    brief: string;
    /** Who clears it, short (a chip) and long (a sentence). */
    clears: {
        by: 'policy' | 'people';
        short: string;
        long: string;
    };
}
/** The four tiers, with the numbers the policy in force sets. */
declare function tierDefs(policy?: TierPolicy): TierDef[];
declare const NOT_TIERED: {
    name: string;
    covers: string;
    brief: string;
};
declare const TIER_FLOOR_NOTE = "Tier is a floor: a change that touches a tier-3 object is tier 3 however small the edit. A repo's clearance.yaml can only tighten it.";
/**
 * The policy in force, from GET /v1/clearance-policy; the baseline until it loads or when it cannot be read. Clearance's
 * route takes no parameters today (it answers the gate's policy for every app and env, and refuses an unknown query
 * parameter with 400), so app and env only key the poll; they are sent once Clearance serves a per-app policy.
 */
declare function useTierPolicy(app?: string, env?: string): {
    policy: TierPolicy;
    source: 'policy' | 'baseline';
};
/** Why a change has its tier: the objects and rules at that tier (gate.md: "every grant carries why this tier"). */
declare function tierWhy(change: Pick<Change, 'tier' | 'reasons'>): string;
/** C: a tier badge that explains itself. With the change, the hover says why it has this tier and who must clear it. */
declare function TierBadge({ tier, change, policy, children }: {
    tier: number | null | undefined;
    change?: Pick<Change, 'tier' | 'reasons' | 'requirement' | 'state' | 'cleared_by' | 'proposer_kind'>;
    policy?: TierPolicy;
    children?: ReactNode;
}): react.JSX.Element;
/** Changes per tier, as GET /v1/clearances/counts?by=tier returns them. */
type TierCounts = Record<number, number>;
declare function tierCountsOf(items: Array<{
    key: string | null;
    count: number;
}> | undefined): TierCounts;
/** C: the tier-mix bar: one segment per tier, sized by its share, with the counts under it. Reusable (the coverage drawer). */
declare function TierMix({ counts, label }: {
    counts: TierCounts;
    label?: string;
}): react.JSX.Element;
/** B: the compact key above the change table: one cell per tier, collapsible to the badges alone. */
declare function TierKey({ policy, counts, defaultOpen }: {
    policy?: TierPolicy;
    counts?: TierCounts;
    defaultOpen?: boolean;
}): react.JSX.Element;
/** A: the Tier filter. A pill (amber while any tier is chosen) that opens the legend; every row is a checkbox, so learning what a tier means and filtering by it are one action. */
declare function TierFilter({ value, onChange, policy, source, counts }: {
    value: number[];
    onChange: (tiers: number[]) => void;
    policy?: TierPolicy;
    source?: 'policy' | 'baseline';
    counts?: TierCounts;
}): react.JSX.Element;

/** Which row is open: at most one. `initial` is a deep link (`?change=<id>`). */
declare function useOneOpen<K extends string | number>(initial?: K): {
    open: K | undefined;
    toggle: (key: K) => void;
    close: () => void;
    set: (key: K | undefined) => void;
};
interface ExpandRowProps {
    /** Unique within the page; the details row is `${id}-details`, which the row's aria-controls names. */
    id: string;
    open: boolean;
    onToggle: () => void;
    /** Columns in the table, for the details cell. */
    colSpan: number;
    /** The row's cells (`<td>`s). */
    children: ReactNode;
    /** The details, rendered only while open. */
    details: ReactNode;
    /** Accessible name for the details region, e.g. "Change ch-1 details". */
    label: string;
}
/** A row that expands inline. Renders two `<tr>`s: the row, and while open its details. */
declare function ExpandRow({ id, open, onToggle, colSpan, children, details, label }: ExpandRowProps): react.JSX.Element;

type ClearanceView = 'clearances' | 'evidence' | 'exceptions' | 'attestations' | 'map' | 'policy';
declare const CLEARANCE_VIEWS: Array<{
    id: ClearanceView;
    label: string;
    sub: string;
}>;
declare function ClearancePage(): react.JSX.Element;

/** A change's state: holding waits on a person (warn), cleared is ok, denied is bad, expired is neutral. */
declare function stateTone(s: ChangeState): StatusTone;
/** What a holding change still needs, in words. */
declare function stillNeeds(c: Pick<Change, 'requirement' | 'approvals'>): string;
declare function ClearanceDetail({ change, onChanged }: {
    change: Change;
    onChanged?: () => void;
}): react.JSX.Element;
declare function ClearancesView({ app, initial, now: nowProp }: {
    app?: string;
    initial?: string;
    now?: number;
}): react.JSX.Element;

/** History, outcome and attestation: the proof behind one change. */
declare function ChangeProof({ change }: {
    change: Change;
}): react.JSX.Element;

declare function EvidenceView({ now: nowProp, initialApp }: {
    now?: number;
    initialApp?: string;
}): react.JSX.Element;

declare function ExceptionsView({ now: nowProp, initialScope }: {
    now?: number;
    initialScope?: string;
}): react.JSX.Element;

declare function AttestationsView({ now: nowProp, onOpenChange, initial }: {
    now?: number;
    onOpenChange?: (changeId: string) => void;
    initial?: string;
}): react.JSX.Element;

type Navigate = (params: Record<string, string>) => void;

/** The Map tab: the Map, or one environment's detail when `target` is set. The window is shared, so drilling down keeps it. */
declare function MapTab({ target, onOpenTarget, onNavigate }: {
    target?: string;
    onOpenTarget: (id: string | undefined) => void;
    onNavigate: Navigate;
}): react.JSX.Element;

declare function PolicyView({ now: nowProp }: {
    now?: number;
}): react.JSX.Element;

export { ActionReason, AttestationsView, BASELINE_POLICY, BULK_RESOLUTION_LIMIT, BudgetBar, BudgetBars, Button, CLEARANCE_VIEWS, Callout, Card, ChangeProof, Checkbox, Chip, ClearanceDetail, ClearancePage, ClearanceTransportProvider, ClearancesView, ColumnLabel, ControlError, CopyButton, Count, CoverageBanner, CoverageStrip, DEFAULT_PAGE_SIZE, DecisionChip, EmptyNote, EvidenceView, ExceptionsView, ExpandRow, FLIGHT_LOG_MAX_HEIGHT, Fact, FactGrid, Field, FilterBar, FilterChip, FilterChips, FilterGroup, FilterInput, FilterSelect, FlightLog, Hint, IconButton, KindChip, MapTab, NOT_TIERED, PAGE_SIZES, PageHeader, Pager, Panel, PanelSkeleton, PolicyView, ProductMark, RESOLUTION_CAUSES, RESOLUTION_STATES, RUNS_IN_TEXT, ReadError, SearchField, Section, SectionLabel, SectionTitle, SessionBudgets, Skeleton, Stat, StatRow, StateChip, StatusChip, Subtabs, TIER_FLOOR_NOTE, TabError, TabSkeleton, TextLink, TierBadge, TierChip, TierFilter, TierKey, TierMix, Tile, Tooltip, TransportError, VerifiedClaimed, YamlBlock, clock, compact, createFakeTransport, createFetchTransport, dateTime, fontBody, fontDisplay, fontMono, fontScale, healthTone, isWorkload, outcomeLabel, pageSlice, preventFocusScroll, ratio, readDeniedText, relativeTime, runsInOf, shortPrincipal, stateTone, statusOf, stillNeeds, summarize, summarizeCoverage, tierCountsOf, tierDefs, tierTone, tierWhy, tokensForTheme, useClearanceRead, useClearanceTokens, useClearanceTransport, useClearanceWrite, useCoverage, useInputClass, useMountedNow, useOneOpen, usePoll, useScopes, useTableKit, useTextLinkClass, useTierPolicy };
export type { AgentDefinitionView, AgentRunStarted, AgentSource, AgentsList, AttestationConfig, AttestationRow, BannerSummary, BulkResolutionRecorded, ButtonVariant, CalloutTone, Change, ChangeApproval, ChangeAttestation, ChangeObject, ChangeOutcome, ChangeReason, ChangeRecordItem, ChangeRequirement, ChangeState, ClearanceRead, ClearanceTokens, ClearanceTransport, ClearanceView, ClearanceWrite, ControlRefusal, CoverageHealth, CoverageStatement, Decision, DefinitionDrift, EventHistory, EvidenceRecord, ExpandRowProps, FakeAnswer, FakeCall, FakeTransport, FetchLike, FetchTransportOptions, FilterOption, GatePolicy, Hold, HumanRequest, ObservationRecord, ObserveItem, ObservePart, ObserveSegment, ObserveSourceHealth, Page, Params, Polled, Product, Query, RecordRef, RejectedPin, Resolution, ResolutionCause, ResolutionRecorded, ResolutionState, RunResult, RunsIn, RuntimeCatalog, RuntimeEntry, ScopeList, Session, SessionLimits, SessionOutcome, SessionState, StatusTone, TaskTree, Tier, TierCounts, TierDef, TierPolicy, Tone, VerificationBrief, VerifyAnswer };
