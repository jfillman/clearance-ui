import { jsxs, jsx } from 'react/jsx-runtime';
import { useMemo, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { relativeTime, whenTitle, shortPrincipal } from '../../kit/format.esm.js';
import { usePoll } from '../../kit/usePoll.esm.js';
import { useMountedNow } from '../../kit/now.esm.js';
import { FilterBar, FilterChips, Count, TabError, Hint, Subtabs, useTableKit, Section, EmptyNote, Tooltip, StatusChip, TextLink } from '../../kit/kit.esm.js';
import '../../kit/components.esm.js';
import '../../kit/FlightLog.esm.js';
import '../../kit/transport.esm.js';
import { useClearanceRead } from '../../kit/read.esm.js';
import { useScopes, readDeniedText } from '../../kit/coverage.esm.js';
import '../../kit/Pager.esm.js';
import '@material-ui/core/Popper';
import '../../kit/kitStyles.esm.js';
import '../../kit/ExpandRow.esm.js';
import { Time } from '../../kit/Time.esm.js';
import { ExceptionsView, observationRows } from '../exceptions/ExceptionsView.esm.js';
import { useHealthRecords, OPEN_UNKNOWN_TITLE, fromOf, useCoverageMany } from './data.esm.js';
import { HealthMatrix } from './HealthMatrix.esm.js';
import { buildHealthMatrix } from './healthModel.esm.js';
import { ResolvePanel } from './ResolvePanel.esm.js';
import { choiceForState } from './resolveMapping.esm.js';

const COVERAGE_TABS = [
  { id: "open", label: "Open exceptions" },
  { id: "not-attributed", label: "Not attributed" },
  { id: "limits", label: "Named limits" }
];
const isCoverageTab = (v) => COVERAGE_TABS.some((t) => t.id === v);
const HEALTH_WINDOWS = [
  { id: "7", label: "7 days" },
  { id: "14", label: "14 days" },
  { id: "30", label: "30 days" }
];
const RESOLUTION_TONE = { reverted: "ok", ratified: "ok", "still-live": "warn", "declared-break-glass": "warn" };
const useStyles = makeStyles(() => ({
  page: { display: "flex", flexDirection: "column", gap: 16 },
  scroll: { overflowX: "auto" }
}));
function NotAttributed({ scopes, now, onOpen }) {
  const c = useStyles();
  const tk = useTableKit();
  const api = useClearanceRead();
  const from = fromOf(now);
  const covs = useCoverageMany(api, scopes, from);
  const obs = usePoll(
    `na-obs:${scopes.join(",")}:${from}`,
    async () => {
      const out = {};
      for (const scope of scopes) out[scope] = (await api.get("/v1/observations", { scope, kind: "observation", since: from, limit: 200 })).items;
      return out;
    },
    6e4
  );
  const rows = useMemo(
    () => covs.flatMap((cv) => observationRows(cv.scope, cv.data, obs.data?.[cv.scope] ?? [], [])).filter((r) => r.klass === "observed-not-attributed").sort((a, b) => Date.parse(b.ts) - Date.parse(a.ts) || b.seq - a.seq),
    [covs, obs.data]
  );
  const failed = covs.find((cv) => cv.failure !== void 0 && cv.data === void 0)?.failure;
  return /* @__PURE__ */ jsxs(Section, { framed: true, "aria-label": "Not attributed", title: "Seen, not attributed", count: `${rows.length} in the last 7 days`, children: [
    failed !== void 0 && /* @__PURE__ */ jsx(TabError, { error: new Error(readDeniedText(failed)), what: "the coverage statement" }),
    obs.failure !== void 0 && /* @__PURE__ */ jsx(TabError, { error: new Error(readDeniedText(obs.failure)), what: "the observations", onRetry: obs.refresh }),
    rows.length === 0 ? /* @__PURE__ */ jsx(EmptyNote, { inset: true, children: scopes.length === 0 ? "No scope is linked, so nothing is observed." : "Nothing was seen without an author in this window." }) : /* @__PURE__ */ jsx("div", { className: c.scroll, children: /* @__PURE__ */ jsxs("table", { className: tk.table, children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsx("tr", { children: ["When", "Scope", "Resource", "Actor", "What changed", "Resolution", ""].map((h) => /* @__PURE__ */ jsx("th", { className: tk.th, children: h }, h)) }) }),
      /* @__PURE__ */ jsx("tbody", { children: rows.map((r) => /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx(Tooltip, { title: whenTitle(r.ts), children: /* @__PURE__ */ jsx("span", { children: relativeTime(r.ts, now) }) }) }),
        /* @__PURE__ */ jsx("td", { className: `${tk.td} ${tk.meta}`, children: r.scope }),
        /* @__PURE__ */ jsx("td", { className: `${tk.td} ${tk.meta}`, children: r.resource || r.source }),
        /* @__PURE__ */ jsx("td", { className: `${tk.td} ${tk.meta}`, children: shortPrincipal(r.actor) || "not attributed" }),
        /* @__PURE__ */ jsx("td", { className: `${tk.td} ${tk.meta}`, children: r.diff || "\u2014" }),
        /* @__PURE__ */ jsx("td", { className: tk.td, children: r.resolution ? /* @__PURE__ */ jsx(StatusChip, { tone: RESOLUTION_TONE[r.resolution] ?? "warn", children: choiceForState(r.resolution)?.label ?? r.resolution }) : /* @__PURE__ */ jsx(StatusChip, { tone: "neutral", children: "none recorded" }) }),
        /* @__PURE__ */ jsx("td", { className: tk.td, children: !r.resolution && r.resolvable && /* @__PURE__ */ jsx(TextLink, { onClick: () => onOpen(r.scope), "aria-label": `Open ${r.resource || r.source}, seq ${r.seq}, in open exceptions`, children: "Open \u2192" }) })
      ] }, `${r.scope}-${r.seq}`)) })
    ] }) })
  ] });
}
function NamedLimits({ scopes, now }) {
  const c = useStyles();
  const tk = useTableKit();
  const api = useClearanceRead();
  const covs = useCoverageMany(api, scopes, fromOf(now));
  const limits = useMemo(() => {
    const out = [];
    for (const cv of covs) {
      const st = cv.data;
      if (!st) continue;
      st.could_not_see.segments.forEach(
        (s, i) => out.push({ key: `${cv.scope}-seg-${i}`, scope: cv.scope, kind: `could not see (${s.state})`, source: s.source, window: `${s.from} \u2192 ${s.to}`, why: s.reason, tone: s.state === "blind" ? "bad" : "warn" })
      );
      st.could_not_see.audit_gaps.forEach((g) => out.push({ key: `${cv.scope}-gap-${g.seq}`, scope: cv.scope, kind: "audit gap", source: g.source, window: g.ts, why: g.reason, tone: "bad" }));
      for (const h of st.health.sources) {
        if (h.state === "healthy" && !h.stale && h.failed_checks.length === 0) continue;
        out.push({ key: `${cv.scope}-src-${h.source}`, scope: cv.scope, kind: h.stale && h.state === "healthy" ? "feed stale" : `feed ${h.state}`, source: h.source, window: h.last_ts ?? "never seen", why: h.failed_checks.length ? `failing: ${h.failed_checks.join(", ")}` : "no health record inside its interval", tone: h.state === "blind" || h.stale ? "bad" : "warn" });
      }
      if (st.source_integrity.unverified > 0) out.push({ key: `${cv.scope}-int`, scope: cv.scope, kind: "unverified source", source: "", window: "", why: `${st.source_integrity.unverified} of ${st.source_integrity.observations} observations are not yet verified as delivered unaltered`, tone: "warn" });
      if (st.truncated || st.seen_not_cleared.truncated) out.push({ key: `${cv.scope}-trunc`, scope: cv.scope, kind: "list truncated", source: "", window: "", why: "The statement lists the first 200 items; narrow the window to see the rest.", tone: "neutral" });
    }
    return out;
  }, [covs]);
  const unread = covs.filter((cv) => cv.data === void 0);
  const failedScopes = unread.filter((cv) => cv.failure !== void 0);
  const failed = failedScopes[0]?.failure;
  return /* @__PURE__ */ jsxs(Section, { framed: true, "aria-label": "Named limits", title: "Named limits", count: `${limits.length} named`, children: [
    failed !== void 0 && /* @__PURE__ */ jsx(TabError, { error: new Error(readDeniedText(failed)), what: `the coverage statement of ${failedScopes.map((f) => f.scope).join(", ")}` }),
    limits.length === 0 ? /* @__PURE__ */ jsxs(EmptyNote, { inset: true, children: [
      scopes.length === 0 && "No scope is linked, so there is nothing to name.",
      scopes.length > 0 && failedScopes.length > 0 && `Not read: the coverage of ${failedScopes.map((f) => f.scope).join(", ")} could not be read, so its limits are unknown.`,
      scopes.length > 0 && failedScopes.length === 0 && unread.length > 0 && "Loading the coverage statements\u2026",
      scopes.length > 0 && unread.length === 0 && "No limit is named for any scope in this window: every feed reported and none dropped."
    ] }) : /* @__PURE__ */ jsx("div", { className: c.scroll, children: /* @__PURE__ */ jsxs("table", { className: tk.table, children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsx("tr", { children: ["Scope", "Limit", "Source", "When", "Why"].map((h) => /* @__PURE__ */ jsx("th", { className: tk.th, children: h }, h)) }) }),
      /* @__PURE__ */ jsx("tbody", { children: limits.map((l) => /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("td", { className: `${tk.td} ${tk.meta}`, children: l.scope }),
        /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx(StatusChip, { tone: l.tone, children: l.kind }) }),
        /* @__PURE__ */ jsx("td", { className: `${tk.td} ${tk.meta}`, children: l.source || "\u2014" }),
        /* @__PURE__ */ jsx("td", { className: `${tk.td} ${tk.meta}`, children: /^\d{4}-/.test(l.window.slice(0, 5)) && !l.window.includes("\u2192") ? /* @__PURE__ */ jsx(Time, { iso: l.window }) : l.window || "\u2014" }),
        /* @__PURE__ */ jsx("td", { className: `${tk.td} ${tk.meta}`, children: l.why })
      ] }, l.key)) })
    ] }) }),
    limits.length > 0 && unread.length > 0 && /* @__PURE__ */ jsxs(Hint, { inset: true, children: [
      "Not read: ",
      unread.map((u) => u.scope).join(", "),
      ". Its limits are unknown, not absent."
    ] }),
    /* @__PURE__ */ jsx(Hint, { inset: true, children: "A scope with a named limit is never reported clean: what Clearance could not see is listed, not assumed to be fine." })
  ] });
}
function CoverageView({ now: nowProp, tab = "open", onTab, scope, openCount, onScope }) {
  const c = useStyles();
  const api = useClearanceRead();
  const now = useMountedNow(nowProp);
  const scopes = useScopes();
  const list = useMemo(() => scopes.data?.scopes ?? [], [scopes.data]);
  const [days, setDays] = useState("14");
  const health = useHealthRecords(api, list, now, Number(days));
  const matrix = useMemo(() => buildHealthMatrix(list, health.data?.byScope ?? {}, now, Number(days), health.data?.meta), [list, health.data, now, days]);
  const [current, setCurrent] = useState(tab);
  const active = onTab ? tab : current;
  const go = (t, sc) => onTab ? onTab(t, sc) : setCurrent(t);
  const [pickScope, setPickScope] = useState(scope);
  const effScope = onTab || onScope ? scope : pickScope;
  return /* @__PURE__ */ jsxs("div", { className: c.page, children: [
    /* @__PURE__ */ jsx(FilterBar, { end: /* @__PURE__ */ jsx(Count, { children: list.length === 0 ? "No scope linked" : `${list.length} ${list.length === 1 ? "scope" : "scopes"}` }), children: /* @__PURE__ */ jsx(FilterChips, { label: "Matrix window", options: HEALTH_WINDOWS, value: days, onChange: setDays }) }),
    scopes.failure !== void 0 && /* @__PURE__ */ jsx(TabError, { error: new Error(readDeniedText(scopes.failure)), what: "the scopes", onRetry: scopes.refresh }),
    health.failure !== void 0 && !health.data && /* @__PURE__ */ jsx(TabError, { error: new Error(readDeniedText(health.failure)), what: "feed health", onRetry: health.refresh }),
    health.data && list.some((s) => health.data.meta[s]?.error) && /* @__PURE__ */ jsxs(Hint, { children: [
      "Health could not be read for ",
      list.filter((s) => health.data.meta[s]?.error).join(", "),
      ": those rows are shown as not read, not as healthy."
    ] }),
    scopes.failure === void 0 && /* @__PURE__ */ jsx(HealthMatrix, { matrix }),
    /* @__PURE__ */ jsx(Subtabs, { label: "Coverage details", tabs: COVERAGE_TABS.map((t) => ({ id: t.id, label: t.label, count: t.id === "open" ? openCount : void 0, countTitle: t.id === "open" && openCount === "?" ? OPEN_UNKNOWN_TITLE : void 0 })), value: active, onChange: (id) => go(id) }),
    active === "open" && /* @__PURE__ */ jsx(
      ExceptionsView,
      {
        now,
        initialScope: effScope,
        onScope: (sc) => onScope ? onScope(sc) : setPickScope(sc),
        initialOpen: true,
        initialWindow: "7d",
        renderResolve: (row, onDone) => /* @__PURE__ */ jsx(ResolvePanel, { row, onDone }, row.seq)
      }
    ),
    active === "not-attributed" && /* @__PURE__ */ jsx(NotAttributed, { scopes: list, now, onOpen: (sc) => {
      if (!onTab) {
        if (onScope) onScope(sc);
        else setPickScope(sc);
      }
      go("open", sc);
    } }),
    active === "limits" && /* @__PURE__ */ jsx(NamedLimits, { scopes: list, now })
  ] });
}

export { COVERAGE_TABS, CoverageView, isCoverageTab };
//# sourceMappingURL=CoverageView.esm.js.map
