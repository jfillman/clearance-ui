import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useRef, useEffect, useState, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useClearanceTokens, fontBody } from '../../kit/tokens.esm.js';
import { TextLink, Tooltip, StatusChip } from '../../kit/kit.esm.js';
import '../../kit/components.esm.js';
import '../../kit/FlightLog.esm.js';
import '../../kit/transport.esm.js';
import '../../kit/coverage.esm.js';
import '../../kit/Pager.esm.js';
import '@material-ui/core/Popper';
import '../../kit/kitStyles.esm.js';
import '../../kit/ExpandRow.esm.js';
import { ROW_CAP, gateWords, COVERAGE_ORDER } from './model.esm.js';
import { statusColor, coverageColors, statusWord, mixWords, CoverageMix, statusTone } from './parts.esm.js';
import { placePopover } from './layout.esm.js';
import { useMapStyles } from './styles.esm.js';
import { useHoverIntent } from './useHoverIntent.esm.js';

const nodeName = (id) => id.startsWith("gate:") ? gateWords(id.slice(5)).name : id;
const keys = (act) => (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    act(e.currentTarget);
  }
};
const fmt = (n) => n.toLocaleString();
const clip = (s, n) => s.length > n ? `${s.slice(0, n - 1)}\u2026` : s;
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const modeWords = (m) => [m.enforce > 0 && `${m.enforce} enforce`, m.flag > 0 && `${m.flag} flag`, m.silent > 0 && `${m.silent} silent`].filter(Boolean).join(" \xB7 ");
function MixBar({ t, mix, x, y, w }) {
  const total = mix.enforce + mix.flag + mix.silent;
  const seg = [
    { n: mix.enforce, fill: t.good },
    { n: mix.flag, fill: t.amber },
    { n: mix.silent, fill: t.textFaint }
  ];
  let at = x;
  return /* @__PURE__ */ jsxs("g", { children: [
    /* @__PURE__ */ jsx("rect", { x, y, width: w, height: 6, rx: 3, fill: t.lineSoft }),
    total > 0 && seg.filter((s) => s.n > 0).map((s, i) => {
      const sw = w * s.n / total;
      const r = /* @__PURE__ */ jsx("rect", { x: at, y, width: sw, height: 6, fill: s.fill }, i);
      at += sw;
      return r;
    })
  ] });
}
function CoverageBar({ t, coverage, x, y, w }) {
  const colors = coverageColors(t);
  const order = [...COVERAGE_ORDER, ...Object.keys(coverage).filter((k) => !COVERAGE_ORDER.includes(k))];
  const total = order.reduce((n, k) => n + (coverage[k] ?? 0), 0);
  let at = x;
  return /* @__PURE__ */ jsxs("g", { children: [
    /* @__PURE__ */ jsx("rect", { x, y, width: w, height: 7, rx: 3, fill: t.lineSoft }),
    total > 0 && order.filter((k) => coverage[k]).map((k) => {
      const sw = w * coverage[k] / total;
      const r = /* @__PURE__ */ jsx("rect", { x: at, y, width: sw, height: 7, fill: colors[k] ?? t.line }, k);
      at += sw;
      return r;
    })
  ] });
}
function hoverProps(sel, h) {
  return {
    onMouseEnter: (e) => h.on(sel, e.currentTarget),
    onMouseLeave: () => h.off(),
    onFocus: (e) => h.on(sel, e.currentTarget),
    onBlur: (e) => {
      if (!h.within(e.relatedTarget)) h.off();
    }
  };
}
function GateNode({ v, t, h, onSel }) {
  const c = useMapStyles();
  const n = v.node;
  const label = `Gate type ${v.name}: ${n.instances} instances guarding ${n.targets} targets, ${mixWords(n.mix)}, ${fmt(n.decisions)} decisions, ${n.refused} refused, ${n.holding} holding, status ${statusWord(n.status)}`;
  const sel = { kind: "gate", id: n.id };
  const modes = modeWords(n.mix);
  return /* @__PURE__ */ jsxs("g", { className: `${c.node} ${v.dim ? c.nodeDim : ""}`, role: "button", tabIndex: 0, "aria-label": label, ...hoverProps(sel, h), onClick: (e) => onSel(sel, e.currentTarget), onKeyDown: keys((el) => onSel(sel, el)), "data-testid": `gate-${n.type}`, children: [
    /* @__PURE__ */ jsx("rect", { className: "frame", x: v.x, y: v.y, width: v.w, height: v.h, rx: 6 }),
    /* @__PURE__ */ jsx("circle", { cx: v.x + v.w - 14, cy: v.y + 15, r: 5, fill: statusColor(t, n.status) }),
    /* @__PURE__ */ jsx("text", { className: c.nodeKind, x: v.x + 12, y: v.y + 19, children: clip(`${v.kind} \xB7 ${plural(n.instances, "instance")}`, 29) }),
    /* @__PURE__ */ jsx("text", { className: c.nodeName, x: v.x + 12, y: v.y + 40, children: clip(v.name, 30) }),
    /* @__PURE__ */ jsx(MixBar, { t, mix: n.mix, x: v.x + 12, y: v.y + 50, w: v.w - 24 }),
    /* @__PURE__ */ jsxs("text", { className: c.nodeText, x: v.x + 12, y: v.y + 71, children: [
      fmt(n.decisions),
      " dec \xB7 ",
      n.refused,
      " refused"
    ] }),
    /* @__PURE__ */ jsx("text", { className: c.nodeText, x: v.x + 12, y: v.y + 89, children: modes || "no instances" }),
    n.holding > 0 && /* @__PURE__ */ jsxs("text", { className: c.nodeAmber, x: v.x + v.w - 12, y: v.y + 89, textAnchor: "end", children: [
      n.holding,
      " holding"
    ] })
  ] });
}
function RowNode({ r, t, group, h, onOpen }) {
  const c = useMapStyles();
  const n = r.target;
  const pct = n.verified_pct === null ? "no coverage" : `${Math.round(n.verified_pct)}% verified`;
  const short = n.verified_pct === null ? "none" : `${Math.round(n.verified_pct)}%`;
  const sel = { kind: "target", id: n.id };
  const meta = [n.kind, n.env, n.registry].filter(Boolean).join(" \xB7 ");
  return /* @__PURE__ */ jsxs("g", { className: `${c.row} ${r.dim ? c.nodeDim : ""}`, role: "link", tabIndex: 0, "aria-label": `Open ${n.name} in ${group.node.group}: ${pct}, ${n.holding} holding, status ${statusWord(n.status)}`, style: { cursor: "pointer", outline: "none" }, ...hoverProps(sel, h), onClick: () => onOpen(n.id), onKeyDown: keys(() => onOpen(n.id)), "data-testid": `target-${n.id}`, children: [
    /* @__PURE__ */ jsx("rect", { className: "rowFrame", x: r.x, y: r.y, width: r.w, height: r.h, rx: 4 }),
    /* @__PURE__ */ jsx("circle", { cx: r.x + 12, cy: r.y + 15, r: 4, fill: statusColor(t, n.status) }),
    /* @__PURE__ */ jsx("text", { className: c.nodeStrong, x: r.x + 24, y: r.y + 19, children: clip(n.name, 22) }),
    /* @__PURE__ */ jsxs("text", { className: n.holding > 0 ? c.nodeAmber : c.nodeText, x: r.x + r.w - 10, y: r.y + 19, textAnchor: "end", children: [
      n.holding > 0 ? `${n.holding} hold \xB7 ` : "",
      short
    ] }),
    /* @__PURE__ */ jsx("text", { className: c.nodeKind, x: r.x + 24, y: r.y + 35, children: clip(meta, 38) })
  ] });
}
function GroupNodeView({ v, t, h, onToggle, onOpen }) {
  const c = useMapStyles();
  const n = v.node;
  const pct = n.verified_pct === null ? "no coverage" : `${Math.round(n.verified_pct)}% verified`;
  const sel = { kind: "group", id: n.id };
  const label = `Group ${n.group}: ${v.targets.length} targets, ${pct}, ${n.no_gate} with no gate, ${n.holding} holding, status ${statusWord(n.status)}. ${v.expanded ? "Expanded" : "Collapsed"}`;
  const kinds = Object.entries(n.kinds).map(([k, x]) => `${x} ${k}`).join(" \xB7 ") || plural(v.targets.length, "target");
  const sub = [kinds, ...v.registries, ...v.envs].join(" \xB7 ");
  return /* @__PURE__ */ jsxs("g", { className: v.dim ? c.nodeDim : void 0, "data-testid": `group-${n.group}`, children: [
    /* @__PURE__ */ jsxs("g", { className: c.node, role: "button", tabIndex: 0, "aria-expanded": v.expanded, "aria-label": label, ...hoverProps(sel, h), onClick: () => onToggle(n.group), onKeyDown: keys(() => onToggle(n.group)), children: [
      /* @__PURE__ */ jsx("rect", { className: "frame", x: v.x, y: v.y, width: v.w, height: v.head, rx: 6 }),
      /* @__PURE__ */ jsx("circle", { cx: v.x + v.w - 14, cy: v.y + 16, r: 5, fill: statusColor(t, n.status) }),
      /* @__PURE__ */ jsxs("text", { className: c.nodeTitle, x: v.x + 12, y: v.y + 21, children: [
        v.expanded ? "\u25BE" : "\u25B8",
        " ",
        clip(n.group, 24)
      ] }),
      /* @__PURE__ */ jsxs("text", { className: c.nodeKind, x: v.x + 12, y: v.y + 38, children: [
        clip(sub, 37),
        v.matches > 0 ? ` \xB7 ${v.matches} match` : ""
      ] }),
      /* @__PURE__ */ jsx(CoverageBar, { t, coverage: n.coverage, x: v.x + 12, y: v.y + 47, w: v.w - 24 }),
      /* @__PURE__ */ jsx("text", { className: c.nodeStrong, x: v.x + 12, y: v.y + 71, children: pct }),
      /* @__PURE__ */ jsx("text", { className: n.holding > 0 ? c.nodeAmber : c.nodeText, x: v.x + v.w - 12, y: v.y + 71, textAnchor: "end", children: [n.holding > 0 && `${n.holding} holding`, n.no_gate > 0 && `${n.no_gate} no gate`].filter(Boolean).join(" \xB7 ") }),
      /* @__PURE__ */ jsx("text", { className: c.nodeKind, x: v.x + 12, y: v.y + 87, children: clip(`gates: ${modeWords(n.mix) || "none"}`, 38) })
    ] }),
    v.expanded && /* @__PURE__ */ jsx("rect", { x: v.x, y: v.y + v.head, width: v.w, height: v.h - v.head, rx: 6, fill: t.panel, stroke: t.line }),
    v.expanded && v.rows.map((r) => /* @__PURE__ */ jsx(RowNode, { r, t, group: v, h, onOpen }, r.target.id)),
    v.expanded && v.hiddenRows > 0 && /* @__PURE__ */ jsxs("text", { className: c.nodeText, x: v.x + 14, y: v.y + v.h - 14, children: [
      "+ ",
      v.hiddenRows,
      " more (the ",
      ROW_CAP,
      " worst shown): search to find one"
    ] })
  ] });
}
function ObserverNodeView({ v, t, h, onSel }) {
  const c = useMapStyles();
  const n = v.node;
  const states = Object.entries(n.states).map(([k, x]) => `${x} ${k}`).join(" \xB7 ");
  const sel = { kind: "observer", id: n.id };
  return /* @__PURE__ */ jsxs("g", { className: `${c.node} ${v.dim ? c.nodeDim : ""}`, role: "button", tabIndex: 0, "aria-label": `Observer ${n.provider} ${n.source}: watching ${n.targets} targets, ${states || "no health yet"}, status ${statusWord(n.status)}`, ...hoverProps(sel, h), onClick: (e) => onSel(sel, e.currentTarget), onKeyDown: keys((el) => onSel(sel, el)), "data-testid": `observer-${n.provider}`, children: [
    /* @__PURE__ */ jsx("rect", { className: "frame", x: v.x, y: v.y, width: v.w, height: v.h, rx: 6 }),
    /* @__PURE__ */ jsx("circle", { cx: v.x + v.w - 14, cy: v.y + 15, r: 5, fill: statusColor(t, n.status) }),
    /* @__PURE__ */ jsx("text", { className: c.nodeKind, x: v.x + 12, y: v.y + 19, children: "observer" }),
    /* @__PURE__ */ jsx("text", { className: c.nodeTitle, x: v.x + 12, y: v.y + 40, children: clip(n.provider, 17) }),
    /* @__PURE__ */ jsxs("text", { className: c.nodeText, x: v.x + 12, y: v.y + 58, children: [
      n.source !== n.provider ? `${clip(n.source, 12)} \xB7 ` : "",
      "watching ",
      n.targets
    ] }),
    /* @__PURE__ */ jsx("text", { className: c.nodeText, style: n.status === "ok" ? void 0 : { fill: statusColor(t, n.status) }, x: v.x + 12, y: v.y + 75, children: clip(states || "no health yet", 22) })
  ] });
}
const arrowId = (s) => `mapArrow-${s}`;
function EdgePath({ e, t }) {
  const c = useMapStyles();
  const watch = e.edge.kind === "watches";
  const quiet = watch && e.edge.status === "ok";
  const color = quiet ? t.textFaint : statusColor(t, e.edge.status);
  const state = quiet ? "quiet" : statusWord(e.edge.status);
  const label = `${watch ? "Watches" : "Guards"}: ${nodeName(e.edge.from)} to ${nodeName(e.edge.to)}, ${e.edge.targets} targets, ${fmt(e.edge.volume)} decisions, ${e.edge.refused} refused, ${e.edge.holding} holding, ${statusWord(e.edge.status)}`;
  return /* @__PURE__ */ jsxs("g", { opacity: e.dim ? 0.18 : 1, role: "img", "aria-label": label, children: [
    /* @__PURE__ */ jsx("title", { children: label }),
    /* @__PURE__ */ jsx("path", { className: c.edge, d: e.d, stroke: color, strokeWidth: e.width, strokeDasharray: watch ? "5 4" : void 0, opacity: watch ? 0.85 : 0.6, markerEnd: `url(#${arrowId(state)})` }),
    !watch && e.edge.volume > 0 && !e.dim && /* @__PURE__ */ jsx("path", { className: c.flow, d: e.d, stroke: color, style: { stroke: `color-mix(in srgb, ${color} 45%, white)` } })
  ] });
}
function ColumnHeads({ topo }) {
  const c = useMapStyles();
  const t = useClearanceTokens();
  return /* @__PURE__ */ jsxs("g", { "aria-hidden": "true", children: [
    topo.columns.map((col) => {
      const mid = col.key === "core";
      const x = mid ? col.x + col.w / 2 : col.x;
      return /* @__PURE__ */ jsxs("g", { children: [
        /* @__PURE__ */ jsx("text", { className: c.colHead, x, y: 14, textAnchor: mid ? "middle" : "start", children: col.label }),
        /* @__PURE__ */ jsx("text", { className: c.nodeKind, x, y: 29, textAnchor: mid ? "middle" : "start", children: col.sub })
      ] }, col.key);
    }),
    topo.columns.filter((col) => col.key !== "core").map((col) => /* @__PURE__ */ jsx("line", { x1: col.x, x2: col.x + col.w, y1: 35, y2: 35, stroke: t.lineSoft }, col.key))
  ] });
}
function Popover({ sel, topo, el, h, popRef, onOpen, onToggle }) {
  const c = useMapStyles();
  let name = "";
  let aria = "";
  let status = "ok";
  let body = null;
  let foot = null;
  if (sel.kind === "gate") {
    const v = topo.gates.find((g) => g.node.id === sel.id);
    if (!v) return null;
    const n = v.node;
    name = v.name;
    aria = v.name;
    status = n.status;
    body = /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("dl", { className: c.popFacts, children: [
        /* @__PURE__ */ jsx("dt", { children: "enforced by" }),
        /* @__PURE__ */ jsx("dd", { children: v.kind }),
        /* @__PURE__ */ jsx("dt", { children: "instances" }),
        /* @__PURE__ */ jsx("dd", { children: n.instances }),
        /* @__PURE__ */ jsx("dt", { children: "modes" }),
        /* @__PURE__ */ jsx("dd", { children: mixWords(n.mix) }),
        /* @__PURE__ */ jsx("dt", { children: "guards" }),
        /* @__PURE__ */ jsxs("dd", { children: [
          n.targets,
          " targets"
        ] }),
        /* @__PURE__ */ jsx("dt", { children: "decisions" }),
        /* @__PURE__ */ jsx("dd", { children: fmt(n.decisions) }),
        /* @__PURE__ */ jsx("dt", { children: "refused" }),
        /* @__PURE__ */ jsx("dd", { children: fmt(n.refused) }),
        /* @__PURE__ */ jsx("dt", { children: "exceptions" }),
        /* @__PURE__ */ jsx("dd", { children: n.exceptions }),
        /* @__PURE__ */ jsx("dt", { children: "holding" }),
        /* @__PURE__ */ jsx("dd", { children: n.holding })
      ] }),
      /* @__PURE__ */ jsx(CoverageMix, { coverage: n.coverage, label: `${v.name} coverage` })
    ] });
  } else if (sel.kind === "group") {
    const v = topo.groups.find((g) => g.node.id === sel.id);
    if (!v) return null;
    const n = v.node;
    name = n.group;
    aria = name;
    status = n.status;
    body = /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("dl", { className: c.popFacts, children: [
        /* @__PURE__ */ jsx("dt", { children: "targets" }),
        /* @__PURE__ */ jsx("dd", { children: v.targets.length }),
        /* @__PURE__ */ jsx("dt", { children: "verified" }),
        /* @__PURE__ */ jsx("dd", { children: n.verified_pct === null ? "no coverage" : `${n.verified_pct}%` }),
        /* @__PURE__ */ jsx("dt", { children: "no gate" }),
        /* @__PURE__ */ jsx("dd", { children: n.no_gate }),
        /* @__PURE__ */ jsx("dt", { children: "holding" }),
        /* @__PURE__ */ jsx("dd", { children: n.holding }),
        /* @__PURE__ */ jsx("dt", { children: "gates" }),
        /* @__PURE__ */ jsx("dd", { children: mixWords(n.mix) }),
        /* @__PURE__ */ jsx("dt", { children: "observers" }),
        /* @__PURE__ */ jsx("dd", { children: Object.entries(n.observers).map(([k, x]) => `${x} ${k}`).join(", ") || "none" })
      ] }),
      /* @__PURE__ */ jsx(CoverageMix, { coverage: n.coverage, label: `${n.group} coverage` })
    ] });
    foot = /* @__PURE__ */ jsx(TextLink, { onClick: () => onToggle(n.group), expanded: v.expanded, children: v.expanded ? "Collapse" : "Show targets" });
  } else if (sel.kind === "observer") {
    const v = topo.observers.find((o) => o.node.id === sel.id);
    if (!v) return null;
    const n = v.node;
    name = `${n.provider}${n.source !== n.provider ? ` \xB7 ${n.source}` : ""}`;
    aria = name;
    status = n.status;
    body = /* @__PURE__ */ jsxs("dl", { className: c.popFacts, children: [
      /* @__PURE__ */ jsx("dt", { children: "watching" }),
      /* @__PURE__ */ jsxs("dd", { children: [
        n.targets,
        " targets"
      ] }),
      Object.entries(n.states).map(([k, x]) => /* @__PURE__ */ jsxs("span", { style: { display: "contents" }, children: [
        /* @__PURE__ */ jsx("dt", { children: k }),
        /* @__PURE__ */ jsx("dd", { children: x })
      ] }, k))
    ] });
  } else {
    const hit = topo.groups.flatMap((g) => g.rows.map((r) => ({ r, g }))).find((x) => x.r.target.id === sel.id);
    if (!hit) return null;
    const n = hit.r.target;
    name = n.name;
    aria = name;
    status = n.status;
    body = /* @__PURE__ */ jsxs("dl", { className: c.popFacts, children: [
      /* @__PURE__ */ jsx("dt", { children: "kind" }),
      /* @__PURE__ */ jsxs("dd", { children: [
        n.kind,
        n.env ? ` \xB7 ${n.env}` : ""
      ] }),
      n.registry && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx("dt", { children: "registry" }),
        /* @__PURE__ */ jsx("dd", { children: n.registry })
      ] }),
      /* @__PURE__ */ jsx("dt", { children: "verified" }),
      /* @__PURE__ */ jsx("dd", { children: n.verified_pct === null ? "no coverage" : `${n.verified_pct}%` }),
      /* @__PURE__ */ jsx("dt", { children: "holding" }),
      /* @__PURE__ */ jsx("dd", { children: n.holding }),
      /* @__PURE__ */ jsx("dt", { children: "gates" }),
      /* @__PURE__ */ jsx("dd", { className: c.popList, children: n.gates.length === 0 ? "none declared" : n.gates.map((g) => {
        const w = gateWords(g.type);
        return /* @__PURE__ */ jsxs("span", { className: c.popGate, children: [
          /* @__PURE__ */ jsxs("span", { className: c.popLead, children: [
            w.name,
            " \xB7 ",
            w.kind,
            " \xB7 ",
            g.silent ? "silent" : g.mode
          ] }),
          /* @__PURE__ */ jsx(Tooltip, { title: g.instance, children: /* @__PURE__ */ jsx("span", { className: c.popInstance, children: g.instance }) })
        ] }, g.instance);
      }) }),
      /* @__PURE__ */ jsx("dt", { children: "observers" }),
      /* @__PURE__ */ jsx("dd", { children: n.observers.map((o) => `${o.provider} ${o.state}`).join(", ") || "none" })
    ] });
    foot = /* @__PURE__ */ jsx(TextLink, { onClick: () => onOpen(n.id), children: "Open detail \u2192" });
  }
  return /* @__PURE__ */ jsxs(PlacedBox, { el, popRef, h, wide: sel.kind === "target", label: `${aria} details`, children: [
    /* @__PURE__ */ jsxs("div", { className: c.popHead, children: [
      /* @__PURE__ */ jsx("h3", { className: c.popName, children: name }),
      /* @__PURE__ */ jsx(StatusChip, { tone: statusTone(status), dot: true, children: statusWord(status) })
    ] }),
    body,
    foot
  ] });
}
function PlacedBox({ el, popRef, h, wide, label, children }) {
  const c = useMapStyles();
  const [at, setAt] = useState();
  useLayoutEffect(() => {
    const box = popRef.current;
    if (!box) return;
    if (!el.isConnected) {
      h.close();
      return;
    }
    const r = el.getBoundingClientRect();
    const p = box.getBoundingClientRect();
    const next = placePopover({ x: r.left, y: r.top, w: r.width, h: r.height }, { w: p.width, h: p.height }, { w: window.innerWidth, h: window.innerHeight });
    setAt((prev) => prev && prev.x === next.x && prev.y === next.y && prev.side === next.side ? prev : next);
  });
  return createPortal(
    /* @__PURE__ */ jsx(
      "div",
      {
        ref: popRef,
        className: `${c.popover} ${wide ? c.popoverWide : ""}`,
        style: { position: "fixed", left: at?.x ?? 0, top: at?.y ?? 0, visibility: at ? "visible" : "hidden", zIndex: 1300 },
        "data-side": at?.side,
        role: "dialog",
        "aria-label": label,
        "data-testid": "map-popover",
        onMouseEnter: h.stay,
        onMouseLeave: h.off,
        onFocus: h.stay,
        onBlur: (e) => {
          if (!h.within(e.relatedTarget) && !el.contains(e.relatedTarget)) h.off();
        },
        children
      }
    ),
    document.body
  );
}
function MapTopology({ topo, onToggleGroup, onOpenTarget }) {
  const c = useMapStyles();
  const t = useClearanceTokens();
  const { hover, enter, leave, hideNow } = useHoverIntent();
  const popRef = useRef(null);
  const openedAt = useRef(0);
  const within = (n) => !!n && !!popRef.current && popRef.current.contains(n);
  const open = (sel, el) => {
    openedAt.current = Date.now();
    enter({ sel, el });
  };
  const handlers = { on: open, off: leave, stay: () => hover && enter(hover), within, close: hideNow };
  useEffect(() => {
    if (!hover) return void 0;
    const outside = (e) => {
      const n = e.target;
      if (n && (within(n) || hover.el.contains(n))) return;
      hideNow();
    };
    const esc = (e) => {
      if (e.key === "Escape") hideNow();
    };
    const scrolled = () => {
      if (Date.now() - openedAt.current > 250) hideNow();
    };
    document.addEventListener("pointerdown", outside, true);
    document.addEventListener("mousedown", outside, true);
    document.addEventListener("keydown", esc);
    window.addEventListener("scroll", scrolled, true);
    window.addEventListener("resize", hideNow);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      document.removeEventListener("mousedown", outside, true);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", scrolled, true);
      window.removeEventListener("resize", hideNow);
    };
  }, [hover, hideNow]);
  const toggle = (g) => {
    hideNow();
    onToggleGroup(g);
  };
  const openTarget = (id) => {
    hideNow();
    onOpenTarget(id);
  };
  const total = topo.groups.reduce((n, g) => n + g.targets.length, 0);
  return /* @__PURE__ */ jsx("div", { className: c.stage, children: /* @__PURE__ */ jsxs("div", { className: c.canvas, children: [
    /* @__PURE__ */ jsx("div", { className: c.scroll, children: /* @__PURE__ */ jsxs("svg", { className: c.svg, style: { maxWidth: Math.round(topo.width * 1.25) }, viewBox: `0 0 ${topo.width} ${topo.height}`, role: "group", "aria-label": `Coverage topology: ${topo.gates.length} gate types, ${total} targets in ${topo.groups.length} groups, ${topo.observers.length} observers`, fontFamily: fontBody, children: [
      /* @__PURE__ */ jsx("defs", { children: [["ok", t.good], ["attention", t.amber], ["down", t.bad], ["quiet", t.textFaint]].map(([k, fill]) => /* @__PURE__ */ jsx("marker", { id: arrowId(k), orient: "auto", markerUnits: "userSpaceOnUse", markerWidth: 9, markerHeight: 9, refX: 8, refY: 4.5, children: /* @__PURE__ */ jsx("path", { d: "M0 0 L9 4.5 L0 9 Z", fill }) }, k)) }),
      /* @__PURE__ */ jsx(ColumnHeads, { topo }),
      /* @__PURE__ */ jsx("rect", { className: c.core, x: topo.core.x, y: topo.core.y, width: topo.core.w, height: topo.core.h, rx: 8, opacity: 0.55, "aria-hidden": "true" }),
      topo.edges.map((e) => /* @__PURE__ */ jsx(EdgePath, { e, t }, e.id)),
      topo.gates.map((v) => /* @__PURE__ */ jsx(GateNode, { v, t, h: handlers, onSel: open }, v.node.id)),
      topo.groups.map((v) => /* @__PURE__ */ jsx(GroupNodeView, { v, t, h: handlers, onToggle: toggle, onOpen: openTarget }, v.node.id)),
      topo.observers.map((v) => /* @__PURE__ */ jsx(ObserverNodeView, { v, t, h: handlers, onSel: open }, v.node.id)),
      topo.edges.filter((e) => e.label && !e.dim).map((e) => /* @__PURE__ */ jsx("text", { className: c.edgeLabel, x: e.label.x - e.label.w / 2, y: e.label.y, textAnchor: "start", style: { fill: statusColor(t, e.edge.status) }, "aria-hidden": "true", children: e.label.text }, `l-${e.id}`))
    ] }) }),
    hover && /* @__PURE__ */ jsx(Popover, { sel: hover.sel, topo, el: hover.el, h: handlers, popRef, onOpen: openTarget, onToggle: toggle })
  ] }) });
}
function MapLegend() {
  const c = useMapStyles();
  const t = useClearanceTokens();
  const colors = coverageColors(t);
  const short = {
    "authorized-and-verified": "verified",
    "observed-not-attributed": "not attributed",
    "out-of-band-detected": "out-of-band",
    "coverage-unavailable": "observer blind",
    "break-glass": "break-glass",
    "attempted-refused": "refused",
    unassessed: "unassessed"
  };
  const cov = COVERAGE_ORDER.map((k) => [k, short[k]]);
  return /* @__PURE__ */ jsxs("div", { className: c.legend, role: "group", "aria-label": "Legend", children: [
    /* @__PURE__ */ jsxs("span", { className: c.legendItem, children: [
      /* @__PURE__ */ jsx("i", { className: `${c.swatch} ${c.swatchOk}` }),
      " all verified"
    ] }),
    /* @__PURE__ */ jsxs("span", { className: c.legendItem, children: [
      /* @__PURE__ */ jsx("i", { className: `${c.swatch} ${c.swatchAttn}` }),
      " holding or flag"
    ] }),
    /* @__PURE__ */ jsxs("span", { className: c.legendItem, children: [
      /* @__PURE__ */ jsx("i", { className: `${c.swatch} ${c.swatchDown}` }),
      " out-of-band or blind"
    ] }),
    /* @__PURE__ */ jsxs("span", { className: c.legendItem, children: [
      /* @__PURE__ */ jsx("i", { className: `${c.swatch} ${c.swatchWatch}` }),
      " observer watching"
    ] }),
    /* @__PURE__ */ jsx("span", { children: "line width: decisions in the window" }),
    /* @__PURE__ */ jsxs("span", { className: c.legendItem, children: [
      /* @__PURE__ */ jsx("i", { className: `${c.swatch} ${c.swatchMoving}` }),
      " moving dashes: decisions in the window"
    ] }),
    /* @__PURE__ */ jsxs("span", { className: c.legendItem, children: [
      "gate bar:",
      /* @__PURE__ */ jsx("i", { className: c.legendDot, style: { backgroundColor: t.good } }),
      " enforce",
      /* @__PURE__ */ jsx("i", { className: c.legendDot, style: { backgroundColor: t.amber } }),
      " flag",
      /* @__PURE__ */ jsx("i", { className: c.legendDot, style: { backgroundColor: t.textFaint } }),
      " silent"
    ] }),
    /* @__PURE__ */ jsxs("span", { className: c.legendItem, children: [
      "group bar:",
      cov.map(([k, label]) => /* @__PURE__ */ jsxs("span", { className: c.legendItem, children: [
        /* @__PURE__ */ jsx("i", { className: c.legendDot, style: { backgroundColor: colors[k] } }),
        " ",
        label
      ] }, k))
    ] }),
    /* @__PURE__ */ jsx("span", { className: c.legendItem, children: "\u25B8 opens a group \xB7 click a target to open it" })
  ] });
}

export { MapLegend, MapTopology };
//# sourceMappingURL=MapTopology.esm.js.map
