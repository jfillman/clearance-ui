import { jsx, jsxs } from 'react/jsx-runtime';
import { useState, useEffect, Fragment } from 'react';
import { useClearanceTokens } from '../../kit/tokens.esm.js';
import { StatusChip, Tooltip } from '../../kit/kit.esm.js';
import '../../kit/components.esm.js';
import '../../kit/FlightLog.esm.js';
import '../../kit/transport.esm.js';
import '../../kit/coverage.esm.js';
import '../../kit/Pager.esm.js';
import '../../kit/kitStyles.esm.js';
import '../../kit/ExpandRow.esm.js';
import { COVERAGE_ORDER } from './model.esm.js';
import { useMapStyles } from './styles.esm.js';

const TONES = { down: "bad", attention: "warn", ok: "ok" };
function useClock(ms = 5e3) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}
const statusTone = (s) => TONES[s] ?? "ok";
const statusWord = (s) => s in TONES ? s : "ok";
const MODE_TONES = { flag: "warn", enforce: "ok" };
const modeTone = (mode, silent) => silent ? "neutral" : MODE_TONES[mode] ?? "neutral";
const MODE_WHY = {
  enforce: "Enforcing: a refusal stops the change",
  flag: "Flag mode: a refusal is recorded, not enforced",
  silent: "Declared, but no record of this window names it"
};
function ModeChip({ mode, silent }) {
  const word = silent ? "silent" : mode;
  return /* @__PURE__ */ jsx(StatusChip, { tone: modeTone(mode, silent), title: MODE_WHY[word] ?? word, children: word });
}
const mixWords = (m) => `${m.enforce} enforce \xB7 ${m.flag} flag \xB7 ${m.silent} silent`;
const statusColor = (t, s) => ({ down: t.bad, attention: t.amber })[s] ?? t.good;
const coverageColors = (t) => ({
  "authorized-and-verified": t.good,
  "observed-not-attributed": t.amber,
  "out-of-band-detected": t.bad,
  "coverage-unavailable": t.textFaint,
  "break-glass": t.amberLine,
  "attempted-refused": t.skyLine,
  unassessed: t.line
});
const COVERAGE_WHY = {
  "authorized-and-verified": "Observed, and it matches a grant",
  "observed-not-attributed": "Observed, and nothing says who did it",
  "out-of-band-detected": "Observed with no grant",
  "coverage-unavailable": "An observer was blind: it cannot be called verified",
  "break-glass": "Declared break-glass by a person",
  "attempted-refused": "Attempted and refused: Clearance doing its job",
  unassessed: "Observed, and no assessment is about it yet"
};
function CoverageMix({ coverage, label = "Coverage mix" }) {
  const c = useMapStyles();
  const t = useClearanceTokens();
  const colors = coverageColors(t);
  const keys = [...COVERAGE_ORDER, ...Object.keys(coverage).filter((k) => !COVERAGE_ORDER.includes(k))];
  const total = keys.reduce((n, k) => n + (coverage[k] ?? 0), 0);
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx("div", { className: c.mixBar, role: "img", "aria-label": `${label}: ${total === 0 ? "nothing observed in this window" : keys.filter((k) => coverage[k]).map((k) => `${coverage[k]} ${k}`).join(", ")}`, children: keys.filter((k) => coverage[k]).map((k) => /* @__PURE__ */ jsx(Tooltip, { title: `${k}: ${coverage[k]}`, children: /* @__PURE__ */ jsx("span", { className: c.mixSeg, style: { width: `${100 * coverage[k] / total}%`, backgroundColor: colors[k] ?? t.line } }) }, k)) }),
    /* @__PURE__ */ jsx("ul", { className: c.mixList, "aria-label": `${label} by state`, children: keys.map((k) => /* @__PURE__ */ jsxs("li", { className: c.mixLine, children: [
      /* @__PURE__ */ jsx(Tooltip, { title: COVERAGE_WHY[k] ?? k, children: /* @__PURE__ */ jsxs("span", { className: c.mixKey, children: [
        /* @__PURE__ */ jsx("i", { className: c.mixDot, style: { backgroundColor: colors[k] ?? t.line }, "aria-hidden": true }),
        k
      ] }) }),
      /* @__PURE__ */ jsx("span", { children: coverage[k] ?? 0 })
    ] }, k)) })
  ] });
}

export { CoverageMix, MODE_WHY, ModeChip, mixWords, modeTone, statusColor, statusTone, statusWord, useClock };
//# sourceMappingURL=parts.esm.js.map
