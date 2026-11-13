import { jsxs, jsx } from 'react/jsx-runtime';
import { makeStyles } from '@material-ui/core/styles';
import { Count, FilterSelect, Button } from './kit.esm.js';
import { tokensForTheme, fontScale, fontMono } from './tokens.esm.js';

const PAGE_SIZES = [10, 25, 50, 100];
const DEFAULT_PAGE_SIZE = 50;
const useStyles = makeStyles((theme) => {
  const t = tokensForTheme(theme);
  return {
    bar: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 18px", fontFamily: fontMono, fontSize: fontScale.sm, borderTop: `1px solid ${t.lineSoft}` },
    info: { marginRight: "auto" }
  };
});
function pageSlice(items, page, pageSize) {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const cur = Math.min(Math.max(0, page), pages - 1);
  return { rows: items.slice(cur * pageSize, (cur + 1) * pageSize), page: cur, pages };
}
function Pager({ total, page, pageSize, onPage, onPageSize, label = "Pages" }) {
  const c = useStyles();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const cur = Math.min(Math.max(0, page), pages - 1);
  const from = total === 0 ? 0 : cur * pageSize + 1;
  const to = Math.min(total, (cur + 1) * pageSize);
  return /* @__PURE__ */ jsxs("nav", { className: c.bar, "aria-label": label, children: [
    /* @__PURE__ */ jsx("span", { className: c.info, "aria-live": "polite", children: /* @__PURE__ */ jsxs(Count, { children: [
      from,
      "-",
      to,
      " of ",
      total,
      " \xB7 page ",
      cur + 1,
      " of ",
      pages
    ] }) }),
    /* @__PURE__ */ jsx(FilterSelect, { label: "Rows per page", value: String(pageSize), options: PAGE_SIZES.map((n) => ({ value: String(n), label: `${n} rows` })), onChange: (v) => onPageSize(Number(v)) }),
    /* @__PURE__ */ jsx(Button, { small: true, disabled: cur <= 0, onClick: () => onPage(cur - 1), children: "Previous" }),
    /* @__PURE__ */ jsx(Button, { small: true, disabled: cur >= pages - 1, onClick: () => onPage(cur + 1), children: "Next" })
  ] });
}

export { DEFAULT_PAGE_SIZE, PAGE_SIZES, Pager, pageSlice };
//# sourceMappingURL=Pager.esm.js.map
