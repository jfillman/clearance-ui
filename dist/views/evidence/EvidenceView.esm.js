import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { useState, useMemo, useCallback, useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { clock, relativeTime, shortPrincipal } from '../../kit/format.esm.js';
import { usePoll } from '../../kit/usePoll.esm.js';
import { useMountedNow } from '../../kit/now.esm.js';
import { useTableKit, FilterBar, FilterChips, FilterSelect, FilterInput, SearchField, Count, Hint, Tooltip, Section, TabError, PanelSkeleton, EmptyNote, Chip, StatusChip, Button, Callout, TextLink, YamlBlock } from '../../kit/kit.esm.js';
import { TierChip, DecisionChip, VerifiedClaimed } from '../../kit/components.esm.js';
import '../../kit/FlightLog.esm.js';
import '../../kit/transport.esm.js';
import { useClearanceRead } from '../../kit/read.esm.js';
import '../../kit/coverage.esm.js';
import { PAGE_SIZES } from '../../kit/Pager.esm.js';
import '../../kit/kitStyles.esm.js';
import { useOneOpen, ExpandRow } from '../../kit/ExpandRow.esm.js';

const SINCE_MS = { "24h": 864e5, "7d": 7 * 864e5, "30d": 30 * 864e5, all: 0 };
const COVERAGE_STATES = [
  "authorized-and-verified",
  "observed-not-attributed",
  "out-of-band-detected",
  "coverage-unavailable",
  "break-glass",
  "attempted-refused"
];
const EMPTY = { decision: "", coverage: "", agent: "", tool: "", rule: "", app: "", since: "7d", search: "" };
function searchParams(search) {
  const s = search.trim();
  if (!s) return {};
  if (s.startsWith("t-")) return { task: s };
  if (s.startsWith("s-")) return { session: s };
  return { principal: s.includes(":") || s.includes("/") ? s : `user:${s}` };
}
function queryOf(f, now) {
  return {
    decision: f.decision || void 0,
    coverage: f.coverage || void 0,
    agent: f.agent || void 0,
    tool: f.tool.trim() || void 0,
    rule: f.rule.trim() || void 0,
    app: f.app.trim() || void 0,
    since: f.since === "all" ? void 0 : new Date(now - SINCE_MS[f.since]).toISOString(),
    ...searchParams(f.search)
  };
}
const useStyles = makeStyles(() => ({
  row: { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" },
  pad: { padding: "12px 18px", display: "flex", flexDirection: "column", gap: 10 },
  more: { padding: 14 }
}));
function RecordDetail({ record: picked }) {
  const c = useStyles();
  const [raw, setRaw] = useState(false);
  return /* @__PURE__ */ jsx(Section, { framed: true, "aria-label": "Record detail", title: `Record ${picked.seq}`, meta: /* @__PURE__ */ jsx(DecisionChip, { decision: picked.decision, rule: picked.rule }), count: `${picked.boundary} \xB7 ${picked.schema}`, children: /* @__PURE__ */ jsxs("div", { className: c.pad, children: [
    picked.decision === "deny" && picked.result && /* @__PURE__ */ jsx(Callout, { tone: "bad", children: picked.result }),
    /* @__PURE__ */ jsx(VerifiedClaimed, { record: picked }),
    /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx(TextLink, { expanded: raw, onClick: () => setRaw((v) => !v), children: "raw record" }) }),
    raw && /* @__PURE__ */ jsx(YamlBlock, { text: JSON.stringify(picked, null, 2), "aria-label": "Raw record" })
  ] }) });
}
function EvidenceView({ now: nowProp, initialApp }) {
  const c = useStyles();
  const tk = useTableKit();
  const api = useClearanceRead();
  const now = useMountedNow(nowProp);
  const [f, setF] = useState(initialApp ? { ...EMPTY, app: initialApp } : EMPTY);
  const [pageSize, setPageSize] = useState(PAGE_SIZES[2]);
  const [items, setItems] = useState([]);
  const [next, setNext] = useState(null);
  const [error, setError] = useState();
  const [loading, setLoading] = useState(true);
  const { open: seq, toggle, close } = useOneOpen();
  const query = useMemo(() => queryOf(f, now), [f, now]);
  const key = JSON.stringify({ ...query, limit: pageSize });
  const load = useCallback(
    async (after) => {
      setLoading(true);
      try {
        const page = await api.get("/v1/evidence", { ...query, limit: pageSize, after });
        setItems((prev) => after === void 0 ? page.items : [...prev, ...page.items]);
        setNext(typeof page.next === "number" ? page.next : null);
        setError(void 0);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    },
    [api, query, pageSize]
  );
  useEffect(() => {
    close();
    load();
  }, [key]);
  const agents = usePoll("agents", () => api.get("/v1/agents"), 3e5);
  const totals = usePoll(`totals-${key}`, () => api.get("/v1/evidence/counts", { ...query, by: "decision" }), 0);
  const total = totals.data?.total;
  const { coverage: _coverage, ...queryNoCoverage } = query;
  const covTotals = usePoll(`cov-totals-${JSON.stringify(queryNoCoverage)}`, () => api.get("/v1/evidence/counts", { ...queryNoCoverage, by: "coverage" }), 0);
  const covCount = (state) => covTotals.data?.items.find((i) => i.key === state)?.count;
  const denyCount = totals.data?.items.find((i) => i.key === "deny")?.count ?? 0;
  const head = items[0];
  const set = (patch) => setF((prev) => ({ ...prev, ...patch }));
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs(
      FilterBar,
      {
        end: /* @__PURE__ */ jsxs(Count, { children: [
          total === void 0 ? "\u2026" : total,
          " records match",
          total !== void 0 && ` \xB7 ${denyCount} denied`
        ] }),
        children: [
          /* @__PURE__ */ jsx(FilterChips, { label: "Decision", options: [{ id: "", label: "all decisions" }, { id: "allow", label: "allow" }, { id: "deny", label: "deny" }], value: f.decision, onChange: (d) => set({ decision: d }) }),
          /* @__PURE__ */ jsx(FilterChips, { label: "Coverage", options: ["", ...COVERAGE_STATES].map((st) => ({ id: st, label: st || "all coverage", count: st ? covCount(st) : void 0 })), value: f.coverage, onChange: (st) => set({ coverage: st }) }),
          /* @__PURE__ */ jsx(FilterSelect, { label: "Agent", value: f.agent, options: [{ value: "", label: "any agent" }, ...(agents.data?.items ?? []).map((a) => ({ value: a.name, label: a.name }))], onChange: (v) => set({ agent: v }) }),
          /* @__PURE__ */ jsx(FilterInput, { label: "Tool", placeholder: "tool, e.g. repo.pr.open", value: f.tool, onChange: (v) => set({ tool: v }), width: 190 }),
          /* @__PURE__ */ jsx(FilterInput, { label: "Rule", placeholder: "rule, e.g. R015", value: f.rule, onChange: (v) => set({ rule: v }), width: 110 }),
          /* @__PURE__ */ jsx(FilterInput, { label: "App", placeholder: "app", value: f.app, onChange: (v) => set({ app: v }), width: 110 }),
          /* @__PURE__ */ jsx(FilterSelect, { label: "Since", value: f.since, options: [{ value: "24h", label: "last 24 h" }, { value: "7d", label: "last 7 days" }, { value: "30d", label: "last 30 days" }, { value: "all", label: "all time" }], onChange: (v) => set({ since: v }) }),
          /* @__PURE__ */ jsx(FilterSelect, { label: "Rows", value: String(pageSize), options: PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} rows` })), onChange: (v) => setPageSize(Number(v)) }),
          /* @__PURE__ */ jsx(SearchField, { label: "Search", placeholder: "task id, session or principal", value: f.search, onChange: (v) => set({ search: v }) })
        ]
      }
    ),
    /* @__PURE__ */ jsxs(Hint, { style: { display: "flex", gap: 14, flexWrap: "wrap" }, children: [
      head && /* @__PURE__ */ jsxs("span", { children: [
        "head seq ",
        head.seq,
        " \xB7 ",
        head.hash.slice(0, 12),
        "\u2026 \xB7 ",
        head.assurance ?? "assurance unknown"
      ] }),
      /* @__PURE__ */ jsx(Tooltip, { title: "Clearance verifies the whole chain from genesis for an auditor's own sign-in; Backstage shows the head it would check.", children: /* @__PURE__ */ jsx("span", { children: "chain check: an auditor's step" }) })
    ] }),
    /* @__PURE__ */ jsx("div", { className: c.row, children: /* @__PURE__ */ jsxs(Section, { framed: true, "aria-label": "Records", title: "Records", count: `${items.length} loaded${next !== null ? ", more below" : ""}`, style: { flex: "1 1 100%", minWidth: 0 }, children: [
      error && /* @__PURE__ */ jsx("div", { className: c.pad, children: /* @__PURE__ */ jsx(TabError, { error, what: "records", onRetry: () => load() }) }),
      !error && items.length === 0 && (loading ? /* @__PURE__ */ jsx(PanelSkeleton, { rows: 4, label: "Loading\u2026" }) : /* @__PURE__ */ jsx(EmptyNote, { inset: true, children: "No records match." })),
      items.length > 0 && /* @__PURE__ */ jsxs("table", { className: tk.table, children: [
        /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", { className: tk.th, children: "Seq" }),
          /* @__PURE__ */ jsx("th", { className: tk.th, children: "Time" }),
          /* @__PURE__ */ jsx("th", { className: tk.th, children: "Principal" }),
          /* @__PURE__ */ jsx("th", { className: tk.th, children: "Tool" }),
          /* @__PURE__ */ jsx("th", { className: tk.th, children: "Decision" }),
          /* @__PURE__ */ jsx("th", { className: tk.th, children: "Assurance" })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { children: items.map((r) => /* @__PURE__ */ jsxs(ExpandRow, { id: `evidence-${r.seq}`, open: seq === r.seq, onToggle: () => toggle(r.seq), colSpan: 6, label: `Record ${r.seq} detail`, details: /* @__PURE__ */ jsx(RecordDetail, { record: r }), children: [
          /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx("span", { className: tk.meta, children: r.seq }) }),
          /* @__PURE__ */ jsxs("td", { className: tk.td, children: [
            /* @__PURE__ */ jsx(Tooltip, { title: r.ts, children: /* @__PURE__ */ jsx("span", { className: tk.meta, children: clock(r.ts) }) }),
            /* @__PURE__ */ jsx("div", { className: tk.meta, children: relativeTime(r.ts, now) })
          ] }),
          /* @__PURE__ */ jsxs("td", { className: tk.td, children: [
            /* @__PURE__ */ jsx("span", { className: tk.meta, children: shortPrincipal(r.principal) }),
            r.agent && /* @__PURE__ */ jsx("div", { className: tk.meta, children: r.agent })
          ] }),
          /* @__PURE__ */ jsxs("td", { className: tk.td, children: [
            /* @__PURE__ */ jsx(TierChip, { tier: r.tier }),
            " ",
            /* @__PURE__ */ jsx(Chip, { children: r.tool }),
            (r.app || r.target) && /* @__PURE__ */ jsx("div", { className: tk.meta, children: r.app ?? r.target })
          ] }),
          /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx(DecisionChip, { decision: r.decision, rule: r.rule }) }),
          /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx(StatusChip, { tone: r.assurance === "checkpointed" ? "ok" : "neutral", children: r.assurance ?? "unknown" }) })
        ] }, r.seq)) })
      ] }),
      next !== null && !error && /* @__PURE__ */ jsx("div", { className: c.more, children: /* @__PURE__ */ jsx(Button, { onClick: () => load(next), disabled: loading, children: loading ? "Loading\u2026" : "Load more" }) })
    ] }) })
  ] });
}

export { COVERAGE_STATES, EvidenceView, PAGE_SIZES, queryOf, searchParams };
//# sourceMappingURL=EvidenceView.esm.js.map
