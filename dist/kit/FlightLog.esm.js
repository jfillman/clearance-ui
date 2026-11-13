import { jsx, Fragment, jsxs } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import { DecisionChip, TierChip } from './components.esm.js';
import { Chip } from './kit.esm.js';
import { preventFocusScroll, clock } from './format.esm.js';
import { tokensForTheme, fontScale, fontMono } from './tokens.esm.js';

const FLIGHT_LOG_MAX_HEIGHT = 480;
const useStyles = makeStyles((theme) => {
  const t = tokensForTheme(theme);
  return {
    log: { display: "flex", flexDirection: "column", overflowY: "auto", overscrollBehavior: "contain" },
    item: { display: "flex", flexDirection: "column" },
    open: { padding: "8px 10px 12px 74px", background: t.panelAlt, borderTop: `1px dashed ${t.line}` },
    row: {
      display: "grid",
      gridTemplateColumns: "64px 28px minmax(0, 1fr) auto",
      gap: 10,
      alignItems: "start",
      padding: "7px 0",
      borderTop: `1px solid ${t.lineSoft}`,
      fontSize: fontScale.md,
      color: t.textHi,
      textAlign: "left",
      background: "none",
      border: "none",
      width: "100%",
      font: "inherit",
      cursor: "pointer"
    },
    rowStatic: { cursor: "default" },
    selected: { background: t.panelAlt },
    time: { fontFamily: fontMono, fontSize: fontScale.sm, color: t.textFaint, paddingTop: 2 },
    glyph: { display: "inline-flex", justifyContent: "center", paddingTop: 1 },
    what: { minWidth: 0 },
    detail: { fontSize: fontScale.sm, color: t.textLo, marginTop: 2, wordBreak: "break-word" }
  };
});
function kindOf(r) {
  if (r.tool.startsWith("session.")) return "session";
  if (r.tool.startsWith("run.")) return "run";
  if (r.tool.startsWith("model.")) return "model";
  if (r.tool.startsWith("human.")) return "human";
  if (r.tool.startsWith("provenance.")) return "provenance";
  return "tool";
}
function Glyph({ r }) {
  const k = kindOf(r);
  if (k === "tool") return /* @__PURE__ */ jsx(TierChip, { tier: r.tier ?? 0 });
  const letter = { session: "S", run: "R", model: "M", human: "H", provenance: "P" }[k];
  const kindTone = { session: "neutral", run: "neutral", model: "sky", human: "amber", provenance: "neutral" };
  return /* @__PURE__ */ jsx(Chip, { tone: r.decision === "deny" ? "bad" : kindTone[k], title: k, children: letter });
}
function summarize(r) {
  const eff = r.effect ?? {};
  switch (r.tool) {
    case "session.open":
      return { title: `Session opened`, detail: `${r.agent ?? ""} as ${r.principal}` };
    case "session.open_triggered":
      return { title: `Session opened by a trigger`, detail: `${r.agent ?? ""} as ${r.principal}` };
    case "session.close":
      return { title: "Session closed", detail: r.result };
    case "session.freeze":
      return { title: "Frozen by a person", detail: `${r.principal} \xB7 ${r.result}` };
    case "session.end":
      return { title: "Ended by a person", detail: `${r.principal} \xB7 ${r.result}` };
    case "trigger.hold":
      return { title: "Triggers held", detail: `${r.principal} \xB7 ${r.result}` };
    case "trigger.release":
      return { title: "Triggers released", detail: `${r.principal} \xB7 ${r.result}` };
    case "run.spawn":
      return { title: "Child run started", detail: r.result };
    case "run.launch":
      return { title: "AgentRun created", detail: r.result };
    case "human.request":
      return { title: "Asked a person", detail: r.result };
    case "human.answer":
      return { title: "A person answered", detail: `${r.principal} \xB7 ${r.result}` };
    case "provenance.verify":
      return { title: `Agent gates on ${r.target ?? ""}`, detail: r.result };
    case "deploy.request":
      return { title: `Change registered: ${r.target ?? ""}`, detail: r.result };
    case "deploy.clear":
      return { title: `Change cleared: ${r.target ?? ""}`, detail: `${r.principal} \xB7 ${r.result}` };
    case "deploy.deny":
      return { title: `Change denied: ${r.target ?? ""}`, detail: `${r.principal} \xB7 ${r.result}` };
    case "deploy.expire":
      return { title: `Change expired: ${r.target ?? ""}`, detail: r.result };
    case "definition.load":
      return { title: `Definition loaded: ${r.agent ?? ""}`, detail: r.result };
    case "definition.unload":
      return { title: `Definition unloaded: ${r.agent ?? ""}`, detail: r.result };
    case "definition.reject":
      return { title: `Pin rejected: ${r.agent ?? ""}`, detail: `${r.target ?? ""} \xB7 ${r.result}` };
  }
  if (r.tool.startsWith("model.")) return { title: `Model call`, detail: r.result };
  const bits = [];
  if (eff.pr) bits.push(`PR #${eff.pr}${eff.repo ? ` on ${eff.repo}` : ""}`);
  if (r.app) bits.push(r.app);
  if (r.decision === "deny" && r.result) bits.push(r.result);
  else if (r.result && r.result !== "ok") bits.push(r.result);
  return { title: r.tool, detail: bits.join(" \xB7 ") || void 0 };
}
function FlightLog({ records, selected, onSelect, detail, empty, maxHeight = FLIGHT_LOG_MAX_HEIGHT }) {
  const c = useStyles();
  const sorted = [...records].sort((a, b) => a.seq - b.seq);
  if (sorted.length === 0) return /* @__PURE__ */ jsx(Fragment, { children: empty ?? null });
  return /* @__PURE__ */ jsx("div", { className: c.log, role: "list", "aria-label": "Flight log", style: maxHeight ? { maxHeight } : void 0, children: sorted.map((r) => {
    const s = summarize(r);
    const Row = onSelect ? "button" : "div";
    const isOpen = selected === r.seq;
    const detailId = `flight-log-record-${r.seq}`;
    return /* @__PURE__ */ jsxs("div", { role: "listitem", className: c.item, children: [
      /* @__PURE__ */ jsxs(
        Row,
        {
          type: onSelect ? "button" : void 0,
          className: [c.row, onSelect ? "" : c.rowStatic, isOpen ? c.selected : ""].join(" "),
          onClick: onSelect ? () => onSelect(r) : void 0,
          onMouseDown: onSelect ? preventFocusScroll : void 0,
          "aria-current": isOpen && !detail ? "true" : void 0,
          "aria-expanded": onSelect && detail ? isOpen : void 0,
          "aria-controls": onSelect && detail && isOpen ? detailId : void 0,
          children: [
            /* @__PURE__ */ jsx("span", { className: c.time, children: clock(r.ts) }),
            /* @__PURE__ */ jsx("span", { className: c.glyph, children: /* @__PURE__ */ jsx(Glyph, { r }) }),
            /* @__PURE__ */ jsxs("span", { className: c.what, children: [
              /* @__PURE__ */ jsx("b", { children: s.title }),
              s.detail && /* @__PURE__ */ jsx("div", { className: c.detail, children: s.detail })
            ] }),
            /* @__PURE__ */ jsx(DecisionChip, { decision: r.decision, rule: r.rule })
          ]
        }
      ),
      isOpen && detail && /* @__PURE__ */ jsx("div", { id: detailId, className: c.open, "aria-label": `Record ${r.seq}`, children: detail(r) })
    ] }, r.seq);
  }) });
}

export { FLIGHT_LOG_MAX_HEIGHT, FlightLog, summarize };
//# sourceMappingURL=FlightLog.esm.js.map
