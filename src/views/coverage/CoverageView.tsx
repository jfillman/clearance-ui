import { useMemo, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import {
  Count,
  EmptyNote,
  FilterBar,
  FilterChips,
  Hint,
  readDeniedText,
  relativeTime,
  Section,
  shortPrincipal,
  StatusChip,
  Subtabs,
  TabError,
  TextLink,
  Time,
  useClearanceRead,
  useMountedNow,
  usePoll,
  useScopes,
  useTableKit,
  whenTitle,
  Tooltip,
  type ObservationRecord,
  type Page,
  type StatusTone,
} from '../../kit';
import { ExceptionsView, observationRows } from '../exceptions/ExceptionsView';
import { fromOf, OPEN_UNKNOWN_TITLE, useCoverageMany, useHealthRecords } from './data';
import { HealthMatrix } from './HealthMatrix';
import { buildHealthMatrix } from './healthModel';
import { ResolvePanel } from './ResolvePanel';
import { choiceForState } from './resolveMapping';

// Coverage (BK-1, board C4): what Clearance can and cannot see, and what it saw and did not clear. The scope-by-day health
// matrix from /v1/observations/health on top; below it the open exceptions (the Exceptions list, with the Resolve panel's
// choices from resolveMapping.ts), the changes seen but not attributed, and the named limits. Nothing here needs a cloud
// tenant: with none linked it says so and every tab is empty, not an error. Read for any signed-in person; only an admin is
// offered a resolution, and Clearance (not this page) decides who may.

export type CoverageTab = 'open' | 'not-attributed' | 'limits';
export const COVERAGE_TABS: Array<{ id: CoverageTab; label: string }> = [
  { id: 'open', label: 'Open exceptions' },
  { id: 'not-attributed', label: 'Not attributed' },
  { id: 'limits', label: 'Named limits' },
];
export const isCoverageTab = (v: string | null | undefined): v is CoverageTab => COVERAGE_TABS.some(t => t.id === v);

const HEALTH_WINDOWS = [
  { id: '7', label: '7 days' },
  { id: '14', label: '14 days' },
  { id: '30', label: '30 days' },
];
const RESOLUTION_TONE: Record<string, StatusTone> = { reverted: 'ok', ratified: 'ok', 'still-live': 'warn', 'declared-break-glass': 'warn' };

const useStyles = makeStyles<Theme>(() => ({
  page: { display: 'flex', flexDirection: 'column', gap: 16 },
  scroll: { overflowX: 'auto' },
}));

function NotAttributed({ scopes, now, onOpen }: { scopes: string[]; now: number; onOpen: (scope: string) => void }) {
  const c = useStyles();
  const tk = useTableKit();
  const api = useClearanceRead();
  const from = fromOf(now);
  const covs = useCoverageMany(api, scopes, from);
  const obs = usePoll<Record<string, ObservationRecord[]>>(
    `na-obs:${scopes.join(',')}:${from}`,
    async () => {
      const out: Record<string, ObservationRecord[]> = {};
      for (const scope of scopes) out[scope] = (await api.get<Page<ObservationRecord>>('/v1/observations', { scope, kind: 'observation', since: from, limit: 200 })).items;
      return out;
    },
    60_000,
  );
  const rows = useMemo(
    () => covs.flatMap(cv => observationRows(cv.scope, cv.data, obs.data?.[cv.scope] ?? [], [])).filter(r => r.klass === 'observed-not-attributed').sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts) || b.seq - a.seq),
    [covs, obs.data],
  );
  const failed = covs.find(cv => cv.failure !== undefined && cv.data === undefined)?.failure;
  return (
    <Section framed aria-label="Not attributed" title="Seen, not attributed" count={`${rows.length} in the last 7 days`}>
      {failed !== undefined && <TabError error={new Error(readDeniedText(failed))} what="the coverage statement" />}
      {obs.failure !== undefined && <TabError error={new Error(readDeniedText(obs.failure))} what="the observations" onRetry={obs.refresh} />}
      {rows.length === 0 ? (
        <EmptyNote inset>{scopes.length === 0 ? 'No scope is linked, so nothing is observed.' : 'Nothing was seen without an author in this window.'}</EmptyNote>
      ) : (
        <div className={c.scroll}>
          <table className={tk.table}>
            <thead>
              <tr>{['When', 'Scope', 'Resource', 'Actor', 'What changed', 'Resolution', ''].map(h => <th key={h} className={tk.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={`${r.scope}-${r.seq}`}>
                  <td className={tk.td}><Tooltip title={whenTitle(r.ts)}><span>{relativeTime(r.ts, now)}</span></Tooltip></td>
                  <td className={`${tk.td} ${tk.meta}`}>{r.scope}</td>
                  <td className={`${tk.td} ${tk.meta}`}>{r.resource || r.source}</td>
                  <td className={`${tk.td} ${tk.meta}`}>{shortPrincipal(r.actor) || 'not attributed'}</td>
                  <td className={`${tk.td} ${tk.meta}`}>{r.diff || '—'}</td>
                  <td className={tk.td}>{r.resolution ? <StatusChip tone={RESOLUTION_TONE[r.resolution] ?? 'warn'}>{choiceForState(r.resolution)?.label ?? r.resolution}</StatusChip> : <StatusChip tone="neutral">none recorded</StatusChip>}</td>
                  <td className={tk.td}>{!r.resolution && r.resolvable && <TextLink onClick={() => onOpen(r.scope)} aria-label={`Open ${r.resource || r.source}, seq ${r.seq}, in open exceptions`}>Open →</TextLink>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Section>
  );
}

interface Limit {
  key: string;
  scope: string;
  kind: string;
  source: string;
  window: string;
  why: string;
  tone: StatusTone;
}

function NamedLimits({ scopes, now }: { scopes: string[]; now: number }) {
  const c = useStyles();
  const tk = useTableKit();
  const api = useClearanceRead();
  const covs = useCoverageMany(api, scopes, fromOf(now));
  const limits = useMemo(() => {
    const out: Limit[] = [];
    for (const cv of covs) {
      const st = cv.data;
      if (!st) continue;
      st.could_not_see.segments.forEach((s, i) =>
        out.push({ key: `${cv.scope}-seg-${i}`, scope: cv.scope, kind: `could not see (${s.state})`, source: s.source, window: `${s.from} → ${s.to}`, why: s.reason, tone: s.state === 'blind' ? 'bad' : 'warn' }),
      );
      st.could_not_see.audit_gaps.forEach(g => out.push({ key: `${cv.scope}-gap-${g.seq}`, scope: cv.scope, kind: 'audit gap', source: g.source, window: g.ts, why: g.reason, tone: 'bad' }));
      for (const h of st.health.sources) {
        if (h.state === 'healthy' && !h.stale && h.failed_checks.length === 0) continue;
        out.push({ key: `${cv.scope}-src-${h.source}`, scope: cv.scope, kind: h.stale && h.state === 'healthy' ? 'feed stale' : `feed ${h.state}`, source: h.source, window: h.last_ts ?? 'never seen', why: h.failed_checks.length ? `failing: ${h.failed_checks.join(', ')}` : 'no health record inside its interval', tone: h.state === 'blind' || h.stale ? 'bad' : 'warn' });
      }
      if (st.source_integrity.unverified > 0) out.push({ key: `${cv.scope}-int`, scope: cv.scope, kind: 'unverified source', source: '', window: '', why: `${st.source_integrity.unverified} of ${st.source_integrity.observations} observations are not yet verified as delivered unaltered`, tone: 'warn' });
      if (st.truncated || st.seen_not_cleared.truncated) out.push({ key: `${cv.scope}-trunc`, scope: cv.scope, kind: 'list truncated', source: '', window: '', why: 'The statement lists the first 200 items; narrow the window to see the rest.', tone: 'neutral' });
    }
    return out;
  }, [covs]);
  // Clean is only ever said of a scope whose coverage was read: a scope that failed or is still loading is "not read".
  const unread = covs.filter(cv => cv.data === undefined);
  const failedScopes = unread.filter(cv => cv.failure !== undefined);
  const failed = failedScopes[0]?.failure;
  return (
    <Section framed aria-label="Named limits" title="Named limits" count={`${limits.length} named`}>
      {failed !== undefined && <TabError error={new Error(readDeniedText(failed))} what={`the coverage statement of ${failedScopes.map(f => f.scope).join(', ')}`} />}
      {limits.length === 0 ? (
        <EmptyNote inset>
          {scopes.length === 0 && 'No scope is linked, so there is nothing to name.'}
          {scopes.length > 0 && failedScopes.length > 0 && `Not read: the coverage of ${failedScopes.map(f => f.scope).join(', ')} could not be read, so its limits are unknown.`}
          {scopes.length > 0 && failedScopes.length === 0 && unread.length > 0 && 'Loading the coverage statements…'}
          {scopes.length > 0 && unread.length === 0 && 'No limit is named for any scope in this window: every feed reported and none dropped.'}
        </EmptyNote>
      ) : (
        <div className={c.scroll}>
          <table className={tk.table}>
            <thead>
              <tr>{['Scope', 'Limit', 'Source', 'When', 'Why'].map(h => <th key={h} className={tk.th}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {limits.map(l => (
                <tr key={l.key}>
                  <td className={`${tk.td} ${tk.meta}`}>{l.scope}</td>
                  <td className={tk.td}><StatusChip tone={l.tone}>{l.kind}</StatusChip></td>
                  <td className={`${tk.td} ${tk.meta}`}>{l.source || '—'}</td>
                  <td className={`${tk.td} ${tk.meta}`}>{/^\d{4}-/.test(l.window.slice(0, 5)) && !l.window.includes('→') ? <Time iso={l.window} /> : l.window || '—'}</td>
                  <td className={`${tk.td} ${tk.meta}`}>{l.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {limits.length > 0 && unread.length > 0 && <Hint inset>Not read: {unread.map(u => u.scope).join(', ')}. Its limits are unknown, not absent.</Hint>}
      <Hint inset>A scope with a named limit is never reported clean: what Clearance could not see is listed, not assumed to be fine.</Hint>
    </Section>
  );
}

export function CoverageView({ now: nowProp, tab = 'open', onTab, scope, openCount, onScope }: { now?: number; tab?: CoverageTab; onTab?: (t: CoverageTab, scope?: string) => void; onScope?: (scope: string | undefined) => void; scope?: string; openCount?: number | '?' }) {
  const c = useStyles();
  const api = useClearanceRead();
  const now = useMountedNow(nowProp);
  const scopes = useScopes();
  const list = useMemo(() => scopes.data?.scopes ?? [], [scopes.data]);
  const [days, setDays] = useState('14');
  const health = useHealthRecords(api, list, now, Number(days));
  const matrix = useMemo(() => buildHealthMatrix(list, health.data?.byScope ?? {}, now, Number(days), health.data?.meta), [list, health.data, now, days]);
  const [current, setCurrent] = useState<CoverageTab>(tab);
  const active = onTab ? tab : current;
  const go = (t: CoverageTab, sc?: string) => (onTab ? onTab(t, sc) : setCurrent(t));
  const [pickScope, setPickScope] = useState<string | undefined>(scope);
  // With a host that owns the URL (onTab/onScope), the `scope` prop is the truth, Back and Forward included: the Scope selector writes to it
  // through onScope and the list follows it. Without a host callback the page keeps the scope itself.
  const effScope = onTab || onScope ? scope : pickScope;
  return (
    <div className={c.page}>
      <FilterBar end={<Count>{list.length === 0 ? 'No scope linked' : `${list.length} ${list.length === 1 ? 'scope' : 'scopes'}`}</Count>}>
        <FilterChips label="Matrix window" options={HEALTH_WINDOWS} value={days} onChange={setDays} />
      </FilterBar>
      {scopes.failure !== undefined && <TabError error={new Error(readDeniedText(scopes.failure))} what="the scopes" onRetry={scopes.refresh} />}
      {health.failure !== undefined && !health.data && <TabError error={new Error(readDeniedText(health.failure))} what="feed health" onRetry={health.refresh} />}
      {health.data && list.some(s => health.data!.meta[s]?.error) && (
        <Hint>Health could not be read for {list.filter(s => health.data!.meta[s]?.error).join(', ')}: those rows are shown as not read, not as healthy.</Hint>
      )}
      {scopes.failure === undefined && <HealthMatrix matrix={matrix} />}
      <Subtabs label="Coverage details" tabs={COVERAGE_TABS.map(t => ({ id: t.id, label: t.label, count: t.id === 'open' ? openCount : undefined, countTitle: t.id === 'open' && openCount === '?' ? OPEN_UNKNOWN_TITLE : undefined }))} value={active} onChange={id => go(id)} />
      {active === 'open' && (
        <ExceptionsView
          now={now}
          initialScope={effScope}
          onScope={sc => (onScope ? onScope(sc) : setPickScope(sc))}
          initialOpen
          initialWindow="7d"
          renderResolve={(row, onDone) => <ResolvePanel key={row.seq} row={row} onDone={onDone} />}
        />
      )}
      {active === 'not-attributed' && <NotAttributed scopes={list} now={now} onOpen={sc => { setPickScope(sc); go('open', sc); }} />}
      {active === 'limits' && <NamedLimits scopes={list} now={now} />}
    </div>
  );
}
