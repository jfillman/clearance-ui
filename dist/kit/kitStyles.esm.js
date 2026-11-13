import { makeStyles } from '@material-ui/core/styles';
import { tokensForTheme, fontScale, fontBody, fontMono, fontDisplay } from './tokens.esm.js';

const useUi = makeStyles((theme) => {
  const t = tokensForTheme(theme);
  return {
    // ---- page chrome
    pageHead: { display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16, flexWrap: "wrap", marginBottom: 14 },
    pageTitle: { margin: 0, fontFamily: fontDisplay, fontWeight: 700, fontSize: fontScale.x2, lineHeight: 1.1, color: t.textHi },
    pageSub: { margin: "4px 0 0", fontFamily: fontBody, fontSize: fontScale.md, color: t.textLo, maxWidth: 760 },
    pageActions: { display: "flex", gap: 8, alignItems: "center" },
    eyebrow: { display: "flex", alignItems: "center", gap: 8, fontFamily: fontMono, fontWeight: 600, fontSize: fontScale.xs, letterSpacing: "0.1em", textTransform: "uppercase", color: t.textLo },
    // ---- surfaces
    panel: { backgroundColor: t.panel, border: `1px solid ${t.line}`, borderRadius: 6, minWidth: 0 },
    panelAccent: { borderColor: t.amberLine },
    sectionLabel: { margin: 0, fontFamily: fontMono, fontWeight: 600, fontSize: fontScale.xs, letterSpacing: "0.1em", textTransform: "uppercase", color: t.textLo },
    columnLabel: { fontFamily: fontMono, fontWeight: 500, fontSize: fontScale.xs, letterSpacing: "0.1em", textTransform: "uppercase", color: t.textLo },
    // ---- controls
    checkbox: { accentColor: t.amber, width: 15, height: 15, margin: 0, cursor: "pointer", verticalAlign: "middle", "&:disabled": { cursor: "default", opacity: 0.5 } },
    button: {
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 5,
      fontFamily: fontBody,
      fontSize: fontScale.md,
      fontWeight: 500,
      lineHeight: 1.2,
      padding: "7px 13px",
      borderRadius: 5,
      border: `1px solid ${t.line}`,
      backgroundColor: t.panelAlt,
      color: t.textHi,
      cursor: "pointer",
      "&:hover:not(:disabled)": { borderColor: t.textFaint },
      "&:disabled": { opacity: 0.45, cursor: "default" },
      "&:focus-visible": { outline: `2px solid ${t.sky}`, outlineOffset: 1 }
    },
    // A clean amber fill with an `amber` edge; hover and press are colour steps; disabled goes grey, not translucent amber.
    buttonPrimary: {
      backgroundColor: t.amberFill,
      borderColor: t.amber,
      color: t.onAmber,
      fontWeight: 600,
      "&:hover:not(:disabled)": { backgroundColor: t.amberFillHover, borderColor: t.amber },
      "&:active:not(:disabled)": { backgroundColor: t.amberFillPress },
      "&:disabled": { opacity: 1, backgroundColor: t.panelAlt, borderColor: t.line, color: t.textFaint }
    },
    buttonDanger: { backgroundColor: "transparent", borderColor: t.bad, color: t.bad, "&:hover:not(:disabled)": { borderColor: t.bad } },
    buttonSmall: { padding: "4px 9px", fontSize: fontScale.sm },
    iconButton: {
      width: 22,
      height: 22,
      display: "inline-grid",
      placeItems: "center",
      padding: 0,
      border: `1px solid ${t.line}`,
      borderRadius: 4,
      backgroundColor: "transparent",
      color: t.textLo,
      fontFamily: fontMono,
      fontWeight: 600,
      fontSize: fontScale.sm,
      cursor: "pointer",
      "&:hover:not(:disabled)": { color: t.textHi, borderColor: t.textFaint },
      "&:disabled": { opacity: 0.35, cursor: "default" },
      "&:focus-visible": { outline: `2px solid ${t.sky}`, outlineOffset: 1 }
    },
    // ---- chips: a label (what it is). Square; a status (what state it is in) is rounded, see useStatus.
    chip: {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      fontFamily: fontMono,
      fontWeight: 500,
      fontSize: fontScale.xs,
      lineHeight: 1,
      padding: "4px 7px",
      border: `1px solid ${t.line}`,
      borderRadius: 4,
      color: t.textLo,
      whiteSpace: "nowrap",
      verticalAlign: "middle"
    },
    chipSky: { color: t.sky, borderColor: t.skyLine },
    chipAmber: { color: t.amberText, borderColor: t.amberLine },
    chipOk: { color: t.good, borderColor: t.good },
    chipBad: { color: t.bad, borderColor: t.bad },
    // ---- sub-tabs (a page's own tab bar)
    subtabs: { display: "flex", gap: 2, borderBottom: `1px solid ${t.line}` },
    subtab: {
      fontFamily: fontDisplay,
      fontWeight: 600,
      fontSize: fontScale.md,
      padding: "9px 14px",
      marginBottom: -1,
      border: 0,
      borderBottom: "2px solid transparent",
      backgroundColor: "transparent",
      color: t.textLo,
      cursor: "pointer",
      "&:focus-visible": { outline: `2px solid ${t.sky}`, outlineOffset: -2 }
    },
    subtabOn: { color: t.textHi, borderBottomColor: t.amber },
    // ---- form fields
    field: { display: "flex", flexDirection: "column", gap: 5, minWidth: 0 },
    fieldLabel: { display: "flex", justifyContent: "space-between", gap: 8, fontFamily: fontBody, fontSize: fontScale.sm, fontWeight: 500, color: t.textLo },
    input: {
      width: "100%",
      boxSizing: "border-box",
      backgroundColor: t.bg,
      border: `1px solid ${t.line}`,
      borderRadius: 4,
      color: t.textHi,
      padding: "8px 10px",
      fontFamily: fontMono,
      fontSize: fontScale.md,
      "&::placeholder": { fontFamily: fontBody, fontStyle: "italic", color: t.textFaint, opacity: 0.85 },
      "&:focus": { outline: "none", borderColor: t.sky }
    },
    textarea: { minHeight: 72, resize: "vertical" },
    problem: { fontSize: fontScale.sm, color: t.bad }
  };
});
const useControls = makeStyles((theme) => {
  const t = tokensForTheme(theme);
  return {
    // A FilterBar has no margin of its own: the page body (a 16px column gap) or the panel padding spaces it.
    // Filters: what a view shows. Separate pills; the one that is on is amber. Never used for an action.
    filterBar: { display: "flex", alignItems: "center", gap: "10px 18px", flexWrap: "wrap" },
    filterBarEnd: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" },
    filterGroup: { display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
    filterLabel: { fontFamily: fontBody, fontSize: fontScale.sm, color: t.textFaint, marginRight: 2 },
    filterChip: {
      display: "inline-flex",
      alignItems: "center",
      gap: 6,
      fontFamily: fontMono,
      fontWeight: 500,
      fontSize: fontScale.xs,
      lineHeight: 1.2,
      padding: "5px 10px",
      borderRadius: 6,
      border: `1px solid ${t.line}`,
      backgroundColor: t.panel,
      color: t.textLo,
      cursor: "pointer",
      whiteSpace: "nowrap",
      "&:hover:not(:disabled)": { borderColor: t.textFaint, color: t.textHi },
      "&:disabled": { opacity: 0.45, cursor: "default" },
      "&:focus-visible": { outline: `2px solid ${t.sky}`, outlineOffset: 1 }
    },
    filterChipOn: {
      borderColor: t.amberLine,
      backgroundColor: t.amberSoft,
      color: t.amberInk,
      "&:hover:not(:disabled)": { borderColor: t.amber, color: t.amberInk }
    },
    filterCount: { color: t.textFaint },
    filterCountOn: { color: t.amberInk, opacity: 0.75 },
    select: {
      fontFamily: fontMono,
      fontWeight: 500,
      fontSize: fontScale.xs,
      lineHeight: 1.2,
      padding: "5px 8px",
      borderRadius: 6,
      border: `1px solid ${t.line}`,
      backgroundColor: t.panel,
      color: t.textHi,
      cursor: "pointer",
      "&:focus-visible": { outline: `2px solid ${t.sky}`, outlineOffset: 1 }
    },
    // A text filter (a tool name, a rule id): labelled like the other filters, a field styled like the select pill.
    filterInput: {
      fontFamily: fontMono,
      fontSize: fontScale.xs,
      lineHeight: 1.2,
      padding: "5px 8px",
      borderRadius: 6,
      border: `1px solid ${t.line}`,
      backgroundColor: t.panel,
      color: t.textHi,
      width: 150,
      "&::placeholder": { color: t.textFaint },
      "&:focus": { outline: "none", borderColor: t.sky }
    },
    search: { position: "relative", display: "flex", alignItems: "center", flex: "1 1 240px", minWidth: 200 },
    searchIcon: { position: "absolute", left: 10, width: 16, height: 16, color: t.textFaint, pointerEvents: "none" },
    searchInput: {
      width: "100%",
      boxSizing: "border-box",
      fontFamily: fontBody,
      fontSize: fontScale.md,
      padding: "6px 10px 6px 32px",
      borderRadius: 6,
      border: `1px solid ${t.line}`,
      backgroundColor: t.panel,
      color: t.textHi,
      "&::placeholder": { color: t.textFaint },
      "&:focus": { outline: "none", borderColor: t.sky }
    },
    // Links: go somewhere or show/hide a detail. Text, never a box.
    textLink: {
      display: "inline-flex",
      alignItems: "center",
      gap: 4,
      fontFamily: fontMono,
      fontSize: fontScale.sm,
      color: t.sky,
      background: "none",
      border: 0,
      padding: 0,
      cursor: "pointer",
      textDecoration: "none",
      "&:hover": { textDecoration: "underline" },
      "&:focus-visible": { outline: `2px solid ${t.sky}`, outlineOffset: 2 }
    }
  };
});
const useStatus = makeStyles((theme) => {
  const t = tokensForTheme(theme);
  return {
    status: {
      display: "inline-flex",
      alignItems: "center",
      gap: 5,
      fontFamily: fontMono,
      fontWeight: 500,
      fontSize: fontScale.xs,
      lineHeight: 1.3,
      padding: "2px 9px",
      borderRadius: 11,
      border: "1px solid",
      whiteSpace: "nowrap",
      verticalAlign: "middle"
    },
    statusButton: {
      cursor: "pointer",
      "&:hover": { filter: "brightness(0.97)" },
      "&:focus-visible": { outline: `2px solid ${t.sky}`, outlineOffset: 1 }
    },
    statusDot: { width: 6, height: 6, borderRadius: "50%", backgroundColor: "currentColor", flexShrink: 0 },
    ok: { color: t.good, backgroundColor: t.goodSoft, borderColor: t.good },
    warn: { color: t.amberInk, backgroundColor: t.amberSoft, borderColor: t.amberLine },
    bad: { color: t.bad, backgroundColor: t.badSoft, borderColor: t.bad },
    info: { color: t.sky, backgroundColor: t.skySoft, borderColor: t.skyLine },
    neutral: { color: t.textLo, backgroundColor: t.panelAlt, borderColor: t.line }
  };
});
const useSection = makeStyles((theme) => {
  const t = tokensForTheme(theme);
  return {
    section: { display: "flex", flexDirection: "column", gap: 10, minWidth: 0 },
    framed: { gap: 0, backgroundColor: t.panel, border: `1px solid ${t.line}`, borderRadius: 6, overflow: "hidden" },
    head: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: "6px 12px", flexWrap: "wrap", minWidth: 0 },
    headFramed: { padding: "12px 18px", borderBottom: `1px solid ${t.lineSoft}` },
    headStart: { display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", minWidth: 0 },
    headEnd: { display: "flex", alignItems: "center", gap: 12, marginLeft: "auto" },
    title: { margin: 0, fontFamily: fontDisplay, fontWeight: 700, fontSize: fontScale.lg, lineHeight: 1.3, color: t.textHi },
    title2: { fontSize: fontScale.md },
    count: { fontFamily: fontMono, fontSize: fontScale.xs, color: t.textFaint, whiteSpace: "nowrap" },
    empty: { margin: 0, fontFamily: fontBody, fontSize: fontScale.sm, fontStyle: "italic", lineHeight: 1.5, color: t.textLo },
    hint: { margin: 0, fontFamily: fontBody, fontSize: fontScale.sm, lineHeight: 1.5, color: t.textLo },
    inset: { padding: "12px 18px" }
  };
});
const columnLabelLook = { fontFamily: fontMono, fontWeight: 500, fontSize: fontScale.xs, letterSpacing: "0.1em", textTransform: "uppercase" };
const useData = makeStyles((theme) => {
  const t = tokensForTheme(theme);
  return {
    factGrid: { display: "grid", gap: "12px 24px", minWidth: 0 },
    factRow: { display: "flex", flexWrap: "wrap", gap: "12px 32px", "& > *": { flex: "0 1 auto", maxWidth: "100%" } },
    fact: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0 },
    factInline: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "baseline",
      gap: 12,
      padding: "5px 0",
      borderBottom: `1px solid ${t.lineSoft}`,
      "&:last-child": { borderBottom: "none" }
    },
    factLabel: { ...columnLabelLook, color: t.textLo, whiteSpace: "nowrap" },
    factValue: { fontFamily: fontMono, fontSize: fontScale.sm, lineHeight: 1.4, color: t.textHi, overflowWrap: "anywhere", minWidth: 0 },
    factValueInline: { textAlign: "right" },
    table: { width: "100%", borderCollapse: "collapse", "& tbody tr:last-child td": { borderBottom: "none" } },
    th: {
      ...columnLabelLook,
      textAlign: "left",
      color: t.textLo,
      padding: "8px 14px",
      borderBottom: `1px solid ${t.line}`,
      whiteSpace: "nowrap",
      "&:first-child": { paddingLeft: 18 },
      "&:last-child": { paddingRight: 18 }
    },
    td: {
      fontFamily: fontBody,
      fontSize: fontScale.md,
      padding: "9px 14px",
      borderBottom: `1px solid ${t.lineSoft}`,
      color: t.textHi,
      verticalAlign: "top",
      "&:first-child": { paddingLeft: 18 },
      "&:last-child": { paddingRight: 18 }
    },
    // A secondary line or a mono value inside a cell.
    cellMeta: { fontFamily: fontMono, fontSize: fontScale.sm, color: t.textLo, overflowWrap: "anywhere" },
    rowLink: { cursor: "pointer", "&:hover": { backgroundColor: t.panelAlt } },
    rowSelected: { backgroundColor: t.panelAlt },
    dense: {
      "& th": { padding: "4px 12px 6px 0", "&:first-child": { paddingLeft: 0 }, "&:last-child": { paddingRight: 0 } },
      "& td": { padding: "6px 12px 6px 0", fontFamily: fontMono, fontSize: fontScale.sm, verticalAlign: "top", "&:first-child": { paddingLeft: 0 }, "&:last-child": { paddingRight: 0 } }
    }
  };
});
const useBlocks = makeStyles((theme) => {
  const t = tokensForTheme(theme);
  return {
    card: { padding: "14px 18px", display: "flex", flexDirection: "column", gap: 10, minWidth: 0 },
    cardHead: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: "6px 12px", flexWrap: "wrap" },
    cardHeadStart: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 },
    cardHeadEnd: { display: "flex", alignItems: "center", gap: 8, marginLeft: "auto" },
    tile: { backgroundColor: t.panelAlt, border: `1px solid ${t.lineSoft}`, borderRadius: 4, padding: "8px 10px", minWidth: 0 },
    callout: { display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 14px", borderRadius: 6, border: "1px solid" },
    calloutBody: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 },
    calloutTitle: { margin: 0, fontFamily: fontDisplay, fontWeight: 700, fontSize: fontScale.md, lineHeight: 1.35 },
    calloutText: { fontFamily: fontBody, fontSize: fontScale.sm, lineHeight: 1.5, color: t.textHi },
    calloutActions: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 },
    info: { color: t.sky, backgroundColor: t.skySoft, borderColor: t.skyLine },
    warn: { color: t.amberInk, backgroundColor: t.amberSoft, borderColor: t.amberLine },
    bad: { color: t.bad, backgroundColor: t.badSoft, borderColor: t.bad },
    ok: { color: t.good, backgroundColor: t.goodSoft, borderColor: t.good },
    neutral: { color: t.textLo, backgroundColor: t.panelAlt, borderColor: t.line },
    calloutLabel: { fontFamily: fontMono, fontWeight: 500, fontSize: fontScale.xs, letterSpacing: "0.1em", textTransform: "uppercase" },
    stat: { display: "flex", flexDirection: "column", gap: 3, minWidth: 0 },
    statLabel: { fontFamily: fontMono, fontWeight: 500, fontSize: fontScale.xs, letterSpacing: "0.1em", textTransform: "uppercase", color: t.textLo },
    statValue: { fontFamily: fontDisplay, fontWeight: 700, fontSize: fontScale.x2, lineHeight: 1.1, color: t.textHi, overflowWrap: "anywhere" },
    statValueOk: { color: t.good },
    statValueInfo: { color: t.sky },
    statValueWarn: { color: t.amberInk },
    statValueBad: { color: t.bad },
    statCaption: { fontFamily: fontMono, fontSize: fontScale.xs, color: t.textFaint },
    // A row of Stats, each in a Card.
    statRow: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 16 }
  };
});
const useFeedback = makeStyles((theme) => {
  const t = tokensForTheme(theme);
  return {
    tip: {
      backgroundColor: t.textHi,
      color: t.bg,
      fontFamily: fontBody,
      fontSize: fontScale.sm,
      lineHeight: 1.45,
      padding: "8px 10px",
      borderRadius: 6,
      maxWidth: 340,
      whiteSpace: "pre-line",
      boxShadow: "0 10px 28px rgba(0,0,0,0.25)"
    },
    reason: {
      display: "flex",
      alignItems: "flex-start",
      gap: 8,
      padding: "8px 12px",
      borderRadius: 4,
      border: `1px solid ${t.lineSoft}`,
      backgroundColor: t.panelAlt,
      color: t.textHi,
      fontFamily: fontBody,
      fontSize: fontScale.md,
      lineHeight: 1.45
    },
    reasonIcon: { fontFamily: fontMono, fontSize: fontScale.sm, marginTop: 1, color: t.textLo, flexShrink: 0 },
    bone: {
      display: "block",
      borderRadius: 4,
      backgroundColor: t.panelAlt,
      backgroundImage: `linear-gradient(90deg, ${t.panelAlt} 0%, ${t.lineSoft} 50%, ${t.panelAlt} 100%)`,
      backgroundSize: "200% 100%",
      animation: "$shimmer 1.6s ease-in-out infinite",
      "@media (prefers-reduced-motion: reduce)": { animation: "none" }
    },
    "@keyframes shimmer": { "0%": { backgroundPosition: "100% 0" }, "100%": { backgroundPosition: "-100% 0" } },
    skelPanel: { padding: 14, borderRadius: 6, border: `1px solid ${t.lineSoft}`, backgroundColor: t.panel, display: "flex", flexDirection: "column", gap: 12 },
    skelRow: { display: "grid", gridTemplateColumns: "90px 1fr 140px", gap: 12 },
    skelCaption: { fontFamily: fontMono, fontSize: fontScale.xs, color: t.textLo },
    detail: { fontFamily: fontMono, fontSize: fontScale.sm, color: t.textLo, overflowWrap: "anywhere", marginTop: 6 },
    codeWrap: { display: "flex", flexDirection: "column", gap: 8, minWidth: 0 },
    codeHead: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
    codeTitle: { fontFamily: fontMono, fontSize: fontScale.sm, color: t.textLo, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    spacer: { flex: 1 },
    codeBox: { borderRadius: 4, border: `1px solid ${t.lineSoft}`, backgroundColor: t.bg, overflow: "auto", fontFamily: fontMono, fontSize: fontScale.xs, lineHeight: 1.6, padding: "6px 0" },
    codeLine: { display: "flex" },
    lineNo: { flexShrink: 0, width: 40, textAlign: "right", paddingRight: 10, color: t.textFaint, opacity: 0.6, userSelect: "none" },
    lineText: { whiteSpace: "pre", paddingRight: 12, minWidth: 0 },
    lineTextNoGutter: { paddingLeft: 12 }
  };
});
const useTiers = makeStyles((theme) => {
  const t = tokensForTheme(theme);
  return {
    anchor: { position: "relative", display: "inline-block" },
    popover: {
      position: "absolute",
      top: "100%",
      left: 0,
      marginTop: 6,
      width: "min(560px, calc(100vw - 48px))",
      backgroundColor: t.panel,
      border: `1px solid ${t.line}`,
      borderRadius: 8,
      boxShadow: "0 16px 40px rgba(0,0,0,0.28)",
      zIndex: 10,
      overflow: "hidden"
    },
    popHead: { padding: "12px 14px", borderBottom: `1px solid ${t.line}`, display: "flex", gap: 10, alignItems: "baseline", flexWrap: "wrap" },
    popTitle: { fontFamily: fontDisplay, fontWeight: 700, fontSize: fontScale.lg, color: t.textHi, margin: 0 },
    popSub: { fontFamily: fontBody, fontSize: fontScale.sm, color: t.textLo, flex: "1 1 220px" },
    row: {
      display: "flex",
      gap: 10,
      alignItems: "flex-start",
      padding: "9px 14px",
      borderBottom: `1px solid ${t.lineSoft}`,
      cursor: "pointer",
      "&:hover": { backgroundColor: t.panelAlt }
    },
    rowOn: { backgroundColor: t.amberSoft, "&:hover": { backgroundColor: t.amberSoft } },
    rowBody: { flex: 1, minWidth: 0 },
    rowName: { fontFamily: fontDisplay, fontWeight: 600, fontSize: fontScale.md, color: t.textHi },
    rowMeta: { fontFamily: fontBody, fontSize: fontScale.sm, color: t.textLo, marginTop: 2, lineHeight: 1.4 },
    rowEnd: { flex: "0 0 150px", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4, textAlign: "right" },
    rowCount: { fontFamily: fontMono, fontSize: fontScale.xs, color: t.textFaint },
    popFoot: { padding: "10px 14px", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", borderTop: `1px solid ${t.line}` },
    popNote: { padding: "9px 14px", backgroundColor: t.panelAlt, borderTop: `1px solid ${t.line}`, fontFamily: fontBody, fontSize: fontScale.sm, color: t.textLo },
    keyHead: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", padding: "8px 14px", borderBottom: `1px solid ${t.line}` },
    keyStrip: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", borderBottom: `1px solid ${t.line}` },
    keyCell: { padding: "10px 12px", display: "flex", flexDirection: "column", gap: 4, borderRight: `1px solid ${t.lineSoft}`, minWidth: 0 },
    keyTop: { display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" },
    keyName: { fontFamily: fontDisplay, fontWeight: 600, fontSize: fontScale.sm, color: t.textHi },
    keyBadges: { display: "flex", gap: 8, flexWrap: "wrap", padding: "8px 14px", borderBottom: `1px solid ${t.line}` },
    tipTitle: { fontWeight: 600, marginBottom: 4 },
    tipLine: { marginTop: 4 },
    tipDim: { opacity: 0.75, marginTop: 6 },
    badge: { display: "inline-flex", cursor: "default", "&:focus-visible": { outline: `2px solid ${t.sky}`, outlineOffset: 2, borderRadius: 4 } },
    mix: { display: "flex", height: 10, borderRadius: 3, overflow: "hidden", backgroundColor: t.line, gap: 1 },
    seg: { display: "block", height: "100%" },
    seg0: { backgroundColor: t.textFaint },
    seg1: { backgroundColor: t.sky },
    seg2: { backgroundColor: t.amber },
    seg3: { backgroundColor: t.bad },
    mixLegend: { display: "flex", gap: 14, flexWrap: "wrap", fontFamily: fontMono, fontSize: fontScale.xs, color: t.textLo },
    mixItem: { display: "inline-flex", gap: 6, alignItems: "center" }
  };
});

export { useBlocks, useControls, useData, useFeedback, useSection, useStatus, useTiers, useUi };
//# sourceMappingURL=kitStyles.esm.js.map
