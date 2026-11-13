import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import { compact, ratio } from './format.esm.js';
import { StatusChip, Chip } from './kit.esm.js';
import { tokensForTheme, fontScale, fontMono, useClearanceTokens } from './tokens.esm.js';

const useStyles = makeStyles((theme) => {
  const t = tokensForTheme(theme);
  return {
    bars: { display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" },
    bar: { display: "flex", flexDirection: "column", gap: 4 },
    barLabel: { fontFamily: fontMono, fontWeight: 500, fontSize: fontScale.xs, textTransform: "uppercase", letterSpacing: "0.1em", color: t.textLo },
    track: { height: 6, borderRadius: 3, background: t.panelAlt, overflow: "hidden" },
    fill: { height: "100%", borderRadius: 3 },
    barValue: { fontFamily: fontMono, fontSize: fontScale.sm, color: t.textLo },
    fields: { display: "grid", gridTemplateColumns: "minmax(90px, auto) 1fr auto", gap: "6px 12px", alignItems: "baseline", fontSize: fontScale.md },
    fieldKey: { fontFamily: fontMono, fontWeight: 500, fontSize: fontScale.xs, textTransform: "uppercase", letterSpacing: "0.1em", color: t.textLo },
    fieldValue: { fontFamily: fontMono, fontSize: fontScale.sm, color: t.textHi, wordBreak: "break-all" }
  };
});
const TIER_TONES = { 0: "neutral", 1: "sky", 2: "amber", 3: "bad" };
const tierTone = (tier) => {
  if (tier === null || tier === void 0) return "neutral";
  const n = typeof tier === "number" ? tier : Number(String(tier).replace("T", ""));
  return TIER_TONES[n] ?? "neutral";
};
function TierChip({ tier }) {
  if (tier === null || tier === void 0) return null;
  const label = typeof tier === "number" ? `T${tier}` : tier;
  return /* @__PURE__ */ jsx(Chip, { tone: tierTone(tier), title: { T0: "read only", T1: "reversible write", T2: "propose only: a person merges", T3: "tripwire: denied and recorded" }[label] ?? label, children: label });
}
function DecisionChip({ decision, rule }) {
  if (decision === "allow") return /* @__PURE__ */ jsx(StatusChip, { tone: "ok", children: "allow" });
  return /* @__PURE__ */ jsx(StatusChip, { tone: "bad", children: rule ? `deny ${rule}` : "deny" });
}
function KindChip({ kind }) {
  return /* @__PURE__ */ jsx(Chip, { children: kind });
}
function outcomeLabel(o) {
  if (o.status === "done") return { label: "finished", tone: "ok", why: "the run answered" };
  if (o.status === "expired") return { label: "expired", tone: "neutral", why: "the session reached its time limit first" };
  if (o.status === "budget") return { label: "failed", tone: "bad", why: "the model budget ran out" };
  if (o.status === "no-result") return { label: "no result", tone: "warn", why: `the run ended (${o.run_phase ?? "unknown"}) without handing back a result` };
  return { label: "failed", tone: "bad", why: o.reason || "the run stopped with an error" };
}
function StateChip({ state, tripped, reason, outcome }) {
  if (state === "live" && tripped) return /* @__PURE__ */ jsx(StatusChip, { tone: "warn", dot: true, title: reason ?? void 0, children: "tripped" });
  if (state === "live") return /* @__PURE__ */ jsx(StatusChip, { tone: "info", dot: true, children: "live" });
  if (outcome) {
    const o = outcomeLabel(outcome);
    return /* @__PURE__ */ jsx(StatusChip, { tone: o.tone, title: o.why, children: o.label });
  }
  if (state === "closed") return /* @__PURE__ */ jsx(StatusChip, { tone: "neutral", children: "closed" });
  return /* @__PURE__ */ jsx(StatusChip, { tone: "neutral", title: "the session reached its time limit", children: "expired" });
}
function BudgetBar({ label, used, limit, format = String }) {
  const t = useClearanceTokens();
  const c = useStyles();
  const r = ratio(used, limit);
  let color = t.sky;
  if (r >= 1) color = t.bad;
  else if (r >= 0.8) color = t.amber;
  const u = used ?? 0;
  return /* @__PURE__ */ jsxs("div", { className: c.bar, role: "meter", "aria-label": label, "aria-valuemin": 0, "aria-valuemax": limit ?? 0, "aria-valuenow": u, children: [
    /* @__PURE__ */ jsx("span", { className: c.barLabel, children: label }),
    /* @__PURE__ */ jsx("div", { className: c.track, children: /* @__PURE__ */ jsx("div", { className: c.fill, style: { width: `${Math.round(r * 100)}%`, background: color } }) }),
    /* @__PURE__ */ jsx("span", { className: c.barValue, children: limit ? `${format(u)} of ${format(limit)}` : format(u) })
  ] });
}
const minutesBetween = (a, b) => Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 6e4);
function BudgetBars({ used, limits, createdAt, expiresAt, now = Date.now() }) {
  const c = useStyles();
  const elapsed = createdAt ? minutesBetween(createdAt, new Date(Math.min(now, expiresAt ? new Date(expiresAt).getTime() : now)).toISOString()) : void 0;
  return /* @__PURE__ */ jsxs("div", { className: c.bars, children: [
    createdAt && /* @__PURE__ */ jsx(BudgetBar, { label: "Run time", used: Math.round(elapsed ?? 0), limit: limits.ttl_minutes, format: (n) => `${n} min` }),
    /* @__PURE__ */ jsx(BudgetBar, { label: "Tool calls", used: used.tool_calls, limit: limits.tool_calls }),
    /* @__PURE__ */ jsx(BudgetBar, { label: "GitHub calls", used: used.github_calls, limit: limits.github_calls }),
    /* @__PURE__ */ jsx(BudgetBar, { label: "Open PRs", used: used.open_prs, limit: limits.open_prs }),
    /* @__PURE__ */ jsx(BudgetBar, { label: "Model tokens", used: used.model_tokens, limit: limits.model_tokens, format: compact }),
    /* @__PURE__ */ jsx(BudgetBar, { label: "Child runs", used: used.children, limit: limits.children })
  ] });
}
function SessionBudgets({ session, now }) {
  return /* @__PURE__ */ jsx(BudgetBars, { used: session.used, limits: session.limits, createdAt: session.created_at, expiresAt: session.expires_at, now });
}
const FIELD_ORDER = ["principal", "agent", "session", "task_id", "tool", "tier", "decision", "rule", "target", "app", "result", "args_sha256", "effect"];
function VerifiedClaimed({ record }) {
  const c = useStyles();
  const verified = new Set(record.verified ?? []);
  const claimed = new Set(record.claimed ?? []);
  const keys = [...FIELD_ORDER.filter((k) => k in record && record[k] !== null && record[k] !== void 0), ...[...claimed].filter((k) => !FIELD_ORDER.includes(k))];
  return /* @__PURE__ */ jsxs("div", { className: c.fields, children: [
    keys.map((k) => {
      const v = record[k];
      const text = typeof v === "object" ? JSON.stringify(v) : String(v);
      let mark;
      if (verified.has(k)) mark = "verified";
      else if (claimed.has(k)) mark = "claimed";
      return /* @__PURE__ */ jsx(FieldRow, { name: k, value: text, mark }, k);
    }),
    /* @__PURE__ */ jsx(FieldRow, { name: "coverage", value: record.coverage }),
    /* @__PURE__ */ jsx(FieldRow, { name: "assurance", value: record.assurance ?? "unknown" }),
    /* @__PURE__ */ jsx(FieldRow, { name: "hash", value: `${record.prev_hash.slice(0, 8)}\u2026 \u2192 ${record.hash.slice(0, 8)}\u2026` })
  ] });
}
function FieldRow({ name, value, mark }) {
  const c = useStyles();
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("span", { className: c.fieldKey, children: name }),
    /* @__PURE__ */ jsx("span", { className: c.fieldValue, children: value }),
    /* @__PURE__ */ jsxs("span", { children: [
      mark === "verified" && /* @__PURE__ */ jsx(StatusChip, { tone: "ok", children: "verified" }),
      mark === "claimed" && /* @__PURE__ */ jsx(StatusChip, { tone: "warn", children: "claimed" })
    ] })
  ] });
}

export { BudgetBar, BudgetBars, DecisionChip, KindChip, SessionBudgets, StateChip, TierChip, VerifiedClaimed, outcomeLabel, tierTone };
//# sourceMappingURL=components.esm.js.map
