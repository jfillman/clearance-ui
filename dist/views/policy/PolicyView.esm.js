import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { useState, useMemo } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { useClearanceTokens } from '../../kit/tokens.esm.js';
import { usePoll } from '../../kit/usePoll.esm.js';
import { useMountedNow } from '../../kit/now.esm.js';
import { useTableKit, FilterBar, FilterChips, TabError, Section, PanelSkeleton, Chip, Hint, Count, useInputClass, Field, Button, StatusChip, ColumnLabel } from '../../kit/kit.esm.js';
import { TierChip, DecisionChip } from '../../kit/components.esm.js';
import '../../kit/FlightLog.esm.js';
import '../../kit/transport.esm.js';
import { useClearanceRead } from '../../kit/read.esm.js';
import '../../kit/coverage.esm.js';
import '../../kit/Pager.esm.js';
import '../../kit/kitStyles.esm.js';
import { ExpandRow } from '../../kit/ExpandRow.esm.js';

const WEEK_MS = 7 * 864e5;
const useStyles = makeStyles(() => ({
  row: { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" },
  scroll: { overflowX: "auto" },
  pad: { padding: "12px 18px", display: "flex", flexDirection: "column", gap: 10 },
  path: { display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" },
  verdict: { display: "flex", flexDirection: "column", gap: 6 },
  ruleDetail: { display: "flex", flexDirection: "column", gap: 6, padding: "10px 18px" },
  run: { alignSelf: "flex-start" }
}));
function PolicyView({ now: nowProp }) {
  const t = useClearanceTokens();
  const c = useStyles();
  const tk = useTableKit();
  const api = useClearanceRead();
  const now = useMountedNow(nowProp);
  const [sub, setSub] = useState("rules");
  const [open, setOpen] = useState();
  const policy = usePoll("policy", () => api.get("/v1/policy"), 3e5);
  const since = useMemo(() => new Date(now - WEEK_MS).toISOString(), [now]);
  const hits = usePoll(`hits-${since}`, () => api.get("/v1/evidence/counts", { by: "rule", decision: "deny", since }), 6e4);
  const hitsByRule = useMemo(() => new Map((hits.data?.items ?? []).map((i) => [i.key, i.count])), [hits.data]);
  const rules = policy.data?.rules ?? [];
  const tools = policy.data?.tools ?? [];
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(FilterBar, { children: /* @__PURE__ */ jsx(
      FilterChips,
      {
        label: "Policy sections",
        hideLabel: true,
        options: [{ id: "rules", label: "Runtime rules", count: rules.length || void 0 }, { id: "tools", label: "Tool registry", count: tools.length || void 0 }],
        value: sub,
        onChange: setSub
      }
    ) }),
    policy.error && !policy.data && /* @__PURE__ */ jsx("div", { style: { marginBottom: 12 }, children: /* @__PURE__ */ jsx(TabError, { error: policy.error, what: "the policy", onRetry: policy.refresh }) }),
    /* @__PURE__ */ jsxs("div", { className: c.row, children: [
      sub === "rules" ? /* @__PURE__ */ jsxs(Section, { framed: true, "aria-label": "Deny rules", title: "Deny rules, in evaluation order", meta: /* @__PURE__ */ jsx(Count, { children: "CEL \xB7 first match denies \xB7 an expression that fails to evaluate denies (R000)" }), count: `hits, 7 days${hits.data ? "" : " \u2026"}`, style: { flex: "1.5 1 600px" }, children: [
        policy.loading && !policy.data && /* @__PURE__ */ jsx(PanelSkeleton, { rows: 4, label: "Loading\u2026" }),
        rules.length > 0 && /* @__PURE__ */ jsx("div", { className: c.scroll, children: /* @__PURE__ */ jsxs("table", { className: tk.table, children: [
          /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("th", { className: tk.th, children: "Rule" }),
            /* @__PURE__ */ jsx("th", { className: tk.th, children: "Name" }),
            /* @__PURE__ */ jsx("th", { className: tk.th, children: "Denies when" }),
            /* @__PURE__ */ jsx("th", { className: tk.th, children: "Source" }),
            /* @__PURE__ */ jsx("th", { className: tk.th, children: "Hits" })
          ] }) }),
          /* @__PURE__ */ jsx("tbody", { children: rules.map((r) => {
            const n = hitsByRule.get(r.id) ?? 0;
            const isOpen = open === r.id;
            return /* @__PURE__ */ jsxs(ExpandRow, { id: `rule-${r.id}`, open: isOpen, onToggle: () => setOpen(isOpen ? void 0 : r.id), colSpan: 5, label: `Rule ${r.id} detail`, details: /* @__PURE__ */ jsxs("div", { className: c.ruleDetail, children: [
              /* @__PURE__ */ jsxs(Hint, { children: [
                /* @__PURE__ */ jsx("b", { children: "Message" }),
                " ",
                r.message
              ] }),
              /* @__PURE__ */ jsxs(Hint, { children: [
                /* @__PURE__ */ jsx("b", { children: "Hint to the agent" }),
                " ",
                r.hint
              ] })
            ] }), children: [
              /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx(Chip, { children: r.id }) }),
              /* @__PURE__ */ jsx("td", { className: tk.td, children: r.name }),
              /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx("span", { className: tk.meta, children: r.expression }) }),
              /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx(Chip, { tone: r.pack === "core" ? "neutral" : "sky", children: r.pack }) }),
              /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx("span", { className: tk.meta, style: { color: n ? t.amberText : t.textFaint }, children: n }) })
            ] }, r.id);
          }) })
        ] }) })
      ] }) : /* @__PURE__ */ jsx(Section, { framed: true, "aria-label": "Tool registry", title: "Tool registry", meta: /* @__PURE__ */ jsx(Count, { children: "what an agent may be granted; the tier is the authority a call needs" }), count: `${tools.length} tools`, style: { flex: "1.5 1 600px" }, children: tools.length > 0 && /* @__PURE__ */ jsx("div", { className: c.scroll, children: /* @__PURE__ */ jsxs("table", { className: tk.table, children: [
        /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("th", { className: tk.th, children: "Tool" }),
          /* @__PURE__ */ jsx("th", { className: tk.th, children: "Tier" }),
          /* @__PURE__ */ jsx("th", { className: tk.th, children: "What it does" }),
          /* @__PURE__ */ jsx("th", { className: tk.th, children: "Needs" }),
          /* @__PURE__ */ jsx("th", { className: tk.th, children: "Acts on" })
        ] }) }),
        /* @__PURE__ */ jsx("tbody", { children: tools.map((tool) => /* @__PURE__ */ jsxs("tr", { children: [
          /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx(Chip, { children: tool.name }) }),
          /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx(TierChip, { tier: tool.tier }) }),
          /* @__PURE__ */ jsxs("td", { className: tk.td, children: [
            tool.summary,
            tool.propose_only && /* @__PURE__ */ jsx("div", { className: tk.meta, children: "propose only: a person merges" })
          ] }),
          /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx("span", { className: tk.meta, children: tool.required_args.join(", ") || "\u2014" }) }),
          /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsxs("span", { className: tk.meta, children: [
            tool.target === "none" ? "\u2014" : tool.target,
            tool.github_cost ? ` \xB7 ${tool.github_cost} GitHub calls` : ""
          ] }) })
        ] }, tool.name)) })
      ] }) }) }),
      /* @__PURE__ */ jsx(Explainer, { rules, tools })
    ] })
  ] });
}
function Explainer({ rules, tools }) {
  const c = useStyles();
  const inp = useInputClass();
  const api = useClearanceRead();
  const agents = usePoll("agents", () => api.get("/v1/agents"), 3e5);
  const [agent, setAgent] = useState("");
  const [tool, setTool] = useState("");
  const [args, setArgs] = useState("{}");
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState();
  const [error, setError] = useState();
  const names = useMemo(() => new Map(rules.map((r) => [r.id, r.name])), [rules]);
  let argsError;
  try {
    const parsed = JSON.parse(args || "{}");
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) argsError = "args must be a JSON object";
  } catch {
    argsError = "args is not valid JSON";
  }
  const run = async () => {
    setBusy(true);
    setError(void 0);
    try {
      setOut(await api.get("/v1/policy/explain", { agent, tool, args }));
    } catch (e) {
      setOut(void 0);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsx(Section, { framed: true, "aria-label": "Would this be allowed?", title: "Would this be allowed?", meta: /* @__PURE__ */ jsx(Count, { children: "dry-runs the real policy on a fresh session \xB7 records nothing" }), style: { flex: "1 1 360px" }, children: /* @__PURE__ */ jsxs("div", { className: c.pad, children: [
    /* @__PURE__ */ jsx(Field, { label: "Agent", children: ({ className }) => /* @__PURE__ */ jsxs("select", { className, value: agent, onChange: (e) => setAgent(e.target.value), children: [
      /* @__PURE__ */ jsx("option", { value: "", children: "choose an agent" }),
      (agents.data?.items ?? []).map((a) => /* @__PURE__ */ jsx("option", { value: a.name, children: a.name }, a.name))
    ] }) }),
    /* @__PURE__ */ jsx(Field, { label: "Tool", children: ({ className }) => /* @__PURE__ */ jsxs("select", { className, value: tool, onChange: (e) => setTool(e.target.value), children: [
      /* @__PURE__ */ jsx("option", { value: "", children: "choose a tool" }),
      tools.map((x) => /* @__PURE__ */ jsxs("option", { value: x.name, children: [
        x.tier,
        " ",
        x.name
      ] }, x.name))
    ] }) }),
    /* @__PURE__ */ jsx(Field, { label: "Args (JSON)", children: ({ className }) => /* @__PURE__ */ jsx("textarea", { className: `${className} ${inp.textarea}`, value: args, onChange: (e) => setArgs(e.target.value), spellCheck: false }) }),
    argsError && /* @__PURE__ */ jsx("span", { className: inp.problem, children: argsError }),
    /* @__PURE__ */ jsx(Button, { variant: "primary", className: c.run, onClick: run, disabled: busy || !agent || !tool || !!argsError, children: busy ? "Running\u2026" : "Run dry run" }),
    error && /* @__PURE__ */ jsx("span", { className: inp.problem, children: error }),
    out && /* @__PURE__ */ jsxs("div", { className: c.verdict, "aria-live": "polite", children: [
      /* @__PURE__ */ jsxs("div", { className: c.path, children: [
        /* @__PURE__ */ jsx(DecisionChip, { decision: out.decision.allow ? "allow" : "deny", rule: out.decision.rule }),
        out.decision.name && /* @__PURE__ */ jsx(Count, { children: out.decision.name }),
        !out.known_tool && /* @__PURE__ */ jsx(StatusChip, { tone: "warn", children: "unknown tool" })
      ] }),
      !out.decision.allow && /* @__PURE__ */ jsx("span", { children: out.decision.message }),
      out.decision.hint && /* @__PURE__ */ jsxs(Hint, { children: [
        "Hint: ",
        out.decision.hint
      ] }),
      /* @__PURE__ */ jsx(ColumnLabel, { children: "Path through the rules" }),
      /* @__PURE__ */ jsxs("div", { className: c.path, children: [
        out.path.map((r) => {
          let tone = "neutral";
          let verdict = "passed";
          if (r.error) [tone, verdict] = ["warn", "failed to evaluate"];
          else if (r.matched) [tone, verdict] = ["bad", "matched"];
          return /* @__PURE__ */ jsx(StatusChip, { tone, title: `${r.name}: ${verdict}`, children: r.id }, r.id);
        }),
        /* @__PURE__ */ jsx(Count, { children: out.decision.allow ? `${out.path.length} rules, none matched` : `${out.path.length} rules to the first match (${names.get(out.decision.rule ?? "") ?? out.decision.rule})` })
      ] })
    ] })
  ] }) });
}

export { PolicyView };
//# sourceMappingURL=PolicyView.esm.js.map
