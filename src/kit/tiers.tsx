import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Checkbox, Chip, FilterChip, FilterGroup, StatusChip, Tooltip, type Tone } from './kit';
import { tierTone } from './components';
import { useTiers } from './kitStyles';
import { useClearanceRead } from './read';
import { usePoll } from './usePoll';
import type { Change, GatePolicy } from './types';

// The tier legend, one definition, three ways to show it (board C5, owner-approved):
//   A  TierFilter   the Tier filter's popover: each row is the legend and a checkbox filter, amber while on
//   B  TierKey      a compact key above the change table, collapsible to badges
//   C  TierBadge    the badge's hover ("why this tier"), and TierMix, the tier-mix bar (also for the coverage drawer)
// The words live here and nowhere else, so the three cannot drift. They are the baseline table in Clearance's
// docs/gate.md ("Tiers at the deployment boundary"). What the policy in force says (GET /v1/clearance-policy: who each
// tier needs, the line limit of a tier-1 bump) replaces the baseline's numbers when the read succeeds; a repo's
// clearance.yaml can only tighten, never loosen, so the baseline is a safe thing to show while that loads or fails.

/** The baseline when the policy cannot be read: the gate's built-in defaults (Clearance internal/gate/policy.go). */
export const BASELINE_POLICY: Pick<GatePolicy, 'approvers' | 'maxLinesTier1'> = {
  approvers: { '2': { owner: 1, outside: 0 }, '3': { owner: 1, outside: 1 } },
  maxLinesTier1: 400,
};

export type TierPolicy = Pick<GatePolicy, 'approvers' | 'maxLinesTier1'> & Partial<Pick<GatePolicy, 'version' | 'repoPolicy'>>;

export interface TierDef {
  tier: 0 | 1 | 2 | 3;
  /** The short name, in the docs' own words. */
  name: string;
  /** What it covers (gate.md's "What it covers (baseline)"). */
  covers: string;
  /** The same in a few words, for the key. */
  brief: string;
  /** Who clears it, short (a chip) and long (a sentence). */
  clears: { by: 'policy' | 'people'; short: string; long: string };
}

const WORDS = ['no', 'one', 'two', 'three', 'four'];
const word = (n: number) => WORDS[n] ?? String(n);

function approval(tier: number, policy: TierPolicy): TierDef['clears'] {
  const a = policy.approvers[String(tier)] ?? BASELINE_POLICY.approvers[String(tier)] ?? { owner: 1, outside: 0 };
  const total = a.owner + a.outside;
  const parts = [a.owner > 0 && `${word(a.owner)} from the owner group`, a.outside > 0 && `${word(a.outside)} from outside it`].filter(Boolean).join(', ');
  if (total === 1) return { by: 'people', short: 'one owner', long: `one person from the app's owner group, not the proposer` };
  const short = a.outside > 0 ? `${word(total)} people, ${word(a.outside)} outside the owner group` : `${word(total)} owners`;
  return { by: 'people', short, long: `${word(total)} people: ${parts}, none of them the proposer` };
}

/** The four tiers, with the numbers the policy in force sets. */
export function tierDefs(policy: TierPolicy = BASELINE_POLICY): TierDef[] {
  const lines = policy.maxLinesTier1;
  return [
    {
      tier: 0,
      name: 'Docs and tests',
      covers: 'Docs, tests, comments, labels and annotations without effect, anything outside a runtime path',
      brief: 'docs, tests, labels',
      clears: { by: 'policy', short: 'policy, at once', long: 'policy, at once' },
    },
    {
      tier: 1,
      name: 'Image bump',
      covers: `An image bump on a Flight-registry image with CI green and provenance confirmed, under ${lines} changed lines; otherwise it becomes tier 2`,
      brief: `image bump, CI green, under ${lines} lines`,
      clears: { by: 'policy', short: 'policy, if checks hold', long: 'policy, at once, when every check holds' },
    },
    {
      tier: 2,
      name: 'Runtime shape',
      covers: 'Replicas, resources, Rollout strategy, values-<env>.yaml, NetworkPolicy, HTTPRoute, environment variables, probes',
      brief: 'replicas, resources, NetworkPolicy, env vars',
      clears: approval(2, policy),
    },
    {
      tier: 3,
      name: 'Secrets, RBAC and data',
      covers: 'Secrets and their references (Secret, ExternalSecret, SecretStore), RBAC (Role, RoleBinding, ServiceAccount), AppProject, migrations and jobs that write data, anything in clearance.yaml itself',
      brief: 'secrets, RBAC, data migrations',
      clears: approval(3, policy),
    },
  ];
}

export const NOT_TIERED = { name: 'Not tiered', covers: 'Seen in the environment with no grant (out of band)', brief: 'seen with no grant' };
export const TIER_FLOOR_NOTE = 'Tier is a floor: a change that touches a tier-3 object is tier 3 however small the edit. A repo\'s clearance.yaml can only tighten it.';

