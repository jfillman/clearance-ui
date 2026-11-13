import { useMemo, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import {
  Button,
  Card,
  Callout,
  Chip,
  ControlError,
  dateTime,
  EmptyNote,
  Fact,
  FactGrid,
  FilterBar,
  FilterChips,
  PanelSkeleton,
  relativeTime,
  Section,
  shortPrincipal,
  Stat,
  StatRow,
  StatusChip,
  TabError,
  tierCountsOf,
  tierDefs,
  TierBadge,
  TierFilter,
  TierKey,
  TierMix,
  tierWhy,
  Tooltip,
  useTierPolicy,
  useClearanceRead,
  useClearanceWrite,
  useInputClass,
  useMountedNow,
  usePoll,
  useTableKit,
  type Change,
  type ChangeState,
  type Page,
  type StatusTone,
} from '../../kit';
import { ChangeProof } from './ChangeProof';

// Clearances (board C1, the deployment gate; clearance docs/gate.md, v0.19.0): every change the clearance-gate check
// registered for a protected environment, its tier and why, what it waits on, and who cleared it. A change holding
// for people is cleared or denied here, as the signed-in person through the delegate model; Clearance decides who may
// (the app's owner group, and for tier 3 an outside group, never the proposer, never twice) and records it.

const STATES: Array<{ id: ChangeState | 'all'; label: string }> = [
  { id: 'holding', label: 'Holding' },
  { id: 'cleared', label: 'Cleared' },
  { id: 'denied', label: 'Denied' },
  { id: 'expired', label: 'Expired' },
  { id: 'all', label: 'All' },
];

/** A change's state: holding waits on a person (warn), cleared is ok, denied is bad, expired is neutral. */
export function stateTone(s: ChangeState): StatusTone {
  if (s === 'holding') return 'warn';
  if (s === 'cleared') return 'ok';
  if (s === 'denied') return 'bad';
  return 'neutral';
}

/** What a holding change still needs, in words. */
export function stillNeeds(c: Pick<Change, 'requirement' | 'approvals'>): string {
  const r = c.requirement;
  if (!r) return '';
  const have = (role: string) => c.approvals.filter(a => a.role === role).length;
  const parts: string[] = [];
  if (r.owner - have('owner') > 0) parts.push(`${r.owner - have('owner')} from ${shortPrincipal(r.ownerGroup)}`);
  if (r.outside - have('outside') > 0) parts.push(`${r.outside - have('outside')} from ${r.outsideGroups.map(shortPrincipal).join(' or ')}`);
  return parts.join(' and ');
}

// Layout only: every look is the kit's.
const useStyles = makeStyles<Theme>(() => ({
  row: { display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' },
  scroll: { overflowX: 'auto' },
  pad: { padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 12 },
  actions: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' },
  reason: { flex: '1 1 220px', width: 'auto' },
  selectable: { userSelect: 'text' },
  stack: { display: 'flex', flexDirection: 'column', gap: 16 },
}));

function needsText(change: Change): string {
  if (change.state === 'holding') return stillNeeds(change) || 'nothing more';
  if (change.cleared_by === 'policy') return 'cleared by policy';
  return '—';
}

export function ClearanceDetail({ change, onChanged }: { change: Change; onChanged?: () => void }) {
  const c = useStyles();
  const { policy } = useTierPolicy(change.app, change.env);
  const tk = useTableKit();
  const inp = useInputClass();
  const write = useClearanceWrite();
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const act = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError(undefined);
    try {
      await fn();
      setReason('');
      onChanged?.();
    } catch (e) {
      setError(e instanceof ControlError ? `${e.refusal.rule ? `${e.refusal.rule}: ` : ''}${e.message}` : String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Section
      framed
      aria-label="Change detail"
      title={`${change.app} · ${change.env}`}
      meta={
        <>
          <TierBadge tier={change.tier} change={change} policy={policy}>tier {change.tier}</TierBadge>
          <StatusChip tone={stateTone(change.state)} dot={change.state === 'holding'}>{change.state}</StatusChip>
          <Chip>{change.target}</Chip>
        </>
      }
      count={<span className={c.selectable} data-testid="change-id">{change.id}</span>}
    >
      <div className={c.pad}>
        <FactGrid min={300}>
          <Fact label="Why this tier">{tierDefs(policy)[change.tier]?.name ?? ''}: {tierWhy(change) || 'nothing above tier 0'}</Fact>
          <Fact label="Proposed by">{shortPrincipal(change.proposer)} ({change.proposer_kind}{change.agent ? `: ${change.agent}` : ''})</Fact>
          <Fact label="Needs">{needsText(change)}</Fact>
          <Fact label="Approvals">{change.approvals.length ? change.approvals.map(a => `${shortPrincipal(a.person)} (${a.role}${a.via ? ', via Tower' : ''}, ${dateTime(a.at)})`).join('; ') : 'none'}</Fact>
          {change.deny_reason && <Fact label="Denied">{shortPrincipal(change.denied_by)}: {change.deny_reason}</Fact>}
          <Fact label="Checks">{Object.entries(change.checks).map(([k, v]) => `${k} ${v}`).join(' · ')}</Fact>
          <Fact label="Binds to">head {change.head.slice(0, 12)} · tree {change.tree_digest.slice(0, 12)} · {change.objects.length} object(s) · policy {change.policy_version}{change.repo_policy_digest ? ' + clearance.yaml' : ''}</Fact>
          <Fact label="Expires">{dateTime(change.expires_at)}</Fact>
        </FactGrid>
        {change.state === 'holding' && (
          <div className={c.actions}>
            <Button variant="primary" disabled={busy} onClick={() => act(() => write.clearChange(change.id))}>Clear as you</Button>
            <input className={`${inp.input} ${c.reason}`} aria-label="Reason to deny" placeholder="Reason to deny (recorded)" value={reason} onChange={e => setReason(e.target.value)} />
            <Button variant="danger" disabled={busy || !reason.trim()} onClick={() => act(() => write.denyChange(change.id, reason))}>Deny…</Button>
          </div>
        )}
        {error && <Callout tone="bad">{error}</Callout>}
      </div>
      <div className={c.scroll}>
        <table className={tk.table} aria-label="Objects this change touches">
          <thead><tr><th className={tk.th}>Object</th><th className={tk.th}>Change</th><th className={tk.th}>Fields</th></tr></thead>
          <tbody>
            {change.objects.slice(0, 100).map(o => {
              const why = change.reasons.find(r => r.subject === `${o.kind} ${o.namespace ? `${o.namespace}/` : ''}${o.name}`);
              return (
                <tr key={`${o.kind}/${o.namespace}/${o.name}`}>
                  <td className={tk.td}><Chip>{o.kind}</Chip> <span className={tk.meta}>{o.namespace ? `${o.namespace}/` : ''}{o.name}</span>{why && <> <TierBadge tier={why.tier} policy={policy}>T{why.tier} {why.rule}</TierBadge></>}</td>
                  <td className={tk.td}><span className={tk.meta}>{o.op}</span></td>
                  <td className={tk.td}><span className={tk.meta}>{o.fields.slice(0, 6).join(', ')}{o.fields.length > 6 ? ` +${o.fields.length - 6}` : ''}{o.images.length ? ` → ${o.images.join(', ')}` : ''}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Section>
  );
}

export function ClearancesView({ app, initial, now: nowProp }: { app?: string; initial?: string; now?: number }) {
  const c = useStyles();
  const tk = useTableKit();
  const api = useClearanceRead();
  const now = useMountedNow(nowProp);
  const [state, setState] = useState<ChangeState | 'all'>(initial ? 'all' : 'holding');
  const [selected, setSelected] = useState<string | undefined>(initial);
  const [tiers, setTiers] = useState<number[]>([]);
  const { policy, source } = useTierPolicy(app);
  const since = useMemo(() => new Date(Math.floor((now - 24 * 3_600_000) / 60_000) * 60_000).toISOString(), [now]);
  // The server's tier filter takes one tier: several are one read each, merged newest first.
  const list = usePoll(`clearances-${app ?? ''}-${state}-${tiers.join('')}`, async () => {
    const q = { app, state: state === 'all' ? undefined : state, limit: 100 };
    if (tiers.length < 2) return api.get<Page<Change>>('/v1/clearances', { ...q, tier: tiers[0] });
    const pages = await Promise.all(tiers.map(tier => api.get<Page<Change>>('/v1/clearances', { ...q, tier })));
    const merged = pages.flatMap(p => p.items).sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1)).slice(0, 100);
    return { ...pages[0], items: merged };
  }, 30_000);
  const tierCounts = usePoll(`clearance-tier-counts-${app ?? ''}-${since}`, () => api.get<{ items: Array<{ key: string | null; count: number }> }>('/v1/clearances/counts', { app, by: 'tier', since }), 60_000);
  const mix = tierCountsOf(tierCounts.data?.items);
  const counts = usePoll(`clearance-counts-${app ?? ''}`, () => api.get<{ items: Array<{ key: string | null; count: number }>; total: number }>('/v1/clearances/counts', { app, by: 'state' }), 60_000);
  const byPolicy = usePoll(`clearance-cleared-by-${app ?? ''}`, () => api.get<{ items: Array<{ key: string | null; count: number }> }>('/v1/clearances/counts', { app, by: 'cleared_by', state: 'cleared' }), 60_000);
  const one = usePoll(`clearance-${selected ?? ''}`, () => (selected ? api.get<Change>(`/v1/clearances/${encodeURIComponent(selected)}`) : Promise.resolve(undefined)), 30_000);
  const count = (k: string) => counts.data?.items.find(i => i.key === k)?.count ?? 0;
  const items = list.data?.items ?? [];
  const refresh = () => { tierCounts.refresh(); list.refresh(); counts.refresh(); one.refresh(); byPolicy.refresh(); };
  return (
    <>
      <StatRow>
        <Card><Stat label="Holding for people" value={count('holding')} tone={count('holding') ? 'warn' : undefined} /></Card>
        <Card><Stat label="Cleared by policy" value={byPolicy.data?.items.find(i => i.key === 'policy')?.count ?? 0} /></Card>
        <Card><Stat label="Cleared by people" value={byPolicy.data?.items.find(i => i.key === 'people')?.count ?? 0} /></Card>
        <Card><Stat label="Denied · expired" value={`${count('denied')} · ${count('expired')}`} /></Card>
        <Card><Stat label="Changes in 24 h, by tier" value={Object.values(mix).reduce((n, v) => n + v, 0)} /><TierMix counts={mix} /></Card>
      </StatRow>
      <div className={c.row}>
        <Section framed aria-label="Changes" title="Changes" count={`${items.length} shown`} style={{ flex: '1.2 1 520px' }}>
          <div className={c.pad}>
            <FilterBar>
              <FilterChips label="State" options={STATES} value={state} onChange={setState} />
              <TierFilter value={tiers} onChange={setTiers} policy={policy} source={source} counts={mix} />
            </FilterBar>
          </div>
          <TierKey policy={policy} counts={mix} />
          {list.error && !list.data && <div className={c.pad}><TabError error={list.error} what="changes" onRetry={list.refresh} /></div>}
          {list.loading && !list.data && <PanelSkeleton rows={4} label="Loading…" />}
          {list.data && items.length === 0 && <EmptyNote inset>No {state === 'all' ? '' : `${state} `}{tiers.length ? `tier ${tiers.join(', ')} ` : ''}changes{app ? ` for ${app}` : ''}. The clearance-gate check registers a change on every release PR to a protected environment.</EmptyNote>}
          {items.length > 0 && (
            <div className={c.scroll}>
              <table className={tk.table}>
                <thead><tr><th className={tk.th}>Change</th><th className={tk.th}>Tier</th><th className={tk.th}>State</th><th className={tk.th}>Needs</th><th className={tk.th}>Updated</th></tr></thead>
                <tbody>
                  {items.map(ch => (
                    <tr key={ch.id} className={`${tk.rowLink} ${ch.id === selected ? tk.rowSelected : ''}`} aria-selected={ch.id === selected} tabIndex={0} onClick={() => setSelected(ch.id)} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setSelected(ch.id)}>
                      <td className={tk.td}><b>{ch.app}</b> · {ch.env}<div className={tk.meta}>{ch.id} · {ch.target} · {shortPrincipal(ch.proposer)}</div></td>
                      <td className={tk.td}><TierBadge tier={ch.tier} change={ch} policy={policy}>T{ch.tier}</TierBadge></td>
                      <td className={tk.td}><StatusChip tone={stateTone(ch.state)} dot={ch.state === 'holding'}>{ch.state}</StatusChip></td>
                      <td className={tk.td}><span className={tk.meta}>{ch.state === 'holding' ? stillNeeds(ch) : ch.cleared_by ?? ''}</span></td>
                      <td className={tk.td}><Tooltip title={dateTime(ch.updated_at)}><span className={tk.meta}>{relativeTime(ch.updated_at, now)}</span></Tooltip></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Section>
        <div style={{ flex: '1 1 440px', minWidth: 0 }}>
          {one.data ? (
            <div className={c.stack}>
              <ClearanceDetail change={one.data} onChanged={refresh} />
              <ChangeProof change={one.data} />
            </div>
          ) : (
            <Section framed title="Change"><EmptyNote inset>{one.error ?? 'Select a change to see why it has its tier, what it binds to, and to clear or deny it.'}</EmptyNote></Section>
          )}
        </div>
      </div>
    </>
  );
}
