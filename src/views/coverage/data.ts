import { useEffect, useState } from 'react';
import { coveragePollerFor, useClearanceRead, usePoll, useScopes, type ClearanceRead, type CoverageSnapshot, type ObservationRecord, type Page, type Polled } from '../../kit';
import { gateRows, observationRows } from '../exceptions/ExceptionsView';
import { windowStart, type MatrixRow } from './healthModel';

// Coverage's reads. Every one is a GET through the host's transport; the coverage statements ride the shared poller (one
// request per scope and window however many components show it), so the nav's count and the tabs agree and ask once.

export const DAY_MS = 86_400_000;
/** The window the Coverage page, its tabs and the nav count all read: the same `from`, so the shared poller asks once. */
export const COVERAGE_WINDOW_MS = 7 * DAY_MS;
export const fromOf = (now: number, ms: number = COVERAGE_WINDOW_MS): string => new Date(now - ms).toISOString();

/** The coverage statements of several scopes, each from the shared poller. */
export function useCoverageMany(api: ClearanceRead, scopes: string[], from: string): Array<{ scope: string } & CoverageSnapshot> {
  const [, setVersion] = useState(0);
  const key = scopes.join('\n');
  useEffect(() => {
    const poller = coveragePollerFor(api);
    const offs = (key ? key.split('\n') : []).map(s => poller.subscribe(s, from, () => setVersion(v => v + 1)));
    return () => offs.forEach(off => off());
  }, [api, key, from]);
  const poller = coveragePollerFor(api);
  return scopes.map(scope => ({ scope, ...poller.snapshot(scope, from) }));
}

/**
 * The open-exceptions count for the nav: what Clearance saw and did not clear with no resolution yet (the coverage statements),
 * plus the gate's own exceptions of a kind a person can resolve with none. An operation on the monitoring itself is never
 * resolvable, so it is not counted as something to do (the list still shows it). undefined until it is known.
 */
export function useOpenExceptionCount(now: number): { count?: number; loading: boolean } {
  const api = useClearanceRead();
  const scopes = useScopes();
  const from = fromOf(now);
  const list = scopes.data?.scopes ?? [];
  const covs = useCoverageMany(api, list, from);
  const gate = usePoll<Page<ObservationRecord>>(`gate:${from}`, () => api.get('/v1/exceptions', { since: from, limit: 100 }), 60_000);
  const gateItems = gate.data?.items ?? [];
  const wantRes = gateItems.length > 0 && list.length > 0;
  const res = usePoll<Page<ObservationRecord>>(
    `count-res:${list.join(',')}:${wantRes}`,
    async () => {
      if (!wantRes) return { items: [], next: null };
      const pages = await Promise.all(list.map(sc => api.get<Page<ObservationRecord>>('/v1/observations', { scope: sc, kind: 'resolution', limit: 200 })));
      return { items: pages.flatMap(p => p.items), next: null };
    },
    60_000,
  );
  const loading = scopes.loading || (!scopes.failure && covs.some(c => c.loading && c.data === undefined && c.failure === undefined)) || gate.loading || res.loading;
  const known = scopes.data !== undefined && !scopes.failure;
  if (!known || loading) return { loading: !scopes.failure };
  const obs = covs.flatMap(c => observationRows(c.scope, c.data, [], [])).filter(r => r.resolvable && !r.resolution).length;
  const gates = gateRows(gateItems, res.data?.items ?? []).filter(r => r.resolvable && !r.resolution).length;
  return { count: obs + gates, loading: false };
}

const PAGES_PER_SCOPE = 10;
const PAGE_LIMIT = 200;

export interface HealthData {
  byScope: Record<string, ObservationRecord[]>;
  meta: Record<string, Pick<MatrixRow, 'coveredFrom' | 'error'>>;
}

/** GET /v1/observations/health per scope (newest first), following `next` up to a budget; a scope that fails is named, not dropped. */
export function useHealthRecords(api: ClearanceRead, scopes: string[], now: number, days: number): Polled<HealthData> {
  const since = windowStart(now, days);
  return usePoll<HealthData>(
    `health:${scopes.join(',')}:${since}`,
    async () => {
      const byScope: HealthData['byScope'] = {};
      const meta: HealthData['meta'] = {};
      for (const scope of scopes) {
        const items: ObservationRecord[] = [];
        let after: string | number | null | undefined;
        try {
          for (let i = 0; i < PAGES_PER_SCOPE; i += 1) {
            const page: Page<ObservationRecord> = await api.get('/v1/observations/health', { scope, since, limit: PAGE_LIMIT, ...(after !== undefined && after !== null ? { after } : {}) });
            items.push(...page.items);
            after = page.next;
            if (after === null || after === undefined || page.items.length === 0) break;
          }
          // Still more to read: the oldest record read is how far back this scope is known.
          if (after !== null && after !== undefined && items.length) meta[scope] = { coveredFrom: items.reduce((a, r) => (r.ts < a ? r.ts : a), items[0].ts) };
        } catch (e) {
          meta[scope] = { error: e instanceof Error ? e.message : String(e) };
        }
        byScope[scope] = items;
      }
      return { byScope, meta };
    },
    5 * 60_000,
  );
}
