import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useClearanceTokens } from './tokens.esm.js';

const TICK_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];
function ProductMark({ product, size = 24 }) {
  const t = useClearanceTokens();
  const accent = product === "autopilot" ? t.amber : t.good;
  return /* @__PURE__ */ jsxs("svg", { width: size, height: size, viewBox: "0 0 96 96", role: "img", "aria-label": `${product} mark`, style: { flexShrink: 0 }, children: [
    /* @__PURE__ */ jsx("circle", { cx: "48", cy: "48", r: "40", fill: "none", stroke: t.line, strokeWidth: 2 }),
    /* @__PURE__ */ jsx("g", { stroke: t.textFaint, strokeWidth: 2, children: TICK_ANGLES.map((angle) => /* @__PURE__ */ jsx("line", { x1: "48", y1: "8", x2: "48", y2: "15", transform: `rotate(${angle} 48 48)` }, angle)) }),
    /* @__PURE__ */ jsx("polygon", { points: "44,2 52,2 48,9", fill: t.amber }),
    product === "autopilot" && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("path", { d: "M33,34 H28 V62 H33 M63,34 H68 V62 H63", fill: "none", stroke: accent, strokeWidth: 3, strokeLinecap: "round", strokeLinejoin: "round" }),
      /* @__PURE__ */ jsx("polygon", { points: "48,33 57.5,59 48,53.5 38.5,59", fill: accent, stroke: accent, strokeWidth: 1.5, strokeLinejoin: "round" })
    ] }),
    product === "clearance" && /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("path", { d: "M35,37 L44.5,46.5 L61.5,29.5", fill: "none", stroke: accent, strokeWidth: 4.5, strokeLinecap: "round", strokeLinejoin: "round" }),
      /* @__PURE__ */ jsx("line", { x1: "29", y1: "57", x2: "67", y2: "57", stroke: accent, strokeWidth: 3.2, strokeLinecap: "round" }),
      /* @__PURE__ */ jsx("line", { x1: "29", y1: "65", x2: "67", y2: "65", stroke: accent, strokeWidth: 3.2, strokeDasharray: "5.5 4.3" })
    ] })
  ] });
}

export { ProductMark };
//# sourceMappingURL=ProductMark.esm.js.map
