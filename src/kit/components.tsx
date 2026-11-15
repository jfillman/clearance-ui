import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { compact, ratio } from './format';
import { Chip, StatusChip, type StatusTone, type Tone } from './kit';
import { fontMono, fontScale, tokensForTheme, useClearanceTokens } from './tokens';
import type { Decision, EvidenceRecord, Session, SessionLimits, SessionOutcome, SessionState, Tier } from './types';

const useStyles = makeStyles<Theme>(theme => {
  const t = tokensForTheme(theme);
  return {
  bars: { display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' },
  bar: { display: 'flex', flexDirection: 'column', gap: 4 },
  barLabel: { fontFamily: fontMono, fontWeight: 500, fontSize: fontScale.xs, textTransform: 'uppercase', letterSpacing: '0.1em', color: t.textLo },
  track: { height: 6, borderRadius: 3, background: t.panelAlt, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 3 },
  barValue: { fontFamily: fontMono, fontSize: fontScale.sm, color: t.textLo },
  fields: { display: 'grid', gridTemplateColumns: 'minmax(90px, auto) 1fr auto', gap: '6px 12px', alignItems: 'baseline', fontSize: fontScale.md },
  fieldKey: { fontFamily: fontMono, fontWeight: 500, fontSize: fontScale.xs, textTransform: 'uppercase', letterSpacing: '0.1em', color: t.textLo },
  fieldValue: { fontFamily: fontMono, fontSize: fontScale.sm, color: t.textHi, wordBreak: 'break-all' },
  };
});

const TIER_TONES: Record<number, Tone> = { 0: 'neutral', 1: 'sky', 2: 'amber', 3: 'bad' };

export const tierTone = (tier: Tier | number | null | undefined): Tone => {
  if (tier === null || tier === undefined) return 'neutral';
  const n = typeof tier === 'number' ? tier : Number(String(tier).replace('T', ''));
  return TIER_TONES[n] ?? 'neutral';
};

/** A tool tier: T0 read, T1 reversible write, T2 propose only, T3 tripwire. */
export function TierChip({ tier }: { tier: Tier | number | null | undefined }) {
  if (tier === null || tier === undefined) return null;
  const label = typeof tier === 'number' ? `T${tier}` : tier;
  return (
    <Chip tone={tierTone(tier)} title={{ T0: 'read only', T1: 'reversible write', T2: 'propose only: a person merges', T3: 'tripwire: denied and recorded' }[label] ?? label}>
      {label}
    </Chip>
  );
}

/** A decision as Clearance recorded it (a state, so a StatusChip): allow, or deny with its rule. */
export function DecisionChip({ decision, rule }: { decision: Decision | string; rule?: string | null }) {
  if (decision === 'allow') return <StatusChip tone="ok">allow</StatusChip>;
  return <StatusChip tone="bad">{rule ? `deny ${rule}` : 'deny'}</StatusChip>;
}

/** What kind of agent or caller something is (event, scheduled, session, task...): a label, so a square neutral Chip. */
export function KindChip({ kind }: { kind: string }) {
  return <Chip>{kind}</Chip>;
}

/** How an ended session's outcome reads (clearance v0.25.0): a run that answered finished; one that stopped short failed. */
export function outcomeLabel(o: SessionOutcome): { label: string; tone: StatusTone; why: string } {
  if (o.status === 'done') return { label: 'finished', tone: 'ok', why: 'the run answered' };
  if (o.status === 'expired') return { label: 'expired', tone: 'neutral', why: 'the session reached its time limit first' };
  if (o.status === 'budget') return { label: 'failed', tone: 'bad', why: 'the model budget ran out' };
  if (o.status === 'no-result') return { label: 'no result', tone: 'warn', why: `the run ended (${o.run_phase ?? 'unknown'}) without handing back a result` };
  return { label: 'failed', tone: 'bad', why: o.reason || 'the run stopped with an error' };
}

/** A session's state; a tripped live session is what waits on a person. An ended one says how it ended when it can. */
export function StateChip({ state, tripped, reason, outcome }: { state: SessionState; tripped?: boolean; reason?: string | null; outcome?: SessionOutcome | null }) {
  if (state === 'live' && tripped) return <StatusChip tone="warn" dot title={reason ?? undefined}>tripped</StatusChip>;
  if (state === 'live') return <StatusChip tone="info" dot>live</StatusChip>;
  if (outcome) {
    const o = outcomeLabel(outcome);
    return <StatusChip tone={o.tone} title={o.why}>{o.label}</StatusChip>;
  }
  if (state === 'closed') return <StatusChip tone="neutral">closed</StatusChip>;
  return <StatusChip tone="neutral" title="the session reached its time limit">expired</StatusChip>;
}

export function BudgetBar({ label, used, limit, format = String, valueText }: { label: string; used: number | undefined; limit: number | undefined; format?: (n: number) => string; valueText?: string }) {
  const t = useClearanceTokens();
  const c = useStyles();
  const r = ratio(used, limit);
  let color = t.sky;
  if (r >= 1) color = t.bad;
  else if (r >= 0.8) color = t.amber;
  const u = used ?? 0;
  return (
    <div className={c.bar} role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={limit ?? 0} aria-valuenow={u}>
      <span className={c.barLabel}>{label}</span>
      <div className={c.track}>
        <div className={c.fill} style={{ width: `${Math.round(r * 100)}%`, background: color }} />
      </div>
      <span className={c.barValue}>{valueText ?? (limit ? `${format(u)} of ${format(limit)}` : format(u))}</span>
    </div>
  );
}

const minutesBetween = (a: string, b: string) => Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 60000);

