import { jsx, Fragment, jsxs } from 'react/jsx-runtime';
import { clock, dateTimeShort, dateTime, utcDateTime } from './format.esm.js';
import { Tooltip } from './kit.esm.js';

const visuallyHidden = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" };
function Time({ iso, format = "full", standalone = false }) {
  if (!iso) return null;
  const text = { full: dateTime, short: dateTimeShort, clock }[format](iso);
  if (text === iso) return /* @__PURE__ */ jsx(Fragment, { children: text });
  const utc = utcDateTime(iso, true);
  return /* @__PURE__ */ jsx(Tooltip, { title: utc, children: /* @__PURE__ */ jsxs("time", { dateTime: iso, tabIndex: standalone ? 0 : void 0, children: [
    text,
    /* @__PURE__ */ jsxs("span", { style: visuallyHidden, children: [
      " (UTC ",
      utc,
      ")"
    ] })
  ] }) });
}

export { Time };
//# sourceMappingURL=Time.esm.js.map
