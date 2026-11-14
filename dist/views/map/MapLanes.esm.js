import { jsx, Fragment, jsxs } from 'react/jsx-runtime';
import '@material-ui/core/styles';
import 'react';
import { Tooltip, StatusChip, Callout } from '../../kit/kit.esm.js';
import '../../kit/components.esm.js';
import '../../kit/FlightLog.esm.js';
import '../../kit/transport.esm.js';
import '../../kit/coverage.esm.js';
import '../../kit/Pager.esm.js';
import '../../kit/kitStyles.esm.js';
import '../../kit/ExpandRow.esm.js';
import { lanePartials } from './model.esm.js';
import { ModeChip } from './parts.esm.js';
import { useMapStyles } from './styles.esm.js';

const STEPS = [
  { id: "requested", label: "Requested", sub: "deploy.request" },
  { id: "tiered", label: "Tiered", sub: "tier + why" },
  { id: "decided", label: "Decided", sub: "clear \xB7 hold \xB7 deny" },
  { id: "applied", label: "Applied", sub: "deploy.outcome" },
  { id: "observed", label: "Observed", sub: "observer saw it" },
  { id: "verified", label: "Verified", sub: "matches the grant" }
];
function MapLanes({ rows, partial = [], flagWord = "would refuse", empty }) {
  const c = useMapStyles();
  const notes = lanePartials(partial);
  const scopeCounted = new Set(notes.flatMap((n) => n.field.replace(/^lanes\./, "").split(",")));
  if (rows.length === 0) return /* @__PURE__ */ jsx(Fragment, { children: empty ?? null });
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs("table", { className: c.lanes, children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { className: c.laneHead, scope: "col", children: "Gate \xB7 target" }),
        STEPS.map((s) => /* @__PURE__ */ jsxs("th", { className: c.laneHead, scope: "col", children: [
          s.label,
          /* @__PURE__ */ jsxs("span", { className: c.laneSub, children: [
            s.sub,
            scopeCounted.has(s.id) ? " \u2020" : ""
          ] })
        ] }, s.id))
      ] }) }),
      /* @__PURE__ */ jsx("tbody", { children: rows.map((r) => {
        const max = Math.max(1, ...STEPS.map((s) => r.lanes[s.id]));
        return /* @__PURE__ */ jsxs("tr", { className: r.selected ? c.laneRowOn : void 0, children: [
          /* @__PURE__ */ jsxs("td", { className: c.laneName, children: [
            /* @__PURE__ */ jsxs("div", { style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }, children: [
              r.onSelect ? /* @__PURE__ */ jsx(Tooltip, { title: "Scope the lanes to this gate", children: /* @__PURE__ */ jsx("span", { role: "button", tabIndex: 0, "aria-pressed": !!r.selected, className: c.rowName, style: { cursor: "pointer" }, onClick: r.onSelect, onKeyDown: (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), r.onSelect?.()), children: r.label }) }) : /* @__PURE__ */ jsx("span", { className: c.rowName, children: r.label }),
              r.mode && /* @__PURE__ */ jsx(ModeChip, { mode: r.mode, silent: r.silent })
            ] }),
            r.sub && /* @__PURE__ */ jsx("span", { className: c.rowMeta, children: r.sub })
          ] }),
          STEPS.map((s) => {
            const hatched = r.blind && (s.id === "observed" || s.id === "verified");
            const n = r.lanes[s.id];
            return /* @__PURE__ */ jsxs("td", { className: c.laneCell, children: [
              hatched ? /* @__PURE__ */ jsx(Tooltip, { title: "An observer of this target is blind: nothing can be observed or verified, so no number is shown", children: /* @__PURE__ */ jsx("span", { children: /* @__PURE__ */ jsx(StatusChip, { tone: "bad", children: "coverage-unavailable" }) }) }) : /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsxs("span", { className: c.laneNum, children: [
                  n.toLocaleString(),
                  scopeCounted.has(s.id) ? " \u2020" : ""
                ] }),
                /* @__PURE__ */ jsx("span", { className: c.laneTrack, "aria-hidden": true, children: /* @__PURE__ */ jsx("span", { className: `${c.laneFill} ${s.id === "verified" ? c.laneFillGood : ""}`, style: { width: `${100 * n / max}%` } }) })
              ] }),
              s.id === "decided" && r.holding > 0 && /* @__PURE__ */ jsxs("span", { className: `${c.laneExtra} ${c.laneExtraAmber}`, children: [
                r.holding,
                " holding"
              ] }),
              s.id === "decided" && r.refused > 0 && /* @__PURE__ */ jsxs("span", { className: `${c.laneExtra} ${c.laneExtraBad}`, children: [
                r.refused,
                " ",
                r.mode === "flag" ? flagWord : "refused"
              ] }),
              s.id === "applied" && r.lanes.applied > 0 && /* @__PURE__ */ jsxs("span", { className: c.laneExtra, children: [
                r.lanes.applied_matched,
                " matched the grant"
              ] })
            ] }, s.id);
          })
        ] }, r.key);
      }) })
    ] }),
    notes.map((n) => /* @__PURE__ */ jsx(Callout, { tone: "neutral", label: `\u2020 partial: ${n.field}`, children: n.reason }, n.field))
  ] });
}

export { MapLanes };
//# sourceMappingURL=MapLanes.esm.js.map
