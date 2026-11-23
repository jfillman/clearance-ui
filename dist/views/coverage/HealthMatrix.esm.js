import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import { fontScale, fontMono, useClearanceTokens } from '../../kit/tokens.esm.js';
import 'react';
import '../../kit/transport.esm.js';
import { useTableKit, Section, EmptyNote, Count, Tooltip, Hint } from '../../kit/kit.esm.js';
import '../../kit/components.esm.js';
import '../../kit/FlightLog.esm.js';
import '../../kit/coverage.esm.js';
import '../../kit/Pager.esm.js';
import '@material-ui/core/Popper';
import '../../kit/kitStyles.esm.js';
import '../../kit/ExpandRow.esm.js';
import { matrixSummary } from './healthModel.esm.js';

const WORD = { healthy: "healthy", degraded: "degraded", blind: "blind", none: "no health record" };
const useStyles = makeStyles(() => ({
  scroll: { overflowX: "auto", padding: "4px 16px 12px" },
  grid: { borderCollapse: "separate", borderSpacing: 3 },
  rowHead: { textAlign: "left", fontFamily: fontMono, fontSize: fontScale.sm, color: ({ t }) => t.textHi, paddingRight: 12, whiteSpace: "nowrap", fontWeight: 400 },
  dayHead: { fontFamily: fontMono, fontSize: fontScale.xs, color: ({ t }) => t.textLo, fontWeight: 400, padding: 0, textAlign: "center" },
  cell: { width: 28, height: 22, borderRadius: 3, display: "block", boxSizing: "border-box" },
  legend: { display: "flex", gap: 14, flexWrap: "wrap", alignItems: "center", padding: "0 16px 12px" },
  key: { display: "inline-flex", gap: 6, alignItems: "center", fontSize: fontScale.sm, color: ({ t }) => t.textLo },
  swatch: { width: 12, height: 12, borderRadius: 3, display: "inline-block", boxSizing: "border-box" }
}));
const fill = (t, s, partial) => {
  if (partial) return { background: "transparent", border: `1px dashed ${t.textFaint}` };
  if (s === "healthy") return { background: t.good };
  if (s === "degraded") return { background: t.amber };
  if (s === "blind") return { background: t.bad };
  return { background: t.panelAlt, border: `1px solid ${t.line}` };
};
const cellLabel = (scope, c) => {
  if (c.partial && c.state === "none") return `${scope}, ${c.day}: not loaded, too many records to read this far back`;
  const base = `${scope}, ${c.day}: ${WORD[c.state]}`;
  const more = [c.records ? `${c.records} ${c.records === 1 ? "record" : "records"}` : "", c.failed.length ? `failed: ${c.failed.join(", ")}` : "", c.sources.length ? `from ${c.sources.join(", ")}` : ""].filter(Boolean).join("; ");
  return `${base}${more ? ` (${more})` : ""}${c.partial ? "; only part of this day was read" : ""}`;
};
function HealthMatrix({ matrix }) {
  const t = useClearanceTokens();
  const c = useStyles({ t });
  const tk = useTableKit();
  const sum = matrixSummary(matrix);
  const count = matrix.rows.length === 0 ? void 0 : `${sum.unhealthy} of ${sum.scopes} not healthy every day${sum.silentToday ? ` \xB7 ${sum.silentToday} silent today` : ""}`;
  return /* @__PURE__ */ jsx(Section, { framed: true, "aria-label": "Health by scope and day", title: "Health by scope and day", count, children: matrix.rows.length === 0 ? /* @__PURE__ */ jsx(EmptyNote, { inset: true, children: "Nothing is linked to observe yet: no cluster, cloud account or other scope is reporting to Clearance, so there is no health to show. This is not a clean bill: a scope that is not watched is not covered." }) : /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("div", { className: c.scroll, children: /* @__PURE__ */ jsxs("table", { className: c.grid, "aria-label": `Feed health: ${matrix.rows.length} scopes by ${matrix.days.length} days, newest day last`, "data-testid": "health-matrix", children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { scope: "col", className: tk.th, children: /* @__PURE__ */ jsx("span", { style: { position: "absolute", width: 1, height: 1, overflow: "hidden" }, children: "Scope" }) }),
        matrix.days.map((d) => /* @__PURE__ */ jsx("th", { scope: "col", className: c.dayHead, children: d.slice(8) }, d))
      ] }) }),
      /* @__PURE__ */ jsx("tbody", { children: matrix.rows.map((r) => /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsxs("th", { scope: "row", className: c.rowHead, children: [
          r.scope,
          r.error ? /* @__PURE__ */ jsx(Count, { children: " not read" }) : null
        ] }),
        r.cells.map((cell) => /* @__PURE__ */ jsx("td", { style: { padding: 0 }, children: /* @__PURE__ */ jsx(Tooltip, { title: r.error ? `${r.scope}: health not read (${r.error})` : cellLabel(r.scope, cell), children: /* @__PURE__ */ jsx("span", { className: c.cell, style: fill(t, cell.state, cell.partial), role: "img", "aria-label": r.error ? `${r.scope}, ${cell.day}: health not read` : cellLabel(r.scope, cell), "data-state": r.error ? "error" : cell.state }) }) }, cell.day))
      ] }, r.scope)) })
    ] }) }),
    /* @__PURE__ */ jsxs("div", { className: c.legend, "aria-label": "Legend", children: [
      ["healthy", "degraded", "blind", "none"].map((s) => /* @__PURE__ */ jsxs("span", { className: c.key, children: [
        /* @__PURE__ */ jsx("i", { className: c.swatch, style: fill(t, s), "aria-hidden": true }),
        WORD[s]
      ] }, s)),
      /* @__PURE__ */ jsxs("span", { className: c.key, children: [
        /* @__PURE__ */ jsx("i", { className: c.swatch, style: fill(t, "none", true), "aria-hidden": true }),
        "not loaded"
      ] })
    ] }),
    /* @__PURE__ */ jsx(Hint, { inset: true, children: "A day is the worst state any feed reported in it (UTC). A day with no record is shown as no record, never as healthy." })
  ] }) });
}

export { HealthMatrix };
//# sourceMappingURL=HealthMatrix.esm.js.map
