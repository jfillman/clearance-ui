import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { useClearanceTokens } from '../../kit/tokens.esm.js';
import 'react';
import { Tooltip, Hint } from '../../kit/kit.esm.js';
import '../../kit/components.esm.js';
import '../../kit/FlightLog.esm.js';
import '../../kit/transport.esm.js';
import '../../kit/coverage.esm.js';
import '../../kit/Pager.esm.js';
import '../../kit/kitStyles.esm.js';
import '../../kit/ExpandRow.esm.js';
import { buildMatrix } from './model.esm.js';
import { statusColor } from './parts.esm.js';
import { useMapStyles } from './styles.esm.js';

const WORDS = { enforce: "enforcing", flag: "flag mode", silent: "declared, silent", none: "does not guard it" };
function MapMatrix({ map, targets, onOpenTarget }) {
  const c = useMapStyles();
  const t = useClearanceTokens();
  const m = buildMatrix(map, targets);
  const cls = { enforce: c.cellEnforce, flag: c.cellFlag, silent: c.cellSilent, none: c.cellNone };
  const open = (id) => (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpenTarget(id);
    }
  };
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("div", { className: c.matrixScroll, children: /* @__PURE__ */ jsxs("table", { className: c.matrix, "aria-label": `Gates by targets: ${m.gateTypes.length} gate types, ${m.targets.length} targets, worst first`, "data-testid": "map-matrix", children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { scope: "col", className: c.matrixRowHead, children: /* @__PURE__ */ jsx("span", { className: c.visuallyHidden, children: "Gate type" }) }),
        m.targets.map((x) => /* @__PURE__ */ jsx("th", { scope: "col", style: { padding: 0 }, children: /* @__PURE__ */ jsx(Tooltip, { title: `${x.name} \xB7 ${x.group}`, children: /* @__PURE__ */ jsx("span", { style: { display: "block", width: 16, height: 6, borderRadius: 2, backgroundColor: statusColor(t, x.status) }, "aria-label": `${x.name}, ${x.status}` }) }) }, x.id))
      ] }) }),
      /* @__PURE__ */ jsx("tbody", { children: m.gateTypes.map((type) => /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { scope: "row", className: c.matrixRowHead, children: type }),
        m.targets.map((x) => {
          const mode = m.cell(type, x);
          return /* @__PURE__ */ jsx(Tooltip, { title: `${type} on ${x.name}: ${WORDS[mode]}`, children: /* @__PURE__ */ jsx("td", { className: `${c.matrixCell} ${cls[mode]}`, role: "button", tabIndex: 0, "aria-label": `${type} on ${x.name}: ${WORDS[mode]}. Open detail`, onClick: () => onOpenTarget(x.id), onKeyDown: open(x.id), "data-mode": mode }) }, x.id);
        })
      ] }, type)) })
    ] }) }),
    /* @__PURE__ */ jsx(Hint, { inset: true, children: "Gates \xD7 targets, worst first. Green enforces, amber is flag mode, grey is declared but silent, a dashed red cell is a gate type that does not guard that target. Click a cell to open the target." })
  ] });
}

export { MapMatrix };
//# sourceMappingURL=MapMatrix.esm.js.map