/** Minutes as the bar shows them: seconds under a minute, minutes and seconds under ten, whole minutes after. */
export function formatMinutes(n: number): string {
  const secs = Math.round(n * 60);
  if (secs < 60) return `${secs} s`;
  if (secs < 600 && secs % 60 !== 0) return `${Math.floor(secs / 60)} min ${secs % 60} s`;
  return `${Math.round(secs / 60)} min`;
}

/**
 * Every budget a session has, used against its limits, as bars. Time is elapsed against the session's TTL: up to `now`
 * while the session is live, up to `endedAt` once it has ended (`ended` with no `endedAt` means the end time is unknown,
 * so the bar shows the limit and no value rather than a made-up one). Never past `expiresAt`.
 */
export function BudgetBars({ used, limits, createdAt, expiresAt, now = Date.now(), endedAt, ended }: { used: Record<string, number>; limits: SessionLimits; createdAt?: string; expiresAt?: string; now?: number; endedAt?: string; ended?: boolean }) {
  const c = useStyles();
  const endMs = endedAt ? new Date(endedAt).getTime() : now;
  const elapsed = createdAt ? minutesBetween(createdAt, new Date(Math.min(endMs, expiresAt ? new Date(expiresAt).getTime() : endMs)).toISOString()) : undefined;
  const unknownEnd = !!ended && !endedAt;
  return (
    <div className={c.bars}>
      {createdAt && <BudgetBar label="Run time" used={unknownEnd ? 0 : elapsed ?? 0} limit={limits.ttl_minutes} format={formatMinutes} valueText={unknownEnd ? `ended (limit ${formatMinutes(limits.ttl_minutes)})` : undefined} />}
      <BudgetBar label="Tool calls" used={used.tool_calls} limit={limits.tool_calls} />
      <BudgetBar label="GitHub calls" used={used.github_calls} limit={limits.github_calls} />
      <BudgetBar label="Open PRs" used={used.open_prs} limit={limits.open_prs} />
      <BudgetBar label="Model tokens" used={used.model_tokens} limit={limits.model_tokens} format={compact} />
      <BudgetBar label="Child runs" used={used.children} limit={limits.children} />
    </div>
  );
}

/**
 * The budgets a Session carries, as BudgetBars. A live session's run time counts to `now`; an ended one counts to
 * outcome.finished_at (an expired one (not closed, past its deadline) shows the full TTL; a closed one with no outcome has
 * no end time to show).
 */
export function SessionBudgets({ session, now = Date.now() }: { session: Session; now?: number }) {
  const finished = session.outcome?.finished_at;
  // Closed with no outcome has no known end time, whatever the clock says; only a session that is not closed and is past
  // its deadline (expired) ran to expires_at, and a live one counts to now (BudgetBars clamps it to expires_at).
  const ended = !!finished || session.closed;
  const endedAt = finished;
  return <BudgetBars used={session.used} limits={session.limits} createdAt={session.created_at} expiresAt={session.expires_at} now={now} endedAt={endedAt} ended={ended} />;
}

const FIELD_ORDER = ['principal', 'agent', 'session', 'task_id', 'tool', 'tier', 'decision', 'rule', 'target', 'app', 'result', 'args_sha256', 'effect'];

/** One record field by field, each marked verified (Clearance checked it) or claimed (an integration said so). */
export function VerifiedClaimed({ record }: { record: EvidenceRecord }) {
  const c = useStyles();
  const verified = new Set(record.verified ?? []);
  const claimed = new Set(record.claimed ?? []);
  const keys = [...FIELD_ORDER.filter(k => k in record && (record as any)[k] !== null && (record as any)[k] !== undefined), ...[...claimed].filter(k => !FIELD_ORDER.includes(k))];
  return (
    <div className={c.fields}>
      {keys.map(k => {
        const v = (record as any)[k];
        const text = typeof v === 'object' ? JSON.stringify(v) : String(v);
        let mark: 'verified' | 'claimed' | undefined;
        if (verified.has(k)) mark = 'verified';
        else if (claimed.has(k)) mark = 'claimed';
        return <FieldRow key={k} name={k} value={text} mark={mark} />;
      })}
      <FieldRow name="coverage" value={record.coverage} />
      <FieldRow name="assurance" value={record.assurance ?? 'unknown'} />
      <FieldRow name="hash" value={`${record.prev_hash.slice(0, 8)}… → ${record.hash.slice(0, 8)}…`} />
    </div>
  );
}

function FieldRow({ name, value, mark }: { name: string; value: string; mark?: 'verified' | 'claimed' }) {
  const c = useStyles();
  return (
    <>
      <span className={c.fieldKey}>{name}</span>
      <span className={c.fieldValue}>{value}</span>
      <span>
        {mark === 'verified' && <StatusChip tone="ok">verified</StatusChip>}
        {mark === 'claimed' && <StatusChip tone="warn">claimed</StatusChip>}
      </span>
    </>
  );
}
