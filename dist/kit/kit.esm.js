import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { forwardRef, useState, useMemo } from 'react';
import MuiTooltip from '@material-ui/core/Tooltip';
import { preventFocusScroll } from './format.esm.js';
import { useClearanceTokens } from './tokens.esm.js';
import { useUi, useBlocks, useSection, useFeedback, useStatus, useData, useControls } from './kitStyles.esm.js';

const cx = (...c) => c.filter(Boolean).join(" ");
function useKit() {
  const t = useClearanceTokens();
  return { t, ui: useUi() };
}
function useControlsKit() {
  return useControls();
}
function Tooltip({ title, children }) {
  if (!title) return children;
  return /* @__PURE__ */ jsx(TooltipOn, { title, children });
}
function TooltipOn({ title, children }) {
  const f = useFeedback();
  const disabled = Boolean(children.props.disabled);
  const target = typeof children.type === "string" && !disabled ? children : (
    // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
    /* @__PURE__ */ jsx("span", { style: { display: "inline-flex" }, tabIndex: disabled ? 0 : void 0, children })
  );
  return /* @__PURE__ */ jsx(MuiTooltip, { title, enterDelay: 300, enterNextDelay: 150, classes: { tooltip: f.tip }, placement: "bottom", children: target });
}
function ActionReason({ id, children }) {
  const f = useFeedback();
  return /* @__PURE__ */ jsxs("div", { id, className: f.reason, children: [
    /* @__PURE__ */ jsx("span", { className: f.reasonIcon, "aria-hidden": true, children: "\u2298" }),
    /* @__PURE__ */ jsx("div", { children })
  ] });
}
function PageHeader({ title, subtitle, eyebrow, actions }) {
  const { ui } = useKit();
  return /* @__PURE__ */ jsxs("div", { className: ui.pageHead, children: [
    /* @__PURE__ */ jsxs("div", { children: [
      eyebrow && /* @__PURE__ */ jsx("div", { className: ui.eyebrow, children: eyebrow }),
      /* @__PURE__ */ jsx("h1", { className: ui.pageTitle, style: eyebrow ? { marginTop: 4 } : void 0, children: title }),
      subtitle && /* @__PURE__ */ jsx("p", { className: ui.pageSub, children: subtitle })
    ] }),
    actions && /* @__PURE__ */ jsx("div", { className: ui.pageActions, children: actions })
  ] });
}
const Panel = forwardRef(({ accent, className, children, ...rest }, ref) => {
  const { ui } = useKit();
  return /* @__PURE__ */ jsx("div", { ref, className: cx(ui.panel, accent && ui.panelAccent, className), ...rest, children });
});
Panel.displayName = "Panel";
function SectionLabel({ children }) {
  const { ui } = useKit();
  return /* @__PURE__ */ jsx("h2", { className: ui.sectionLabel, children });
}
function ColumnLabel({ children }) {
  const { ui } = useKit();
  return /* @__PURE__ */ jsx("span", { className: ui.columnLabel, children });
}
function Button({ variant = "default", small, className, type = "button", title, ...rest }) {
  const { ui } = useKit();
  const button = /* @__PURE__ */ jsx(
    "button",
    {
      type,
      onMouseDown: preventFocusScroll,
      className: cx(ui.button, variant === "primary" && ui.buttonPrimary, variant === "danger" && ui.buttonDanger, small && ui.buttonSmall, className),
      ...rest
    }
  );
  return title ? /* @__PURE__ */ jsx(Tooltip, { title, children: button }) : button;
}
function Checkbox({ className, ...rest }) {
  const { ui } = useKit();
  return /* @__PURE__ */ jsx("input", { type: "checkbox", className: cx(ui.checkbox, className), ...rest });
}
function IconButton({ className, type = "button", ...rest }) {
  const { ui } = useKit();
  return /* @__PURE__ */ jsx("button", { type, onMouseDown: preventFocusScroll, className: cx(ui.iconButton, className), ...rest });
}
function Chip({ tone = "neutral", title, className, children }) {
  const { ui } = useKit();
  const toneClass = { neutral: void 0, sky: ui.chipSky, amber: ui.chipAmber, ok: ui.chipOk, bad: ui.chipBad }[tone];
  return /* @__PURE__ */ jsx(Tooltip, { title, children: /* @__PURE__ */ jsx("span", { className: cx(ui.chip, toneClass, className), children }) });
}
function StatusChip({ tone, dot, title, className, children }) {
  const s = useStatus();
  return /* @__PURE__ */ jsx(Tooltip, { title, children: /* @__PURE__ */ jsxs("span", { className: cx(s.status, s[tone], className), children: [
    dot && /* @__PURE__ */ jsx("i", { className: s.statusDot, "aria-hidden": true }),
    children
  ] }) });
}
function Pill({ ui, on, count, title, onClick, children, expanded }) {
  return /* @__PURE__ */ jsx(Tooltip, { title, children: /* @__PURE__ */ jsxs("button", { type: "button", "aria-pressed": on, "aria-haspopup": expanded === void 0 ? void 0 : "dialog", "aria-expanded": expanded, onMouseDown: preventFocusScroll, className: cx(ui.filterChip, on && ui.filterChipOn), onClick, children: [
    children,
    count !== void 0 && " ",
    count !== void 0 && /* @__PURE__ */ jsx("span", { className: cx(ui.filterCount, on && ui.filterCountOn), children: count })
  ] }) });
}
function FilterChips({
  label,
  hideLabel,
  options,
  value,
  onChange
}) {
  const ui = useControlsKit();
  return /* @__PURE__ */ jsxs("div", { className: ui.filterGroup, role: "group", "aria-label": label, children: [
    !hideLabel && /* @__PURE__ */ jsx("span", { className: ui.filterLabel, children: label }),
    options.map((o) => /* @__PURE__ */ jsx(Pill, { ui, on: o.id === value, count: o.count, title: o.title, onClick: () => onChange(o.id), children: o.label }, o.id))
  ] });
}
function FilterChip(props) {
  const ui = useControlsKit();
  return /* @__PURE__ */ jsx(Pill, { ui, ...props });
}
function FilterGroup({ label, hideLabel, children }) {
  const ui = useControlsKit();
  return /* @__PURE__ */ jsxs("div", { className: ui.filterGroup, role: "group", "aria-label": label, children: [
    !hideLabel && /* @__PURE__ */ jsx("span", { className: ui.filterLabel, children: label }),
    children
  ] });
}
function FilterSelect({
  label,
  value,
  options,
  onChange,
  disabled
}) {
  const ui = useControlsKit();
  return /* @__PURE__ */ jsxs("label", { className: ui.filterGroup, children: [
    /* @__PURE__ */ jsx("span", { className: ui.filterLabel, children: label }),
    /* @__PURE__ */ jsx("select", { className: ui.select, value, disabled, onChange: (e) => onChange(e.target.value), children: options.map((o) => /* @__PURE__ */ jsx("option", { value: o.value, children: o.label }, o.value)) })
  ] });
}
function FilterInput({ label, placeholder, value, onChange, width }) {
  const ui = useControlsKit();
  return /* @__PURE__ */ jsxs("label", { className: ui.filterGroup, children: [
    /* @__PURE__ */ jsx("span", { className: ui.filterLabel, children: label }),
    /* @__PURE__ */ jsx("input", { className: ui.filterInput, style: width ? { width } : void 0, placeholder, value, onChange: (e) => onChange(e.target.value) })
  ] });
}
function SearchField({ label, placeholder, value, onChange }) {
  const ui = useControlsKit();
  return /* @__PURE__ */ jsxs("div", { className: ui.search, children: [
    /* @__PURE__ */ jsx("svg", { className: ui.searchIcon, viewBox: "0 0 24 24", fill: "currentColor", "aria-hidden": true, children: /* @__PURE__ */ jsx("path", { d: "M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" }) }),
    /* @__PURE__ */ jsx("input", { type: "search", "aria-label": label, className: ui.searchInput, placeholder, value, onChange: (e) => onChange(e.target.value) })
  ] });
}
function FilterBar({ children, end }) {
  const ui = useControlsKit();
  return /* @__PURE__ */ jsxs("div", { className: ui.filterBar, children: [
    children,
    end && /* @__PURE__ */ jsx("div", { className: ui.filterBarEnd, children: end })
  ] });
}
function useTextLinkClass() {
  return useControlsKit().textLink;
}
function TextLink({
  href,
  onClick,
  title,
  expanded,
  disabled,
  "aria-label": ariaLabel,
  "aria-controls": ariaControls,
  children
}) {
  const ui = useControlsKit();
  if (href) {
    return /* @__PURE__ */ jsx(Tooltip, { title, children: /* @__PURE__ */ jsx("a", { className: ui.textLink, href, target: "_blank", rel: "noopener noreferrer", children }) });
  }
  return /* @__PURE__ */ jsx(Tooltip, { title, children: /* @__PURE__ */ jsxs("button", { type: "button", className: ui.textLink, "aria-expanded": expanded, "aria-label": ariaLabel, "aria-controls": ariaControls, disabled, onMouseDown: preventFocusScroll, onClick, children: [
    expanded !== void 0 && /* @__PURE__ */ jsx("span", { "aria-hidden": true, children: expanded ? "\u25BE" : "\u25B8" }),
    children
  ] }) });
}
function Subtabs({ label, tabs, value, onChange }) {
  const { ui } = useKit();
  return /* @__PURE__ */ jsx("div", { className: ui.subtabs, role: "tablist", "aria-label": label, children: tabs.map((tab) => /* @__PURE__ */ jsx("button", { type: "button", role: "tab", "aria-selected": tab.id === value, onMouseDown: preventFocusScroll, className: cx(ui.subtab, tab.id === value && ui.subtabOn), onClick: () => onChange(tab.id), children: tab.label }, tab.id)) });
}
function Field({ label, children }) {
  const { ui } = useKit();
  return /* @__PURE__ */ jsxs("label", { className: ui.field, children: [
    /* @__PURE__ */ jsx("span", { className: ui.fieldLabel, children: label }),
    children({ className: ui.input })
  ] });
}
function useInputClass() {
  const { ui } = useKit();
  return { input: ui.input, textarea: cx(ui.input, ui.textarea), problem: ui.problem };
}
function useSectionKit() {
  return useSection();
}
function Section({
  title,
  meta,
  count,
  actions,
  framed,
  level = 1,
  className,
  children,
  ...rest
}) {
  const s = useSectionKit();
  const Heading = level === 2 ? "h3" : "h2";
  return /* @__PURE__ */ jsxs("section", { className: cx(s.section, framed && s.framed, className), ...rest, children: [
    /* @__PURE__ */ jsxs("div", { className: cx(s.head, framed && s.headFramed), children: [
      /* @__PURE__ */ jsxs("div", { className: s.headStart, children: [
        /* @__PURE__ */ jsx(Heading, { className: cx(s.title, level === 2 && s.title2), children: title }),
        meta
      ] }),
      (count !== void 0 || actions) && /* @__PURE__ */ jsxs("div", { className: s.headEnd, children: [
        count !== void 0 && /* @__PURE__ */ jsx("span", { className: s.count, children: count }),
        actions
      ] })
    ] }),
    children
  ] });
}
function SectionTitle({ level = 1, children }) {
  const s = useSectionKit();
  const Heading = level === 2 ? "h3" : "h2";
  return /* @__PURE__ */ jsx(Heading, { className: cx(s.title, level === 2 && s.title2), children });
}
function EmptyNote({ inset, className, ...rest }) {
  const s = useSectionKit();
  return /* @__PURE__ */ jsx("p", { className: cx(s.empty, inset && s.inset, className), ...rest });
}
function Hint({ inset, className, ...rest }) {
  const s = useSectionKit();
  return /* @__PURE__ */ jsx("p", { className: cx(s.hint, inset && s.inset, className), ...rest });
}
function Count({ children }) {
  const s = useSectionKit();
  return /* @__PURE__ */ jsx("span", { className: s.count, children });
}
function useDataKit() {
  return useData();
}
function Fact({ label, inline, title, children }) {
  const d = useDataKit();
  return /* @__PURE__ */ jsxs("div", { className: cx(d.fact, inline && d.factInline), children: [
    /* @__PURE__ */ jsx("span", { className: d.factLabel, children: label }),
    /* @__PURE__ */ jsx(Tooltip, { title, children: /* @__PURE__ */ jsx("span", { className: cx(d.factValue, inline && d.factValueInline), children }) })
  ] });
}
function FactGrid({ min, row, className, children }) {
  const d = useDataKit();
  const columns = min !== void 0 && !row;
  return /* @__PURE__ */ jsx("div", { className: cx(d.factGrid, !columns && d.factRow, className), style: columns ? { gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` } : void 0, children });
}
function useTableKit() {
  const d = useDataKit();
  return { table: d.table, th: d.th, td: d.td, meta: d.cellMeta, rowLink: d.rowLink, rowSelected: d.rowSelected, dense: d.dense };
}
function useBlocksKit() {
  return useBlocks();
}
const Card = forwardRef(({ title, meta, actions, level = 2, accent, className, children, ...rest }, ref) => {
  const b = useBlocksKit();
  return /* @__PURE__ */ jsxs(Panel, { ref, accent, className: cx(b.card, className), ...rest, children: [
    (title !== void 0 || actions) && /* @__PURE__ */ jsxs("div", { className: b.cardHead, children: [
      /* @__PURE__ */ jsxs("div", { className: b.cardHeadStart, children: [
        title !== void 0 && /* @__PURE__ */ jsx(SectionTitle, { level, children: title }),
        meta
      ] }),
      actions && /* @__PURE__ */ jsx("div", { className: b.cardHeadEnd, children: actions })
    ] }),
    children
  ] });
});
Card.displayName = "Card";
function Tile({ className, children, ...rest }) {
  const b = useBlocksKit();
  return /* @__PURE__ */ jsx("div", { className: cx(b.tile, className), ...rest, children });
}
function Callout({
  tone,
  label,
  title,
  actions,
  className,
  children,
  ...rest
}) {
  const b = useBlocksKit();
  return /* @__PURE__ */ jsxs("div", { className: cx(b.callout, b[tone], className), role: tone === "bad" ? "alert" : "status", ...rest, children: [
    /* @__PURE__ */ jsxs("div", { className: b.calloutBody, children: [
      label !== void 0 && /* @__PURE__ */ jsx("span", { className: b.calloutLabel, children: label }),
      title !== void 0 && /* @__PURE__ */ jsx("p", { className: b.calloutTitle, children: title }),
      children !== void 0 && /* @__PURE__ */ jsx("div", { className: b.calloutText, children })
    ] }),
    actions && /* @__PURE__ */ jsx("div", { className: b.calloutActions, children: actions })
  ] });
}
function Stat({ label, value, caption, tone, title }) {
  const b = useBlocksKit();
  const toneClass = tone && { ok: b.statValueOk, info: b.statValueInfo, warn: b.statValueWarn, bad: b.statValueBad }[tone];
  return /* @__PURE__ */ jsxs("div", { className: b.stat, title, children: [
    /* @__PURE__ */ jsx("span", { className: b.statLabel, children: label }),
    /* @__PURE__ */ jsx("span", { className: cx(b.statValue, toneClass), children: value }),
    caption !== void 0 && /* @__PURE__ */ jsx("span", { className: b.statCaption, children: caption })
  ] });
}
function StatRow({ children }) {
  const b = useBlocksKit();
  return /* @__PURE__ */ jsx("div", { className: b.statRow, children });
}
function useLoad() {
  return useFeedback();
}
function Skeleton({ width = "100%", height = 12 }) {
  const f = useLoad();
  return /* @__PURE__ */ jsx("span", { className: f.bone, style: { width, height }, "aria-hidden": true });
}
function PanelSkeleton({ rows = 4, label, announce = true }) {
  const f = useLoad();
  return /* @__PURE__ */ jsxs("div", { className: f.skelPanel, role: announce ? "status" : void 0, "aria-label": announce ? label ?? "Loading" : void 0, children: [
    Array.from({ length: rows }, (_, i) => /* @__PURE__ */ jsxs("div", { className: f.skelRow, children: [
      /* @__PURE__ */ jsx(Skeleton, {}),
      /* @__PURE__ */ jsx(Skeleton, { width: `${85 - i * 9}%` }),
      /* @__PURE__ */ jsx(Skeleton, {})
    ] }, i)),
    label && /* @__PURE__ */ jsx("span", { className: f.skelCaption, children: label })
  ] });
}
function TabSkeleton({ label }) {
  const f = useLoad();
  return /* @__PURE__ */ jsxs("div", { style: { display: "flex", flexDirection: "column", gap: 16 }, role: "status", "aria-label": label ?? "Loading", children: [
    /* @__PURE__ */ jsx(Skeleton, { width: 200, height: 18 }),
    /* @__PURE__ */ jsx("div", { style: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }, children: [0, 1, 2].map((i) => /* @__PURE__ */ jsxs("div", { className: f.skelPanel, children: [
      /* @__PURE__ */ jsx(Skeleton, { width: "45%", height: 10 }),
      /* @__PURE__ */ jsx(Skeleton, { width: "70%", height: 16 })
    ] }, i)) }),
    /* @__PURE__ */ jsx(PanelSkeleton, { rows: 5, label, announce: false })
  ] });
}
const firstLine = (error) => (error instanceof Error ? error.message : String(error)).split("\n")[0];
function TabError({ error, what = "this tab", onRetry }) {
  const f = useLoad();
  const [open, setOpen] = useState(false);
  const full = error instanceof Error ? error.message : String(error);
  return /* @__PURE__ */ jsxs(Callout, { tone: "bad", title: `Couldn't load ${what}`, actions: onRetry ? /* @__PURE__ */ jsx(Button, { small: true, onClick: onRetry, children: "Retry" }) : void 0, children: [
    firstLine(error),
    full !== firstLine(error) && /* @__PURE__ */ jsxs("div", { children: [
      /* @__PURE__ */ jsx(TextLink, { expanded: open, onClick: () => setOpen((v) => !v), children: "Details" }),
      open && /* @__PURE__ */ jsx("div", { className: f.detail, children: full })
    ] })
  ] });
}
const KEY_RE = /^(\s*(?:- )?)("?[A-Za-z0-9_.\-/]+"?)(:)(\s.*)?$/;
const LIST_DASH_RE = /^(\s*)(- )(.*)$/;
function scalarColor(text, t) {
  const v = text.trim().replace(/,$/, "");
  if (v === "" || v === "{}" || v === "[]" || v === "|" || v === ">" || v === "null" || v === "~" || v.startsWith("#")) return t.textFaint;
  if (v === "true" || v === "false" || /^-?\d+(\.\d+)?$/.test(v)) return t.amberInk;
  return t.textHi;
}
function CodeLine({ text }) {
  const t = useClearanceTokens();
  if (/^\s*#/.test(text)) return /* @__PURE__ */ jsx("span", { style: { color: t.textFaint, fontStyle: "italic" }, children: text });
  const key = text.match(KEY_RE);
  if (key) {
    const [, prefix, name, colon, rest] = key;
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      prefix,
      /* @__PURE__ */ jsx("span", { style: { color: t.sky }, children: name }),
      colon,
      rest && /* @__PURE__ */ jsx("span", { style: { color: scalarColor(rest, t) }, children: rest })
    ] });
  }
  const dash = text.match(LIST_DASH_RE);
  if (dash) {
    const [, prefix, mark, rest] = dash;
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      prefix,
      /* @__PURE__ */ jsx("span", { style: { color: t.textFaint }, children: mark }),
      /* @__PURE__ */ jsx("span", { style: { color: scalarColor(rest, t) }, children: rest })
    ] });
  }
  return /* @__PURE__ */ jsx("span", { style: { color: scalarColor(text, t) }, children: text });
}
function CopyButton({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }).catch(() => {
    });
  };
  return /* @__PURE__ */ jsx(Button, { small: true, onClick: copy, "aria-label": "Copy to clipboard", children: copied ? "Copied" : "Copy" });
}
function YamlBlock({
  text,
  title,
  actions,
  copy = true,
  lineNumbers = false,
  maxHeight = 460,
  "aria-label": ariaLabel
}) {
  const f = useLoad();
  const lines = useMemo(() => text.replace(/\n$/, "").split("\n"), [text]);
  const head = title !== void 0 || actions !== void 0 || copy;
  return /* @__PURE__ */ jsxs("div", { className: f.codeWrap, children: [
    head && /* @__PURE__ */ jsxs("div", { className: f.codeHead, children: [
      title !== void 0 && /* @__PURE__ */ jsx("span", { className: f.codeTitle, children: title }),
      /* @__PURE__ */ jsx("span", { className: f.spacer }),
      actions,
      copy && /* @__PURE__ */ jsx(CopyButton, { text })
    ] }),
    /* @__PURE__ */ jsx("div", { className: f.codeBox, style: { maxHeight }, "aria-label": ariaLabel, role: ariaLabel ? "region" : void 0, children: lines.map((line, i) => /* @__PURE__ */ jsxs("div", { className: f.codeLine, children: [
      lineNumbers && /* @__PURE__ */ jsx("span", { className: f.lineNo, children: i + 1 }),
      /* @__PURE__ */ jsx("span", { className: cx(f.lineText, !lineNumbers && f.lineTextNoGutter), children: /* @__PURE__ */ jsx(CodeLine, { text: line }) })
    ] }, i)) })
  ] });
}

export { ActionReason, Button, Callout, Card, Checkbox, Chip, ColumnLabel, CopyButton, Count, EmptyNote, Fact, FactGrid, Field, FilterBar, FilterChip, FilterChips, FilterGroup, FilterInput, FilterSelect, Hint, IconButton, PageHeader, Panel, PanelSkeleton, SearchField, Section, SectionLabel, SectionTitle, Skeleton, Stat, StatRow, StatusChip, Subtabs, TabError, TabSkeleton, TextLink, Tile, Tooltip, YamlBlock, useInputClass, useTableKit, useTextLinkClass };
//# sourceMappingURL=kit.esm.js.map
