import { jsx, Fragment } from 'react/jsx-runtime';
import { clock, dateTimeShort, dateTime, utcDateTime } from './format.esm.js';
import { Tooltip } from './kit.esm.js';

function Time({ iso, format = "full" }) {
  if (!iso) return null;
  const text = { full: dateTime, short: dateTimeShort, clock }[format](iso);
  if (text === iso) return /* @__PURE__ */ jsx(Fragment, { children: text });
  return /* @__PURE__ */ jsx(Tooltip, { title: utcDateTime(iso, true), children: /* @__PURE__ */ jsx("span", { children: text }) });
}

export { Time };
//# sourceMappingURL=Time.esm.js.map