/**
 * The policy in force, from GET /v1/clearance-policy; the baseline until it loads or when it cannot be read. Clearance's
 * route takes no parameters today (it answers the gate's policy for every app and env, and refuses an unknown query
 * parameter with 400), so app and env only key the poll; they are sent once Clearance serves a per-app policy.
 */
export function useTierPolicy(app?: string, env?: string): { policy: TierPolicy; source: 'policy' | 'baseline' } {
  const api = useClearanceRead();
  const read = usePoll(`clearance-policy-${app ?? ''}-${env ?? ''}`, () => api.get<GatePolicy>('/v1/clearance-policy'), 300_000);
  return read.data?.approvers ? { policy: read.data, source: 'policy' } : { policy: BASELINE_POLICY, source: 'baseline' };
}

const toneOf = (tier: number | null | undefined): Tone => tierTone(tier);

/** Why a change has its tier: the objects and rules at that tier (gate.md: "every grant carries why this tier"). */
export function tierWhy(change: Pick<Change, 'tier' | 'reasons'>): string {
  const at = change.reasons.filter(r => r.tier === change.tier);
  if (at.length) return at.map(r => `${r.rule} (${r.subject})`).join(', ');
  return change.tier === 0 ? 'nothing above tier 0' : '';
}

function needs(change: Pick<Change, 'requirement' | 'tier'>, def: TierDef): string {
  const r = change.requirement;
  if (!r) return def.clears.long;
  const parts = [r.owner > 0 && `${word(r.owner)} from ${r.ownerGroup}`, r.outside > 0 && `${word(r.outside)} from ${r.outsideGroups.join(' or ')}`].filter(Boolean);
  return `${parts.join(' and ')}, none of them the proposer`;
}

/** C: a tier badge that explains itself. With the change, the hover says why it has this tier and who must clear it. */
export function TierBadge({ tier, change, policy, children }: { tier: number | null | undefined; change?: Pick<Change, 'tier' | 'reasons' | 'requirement' | 'state' | 'cleared_by' | 'proposer_kind'>; policy?: TierPolicy; children?: ReactNode }) {
  const c = useTiers();
  const defs = useMemo(() => tierDefs(policy), [policy]);
  const def = tier === null || tier === undefined ? undefined : defs[tier];
  const tip = (
    <div>
      <div className={c.tipTitle}>{def ? `Tier ${def.tier}: ${def.name}` : NOT_TIERED.name}</div>
      {!def && <div>{NOT_TIERED.covers}</div>}
      {def && change && tierWhy(change) && <div>Why: {tierWhy(change)}.</div>}
      {def && !change && <div>{def.covers}.</div>}
      {def && <div className={c.tipLine}>Cleared by: {change ? needs(change, def) : def.clears.long}.</div>}
      {def && change?.proposer_kind === 'agent' && <div className={c.tipLine}>An agent proposed it, so it is never cleared by policy alone below tier 1.</div>}
      <div className={c.tipDim}>{TIER_FLOOR_NOTE}</div>
    </div>
  );
  return (
    <Tooltip title={tip}>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <span className={c.badge} tabIndex={0}>
        <Chip tone={toneOf(tier)}>{children ?? (def ? `T${def.tier}` : '–')}</Chip>
      </span>
    </Tooltip>
  );
}

/** Changes per tier, as GET /v1/clearances/counts?by=tier returns them. */
export type TierCounts = Record<number, number>;

export function tierCountsOf(items: Array<{ key: string | null; count: number }> | undefined): TierCounts {
  const out: TierCounts = {};
  for (const i of items ?? []) {
    const n = i.key === null ? NaN : Number(i.key);
    if (Number.isInteger(n) && n >= 0 && n <= 3) out[n] = (out[n] ?? 0) + i.count;
  }
  return out;
}

/** C: the tier-mix bar: one segment per tier, sized by its share, with the counts under it. Reusable (the coverage drawer). */
export function TierMix({ counts, label = 'Changes by tier' }: { counts: TierCounts; label?: string }) {
  const c = useTiers();
  const total = [0, 1, 2, 3].reduce((n, t) => n + (counts[t] ?? 0), 0);
  const summary = `${label}: ${[0, 1, 2, 3].map(t => `tier ${t} ${counts[t] ?? 0}`).join(', ')}`;
  const segs: string[] = [c.seg0, c.seg1, c.seg2, c.seg3];
  return (
    <div>
      <div className={c.mix} role="img" aria-label={summary}>
        {total > 0 && [0, 1, 2, 3].filter(t => counts[t]).map(t => <i key={t} className={`${c.seg} ${segs[t]}`} style={{ width: `${(counts[t] / total) * 100}%` }} />)}
      </div>
      <div className={c.mixLegend} style={{ marginTop: 8 }}>
        {[0, 1, 2, 3].map(t => (
          <span key={t} className={c.mixItem}>
            <TierBadge tier={t} />
            {counts[t] ?? 0}
          </span>
        ))}
      </div>
    </div>
  );
}

