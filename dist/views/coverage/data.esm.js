import { useState, useEffect } from 'react';
import '@material-ui/core/styles';
import { usePoll } from '../../kit/usePoll.esm.js';
import '../../kit/kit.esm.js';
import '../../kit/components.esm.js';
import '../../kit/FlightLog.esm.js';
import '../../kit/transport.esm.js';
import { useClearanceRead } from '../../kit/read.esm.js';
import 'react/jsx-runtime';
import { useScopes } from '../../kit/coverage.esm.js';
import { coveragePollerFor } from '../../kit/coveragePoll.esm.js';
import '../../kit/Pager.esm.js';
import '@material-ui/core/Popper';
import '../../kit/kitStyles.esm.js';
import '../../kit/ExpandRow.esm.js';
import { observationRows, gateRows } from '../exceptions/ExceptionsView.esm.js';
import { windowStart } from './healthModel.esm.js';

const DAY_MS = 864e5;
const COVERAGE_WINDOW_MS = 7 * DAY_MS;
const fromOf = (now, ms = COVERAGE_WINDOW_MS) => new Date(now - ms).toISOString();
function useCoverageMany(api, scopes, from) {
  const [, setVersion] = useState(0);
  const key = scopes.join("\n");
  useEffect(() => {
    const poller2 = coveragePollerFor(api);
    const offs = (key ? key.split("\n") : []).map((s) => poller2.subscribe(s, from, () => setVersion((v) => v + 1)));
    return () => offs.forEach((off) => off());
  }, [api, key, from]);
  const poller = coveragePollerFor(api);
  return scopes.map((scope) => ({ scope, ...poller.snapshot(scope, from) }));
}
const OPEN_UNKNOWN_TITLE = "The open-exception count could not be read, so it is unknown. It is not zero.";
function useOpenExceptionCount(now) {
  const api = useClearanceRead();
  const scopes = useScopes();
  const from = fromOf(now);
  const list = scopes.data?.scopes ?? [];
  const covs = useCoverageMany(api, list, from);
  const gate = usePoll(`gate:${from}`, () => api.get("/v1/exceptions", { since: from, limit: 100 }), 6e4);
  const gateItems = gate.data?.items ?? [];
  const wantRes = gateItems.length > 0 && list.length > 0;
  const res = usePoll(
    `count-res:${list.join(",")}:${wantRes}`,
    async () => {
      if (!wantRes) return { items: [], next: null };
      const pages = await Promise.all(list.map((sc) => api.get("/v1/observations", { scope: sc, kind: "resolution", limit: 200 })));
      return { items: pages.flatMap((p) => p.items), next: null };
    },
    6e4
  );
  if (scopes.failure) return { loading: false, failed: true };
  if (scopes.data === void 0) return { loading: true };
  if (covs.some((c) => c.data === void 0 && c.failure !== void 0) || gate.data === void 0 && gate.failure !== void 0 || res.data === void 0 && res.failure !== void 0) return { loading: false, failed: true };
  if (covs.some((c) => c.data === void 0) || gate.data === void 0 || res.data === void 0) return { loading: true };
  const obs = covs.flatMap((c) => observationRows(c.scope, c.data, [], [])).filter((r) => r.resolvable && !r.resolution).length;
  const gates = gateRows(gateItems, res.data.items).filter((r) => r.resolvable && !r.resolution).length;
  return { count: obs + gates, loading: false };
}
const PAGES_PER_SCOPE = 10;
const PAGE_LIMIT = 200;
function useHealthRecords(api, scopes, now, days) {
  const since = windowStart(now, days);
  return usePoll(
    `health:${scopes.join(",")}:${since}`,
    async () => {
      const byScope = {};
      const meta = {};
      for (const scope of scopes) {
        const items = [];
        let after;
        try {
          for (let i = 0; i < PAGES_PER_SCOPE; i += 1) {
            const page = await api.get("/v1/observations/health", { scope, since, limit: PAGE_LIMIT, ...after !== void 0 && after !== null ? { after } : {} });
            items.push(...page.items);
            after = page.next;
            if (after === null || after === void 0 || page.items.length === 0) break;
          }
          if (after !== null && after !== void 0 && items.length) meta[scope] = { coveredFrom: items.reduce((a, r) => r.ts < a ? r.ts : a, items[0].ts) };
        } catch (e) {
          meta[scope] = { error: e instanceof Error ? e.message : String(e) };
        }
        byScope[scope] = items;
      }
      return { byScope, meta };
    },
    5 * 6e4
  );
}

export { COVERAGE_WINDOW_MS, DAY_MS, OPEN_UNKNOWN_TITLE, fromOf, useCoverageMany, useHealthRecords, useOpenExceptionCount };
//# sourceMappingURL=data.esm.js.map
