import { useCallback, useEffect, useMemo, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import {
  Button,
  Callout,
  Chip,
  clock,
  Count,
  DecisionChip,
  EmptyNote,
  FilterBar,
  FilterChips,
  FilterInput,
  FilterSelect,
  Hint,
  PAGE_SIZES,
  PanelSkeleton,
  relativeTime,
  SearchField,
  Section,
  shortPrincipal,
  StatusChip,
  TabError,
  TextLink,
  TierChip,
  Tooltip,
  useClearanceRead,
  useMountedNow,
  usePoll,
  useTableKit,
  VerifiedClaimed,
  YamlBlock,
  type AgentDefinitionView,
  type EvidenceRecord,
  type Page,
} from '../../kit';

// Evidence (board C2): the records you may see, newest first, with the list's filters, totals by decision, and one
// record expanded field by field. The chain check itself is the auditor's own step (clearance verify, or
// /v1/evidence/verify with their own sign-in); this page shows the head it would check.

/** Rows per page, chosen in the filter bar; Load more fetches another page of the same size. */
export { PAGE_SIZES };
type Since = '24h' | '7d' | '30d' | 'all';
const SINCE_MS: Record<Since, number> = { '24h': 86_400_000, '7d': 7 * 86_400_000, '30d': 30 * 86_400_000, all: 0 };

/** The coverage states a record carries (clearance evidence.Coverage); the Coverage chips filter by one. */
export const COVERAGE_STATES = [
  'authorized-and-verified',
  'observed-not-attributed',
  'out-of-band-detected',
  'coverage-unavailable',
  'break-glass',
  'attempted-refused',
] as const;
export type CoverageState = (typeof COVERAGE_STATES)[number];

export interface Filters {
  decision: '' | 'allow' | 'deny';
  coverage: '' | CoverageState;
  agent: string;
  tool: string;
  rule: string;
  app: string;
  since: Since;
  search: string;
}

const EMPTY: Filters = { decision: '', coverage: '', agent: '', tool: '', rule: '', app: '', since: '7d', search: '' };

/** The search box: a task (t-…), a session (s-…) or a principal, by its shape. */
export function searchParams(search: string): { task?: string; session?: string; principal?: string } {
  const s = search.trim();
  if (!s) return {};
  if (s.startsWith('t-')) return { task: s };
  if (s.startsWith('s-')) return { session: s };
  return { principal: s.includes(':') || s.includes('/') ? s : `user:${s}` };
}

export function queryOf(f: Filters, now: number): Record<string, string | number | undefined> {
  return {
    decision: f.decision || undefined,
    coverage: f.coverage || undefined,
    agent: f.agent || undefined,
    tool: f.tool.trim() || undefined,
    rule: f.rule.trim() || undefined,
    app: f.app.trim() || undefined,
    since: f.since === 'all' ? undefined : new Date(now - SINCE_MS[f.since]).toISOString(),
    ...searchParams(f.search),
  };
}

const useStyles = makeStyles<Theme>(() => ({
  row: { display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-start' },
  pad: { padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 10 },
  more: { padding: 14 },
}));

export function EvidenceView({ now: nowProp, initialApp }: { now?: number; initialApp?: string }) {
  const c = useStyles();
  const tk = useTableKit();
  const api = useClearanceRead();
  // Fixed at mount (useMountedNow): the time window must not move with every render, or the key below changes on
  // every render and the list reloads forever (2026-10-31: "Loading…" never ended, no row opened).
  const now = useMountedNow(nowProp);
  const [f, setF] = useState<Filters>(initialApp ? { ...EMPTY, app: initialApp } : EMPTY);
  const [pageSize, setPageSize] = useState<number>(PAGE_SIZES[2]);
  const [items, setItems] = useState<EvidenceRecord[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [seq, setSeq] = useState<number>();
  const [raw, setRaw] = useState(false);
  const query = useMemo(() => queryOf(f, now), [f, now]);
  const key = JSON.stringify({ ...query, limit: pageSize });

  const load = useCallback(
    async (after?: number) => {
      setLoading(true);
      try {
        const page = await api.get<Page<EvidenceRecord>>('/v1/evidence', { ...query, limit: pageSize, after });
        setItems(prev => (after === undefined ? page.items : [...prev, ...page.items]));
        setNext(typeof page.next === 'number' ? page.next : null);
        setError(undefined);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [api, query, pageSize],
  );
  useEffect(() => {
    setSeq(undefined);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const agents = usePoll('agents', () => api.get<{ items: AgentDefinitionView[] }>('/v1/agents'), 300_000);
  const totals = usePoll(`totals-${key}`, () => api.get<{ items: Array<{ key: string; count: number }>; total: number }>('/v1/evidence/counts', { ...query, by: 'decision' }), 0);
  const total = totals.data?.total;
  // Per-state totals for the Coverage chips: the same filters except coverage itself, so every state shows its count.
  const { coverage: _coverage, ...queryNoCoverage } = query;
  const covTotals = usePoll(`cov-totals-${JSON.stringify(queryNoCoverage)}`, () => api.get<{ items: Array<{ key: string | null; count: number }> }>('/v1/evidence/counts', { ...queryNoCoverage, by: 'coverage' }), 0);
  const covCount = (state: string) => covTotals.data?.items.find(i => i.key === state)?.count;
  const denyCount = totals.data?.items.find(i => i.key === 'deny')?.count ?? 0;
  const picked = items.find(r => r.seq === seq);
  const head = items[0];
  const set = (patch: Partial<Filters>) => setF(prev => ({ ...prev, ...patch }));

  return (
    <>
      <FilterBar
        end={<Count>{total === undefined ? '…' : total} records match{total !== undefined && ` · ${denyCount} denied`}</Count>}
      >
        <FilterChips label="Decision" options={[{ id: '', label: 'all decisions' }, { id: 'allow', label: 'allow' }, { id: 'deny', label: 'deny' }]} value={f.decision} onChange={d => set({ decision: d })} />
        <FilterChips label="Coverage" options={(['', ...COVERAGE_STATES] as const).map(st => ({ id: st, label: st || 'all coverage', count: st ? covCount(st) : undefined }))} value={f.coverage} onChange={st => set({ coverage: st })} />
        <FilterSelect label="Agent" value={f.agent} options={[{ value: '', label: 'any agent' }, ...(agents.data?.items ?? []).map(a => ({ value: a.name, label: a.name }))]} onChange={v => set({ agent: v })} />
        <FilterInput label="Tool" placeholder="tool, e.g. repo.pr.open" value={f.tool} onChange={v => set({ tool: v })} width={190} />
        <FilterInput label="Rule" placeholder="rule, e.g. R015" value={f.rule} onChange={v => set({ rule: v })} width={110} />
        <FilterInput label="App" placeholder="app" value={f.app} onChange={v => set({ app: v })} width={110} />
        <FilterSelect label="Since" value={f.since} options={[{ value: '24h', label: 'last 24 h' }, { value: '7d', label: 'last 7 days' }, { value: '30d', label: 'last 30 days' }, { value: 'all', label: 'all time' }]} onChange={v => set({ since: v })} />
        <FilterSelect label="Rows" value={String(pageSize)} options={PAGE_SIZES.map(n => ({ value: String(n), label: `${n} rows` }))} onChange={v => setPageSize(Number(v))} />
        <SearchField label="Search" placeholder="task id, session or principal" value={f.search} onChange={v => set({ search: v })} />
      </FilterBar>
      <Hint style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
        {head && <span>head seq {head.seq} · {head.hash.slice(0, 12)}… · {head.assurance ?? 'assurance unknown'}</span>}
        <Tooltip title="Clearance verifies the whole chain from genesis for an auditor's own sign-in; Backstage shows the head it would check."><span>chain check: an auditor's step</span></Tooltip>
      </Hint>
      <div className={c.row}>
        <Section framed aria-label="Records" title="Records" count={`${items.length} loaded${next !== null ? ', more below' : ''}`} style={{ flex: '1.4 1 560px' }}>
          {error && <div className={c.pad}><TabError error={error} what="records" onRetry={() => load()} /></div>}
          {!error && items.length === 0 && (loading ? <PanelSkeleton rows={4} label="Loading…" /> : <EmptyNote inset>No records match.</EmptyNote>)}
          {items.length > 0 && (
            <table className={tk.table}>
              <thead><tr><th className={tk.th}>Seq</th><th className={tk.th}>Time</th><th className={tk.th}>Principal</th><th className={tk.th}>Tool</th><th className={tk.th}>Decision</th><th className={tk.th}>Assurance</th></tr></thead>
              <tbody>
                {items.map(r => (
                  <tr key={r.seq} className={`${tk.rowLink} ${seq === r.seq ? tk.rowSelected : ''}`} aria-selected={seq === r.seq} tabIndex={0} onClick={() => setSeq(seq === r.seq ? undefined : r.seq)} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && setSeq(seq === r.seq ? undefined : r.seq)}>
                    <td className={tk.td}><span className={tk.meta}>{r.seq}</span></td>
                    <td className={tk.td}><Tooltip title={r.ts}><span className={tk.meta}>{clock(r.ts)}</span></Tooltip><div className={tk.meta}>{relativeTime(r.ts, now)}</div></td>
                    <td className={tk.td}><span className={tk.meta}>{shortPrincipal(r.principal)}</span>{r.agent && <div className={tk.meta}>{r.agent}</div>}</td>
                    <td className={tk.td}><TierChip tier={r.tier} /> <Chip>{r.tool}</Chip>{(r.app || r.target) && <div className={tk.meta}>{r.app ?? r.target}</div>}</td>
                    <td className={tk.td}><DecisionChip decision={r.decision} rule={r.rule} /></td>
                    <td className={tk.td}><StatusChip tone={r.assurance === 'checkpointed' ? 'ok' : 'neutral'}>{r.assurance ?? 'unknown'}</StatusChip></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {next !== null && !error && (
            <div className={c.more}>
              <Button onClick={() => load(next)} disabled={loading}>{loading ? 'Loading…' : 'Load more'}</Button>
            </div>
          )}
        </Section>
        {picked && (
          <Section framed aria-label="Record detail" title={`Record ${picked.seq}`} meta={<DecisionChip decision={picked.decision} rule={picked.rule} />} count={`${picked.boundary} · ${picked.schema}`} style={{ flex: '1 1 420px' }}>
            <div className={c.pad}>
              {picked.decision === 'deny' && picked.result && <Callout tone="bad">{picked.result}</Callout>}
              <VerifiedClaimed record={picked} />
              <div><TextLink expanded={raw} onClick={() => setRaw(v => !v)}>raw record</TextLink></div>
              {raw && <YamlBlock text={JSON.stringify(picked, null, 2)} aria-label="Raw record" />}
            </div>
          </Section>
        )}
      </div>
    </>
  );
}