/** B: the compact key above the change table: one cell per tier, collapsible to the badges alone. */
export function TierKey({ policy, counts, defaultOpen = true }: { policy?: TierPolicy; counts?: TierCounts; defaultOpen?: boolean }) {
  const c = useTiers();
  const [open, setOpen] = useState(defaultOpen);
  const defs = useMemo(() => tierDefs(policy), [policy]);
  return (
    <div role="group" aria-label="Tier key">
      <div className={c.keyHead}>
        <span className={c.popSub} style={{ flex: '0 1 auto' }}>Tier: how much a change can hurt, and who clears it</span>
        <Button small aria-expanded={open} onClick={() => setOpen(!open)} style={{ marginLeft: 'auto' }}>{open ? 'Hide key ▴' : 'Show key ▾'}</Button>
      </div>
      {open ? (
        <div className={c.keyStrip}>
          {defs.map(d => (
            <div key={d.tier} className={c.keyCell}>
              <div className={c.keyTop}><TierBadge tier={d.tier} policy={policy}>{d.tier}</TierBadge><span className={c.keyName}>{d.clears.short}</span></div>
              <span className={c.rowMeta}>{d.brief}</span>
              {counts && <span className={c.rowCount}>{counts[d.tier] ?? 0} in 24 h</span>}
            </div>
          ))}
          <div className={c.keyCell}>
            <div className={c.keyTop}><TierBadge tier={null}>–</TierBadge><span className={c.keyName}>{NOT_TIERED.name}</span></div>
            <span className={c.rowMeta}>{NOT_TIERED.brief}</span>
          </div>
        </div>
      ) : (
        <div className={c.keyBadges}>
          {defs.map(d => <TierBadge key={d.tier} tier={d.tier} policy={policy}>{d.tier}</TierBadge>)}
          <TierBadge tier={null}>–</TierBadge>
        </div>
      )}
    </div>
  );
}

/** A: the Tier filter. A pill (amber while any tier is chosen) that opens the legend; every row is a checkbox, so learning what a tier means and filtering by it are one action. */
export function TierFilter({ value, onChange, policy, source, counts }: { value: number[]; onChange: (tiers: number[]) => void; policy?: TierPolicy; source?: 'policy' | 'baseline'; counts?: TierCounts }) {
  const c = useTiers();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const defs = useMemo(() => tierDefs(policy), [policy]);
  useEffect(() => {
    if (!open) return undefined;
    const outside = (e: MouseEvent) => root.current && !root.current.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const toggle = (t: number) => onChange(value.includes(t) ? value.filter(x => x !== t) : [...value, t].sort());
  return (
    <div className={c.anchor} ref={root}>
      <FilterGroup label="Tier">
        <FilterChip on={value.length > 0} expanded={open} onClick={() => setOpen(!open)}>{value.length ? [...value].sort().join(', ') : 'all'} ▾</FilterChip>
      </FilterGroup>
      {open && (
        <div className={c.popover} role="dialog" aria-label="Change tiers">
          <div className={c.popHead}>
            <h3 className={c.popTitle}>Change tiers</h3>
            <span className={c.popSub}>How much a change can hurt, set by what it touches. Tick tiers to filter the list.</span>
          </div>
          {defs.map(d => {
            const on = value.includes(d.tier);
            return (
              <label key={d.tier} className={`${c.row} ${on ? c.rowOn : ''}`}>
                <Checkbox checked={on} onChange={() => toggle(d.tier)} aria-label={`Tier ${d.tier}: ${d.name}`} />
                <TierBadge tier={d.tier} policy={policy}>{d.tier}</TierBadge>
                <div className={c.rowBody}>
                  <div className={c.rowName}>{d.name}</div>
                  <div className={c.rowMeta}>{d.covers}</div>
                </div>
                <div className={c.rowEnd}>
                  <StatusChip tone={d.clears.by === 'policy' ? 'ok' : 'warn'}>{d.clears.short}</StatusChip>
                  {counts && <span className={c.rowCount}>{counts[d.tier] ?? 0} in 24 h</span>}
                </div>
              </label>
            );
          })}
          <div className={c.popFoot}>
            <TierBadge tier={null}>–</TierBadge>
            <span className={c.popSub}>{NOT_TIERED.name}: {NOT_TIERED.covers.toLowerCase()}.</span>
            {value.length > 0 && <Button small onClick={() => onChange([])}>Clear tier filter</Button>}
          </div>
          <div className={c.popNote}>
            {TIER_FLOOR_NOTE} {source === 'policy' ? `Showing the policy in force${policy?.version ? ` (${policy.version})` : ''}.` : 'Showing the gate\'s baseline.'}
          </div>
        </div>
      )}
    </div>
  );
}
