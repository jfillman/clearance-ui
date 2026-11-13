import { jsx, jsxs } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import { relativeTime, dateTime } from './format.esm.js';
import { Callout, StatusChip, Tooltip, Count } from './kit.esm.js';
import { useMountedNow } from './now.esm.js';
import { useClearanceRead } from './read.esm.js';
import { tokensForTheme, fontScale, fontMono } from './tokens.esm.js';
import { usePoll } from './usePoll.esm.js';

const healthTone = (s) => {
  if (s === "healthy") return "ok";
  return s === "degraded" ? "warn" : "bad";
};
function summarizeCoverage(st) {
  const sources = st.health?.sources ?? [];
  const rank = (s) => ({ blind: 2, degraded: 1 })[s] ?? 0;
  const current = (s) => ["healthy", "degraded", "blind"].includes(s.now) ? s.now : s.state;
  const now = sources.reduce((w, s) => rank(current(s)) > rank(w) ? current(s) : w, sources.length ? "healthy" : "blind");
  const state = sources.some((s) => s.stale) && rank(now) < 2 ? "blind" : now;
  const bad = sources.filter((s) => current(s) !== "healthy" || s.stale);
  const failing = bad.map((s) => {
    const checks = (s.failed_checks ?? []).join(", ");
    return `${s.source}: ${checks || (s.stale ? "no health record inside its interval (stale)" : current(s))}`;
  });
  if (sources.length === 0) failing.push("no feed has reported health for this scope");
  let since;
  if (state !== "healthy") {
    const names = new Set(bad.map((s) => s.source));
    const open = (st.could_not_see?.segments ?? []).filter((g) => names.has(g.source) && g.state !== "healthy").sort((a, b) => Date.parse(b.to) - Date.parse(a.to))[0];
    since = open?.from ?? bad.map((s) => s.last_ts).filter((t) => !!t).sort()[0];
  }
  const headline = { healthy: "Every feed is healthy", degraded: "A feed is degraded: what it reports may be incomplete", blind: "Blind: no feed can currently see this scope" }[state];
  return { state, headline, failing, since };
}
const useStyles = makeStyles((theme) => {
  const t = tokensForTheme(theme);
  return {
    strip: { display: "grid", gap: 8 },
    top: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
    list: { margin: "4px 0 0", paddingLeft: 18, fontFamily: fontMono, fontSize: fontScale.sm, color: t.textHi }
  };
});
const statusOf = (e) => e && typeof e === "object" && typeof e.status === "number" ? e.status : void 0;
function readDeniedText(e) {
  if (statusOf(e) === 403) return "Needs the Clearance release with person reads: until it is deployed, only auditors may read coverage, exceptions and observations.";
  if (statusOf(e) === 503) return "Clearance is not reachable from here (503): clearance.apiUrl is unset or Clearance did not answer.";
  return e instanceof Error ? e.message : String(e);
}
function CoverageBanner({ scope, statement, error, now }) {
  const c = useStyles();
  const at = useMountedNow(now);
  if (!statement) {
    return /* @__PURE__ */ jsx(Callout, { tone: "neutral", role: "region", "aria-label": `Coverage of ${scope}`, "data-state": error ? "unavailable" : "loading", title: /* @__PURE__ */ jsxs("span", { className: c.top, children: [
      scope,
      " ",
      error ? /* @__PURE__ */ jsx(StatusChip, { tone: "neutral", children: "coverage unavailable" }) : /* @__PURE__ */ jsx(StatusChip, { tone: "neutral", children: "reading\u2026" })
    ] }), children: error ? readDeniedText(error) : void 0 });
  }
  const s = summarizeCoverage(statement);
  const tone = healthTone(s.state);
  let trailer = "";
  if (s.state !== "healthy") trailer = " This scope is never reported clean while a feed is not healthy.";
  else if (!statement.clean) trailer = " Not clean: see the exceptions.";
  return /* @__PURE__ */ jsxs(
    Callout,
    {
      tone,
      role: "region",
      "aria-label": `Coverage of ${scope}`,
      "data-state": s.state,
      title: /* @__PURE__ */ jsxs("span", { className: c.top, children: [
        scope,
        /* @__PURE__ */ jsx(StatusChip, { tone: healthTone(s.state), dot: true, children: s.state }),
        s.since && /* @__PURE__ */ jsx(Tooltip, { title: dateTime(s.since), children: /* @__PURE__ */ jsxs(Count, { children: [
          "since ",
          relativeTime(s.since, at),
          " ago"
        ] }) }),
        /* @__PURE__ */ jsxs(Count, { children: [
          statement.seen_not_cleared.count,
          " seen, not cleared \xB7 ",
          statement.cleared_and_verified.count,
          " cleared and verified"
        ] })
      ] }),
      children: [
        s.headline,
        ".",
        trailer,
        s.failing.length > 0 && /* @__PURE__ */ jsx("ul", { className: c.list, "aria-label": "Failing checks", children: s.failing.map((f) => /* @__PURE__ */ jsx("li", { children: f }, f)) })
      ]
    }
  );
}
function useScopes() {
  const api = useClearanceRead();
  return usePoll("scopes", () => api.get("/scopes"), 0);
}
function useCoverage(api, scope, from) {
  return usePoll(`coverage:${scope ?? ""}:${from ?? ""}`, async () => scope ? api.get("/v1/coverage", { scope, from }) : void 0, 6e4);
}
function ScopeBanner({ scope }) {
  const api = useClearanceRead();
  const cov = useCoverage(api, scope);
  return /* @__PURE__ */ jsx(CoverageBanner, { scope, statement: cov.data, error: cov.data ? void 0 : cov.failure });
}
function CoverageStrip({ only }) {
  const c = useStyles();
  const scopes = useScopes();
  const list = only ?? scopes.data?.scopes ?? [];
  if (scopes.failure && !only) return /* @__PURE__ */ jsx("div", { className: c.strip, children: /* @__PURE__ */ jsx(Callout, { tone: "neutral", role: "region", "aria-label": "Coverage", children: readDeniedText(scopes.failure) }) });
  if (list.length === 0) {
    if (scopes.loading || !scopes.data) return null;
    return /* @__PURE__ */ jsx("div", { className: c.strip, children: /* @__PURE__ */ jsx(Callout, { tone: "neutral", role: "region", "aria-label": "Coverage", children: "No observed scope is known, so there is no coverage to show. Clearance does not list its scopes yet (set clearance.observeScopes in the meantime)." }) });
  }
  return /* @__PURE__ */ jsx("div", { className: c.strip, children: list.map((s) => /* @__PURE__ */ jsx(ScopeBanner, { scope: s }, s)) });
}

export { CoverageBanner, CoverageStrip, healthTone, readDeniedText, statusOf, summarizeCoverage, useCoverage, useScopes };
//# sourceMappingURL=coverage.esm.js.map
