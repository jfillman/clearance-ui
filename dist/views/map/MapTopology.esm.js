import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useState } from 'react';
import { useClearanceTokens, fontBody } from '../../kit/tokens.esm.js';
import { Button, Chip, TextLink, StatusChip } from '../../kit/kit.esm.js';
import '../../kit/components.esm.js';
import '../../kit/FlightLog.esm.js';
import '../../kit/transport.esm.js';
import '../../kit/coverage.esm.js';
import '../../kit/Pager.esm.js';
import '../../kit/kitStyles.esm.js';
import '../../kit/ExpandRow.esm.js';
import { ROW_CAP, WIDTH } from './model.esm.js';
import { statusColor, statusWord, mixWords, CoverageMix, statusTone } from './parts.esm.js';
import { useMapStyles } from './styles.esm.js';

const keys = (act) => (e) => {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    act();
  }
};
function MixBar({ t, mix, x, y, w }) {
  const total = mix.enforce + mix.flag + mix.silent;
  if (total === 0) return /* @__PURE__ */ jsx("rect", { x, y, width: w, height: 6, rx: 3, fill: t.lineSoft });
  const seg = [
    { n: mix.enforce, fill: t.good },
    { n: mix.flag, fill: t.amber },
    { n: mix.silent, fill: t.textFaint }
  ];
  let at = x;
  return /* @__PURE__ */ jsxs("g", { children: [
    /* @__PURE__ */ jsx("rect", { x, y, width: w, height: 6, rx: 3, fill: t.lineSoft }),
    seg.filter((s) => s.n > 0).map((s, i) => {
      const sw = w * s.n / total;
      const r = /* @__PURE__ */ jsx("rect", { x: at, y, width: sw, height: 6, fill: s.fill }, i);
      at += sw;
      return r;
    })
  ] });
}
const fmt = (n) => n.toLocaleString();
function GateNode({ v, t, on, onSel }) {
  const c = useMapStyles();
  const n = v.node;
  const label = `Gate type ${n.type}: ${n.instances} instances guarding ${n.targets} targets, ${mixWords(n.mix)}, ${fmt(n.decisions)} decisions, ${n.refused} refused, ${n.holding} holding, status ${statusWord(n.status)}`;
  const sel = { kind: "gate", id: n.id };
  return /* @__PURE__ */ jsxs("g", { className: `${c.node} ${v.dim ? c.nodeDim : ""}`, role: "button", tabIndex: 0, "aria-label": label, onMouseEnter: () => on(sel), onMouseLeave: () => on(void 0), onFocus: () => on(sel), onBlur: () => on(void 0), onClick: () => onSel(sel), onKeyDown: keys(() => onSel(sel)), "data-testid": `gate-${n.type}`, children: [
    /* @__PURE__ */ jsx("rect", { className: "frame", x: v.x, y: v.y, width: v.w, height: v.h, rx: 6 }),
    /* @__PURE__ */ jsx("circle", { cx: v.x + v.w - 14, cy: v.y + 16, r: 5, fill: statusColor(t, n.status) }),
    /* @__PURE__ */ jsx("text", { className: c.nodeTitle, x: v.x + 12, y: v.y + 22, children: n.type }),
    /* @__PURE__ */ jsxs("text", { className: c.nodeStrong, x: v.x + v.w - 28, y: v.y + 22, textAnchor: "end", children: [
      fmt(n.decisions),
      " dec"
    ] }),
    /* @__PURE__ */ jsxs("text", { className: c.nodeText, x: v.x + 12, y: v.y + 41, children: [
      n.instances,
      " instances \xB7 ",
      n.targets,
      " targets"
    ] }),
    /* @__PURE__ */ jsx(MixBar, { t, mix: n.mix, x: v.x + 12, y: v.y + 50, w: 110 }),
    /* @__PURE__ */ jsxs("text", { className: c.nodeText, x: v.x + 130, y: v.y + 57, children: [
      n.mix.enforce,
      "/",
      n.mix.flag,
      "/",
      n.mix.silent
    ] }),
    /* @__PURE__ */ jsxs("text", { className: n.holding > 0 ? c.nodeAmber : c.nodeText, x: v.x + 12, y: v.y + 77, children: [
      n.holding > 0 ? `${n.holding} holding \xB7 ` : "",
      n.refused,
      " refused"
    ] })
  ] });
}
function RowNode({ r, t, group, on, onOpen }) {
  const c = useMapStyles();
  const n = r.target;
  const pct = n.verified_pct === null ? "no coverage" : `${Math.round(n.verified_pct)}% verified`;
  const short = n.verified_pct === null ? "none" : `${Math.round(n.verified_pct)}%`;
  const sel = { kind: "target", id: n.id };
  return /* @__PURE__ */ jsxs("g", { className: `${c.row} ${r.dim ? c.nodeDim : ""}`, role: "link", tabIndex: 0, "aria-label": `Open ${n.name} in ${group.node.group}: ${pct}, ${n.holding} holding, status ${statusWord(n.status)}`, style: { cursor: "pointer", outline: "none" }, onMouseEnter: () => on(sel), onMouseLeave: () => on(void 0), onFocus: () => on(sel), onBlur: () => on(void 0), onClick: () => onOpen(n.id), onKeyDown: keys(() => onOpen(n.id)), "data-testid": `target-${n.id}`, children: [
    /* @__PURE__ */ jsx("rect", { className: "rowFrame", x: r.x, y: r.y, width: r.w, height: r.h, rx: 4 }),
    /* @__PURE__ */ jsx("circle", { cx: r.x + 12, cy: r.cy, r: 4, fill: statusColor(t, n.status) }),
    /* @__PURE__ */ jsx("text", { className: c.nodeStrong, x: r.x + 24, y: r.cy + 4, children: n.name.length > 19 ? `${n.name.slice(0, 18)}\u2026` : n.name }),
    /* @__PURE__ */ jsxs("text", { className: n.holding > 0 ? c.nodeAmber : c.nodeText, x: r.x + r.w - 10, y: r.cy + 4, textAnchor: "end", children: [
      n.holding > 0 ? `${n.holding} hold \xB7 ` : "",
      short
    ] })
  ] });
}
function GroupNodeView({ v, t, on, onToggle, onOpen }) {
  const c = useMapStyles();
  const n = v.node;
  const pct = n.verified_pct === null ? "no coverage" : `${Math.round(n.verified_pct)}% verified`;
  const sel = { kind: "group", id: n.id };
  const label = `Group ${n.group}: ${v.targets.length} targets, ${pct}, ${n.no_gate} with no gate, ${n.holding} holding, status ${statusWord(n.status)}. ${v.expanded ? "Expanded" : "Collapsed"}`;
  return /* @__PURE__ */ jsxs("g", { className: v.dim ? c.nodeDim : void 0, "data-testid": `group-${n.group}`, children: [
    /* @__PURE__ */ jsxs("g", { className: c.node, role: "button", tabIndex: 0, "aria-expanded": v.expanded, "aria-label": label, onMouseEnter: () => on(sel), onMouseLeave: () => on(void 0), onFocus: () => on(sel), onBlur: () => on(void 0), onClick: () => onToggle(n.group), onKeyDown: keys(() => onToggle(n.group)), children: [
      /* @__PURE__ */ jsx("rect", { className: "frame", x: v.x, y: v.y, width: v.w, height: v.h, rx: 6 }),
      /* @__PURE__ */ jsx("circle", { cx: v.x + v.w - 14, cy: v.y + 16, r: 5, fill: statusColor(t, n.status) }),
      /* @__PURE__ */ jsxs("text", { className: c.nodeTitle, x: v.x + 12, y: v.y + 22, children: [
        v.expanded ? "\u25BE" : "\u25B8",
        " ",
        n.group
      ] }),
      /* @__PURE__ */ jsxs("text", { className: c.nodeText, x: v.x + 12, y: v.y + 40, children: [
        v.targets.length,
        " ",
        Object.keys(n.kinds).length === 1 ? Object.keys(n.kinds)[0] : "targets",
        v.matches > 0 ? ` \xB7 ${v.matches} match` : "",
        n.no_gate > 0 ? ` \xB7 ${n.no_gate} no gate` : ""
      ] }),
      /* @__PURE__ */ jsx(MixBar, { t, mix: n.mix, x: v.x + 12, y: v.y + 48, w: 110 }),
      /* @__PURE__ */ jsx("text", { className: n.holding > 0 ? c.nodeAmber : c.nodeText, x: v.x + v.w - 12, y: v.y + 40, textAnchor: "end", children: n.holding > 0 ? `${n.holding} holding` : "" }),
      /* @__PURE__ */ jsx("text", { className: c.nodeStrong, x: v.x + v.w - 12, y: v.y + 56, textAnchor: "end", children: pct })
    ] }),
    v.expanded && v.rows.map((r) => /* @__PURE__ */ jsx(RowNode, { r, t, group: v, on, onOpen }, r.target.id)),
    v.expanded && v.hiddenRows > 0 && /* @__PURE__ */ jsxs("text", { className: c.nodeText, x: v.x + 14, y: v.y + v.h - 14, children: [
      "+ ",
      v.hiddenRows,
      " more (showing the ",
      ROW_CAP,
      " worst): search to find one"
    ] })
  ] });
}
function ObserverNodeView({ v, t, on, onSel }) {
  const c = useMapStyles();
  const n = v.node;
  const states = Object.entries(n.states).map(([k, x]) => `${x} ${k}`).join(", ");
  const sel = { kind: "observer", id: n.id };
  return /* @__PURE__ */ jsxs("g", { className: `${c.node} ${v.dim ? c.nodeDim : ""}`, role: "button", tabIndex: 0, "aria-label": `Observer ${n.provider} ${n.source}: watching ${n.targets} targets, ${states || "no health yet"}, status ${statusWord(n.status)}`, onMouseEnter: () => on(sel), onMouseLeave: () => on(void 0), onFocus: () => on(sel), onBlur: () => on(void 0), onClick: () => onSel(sel), onKeyDown: keys(() => onSel(sel)), "data-testid": `observer-${n.provider}`, children: [
    /* @__PURE__ */ jsx("rect", { className: "frame", x: v.x, y: v.y, width: v.w, height: v.h, rx: 6 }),
    /* @__PURE__ */ jsx("circle", { cx: v.x + v.w - 12, cy: v.y + 14, r: 4, fill: statusColor(t, n.status) }),
    /* @__PURE__ */ jsx("text", { className: c.nodeStrong, x: v.x + 10, y: v.y + 20, children: n.provider }),
    /* @__PURE__ */ jsxs("text", { className: c.nodeText, x: v.x + 10, y: v.y + 36, children: [
      n.source !== n.provider ? `${n.source} \xB7 ` : "",
      n.targets,
      " targets"
    ] })
  ] });
}
function EdgePath({ e, t }) {
  const c = useMapStyles();
  const watch = e.edge.kind === "watches";
  const quiet = watch && e.edge.status === "ok";
  const color = quiet ? t.textFaint : statusColor(t, e.edge.status);
  const label = `${e.edge.kind === "guards" ? "Guards" : "Watches"}: ${e.edge.from} to ${e.edge.to}, ${e.edge.targets} targets, ${fmt(e.edge.volume)} decisions, ${e.edge.refused} refused, ${e.edge.holding} holding, ${statusWord(e.edge.status)}`;
  return /* @__PURE__ */ jsxs("g", { opacity: e.dim ? 0.18 : 1, role: "img", "aria-label": label, children: [
    /* @__PURE__ */ jsx("path", { className: c.edge, d: e.d, stroke: color, strokeWidth: e.width, strokeDasharray: watch ? "5 4" : void 0, opacity: watch ? 0.8 : 0.55 }),
    !watch && e.edge.volume > 0 && !e.dim && /* @__PURE__ */ jsx("path", { className: c.flow, d: e.d })
  ] });
}
function Popover({ sel, topo, onOpen, onToggle }) {
  const c = useMapStyles();
  let name = "";
  let at = { x: 0, y: 0 };
  let status = "ok";
  let body = null;
  let foot = null;
  if (sel.kind === "gate") {
    const v = topo.gates.find((g) => g.node.id === sel.id);
    if (!v) return null;
    const n = v.node;
    name = n.type;
    status = n.status;
    at = { x: v.x + 20, y: v.y + v.h };
    body = /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("dl", { className: c.popFacts, children: [
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
      /* @__PURE__ */ jsx(CoverageMix, { coverage: n.coverage, label: `${n.type} coverage` })
    ] });
  } else if (sel.kind === "group") {
    const v = topo.groups.find((g) => g.node.id === sel.id);
    if (!v) return null;
    const n = v.node;
    name = n.group;
    status = n.status;
    at = { x: v.x + 20, y: v.y + Math.min(v.h, 60) };
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
    status = n.status;
    at = { x: v.x - 140, y: v.y + v.h };
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
    status = n.status;
    at = { x: hit.r.x + 40, y: hit.r.y + hit.r.h };
    body = /* @__PURE__ */ jsx(Fragment, { children: /* @__PURE__ */ jsxs("dl", { className: c.popFacts, children: [
      /* @__PURE__ */ jsx("dt", { children: "kind" }),
      /* @__PURE__ */ jsxs("dd", { children: [
        n.kind,
        n.env ? ` \xB7 ${n.env}` : ""
      ] }),
      /* @__PURE__ */ jsx("dt", { children: "verified" }),
      /* @__PURE__ */ jsx("dd", { children: n.verified_pct === null ? "no coverage" : `${n.verified_pct}%` }),
      /* @__PURE__ */ jsx("dt", { children: "holding" }),
      /* @__PURE__ */ jsx("dd", { children: n.holding }),
      /* @__PURE__ */ jsx("dt", { children: "gates" }),
      /* @__PURE__ */ jsx("dd", { children: n.gates.length === 0 ? "none declared" : n.gates.map((g) => `${g.type} (${g.silent ? "silent" : g.mode})`).join(", ") }),
      /* @__PURE__ */ jsx("dt", { children: "observers" }),
      /* @__PURE__ */ jsx("dd", { children: n.observers.map((o) => `${o.provider} ${o.state}`).join(", ") || "none" })
    ] }) });
    foot = /* @__PURE__ */ jsx(TextLink, { onClick: () => onOpen(n.id), children: "Open detail \u2192" });
  }
  const left = Math.min(Math.max(at.x / WIDTH * 100, 0), 66);
  return /* @__PURE__ */ jsxs("div", { className: c.popover, style: { left: `${left}%`, top: `${Math.min(at.y / topo.height * 100, 35)}%` }, role: "dialog", "aria-label": `${name} details`, "data-testid": "map-popover", children: [
    /* @__PURE__ */ jsxs("div", { className: c.popHead, children: [
      /* @__PURE__ */ jsx("h3", { className: c.popName, children: name }),
      /* @__PURE__ */ jsx(StatusChip, { tone: statusTone(status), dot: true, children: statusWord(status) })
    ] }),
    body,
    foot
  ] });
}
function MapTopology({ topo, onToggleGroup, onOpenTarget }) {
  const c = useMapStyles();
  const t = useClearanceTokens();
  const [hover, setHover] = useState();
  const [pinned, setPinned] = useState();
  const sel = hover ?? pinned;
  const pin = (s) => setPinned((p) => p && p.kind === s.kind && p.id === s.id ? void 0 : s);
  const total = topo.groups.reduce((n, g) => n + g.targets.length, 0);
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    /* @__PURE__ */ jsxs("div", { className: c.stage, onKeyDown: (e) => e.key === "Escape" && setPinned(void 0), children: [
      /* @__PURE__ */ jsx("div", { className: c.scroll, children: /* @__PURE__ */ jsxs("svg", { className: c.svg, viewBox: `0 0 ${topo.width} ${topo.height}`, role: "group", "aria-label": `Coverage topology: ${topo.gates.length} gate types, ${total} targets in ${topo.groups.length} groups, ${topo.observers.length} observers`, fontFamily: fontBody, children: [
        topo.edges.map((e) => /* @__PURE__ */ jsx(EdgePath, { e, t }, e.id)),
        topo.gates.map((v) => /* @__PURE__ */ jsx(GateNode, { v, t, on: setHover, onSel: pin }, v.node.id)),
        topo.groups.map((v) => /* @__PURE__ */ jsx(GroupNodeView, { v, t, on: setHover, onToggle: (g) => {
          onToggleGroup(g);
        }, onOpen: onOpenTarget }, v.node.id)),
        topo.observers.map((v) => /* @__PURE__ */ jsx(ObserverNodeView, { v, t, on: setHover, onSel: pin }, v.node.id))
      ] }) }),
      sel && /* @__PURE__ */ jsx(Popover, { sel, topo, onOpen: onOpenTarget, onToggle: onToggleGroup }),
      pinned && !hover && /* @__PURE__ */ jsx("div", { style: { position: "absolute", top: 6, right: 12 }, children: /* @__PURE__ */ jsx(Button, { small: true, onClick: () => setPinned(void 0), children: "Close details" }) })
    ] })
  );
}
function MapLegend() {
  const c = useMapStyles();
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
    /* @__PURE__ */ jsx(Chip, { tone: "sky", title: "Dashes move along a line where decisions are flowing; they stand still if your system asks for reduced motion", children: "flow" })
  ] });
}

export { MapLegend, MapTopology };
//# sourceMappingURL=MapTopology.esm.js.map
