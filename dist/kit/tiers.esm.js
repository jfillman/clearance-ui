import { jsxs, jsx } from 'react/jsx-runtime';
import { useMemo, useState, useRef, useEffect } from 'react';
import { Tooltip, Chip, FilterGroup, FilterChip, Checkbox, StatusChip, Button } from './kit.esm.js';
import { tierTone } from './components.esm.js';
import { useTiers } from './kitStyles.esm.js';
import { useClearanceRead } from './read.esm.js';
import { usePoll } from './usePoll.esm.js';

const BASELINE_POLICY = {
  approvers: { "2": { owner: 1, outside: 0 }, "3": { owner: 1, outside: 1 } },
  maxLinesTier1: 400
};
const WORDS = ["no", "one", "two", "three", "four"];
const word = (n) => WORDS[n] ?? String(n);
function approval(tier, policy) {
  const a = policy.approvers[String(tier)] ?? BASELINE_POLICY.approvers[String(tier)] ?? { owner: 1, outside: 0 };
  const total = a.owner + a.outside;
  const parts = [a.owner > 0 && `${word(a.owner)} from the owner group`, a.outside > 0 && `${word(a.outside)} from outside it`].filter(Boolean).join(", ");
  if (total === 1) return { by: "people", short: "one owner", long: `one person from the app's owner group, not the proposer` };
  const short = a.outside > 0 ? `${word(total)} people, ${word(a.outside)} outside the owner group` : `${word(total)} owners`;
  return { by: "people", short, long: `${word(total)} people: ${parts}, none of them the proposer` };
}
function tierDefs(policy = BASELINE_POLICY) {
  const lines = policy.maxLinesTier1;
  return [
    {
      tier: 0,
      name: "Docs and tests",
      covers: "Docs, tests, comments, labels and annotations without effect, anything outside a runtime path",
      brief: "docs, tests, labels",
      clears: { by: "policy", short: "policy, at once", long: "policy, at once" }
    },
    {
      tier: 1,
      name: "Image bump",
      covers: `An image bump on a Flight-registry image with CI green and provenance confirmed, under ${lines} changed lines; otherwise it becomes tier 2`,
      brief: `image bump, CI green, under ${lines} lines`,
      clears: { by: "policy", short: "policy, if checks hold", long: "policy, at once, when every check holds" }
    },
    {
      tier: 2,
      name: "Runtime shape",
      covers: "Replicas, resources, Rollout strategy, values-<env>.yaml, NetworkPolicy, HTTPRoute, environment variables, probes",
      brief: "replicas, resources, NetworkPolicy, env vars",
      clears: approval(2, policy)
    },
    {
      tier: 3,
      name: "Secrets, RBAC and data",
      covers: "Secrets and their references (Secret, ExternalSecret, SecretStore), RBAC (Role, RoleBinding, ServiceAccount), AppProject, migrations and jobs that write data, anything in clearance.yaml itself",
      brief: "secrets, RBAC, data migrations",
      clears: approval(3, policy)
    }
  ];
}
const NOT_TIERED = { name: "Not tiered", covers: "Seen in the environment with no grant (out of band)", brief: "seen with no grant" };
const TIER_FLOOR_NOTE = "Tier is a floor: a change that touches a tier-3 object is tier 3 however small the edit. A repo's clearance.yaml can only tighten it.";
function useTierPolicy(app, env) {
  const api = useClearanceRead();
  const read = usePoll(`clearance-policy-${app ?? ""}-${env ?? ""}`, () => api.get("/v1/clearance-policy"), 3e5);
  return read.data?.approvers ? { policy: read.data, source: "policy" } : { policy: BASELINE_POLICY, source: "baseline" };
}
const toneOf = (tier) => tierTone(tier);
function tierWhy(change) {
  const at = change.reasons.filter((r) => r.tier === change.tier);
  if (at.length) return at.map((r) => `${r.rule} (${r.subject})`).join(", ");
  return change.tier === 0 ? "nothing above tier 0" : "";
}
function needs(change, def) {
  const r = change.requirement;
  if (!r) return def.clears.long;
  const parts = [r.owner > 0 && `${word(r.owner)} from ${r.ownerGroup}`, r.outside > 0 && `${word(r.outside)} from ${r.outsideGroups.join(" or ")}`].filter(Boolean);
  return `${parts.join(" and ")}, none of them the proposer`;
}
function TierBadge({ tier, change, policy, children }) {
  const c = useTiers();
  const defs = useMemo(() => tierDefs(policy), [policy]);
  const def = tier === null || tier === void 0 ? void 0 : defs[tier];
  const tip = /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx("div", { className: c.tipTitle, children: def ? `Tier ${def.tier}: ${def.name}` : NOT_TIERED.name }),
    !def && /* @__PURE__ */ jsx("div", { children: NOT_TIERED.covers }),
    def && change && tierWhy(change) && /* @__PURE__ */ jsxs("div", { children: [
      "Why: ",
      tierWhy(change),
      "."
    ] }),
    def && !change && /* @__PURE__ */ jsxs("div", { children: [
      def.covers,
      "."
    ] }),
    def && /* @__PURE__ */ jsxs("div", { className: c.tipLine, children: [
      "Cleared by: ",
      change ? needs(change, def) : def.clears.long,
      "."
    ] }),
    def && change?.proposer_kind === "agent" && /* @__PURE__ */ jsx("div", { className: c.tipLine, children: "An agent proposed it, so it is never cleared by policy alone below tier 1." }),
    /* @__PURE__ */ jsx("div", { className: c.tipDim, children: TIER_FLOOR_NOTE })
  ] });
  return /* @__PURE__ */ jsx(Tooltip, { title: tip, children: /* @__PURE__ */ jsx("span", { className: c.badge, tabIndex: 0, children: /* @__PURE__ */ jsx(Chip, { tone: toneOf(tier), children: children ?? (def ? `T${def.tier}` : "\u2013") }) }) });
}
function tierCountsOf(items) {
  const out = {};
  for (const i of items ?? []) {
    const n = i.key === null ? NaN : Number(i.key);
    if (Number.isInteger(n) && n >= 0 && n <= 3) out[n] = (out[n] ?? 0) + i.count;
  }
  return out;
}
function TierMix({ counts, label = "Changes by tier" }) {
  const c = useTiers();
  const total = [0, 1, 2, 3].reduce((n, t) => n + (counts[t] ?? 0), 0);
  const summary = `${label}: ${[0, 1, 2, 3].map((t) => `tier ${t} ${counts[t] ?? 0}`).join(", ")}`;
  const segs = [c.seg0, c.seg1, c.seg2, c.seg3];
  return /* @__PURE__ */ jsxs("div", { children: [
    /* @__PURE__ */ jsx("div", { className: c.mix, role: "img", "aria-label": summary, children: total > 0 && [0, 1, 2, 3].filter((t) => counts[t]).map((t) => /* @__PURE__ */ jsx("i", { className: `${c.seg} ${segs[t]}`, style: { width: `${counts[t] / total * 100}%` } }, t)) }),
    /* @__PURE__ */ jsx("div", { className: c.mixLegend, style: { marginTop: 8 }, children: [0, 1, 2, 3].map((t) => /* @__PURE__ */ jsxs("span", { className: c.mixItem, children: [
      /* @__PURE__ */ jsx(TierBadge, { tier: t }),
      counts[t] ?? 0
    ] }, t)) })
  ] });
}
function TierKey({ policy, counts, defaultOpen = true }) {
  const c = useTiers();
  const [open, setOpen] = useState(defaultOpen);
  const defs = useMemo(() => tierDefs(policy), [policy]);
  return /* @__PURE__ */ jsxs("div", { role: "group", "aria-label": "Tier key", children: [
    /* @__PURE__ */ jsxs("div", { className: c.keyHead, children: [
      /* @__PURE__ */ jsx("span", { className: c.popSub, style: { flex: "0 1 auto" }, children: "Tier: how much a change can hurt, and who clears it" }),
      /* @__PURE__ */ jsx(Button, { small: true, "aria-expanded": open, onClick: () => setOpen(!open), style: { marginLeft: "auto" }, children: open ? "Hide key \u25B4" : "Show key \u25BE" })
    ] }),
    open ? /* @__PURE__ */ jsxs("div", { className: c.keyStrip, children: [
      defs.map((d) => /* @__PURE__ */ jsxs("div", { className: c.keyCell, children: [
        /* @__PURE__ */ jsxs("div", { className: c.keyTop, children: [
          /* @__PURE__ */ jsx(TierBadge, { tier: d.tier, policy, children: d.tier }),
          /* @__PURE__ */ jsx("span", { className: c.keyName, children: d.clears.short })
        ] }),
        /* @__PURE__ */ jsx("span", { className: c.rowMeta, children: d.brief }),
        counts && /* @__PURE__ */ jsxs("span", { className: c.rowCount, children: [
          counts[d.tier] ?? 0,
          " in 24 h"
        ] })
      ] }, d.tier)),
      /* @__PURE__ */ jsxs("div", { className: c.keyCell, children: [
        /* @__PURE__ */ jsxs("div", { className: c.keyTop, children: [
          /* @__PURE__ */ jsx(TierBadge, { tier: null, children: "\u2013" }),
          /* @__PURE__ */ jsx("span", { className: c.keyName, children: NOT_TIERED.name })
        ] }),
        /* @__PURE__ */ jsx("span", { className: c.rowMeta, children: NOT_TIERED.brief })
      ] })
    ] }) : /* @__PURE__ */ jsxs("div", { className: c.keyBadges, children: [
      defs.map((d) => /* @__PURE__ */ jsx(TierBadge, { tier: d.tier, policy, children: d.tier }, d.tier)),
      /* @__PURE__ */ jsx(TierBadge, { tier: null, children: "\u2013" })
    ] })
  ] });
}
function TierFilter({ value, onChange, policy, source, counts }) {
  const c = useTiers();
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const defs = useMemo(() => tierDefs(policy), [policy]);
  useEffect(() => {
    if (!open) return void 0;
    const outside = (e) => root.current && !root.current.contains(e.target) && setOpen(false);
    const esc = (e) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const toggle = (t) => onChange(value.includes(t) ? value.filter((x) => x !== t) : [...value, t].sort());
  return /* @__PURE__ */ jsxs("div", { className: c.anchor, ref: root, children: [
    /* @__PURE__ */ jsx(FilterGroup, { label: "Tier", children: /* @__PURE__ */ jsxs(FilterChip, { on: value.length > 0, expanded: open, onClick: () => setOpen(!open), children: [
      value.length ? [...value].sort().join(", ") : "all",
      " \u25BE"
    ] }) }),
    open && /* @__PURE__ */ jsxs("div", { className: c.popover, role: "dialog", "aria-label": "Change tiers", children: [
      /* @__PURE__ */ jsxs("div", { className: c.popHead, children: [
        /* @__PURE__ */ jsx("h3", { className: c.popTitle, children: "Change tiers" }),
        /* @__PURE__ */ jsx("span", { className: c.popSub, children: "How much a change can hurt, set by what it touches. Tick tiers to filter the list." })
      ] }),
      defs.map((d) => {
        const on = value.includes(d.tier);
        return /* @__PURE__ */ jsxs("label", { className: `${c.row} ${on ? c.rowOn : ""}`, children: [
          /* @__PURE__ */ jsx(Checkbox, { checked: on, onChange: () => toggle(d.tier), "aria-label": `Tier ${d.tier}: ${d.name}` }),
          /* @__PURE__ */ jsx(TierBadge, { tier: d.tier, policy, children: d.tier }),
          /* @__PURE__ */ jsxs("div", { className: c.rowBody, children: [
            /* @__PURE__ */ jsx("div", { className: c.rowName, children: d.name }),
            /* @__PURE__ */ jsx("div", { className: c.rowMeta, children: d.covers })
          ] }),
          /* @__PURE__ */ jsxs("div", { className: c.rowEnd, children: [
            /* @__PURE__ */ jsx(StatusChip, { tone: d.clears.by === "policy" ? "ok" : "warn", children: d.clears.short }),
            counts && /* @__PURE__ */ jsxs("span", { className: c.rowCount, children: [
              counts[d.tier] ?? 0,
              " in 24 h"
            ] })
          ] })
        ] }, d.tier);
      }),
      /* @__PURE__ */ jsxs("div", { className: c.popFoot, children: [
        /* @__PURE__ */ jsx(TierBadge, { tier: null, children: "\u2013" }),
        /* @__PURE__ */ jsxs("span", { className: c.popSub, children: [
          NOT_TIERED.name,
          ": ",
          NOT_TIERED.covers.toLowerCase(),
          "."
        ] }),
        value.length > 0 && /* @__PURE__ */ jsx(Button, { small: true, onClick: () => onChange([]), children: "Clear tier filter" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: c.popNote, children: [
        TIER_FLOOR_NOTE,
        " ",
        source === "policy" ? `Showing the policy in force${policy?.version ? ` (${policy.version})` : ""}.` : "Showing the gate's baseline."
      ] })
    ] })
  ] });
}

export { BASELINE_POLICY, NOT_TIERED, TIER_FLOOR_NOTE, TierBadge, TierFilter, TierKey, TierMix, tierCountsOf, tierDefs, tierWhy, useTierPolicy };
//# sourceMappingURL=tiers.esm.js.map
