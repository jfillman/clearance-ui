import { useEffect, useMemo, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import {
  Button,
  Callout,
  Card,
  dateTime,
  DEFAULT_PAGE_SIZE,
  EmptyNote,
  FilterBar,
  FilterChips,
  FilterSelect,
  PanelSkeleton,
  Pager,
  pageSlice,
  relativeTime,
  SearchField,
  Section,
  Stat,
  StatRow,
  TabError,
    Tooltip,
  useClearanceRead,
  useMountedNow,
  usePoll,
  useTableKit,
  type AttestationConfig,
  type AttestationRow,
  type Page,
} from '../../kit';
import { cursorOf, rekorUrl, RekorIndex, shortDigest, verifiableOf, verifyDisplay, VerifyChip } from '../clearances/ChangeProof';

// Attestations (board C13): every signed statement that Clearance cleared a change and a deploy applied it, newest first,
// with the Rekor entry that proves when (clearance docs/clearance-api.md "Change history and attestations"). A row opens
// its change. "verified" appears only where the server's last verify answer said so; a Clearance with no trust
// configured says "signed (recorded)".

export type Window = '24h' | '7d' | '30d';
const WINDOWS: Array<{ id: Window; label: string }> = [
  { id: '24h', label: '24 h' },
  { id: '7d', label: '7 d' },
  { id: '30d', label: '30 d' },
];
const WINDOW_MS: Record<Window, number> = { '24h': 24 * 3_600_000, '7d': 7 * 24 * 3_600_000, '30d': 30 * 24 * 3_600_000 };
const FETCH_LIMIT = 100;

/** The start of a window, on the minute so a poll key stays put between renders. */
export const windowSince = (now: number, w: Window): string => new Date(Math.floor((now - WINDOW_MS[w]) / 60_000) * 60_000).toISOString();

/** Rows that match a search: the change id, app, env, release id or a digest contains it (case-insensitive). */
export function searchRows(rows: AttestationRow[], q: string): AttestationRow[] {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter(r => [r.change_id, r.app, r.env, r.release_id ?? '', r.tree_digest, r.digest, r.key_id ?? ''].some(v => v.toLowerCase().includes(needle)));
}

const RECHECK: Record<string, { value: string; caption?: string }> = {
  undefined: { value: '…' },
  true: { value: 'on', caption: 'rows show verified once Clearance re-checks them' },
  false: { value: 'off', caption: 'no trust configured: rows show signed (recorded)' },
};

function keysCaption(config: AttestationConfig | undefined, verifiable: boolean | undefined): string | undefined {
  if (config?.key_ids?.length) return `${config.key_ids.length} trusted: ${config.key_ids.join(', ')}`;
  return verifiable === false ? 'none configured to re-check with' : undefined;
}

const useStyles = makeStyles<Theme>(() => ({
  scroll: { overflowX: 'auto' },
  pad: { padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 12 },
  more: { padding: '8px 18px' },
}));

type CountItems = { items: Array<{ key: string | null; count: number }>; total?: number };

export function AttestationsView({ now: nowProp, onOpenChange }: { now?: number; onOpenChange?: (changeId: string) => void }) {
  const c = useStyles();
  const tk = useTableKit();
  const api = useClearanceRead();
  const now = useMountedNow(nowProp);
  const [win, setWin] = useState<Window>('7d');
  const [app, setApp] = useState('');
  const [env, setEnv] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const since = useMemo(() => windowSince(now, win), [now, win]);
  const key = `${since}|${app}|${env}`;

  const config = usePoll<AttestationConfig | undefined>('attestation-config', () => api.get<AttestationConfig>('/v1/attestation-config').catch(() => undefined), 0);
  const apps = usePoll('attestations-apps', () => api.get<CountItems>('/v1/clearances/counts', { by: 'app' }), 300_000);
  const envs = usePoll('attestations-envs', () => api.get<CountItems>('/v1/clearances/counts', { by: 'env' }), 300_000);
  const counts = usePoll(`attestation-counts-${key}`, () => api.get<CountItems>('/v1/clearances/counts', { by: 'attestation', app, env, since }), 60_000);
  const first = usePoll(`attestations-${key}`, () => api.get<Page<AttestationRow>>('/v1/attestations', { app, env, since, limit: FETCH_LIMIT }), 60_000);
  const [extra, setExtra] = useState<AttestationRow[]>([]);
  const [after, setAfter] = useState<number | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [moreError, setMoreError] = useState<string>();
  useEffect(() => {
    setExtra([]);
    setAfter(undefined);
    setPage(0);
  }, [key]);
  const rows = [...(first.data?.items ?? []), ...extra];
  const next = cursorOf(after, first.data?.next);
  const loadOlder = async () => {
    if (next === null) return;
    setBusy(true);
    setMoreError(undefined);
    try {
      const p = await api.get<Page<AttestationRow>>('/v1/attestations', { app, env, since, limit: FETCH_LIMIT, after: next });
      setExtra(prev => [...prev, ...p.items]);
      setAfter(typeof p.next === 'number' ? p.next : null);
    } catch (e) {
      setMoreError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const shown = searchRows(rows, query);
  const slice = pageSlice(shown, page, pageSize);
  const count = (k: string) => counts.data?.items.find(i => i.key === k)?.count ?? 0;
  const verifiable = verifiableOf(config);
  const keysInUse = new Set(rows.map(r => r.key_id).filter(Boolean)).size;
  const options = (items: CountItems | undefined, all: string) => [{ value: '', label: all }, ...(items?.items ?? []).filter(i => i.key).map(i => ({ value: i.key as string, label: i.key as string }))];

  return (
    <>
      <StatRow>
        <Card><Stat label={`Signed, ${WINDOWS.find(w => w.id === win)!.label}`} value={counts.data ? count('attested') : '…'} caption={config.data?.modes?.length ? config.data.modes.join(', ') : undefined} /></Card>
        <Card><Stat label="Applied, awaiting signature" value={counts.data ? count('pending') : '…'} tone={count('pending') ? 'warn' : undefined} caption="the signer is waiting or retrying, or attestation is off" /></Card>
        <Card><Stat label="Signing keys on these rows" value={keysInUse} caption={keysCaption(config.data, verifiable)} /></Card>
        <Card><Stat label="Server re-check" value={RECHECK[String(verifiable)].value} tone={verifiable ? 'ok' : undefined} caption={RECHECK[String(verifiable)].caption} /></Card>
      </StatRow>
      <Section framed aria-label="Attestations" title="Signed attestations" count={`${shown.length} shown · newest first`}>
        <div className={c.pad}>
          <FilterBar>
            <FilterSelect label="App" value={app} options={options(apps.data, 'any app')} onChange={setApp} />
            <FilterSelect label="Env" value={env} options={options(envs.data, 'any env')} onChange={setEnv} />
            <FilterChips label="Window" options={WINDOWS} value={win} onChange={setWin} />
            <SearchField label="Search attestations" placeholder="Search change, release id or digest" value={query} onChange={v => { setQuery(v); setPage(0); }} />
          </FilterBar>
          {verifiable === false && <Callout tone="info">This Clearance has no trust configured, so it cannot re-check a signature. Rows show &ldquo;signed (recorded)&rdquo;, the state the core recorded. Download a bundle from its change and verify it offline.</Callout>}
        </div>
        {first.error && !first.data && <div className={c.pad}><TabError error={first.failure ?? first.error} what="attestations" onRetry={first.refresh} /></div>}
        {first.loading && !first.data && <PanelSkeleton rows={4} label="Loading attestations…" />}
        {first.data && rows.length === 0 && <EmptyNote inset>No attestations signed in this window{app ? ` for ${app}` : ''}{env ? ` in ${env}` : ''}. One is signed after a cleared change is applied.</EmptyNote>}
        {first.data && rows.length > 0 && shown.length === 0 && <EmptyNote inset>No loaded attestation matches &ldquo;{query}&rdquo;.{next !== null ? ' Older ones are not loaded yet.' : ''}</EmptyNote>}
        {slice.rows.length > 0 && (
          <div className={c.scroll}>
            <table className={tk.table} aria-label="Signed attestations">
              <thead>
                <tr>
                  {['App', 'Env', 'Change', 'Release', 'Tree', 'Signed', 'Rekor index', 'Key id', 'State'].map(h => <th key={h} className={tk.th}>{h}</th>)}
                </tr>
              </thead>
              <tbody>
                {slice.rows.map(r => {
                  const url = rekorUrl(config.data, r.rekor_log_index);
                  return (
                    <tr key={r.record_seq} className={tk.rowLink} tabIndex={0} aria-label={`Open change ${r.change_id}`} onClick={() => onOpenChange?.(r.change_id)} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onOpenChange?.(r.change_id)}>
                      <td className={tk.td}><b>{r.app}</b></td>
                      <td className={tk.td}><span className={tk.meta}>{r.env}</span></td>
                      <td className={tk.td}><span className={tk.meta}>{r.change_id}</span></td>
                      <td className={tk.td}><span className={tk.meta}>{r.release_id ?? '—'}</span></td>
                      <td className={tk.td}><Tooltip title={r.tree_digest}><span className={tk.meta}>{shortDigest(r.tree_digest)}</span></Tooltip></td>
                      <td className={tk.td}><Tooltip title={dateTime(r.signed_at)}><span className={tk.meta}>{relativeTime(r.signed_at, now)} ago</span></Tooltip></td>
                      <td className={tk.td} onClick={e => e.stopPropagation()} onKeyDown={e => e.stopPropagation()}>
                        {r.rekor_log_index === null ? <span className={tk.meta}>not logged</span> : <RekorIndex index={r.rekor_log_index} url={url} />}
                      </td>
                      <td className={tk.td}><span className={tk.meta}>{r.key_id || 'keyless'}</span></td>
                      <td className={tk.td}><VerifyChip display={verifyDisplay({ verifiable, brief: r.verification })} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {shown.length > 0 && <Pager total={shown.length} page={slice.page} pageSize={pageSize} onPage={setPage} onPageSize={n => { setPageSize(n); setPage(0); }} label="Attestation pages" />}
        {next !== null && (
          <div className={c.more}>
            <Button small disabled={busy} onClick={loadOlder}>Load older attestations</Button>
          </div>
        )}
        {moreError && <div className={c.pad}><Callout tone="bad">{moreError}</Callout></div>}
      </Section>
    </>
  );
}
