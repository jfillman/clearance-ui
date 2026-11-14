import { jsxs, jsx } from 'react/jsx-runtime';
import { useRef, useState, useLayoutEffect, useEffect, Fragment, useCallback } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { useTableKit } from './kit.esm.js';

const useStyles = makeStyles(() => ({
  // The details cell carries its own padding (a Section, or a padded body).
  drawer: { padding: 0 }
}));
function useOneOpen(initial) {
  const [open, set] = useState(initial);
  const toggle = useCallback((key) => set((cur) => cur === key ? void 0 : key), []);
  const close = useCallback(() => set(void 0), []);
  return { open, toggle, close, set };
}
function ExpandRow({ id, open, onToggle, colSpan, children, details, label }) {
  const tk = useTableKit();
  const c = useStyles();
  const ref = useRef(null);
  const detailsId = `${id}-details`;
  const [width, setWidth] = useState();
  const measured = width !== void 0;
  useLayoutEffect(() => {
    const holder = open ? ref.current?.closest("table")?.parentElement : void 0;
    if (!holder) return void 0;
    const measure = () => setWidth(holder.clientWidth || void 0);
    measure();
    if (typeof ResizeObserver === "undefined") return void 0;
    const ro = new ResizeObserver(measure);
    ro.observe(holder);
    return () => ro.disconnect();
  }, [open]);
  useEffect(() => {
    if (open) ref.current?.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
  }, [open, measured]);
  const rowKey = (e) => {
    if (e.target !== e.currentTarget) {
      if (e.key === "Escape" && open) onToggle();
      return;
    }
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onToggle();
    } else if (e.key === "Escape" && open) onToggle();
  };
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(
      "tr",
      {
        className: `${tk.rowLink} ${open ? tk.rowSelected : ""}`,
        "aria-expanded": open,
        "aria-controls": open ? detailsId : void 0,
        tabIndex: 0,
        onClick: onToggle,
        onKeyDown: rowKey,
        children
      }
    ),
    open && /* @__PURE__ */ jsx(
      "tr",
      {
        id: detailsId,
        ref,
        "data-testid": "expanded-details",
        onKeyDown: (e) => {
          if (e.key === "Escape" && !e.defaultPrevented) onToggle();
        },
        children: /* @__PURE__ */ jsx("td", { className: `${tk.td} ${c.drawer}`, colSpan, role: "region", "aria-label": label, children: /* @__PURE__ */ jsx("div", { style: width ? { position: "sticky", left: 0, width, boxSizing: "border-box" } : void 0, children: details }) })
      }
    )
  ] });
}

export { ExpandRow, useOneOpen };
//# sourceMappingURL=ExpandRow.esm.js.map
