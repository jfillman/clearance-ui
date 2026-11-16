import { useEffect, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { dateTime, relativeTime } from './format';
import { Callout, Count, StatusChip, Tooltip, type CalloutTone, type StatusTone } from './kit';
import { useMountedNow } from './now';
import { useClearanceRead, type ClearanceRead } from './read';
import { fontMono, fontScale, tokensForTheme } from './tokens';
import type { CoverageHealth, CoverageStatement, ScopeList } from './types';
import { useCoveragePoll, type CoverageRead } from './coveragePoll';
import { usePoll } from './usePoll';

// The coverage banner (O-5, board C2/T1): one scope's coverage statement as healthy, degraded or blind, with the
// checks that are failing and since when. Healthy is Clearance's own word for the worst state of any feed in the
// window (observe.Statement.state): a blind scope is never "clean", and this never says otherwise. Read from
// GET /v1/coverage through the clearance backend; the scope list is GET /api/clearance/scopes (scopes.ts there).

export const healthTone = (s: CoverageHealth | string): StatusTone => {
  if (s === 'healthy') return 'ok';
  return s === 'degraded' ? 'warn' : 'bad';
};

export interface BannerSummary {
  state: CoverageHealth;
  headline: string;
  /** The failing feeds: `source: check, check` (the checks that did not pass), or why it is stale. */
  failing: string[];
  /** When the current state began, or undefined when healthy or when no record says. */
  since?: string;
}

/** What a coverage statement says about a scope's health now, for the banner. */
export function summarizeCoverage(st: CoverageStatement): BannerSummary {
  const sources = st.health?.sources ?? [];
  // The worst of the feeds NOW (the window's worst can be hours old): blind beats degraded beats healthy. A source's
  // `state` is the worst it was at ANY moment of the window; `now` is its state at the window's end (observe.SourceHealth).
  const rank = (s: string) => ({ blind: 2, degraded: 1 })[s as 'blind' | 'degraded'] ?? 0;
  const current = (s: (typeof sources)[number]): CoverageHealth =>
    (['healthy', 'degraded', 'blind'].includes(s.now) ? s.now : s.state) as CoverageHealth;
  const now = sources.reduce<CoverageHealth>((w, s) => (rank(current(s)) > rank(w) ? current(s) : w), sources.length ? 'healthy' : 'blind');
  const state: CoverageHealth = sources.some(s => s.stale) && rank(now) < 2 ? 'blind' : now;
  const bad = sources.filter(s => current(s) !== 'healthy' || s.stale);
  const failing = bad.map(s => {
    const checks = (s.failed_checks ?? []).join(', ');
    return `${s.source}: ${checks || (s.stale ? 'no health record inside its interval (stale)' : current(s))}`;
  });
  if (sources.length === 0) failing.push('no feed has reported health for this scope');
  let since: string | undefined;
  if (state !== 'healthy') {
    const names = new Set(bad.map(s => s.source));
    const open = (st.could_not_see?.segments ?? []).filter(g => names.has(g.source) && g.state !== 'healthy').sort((a, b) => Date.parse(b.to) - Date.parse(a.to))[0];
    since = open?.from ?? bad.map(s => s.last_ts).filter((t): t is string => !!t).sort()[0];
  }
  const headline = { healthy: 'Every feed is healthy', degraded: 'A feed is degraded: what it reports may be incomplete', blind: 'Blind: no feed can currently see this scope' }[state];
  return { state, headline, failing, since };
}

const useStyles = makeStyles<Theme>(theme => {
  const t = tokensForTheme(theme);
  return {
  strip: { display: 'grid', gap: 8 },
  top: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  list: { margin: '4px 0 0', paddingLeft: 18, fontFamily: fontMono, fontSize: fontScale.sm, color: t.textHi },
  };
});

/** Why a coverage read failed, in words. 403 is the Clearance release that opens these reads to people (owner decision O-5). */
export const statusOf = (e: unknown): number | undefined => (e && typeof e === 'object' && typeof (e as { status?: unknown }).status === 'number' ? (e as { status: number }).status : undefined);

export function readDeniedText(e: unknown): string {
  if (statusOf(e) === 403) return 'Needs the Clearance release with person reads: until it is deployed, only auditors may read coverage, exceptions and observations.';
  if (statusOf(e) === 503) return 'Clearance is not reachable from here (503): clearance.apiUrl is unset or Clearance did not answer.';
  return e instanceof Error ? e.message : String(e);
}

/** "5 s" or "2 min": a wait in words. */
const waitText = (ms: number): string => (ms < 60_000 ? `${Math.max(1, Math.ceil(ms / 1000))} s` : `${Math.ceil(ms / 60_000)} min`);

/** The time now, re-read every second while `on`: a countdown needs it, nothing else here does. */
function useTicking(on: boolean): number {
  const [t, setT] = useState(() => Date.now());
  useEffect(() => {
    if (!on) return undefined;
    setT(Date.now());
    const id = setInterval(() => setT(Date.now()), 1000);
    return () => clearInterval(id);
  }, [on]);
  return t;
}

function BusyBanner({ scope, retry }: { scope: string; retry: string }) {
  const c = useStyles();
  return (
    <Callout tone="neutral" role="region" aria-label={`Coverage of ${scope}`} data-state="computing" title={<span className={c.top}>{scope} <StatusChip tone="neutral">computing…</StatusChip></span>}>
      Coverage is being computed.{retry}
    </Callout>
  );
}

export interface CoverageBannerProps {
  scope: string;
  statement?: CoverageStatement;
  error?: unknown;
  now?: number;
  /** The server is busy or timed out and there is no answer yet: say it is being computed, not that it is unavailable. */
  busy?: boolean;
  /** When the next try is due (ms since the epoch). */
  retryAt?: number;
  /** When `statement` was read, when the last try failed and this is what was known before it. */
  staleSince?: number;
}

export function CoverageBanner({ scope, statement, error, now, busy, retryAt, staleSince }: CoverageBannerProps) {
  const c = useStyles();
  const at = useMountedNow(now);
  const nowMs = useTicking(retryAt !== undefined || staleSince !== undefined);
  const retry = retryAt === undefined ? '' : ` Retrying in ${waitText(retryAt - nowMs)}.`;
  if (!statement) {
    if (busy) return <BusyBanner scope={scope} retry={retry} />;
    return (
      <Callout tone="neutral" role="region" aria-label={`Coverage of ${scope}`} data-state={error ? 'unavailable' : 'loading'} title={<span className={c.top}>{scope} {error ? <StatusChip tone="neutral">coverage unavailable</StatusChip> : <StatusChip tone="neutral">reading…</StatusChip>}</span>}>
        {error ? readDeniedText(error) : undefined}
      </Callout>
    );
  }
  const s = summarizeCoverage(statement);
  const tone: CalloutTone = healthTone(s.state) as CalloutTone;
  let trailer = '';
  if (s.state !== 'healthy') trailer = ' This scope is never reported clean while a feed is not healthy.';
  else if (!statement.clean) trailer = ' Not clean: see the exceptions.';
  return (
    <Callout
      tone={tone}
      role="region"
      aria-label={`Coverage of ${scope}`}
      data-state={s.state}
      title={
        <span className={c.top}>
          {scope}
          <StatusChip tone={healthTone(s.state)} dot>{s.state}</StatusChip>
          {s.since && <Tooltip title={dateTime(s.since)}><Count>since {relativeTime(s.since, at)} ago</Count></Tooltip>}
          <Count>{statement.seen_not_cleared.count} seen, not cleared · {statement.cleared_and_verified.count} cleared and verified</Count>
          {staleSince !== undefined && <Count>read {relativeTime(new Date(staleSince).toISOString(), nowMs)} ago; Clearance did not answer the latest try.{retry}</Count>}
        </span>
      }
    >
      {s.headline}.{trailer}
      {s.failing.length > 0 && (
        <ul className={c.list} aria-label="Failing checks">
          {s.failing.map(f => <li key={f}>{f}</li>)}
        </ul>
      )}
    </Callout>
  );
}

/** Reads the scope list (the backend's GET /scopes) once. */
export function useScopes() {
  const api = useClearanceRead();
  return usePoll<ScopeList>('scopes', () => api.get<ScopeList>('/scopes'), 0);
}

/**
 * The coverage statement of one scope (the last day unless `from` says otherwise), read by the shared poller: one
 * request per (scope, from) however many components show it, one scope at a time, every 5 minutes, with back-off.
 */
export function useCoverage(api: ClearanceRead, scope: string | undefined, from?: string): CoverageRead {
  return useCoveragePoll(api, scope, from);
}

function ScopeBanner({ scope }: { scope: string }) {
  const api = useClearanceRead();
  const cov = useCoverage(api, scope);
  return <CoverageBanner scope={scope} statement={cov.data} error={cov.error} busy={cov.busy} retryAt={cov.retryAt} staleSince={cov.stale ? cov.updatedAt : undefined} />;
}

/** A banner for each scope Clearance names (or `only`, to show one app's). Nothing when there is no scope to show. */
export function CoverageStrip({ only }: { only?: string[] }) {
  const c = useStyles();
  const scopes = useScopes();
  const list = only ?? scopes.data?.scopes ?? [];
  if (scopes.failure && !only) return <div className={c.strip}><Callout tone="neutral" role="region" aria-label="Coverage">{readDeniedText(scopes.failure)}</Callout></div>;
  if (list.length === 0) {
    if (scopes.loading || !scopes.data) return null;
    return (
      <div className={c.strip}>
        <Callout tone="neutral" role="region" aria-label="Coverage">
          No observed scope is known, so there is no coverage to show. Clearance does not list its scopes yet (set clearance.observeScopes in the meantime).
        </Callout>
      </div>
    );
  }
  return (
    <div className={c.strip}>
      {list.map(s => <ScopeBanner key={s} scope={s} />)}
    </div>
  );
}
