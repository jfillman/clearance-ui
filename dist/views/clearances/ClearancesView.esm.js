import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useState, useMemo } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { shortPrincipal, dateTime, relativeTime } from '../../kit/format.esm.js';
import { usePoll } from '../../kit/usePoll.esm.js';
import { useMountedNow } from '../../kit/now.esm.js';
import { useTableKit, useInputClass, Section, FactGrid, Fact, Button, Callout, Chip, StatusChip, StatRow, Card, Stat, FilterBar, FilterChips, TabError, PanelSkeleton, EmptyNote, Tooltip } from '../../kit/kit.esm.js';
import '../../kit/components.esm.js';
import '../../kit/FlightLog.esm.js';
import '../../kit/transport.esm.js';
import { useClearanceRead } from '../../kit/read.esm.js';
import { useClearanceWrite, ControlError } from '../../kit/write.esm.js';
import '../../kit/coverage.esm.js';
import '../../kit/Pager.esm.js';
import { useTierPolicy, tierDefs, tierWhy, TierBadge, tierCountsOf, TierMix, TierFilter, TierKey } from '../../kit/tiers.esm.js';
import { ChangeProof } from './ChangeProof.esm.js';

const STATES = [
  { id: "holding", label: "Holding" },
  { id: "cleared", label: "Cleared" },
  { id: "denied", label: "Denied" },
  { id: "expired", label: "Expired" },
  { id: "all", label: "All" }
];
function stateTone(s) {
  if (s === "holding") return "warn";
  if (s === "cleared") return "ok";
  if (s === "denied") return "bad";
  return "neutral";
}
function stillNeeds(c) {
  const r = c.requirement;
  if (!r) return "";
  const have = (role) => c.approvals.filter((a) => a.role === role).length;
  const parts = [];
  if (r.owner - have("owner") > 0) parts.push(`${r.owner - have("owner")} from ${shortPrincipal(r.ownerGroup)}`);
  if (r.outside - have("outside") > 0) parts.push(`${r.outside - have("outside")} from ${r.outsideGroups.map(shortPrincipal).join(" or ")}`);
  return parts.join(" and ");
}
const useStyles = makeStyles(() => ({
  row: { display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-start" },
  scroll: { overflowX: "auto" },
  pad: { padding: "12px 18px", display: "flex", flexDirection: "column", gap: 12 },
  actions: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
  reason: { flex: "1 1 220px", width: "auto" },
  selectable: { userSelect: "text" },
  stack: { display: "flex", flexDirection: "column", gap: 16 }
}));
function needsText(change) {
  if (change.state === "holding") return stillNeeds(change) || "nothing more";
  if (change.cleared_by === "policy") return "cleared by policy";
  return "\u2014";
}
function ClearanceDetail({ change, onChanged }) {
  const c = useStyles();
  const { policy } = useTierPolicy(change.app, change.env);
  const tk = useTableKit();
  const inp = useInputClass();
  const write = useClearanceWrite();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState();
  const act = async (fn) => {
    setBusy(true);
    setError(void 0);
    try {
      await fn();
      setReason("");
      onChanged?.();
    } catch (e) {
      setError(e instanceof ControlError ? `${e.refusal.rule ? `${e.refusal.rule}: ` : ""}${e.message}` : String(e));
    } finally {
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs(
    Section,
    {
      framed: true,
      "aria-label": "Change detail",
      title: `${change.app} \xB7 ${change.env}`,
      meta: /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs(TierBadge, { tier: change.tier, change, policy, children: [
          "tier ",
          change.tier
        ] }),
        /* @__PURE__ */ jsx(StatusChip, { tone: stateTone(change.state), dot: change.state === "holding", children: change.state }),
        /* @__PURE__ */ jsx(Chip, { children: change.target })
      ] }),
      count: /* @__PURE__ */ jsx("span", { className: c.selectable, "data-testid": "change-id", children: change.id }),
      children: [
        /* @__PURE__ */ jsxs("div", { className: c.pad, children: [
          /* @__PURE__ */ jsxs(FactGrid, { min: 300, children: [
            /* @__PURE__ */ jsxs(Fact, { label: "Why this tier", children: [
              tierDefs(policy)[change.tier]?.name ?? "",
              ": ",
              tierWhy(change) || "nothing above tier 0"
            ] }),
            /* @__PURE__ */ jsxs(Fact, { label: "Proposed by", children: [
              shortPrincipal(change.proposer),
              " (",
              change.proposer_kind,
              change.agent ? `: ${change.agent}` : "",
              ")"
            ] }),
            /* @__PURE__ */ jsx(Fact, { label: "Needs", children: needsText(change) }),
            /* @__PURE__ */ jsx(Fact, { label: "Approvals", children: change.approvals.length ? change.approvals.map((a) => `${shortPrincipal(a.person)} (${a.role}${a.via ? ", via Tower" : ""}, ${dateTime(a.at)})`).join("; ") : "none" }),
            change.deny_reason && /* @__PURE__ */ jsxs(Fact, { label: "Denied", children: [
              shortPrincipal(change.denied_by),
              ": ",
              change.deny_reason
            ] }),
            /* @__PURE__ */ jsx(Fact, { label: "Checks", children: Object.entries(change.checks).map(([k, v]) => `${k} ${v}`).join(" \xB7 ") }),
            /* @__PURE__ */ jsxs(Fact, { label: "Binds to", children: [
              "head ",
              change.head.slice(0, 12),
              " \xB7 tree ",
              change.tree_digest.slice(0, 12),
              " \xB7 ",
              change.objects.length,
              " object(s) \xB7 policy ",
              change.policy_version,
              change.repo_policy_digest ? " + clearance.yaml" : ""
            ] }),
            /* @__PURE__ */ jsx(Fact, { label: "Expires", children: dateTime(change.expires_at) })
          ] }),
          change.state === "holding" && /* @__PURE__ */ jsxs("div", { className: c.actions, children: [
            /* @__PURE__ */ jsx(Button, { variant: "primary", disabled: busy, onClick: () => act(() => write.clearChange(change.id)), children: "Clear as you" }),
            /* @__PURE__ */ jsx("input", { className: `${inp.input} ${c.reason}`, "aria-label": "Reason to deny", placeholder: "Reason to deny (recorded)", value: reason, onChange: (e) => setReason(e.target.value) }),
            /* @__PURE__ */ jsx(Button, { variant: "danger", disabled: busy || !reason.trim(), onClick: () => act(() => write.denyChange(change.id, reason)), children: "Deny\u2026" })
          ] }),
          error && /* @__PURE__ */ jsx(Callout, { tone: "bad", children: error })
        ] }),
        /* @__PURE__ */ jsx("div", { className: c.scroll, children: /* @__PURE__ */ jsxs("table", { className: tk.table, "aria-label": "Objects this change touches", children: [
          /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("th", { className: tk.th, children: "Object" }),
            /* @__PURE__ */ jsx("th", { className: tk.th, children: "Change" }),
            /* @__PURE__ */ jsx("th", { className: tk.th, children: "Fields" })
          ] }) }),
          /* @__PURE__ */ jsx("tbody", { children: change.objects.slice(0, 100).map((o) => {
            const why = change.reasons.find((r) => r.subject === `${o.kind} ${o.namespace ? `${o.namespace}/` : ""}${o.name}`);
            return /* @__PURE__ */ jsxs("tr", { children: [
              /* @__PURE__ */ jsxs("td", { className: tk.td, children: [
                /* @__PURE__ */ jsx(Chip, { children: o.kind }),
                " ",
                /* @__PURE__ */ jsxs("span", { className: tk.meta, children: [
                  o.namespace ? `${o.namespace}/` : "",
                  o.name
                ] }),
                why && /* @__PURE__ */ jsxs(Fragment, { children: [
                  " ",
                  /* @__PURE__ */ jsxs(TierBadge, { tier: why.tier, policy, children: [
                    "T",
                    why.tier,
                    " ",
                    why.rule
                  ] })
                ] })
              ] }),
              /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx("span", { className: tk.meta, children: o.op }) }),
              /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsxs("span", { className: tk.meta, children: [
                o.fields.slice(0, 6).join(", "),
                o.fields.length > 6 ? ` +${o.fields.length - 6}` : "",
                o.images.length ? ` \u2192 ${o.images.join(", ")}` : ""
              ] }) })
            ] }, `${o.kind}/${o.namespace}/${o.name}`);
          }) })
        ] }) })
      ]
    }
  );
}
function ClearancesView({ app, initial, now: nowProp }) {
  const c = useStyles();
  const tk = useTableKit();
  const api = useClearanceRead();
  const now = useMountedNow(nowProp);
  const [state, setState] = useState(initial ? "all" : "holding");
  const [selected, setSelected] = useState(initial);
  const [tiers, setTiers] = useState([]);
  const { policy, source } = useTierPolicy(app);
  const since = useMemo(() => new Date(Math.floor((now - 24 * 36e5) / 6e4) * 6e4).toISOString(), [now]);
  const list = usePoll(`clearances-${app ?? ""}-${state}-${tiers.join("")}`, async () => {
    const q = { app, state: state === "all" ? void 0 : state, limit: 100 };
    if (tiers.length < 2) return api.get("/v1/clearances", { ...q, tier: tiers[0] });
    const pages = await Promise.all(tiers.map((tier) => api.get("/v1/clearances", { ...q, tier })));
    const merged = pages.flatMap((p) => p.items).sort((a, b) => a.updated_at < b.updated_at ? 1 : -1).slice(0, 100);
    return { ...pages[0], items: merged };
  }, 3e4);
  const tierCounts = usePoll(`clearance-tier-counts-${app ?? ""}-${since}`, () => api.get("/v1/clearances/counts", { app, by: "tier", since }), 6e4);
  const mix = tierCountsOf(tierCounts.data?.items);
  const counts = usePoll(`clearance-counts-${app ?? ""}`, () => api.get("/v1/clearances/counts", { app, by: "state" }), 6e4);
  const byPolicy = usePoll(`clearance-cleared-by-${app ?? ""}`, () => api.get("/v1/clearances/counts", { app, by: "cleared_by", state: "cleared" }), 6e4);
  const one = usePoll(`clearance-${selected ?? ""}`, () => selected ? api.get(`/v1/clearances/${encodeURIComponent(selected)}`) : Promise.resolve(void 0), 3e4);
  const count = (k) => counts.data?.items.find((i) => i.key === k)?.count ?? 0;
  const items = list.data?.items ?? [];
  const refresh = () => {
    tierCounts.refresh();
    list.refresh();
    counts.refresh();
    one.refresh();
    byPolicy.refresh();
  };
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs(StatRow, { children: [
      /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsx(Stat, { label: "Holding for people", value: count("holding"), tone: count("holding") ? "warn" : void 0 }) }),
      /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsx(Stat, { label: "Cleared by policy", value: byPolicy.data?.items.find((i) => i.key === "policy")?.count ?? 0 }) }),
      /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsx(Stat, { label: "Cleared by people", value: byPolicy.data?.items.find((i) => i.key === "people")?.count ?? 0 }) }),
      /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsx(Stat, { label: "Denied \xB7 expired", value: `${count("denied")} \xB7 ${count("expired")}` }) }),
      /* @__PURE__ */ jsxs(Card, { children: [
        /* @__PURE__ */ jsx(Stat, { label: "Changes in 24 h, by tier", value: Object.values(mix).reduce((n, v) => n + v, 0) }),
        /* @__PURE__ */ jsx(TierMix, { counts: mix })
      ] })
    ] }),
    /* @__PURE__ */ jsxs("div", { className: c.row, children: [
      /* @__PURE__ */ jsxs(Section, { framed: true, "aria-label": "Changes", title: "Changes", count: `${items.length} shown`, style: { flex: "1.2 1 520px" }, children: [
        /* @__PURE__ */ jsx("div", { className: c.pad, children: /* @__PURE__ */ jsxs(FilterBar, { children: [
          /* @__PURE__ */ jsx(FilterChips, { label: "State", options: STATES, value: state, onChange: setState }),
          /* @__PURE__ */ jsx(TierFilter, { value: tiers, onChange: setTiers, policy, source, counts: mix })
        ] }) }),
        /* @__PURE__ */ jsx(TierKey, { policy, counts: mix }),
        list.error && !list.data && /* @__PURE__ */ jsx("div", { className: c.pad, children: /* @__PURE__ */ jsx(TabError, { error: list.error, what: "changes", onRetry: list.refresh }) }),
        list.loading && !list.data && /* @__PURE__ */ jsx(PanelSkeleton, { rows: 4, label: "Loading\u2026" }),
        list.data && items.length === 0 && /* @__PURE__ */ jsxs(EmptyNote, { inset: true, children: [
          "No ",
          state === "all" ? "" : `${state} `,
          tiers.length ? `tier ${tiers.join(", ")} ` : "",
          "changes",
          app ? ` for ${app}` : "",
          ". The clearance-gate check registers a change on every release PR to a protected environment."
        ] }),
        items.length > 0 && /* @__PURE__ */ jsx("div", { className: c.scroll, children: /* @__PURE__ */ jsxs("table", { className: tk.table, children: [
          /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
            /* @__PURE__ */ jsx("th", { className: tk.th, children: "Change" }),
            /* @__PURE__ */ jsx("th", { className: tk.th, children: "Tier" }),
            /* @__PURE__ */ jsx("th", { className: tk.th, children: "State" }),
            /* @__PURE__ */ jsx("th", { className: tk.th, children: "Needs" }),
            /* @__PURE__ */ jsx("th", { className: tk.th, children: "Updated" })
          ] }) }),
          /* @__PURE__ */ jsx("tbody", { children: items.map((ch) => /* @__PURE__ */ jsxs("tr", { className: `${tk.rowLink} ${ch.id === selected ? tk.rowSelected : ""}`, "aria-selected": ch.id === selected, tabIndex: 0, onClick: () => setSelected(ch.id), onKeyDown: (e) => (e.key === "Enter" || e.key === " ") && setSelected(ch.id), children: [
            /* @__PURE__ */ jsxs("td", { className: tk.td, children: [
              /* @__PURE__ */ jsx("b", { children: ch.app }),
              " \xB7 ",
              ch.env,
              /* @__PURE__ */ jsxs("div", { className: tk.meta, children: [
                ch.id,
                " \xB7 ",
                ch.target,
                " \xB7 ",
                shortPrincipal(ch.proposer)
              ] })
            ] }),
            /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsxs(TierBadge, { tier: ch.tier, change: ch, policy, children: [
              "T",
              ch.tier
            ] }) }),
            /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx(StatusChip, { tone: stateTone(ch.state), dot: ch.state === "holding", children: ch.state }) }),
            /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx("span", { className: tk.meta, children: ch.state === "holding" ? stillNeeds(ch) : ch.cleared_by ?? "" }) }),
            /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx(Tooltip, { title: dateTime(ch.updated_at), children: /* @__PURE__ */ jsx("span", { className: tk.meta, children: relativeTime(ch.updated_at, now) }) }) })
          ] }, ch.id)) })
        ] }) })
      ] }),
      /* @__PURE__ */ jsx("div", { style: { flex: "1 1 440px", minWidth: 0 }, children: one.data ? /* @__PURE__ */ jsxs("div", { className: c.stack, children: [
        /* @__PURE__ */ jsx(ClearanceDetail, { change: one.data, onChanged: refresh }),
        /* @__PURE__ */ jsx(ChangeProof, { change: one.data })
      ] }) : /* @__PURE__ */ jsx(Section, { framed: true, title: "Change", children: /* @__PURE__ */ jsx(EmptyNote, { inset: true, children: one.error ?? "Select a change to see why it has its tier, what it binds to, and to clear or deny it." }) }) })
    ] })
  ] });
}

export { ClearanceDetail, ClearancesView, stateTone, stillNeeds };
//# sourceMappingURL=ClearancesView.esm.js.map
