import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import { useState, useEffect, useMemo } from 'react';
import '@material-ui/core/styles';
import { relativeTime } from '../../kit/format.esm.js';
import { usePoll } from '../../kit/usePoll.esm.js';
import { TabError, PanelSkeleton, Section, EmptyNote, Hint, Chip, Callout, TextLink, FilterBar, FilterChips, FilterGroup, FilterChip, SearchField, Count, StatusChip } from '../../kit/kit.esm.js';
import '../../kit/components.esm.js';
import '../../kit/FlightLog.esm.js';
import '../../kit/transport.esm.js';
import { useClearanceRead } from '../../kit/read.esm.js';
import { readDeniedText } from '../../kit/coverage.esm.js';
import '../../kit/Pager.esm.js';
import '../../kit/kitStyles.esm.js';
import '../../kit/ExpandRow.esm.js';
import { MapLanes } from './MapLanes.esm.js';
import { MapMatrix } from './MapMatrix.esm.js';
import { MapTopology, MapLegend } from './MapTopology.esm.js';
import { NO_FILTERS, buildTopology, registryTiers, visibleAttention, registryEmpty, otherPartials, WINDOWS, soleTarget, groupsOf } from './model.esm.js';
import { useClock } from './parts.esm.js';
import { useMapStyles } from './styles.esm.js';

const SEVERITY_TONE = { down: "bad", attention: "warn", info: "neutral" };
const VIEW_KEY = "clearance.map.view";
function readView() {
  try {
    return window.localStorage.getItem(VIEW_KEY) === "lanes" ? "lanes" : "topology";
  } catch {
    return "topology";
  }
}
function writeView(v) {
  try {
    window.localStorage.setItem(VIEW_KEY, v);
  } catch {
  }
}
const windowRange = (id, now) => ({ from: new Date(now - WINDOWS.find((w) => w.id === id).ms).toISOString(), to: new Date(now).toISOString() });
function useMap(win, opts = {}) {
  const api = useClearanceRead();
  const expand = (opts.expand ?? []).join(",");
  return usePoll(
    `map:${win}:${expand}:${opts.target ?? ""}:${opts.group ?? ""}`,
    () => api.get("/v1/map", { ...windowRange(win, Date.now()), expand: expand || void 0, target: opts.target, group: opts.group }),
    3e4
  );
}
function WindowChips({ value, onChange }) {
  return /* @__PURE__ */ jsx(FilterChips, { label: "Window", options: WINDOWS.map((w) => ({ id: w.id, label: w.label })), value, onChange });
}
function EmptyRegistry({ map }) {
  const sources = map?.registry.sources ?? [];
  return /* @__PURE__ */ jsxs(Callout, { tone: "neutral", label: "No targets published yet", title: "The Map draws what is declared, so it is empty until a cluster or account publishes its targets", "data-testid": "map-empty", children: [
    "Targets are published per cluster: each source (a cluster's gitops render, an account's bootstrap) sends the whole set of protected environments it declares, with the gates that guard each and the observers that watch it (",
    /* @__PURE__ */ jsx("code", { children: "PUT /v1/targets/{source}" }),
    ' on the Clearance core). Nothing is inferred from records, so a cluster that has not published shows nothing here, not a false "all clear".',
    sources.length > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
      " Sources that have published: ",
      sources.map((s) => `${s.source} (${s.targets})`).join(", "),
      "."
    ] })
  ] });
}
function AttentionPanel({ items, targets, onOpenTarget, onShow }) {
  const c = useMapStyles();
  return /* @__PURE__ */ jsx(Section, { framed: true, title: "Needs attention", count: items.length, "aria-label": "Needs attention", children: items.length === 0 ? /* @__PURE__ */ jsx(EmptyNote, { inset: true, children: "Nothing needs attention in this window: every declared gate is accounted for and every observer is healthy." }) : /* @__PURE__ */ jsx("ul", { className: c.attnList, children: items.map((a, i) => {
    const one = soleTarget(a, targets);
    const groups = groupsOf(a, targets);
    let action = null;
    if (one) action = /* @__PURE__ */ jsx(TextLink, { onClick: () => onOpenTarget(one.id), "aria-label": `Open ${one.name}`, children: "Open \u2192" });
    else if (groups.length > 0) action = /* @__PURE__ */ jsx(TextLink, { onClick: () => onShow(groups), "aria-label": `Show ${a.title} in the map`, children: "Show" });
    return /* @__PURE__ */ jsxs("li", { className: c.attnItem, children: [
      /* @__PURE__ */ jsx(StatusChip, { tone: SEVERITY_TONE[a.severity], title: a.severity === "info" ? "For information: nothing is failing" : a.severity, children: a.kind }),
      /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx("p", { className: c.attnTitle, children: a.title }),
        /* @__PURE__ */ jsx("p", { className: c.attnDetail, children: a.detail })
      ] }),
      action
    ] }, `${a.kind}-${i}`);
  }) }) });
}
function lanesRows(map, scopeGate, onScope, targets) {
  if (!scopeGate) {
    return map.nodes.gate_types.map((g) => ({ key: g.id, label: g.type, sub: `${g.instances} instances \xB7 ${g.targets} targets`, lanes: g.lanes, holding: g.holding, refused: g.refused, onSelect: () => onScope(g.type) }));
  }
  return targets.flatMap(
    (t) => t.gates.filter((g) => g.type === scopeGate).map((g) => ({
      key: `${t.id}:${g.instance}`,
      label: t.name,
      sub: `${scopeGate} \xB7 ${g.instance} \xB7 ${t.group}`,
      mode: g.mode,
      silent: g.silent,
      lanes: g.lanes,
      holding: g.holding,
      refused: g.refused,
      blind: t.observers.some((o) => o.state === "blind")
    }))
  );
}
function MapView({ win, onWindow, onOpenTarget }) {
  const c = useMapStyles();
  const now = useClock();
  const [view, setViewState] = useState(readView);
  const [expanded, setExpanded] = useState([]);
  const [filters, setFilters] = useState(NO_FILTERS);
  const [scopeGate, setScopeGate] = useState();
  const setView = (v) => {
    setViewState(v);
    writeView(v);
  };
  const map = useMap(win, { expand: expanded });
  useEffect(() => {
    const groups = map.data?.nodes.groups.map((g) => g.group);
    if (groups && expanded.some((g) => !groups.includes(g))) setExpanded((e) => e.filter((g) => groups.includes(g)));
  }, [map.data, expanded]);
  const data = map.data;
  const topo = useMemo(() => data ? buildTopology(data, filters, expanded) : void 0, [data, filters, expanded]);
  const tiers = useMemo(() => registryTiers(data?.nodes.targets ?? []), [data]);
  const attention = useMemo(() => data && topo ? visibleAttention(data.attention, filters, topo.targets) : [], [data, topo, filters]);
  const toggle = (g) => setExpanded((e) => e.includes(g) ? e.filter((x) => x !== g) : [...e, g]);
  const set = (patch) => setFilters((f) => ({ ...f, ...patch }));
  if (!data) {
    if (map.error) return /* @__PURE__ */ jsx(TabError, { error: map.failure ?? map.error, what: "the Map", onRetry: map.refresh });
    return /* @__PURE__ */ jsx(PanelSkeleton, { rows: 6, label: "Reading the coverage map" });
  }
  const instances = data.nodes.gate_types.reduce((n, g) => n + g.instances, 0);
  const empty = registryEmpty(data);
  const iso = map.updatedAt ? new Date(map.updatedAt).toISOString() : void 0;
  const lanes = lanesRows(data, scopeGate, setScopeGate, topo?.targets ?? []);
  const attnCount = data.attention.filter((a) => a.severity !== "info").length;
  let body;
  if (empty) {
    body = /* @__PURE__ */ jsx(EmptyRegistry, { map: data });
  } else if (view === "topology" && topo) {
    body = /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: c.split, children: [
        /* @__PURE__ */ jsxs(
          Section,
          {
            framed: true,
            title: "Clearance coverage map",
            meta: /* @__PURE__ */ jsxs(Chip, { title: "Gate instances are drawn as one node per type, targets as one node per cluster or account", children: [
              "grouped: ",
              instances,
              " gate instances \u2192 ",
              data.nodes.gate_types.length,
              " types \xB7 ",
              topo.targets.length,
              " targets \u2192 ",
              topo.groups.length,
              " groups"
            ] }),
            children: [
              topo.gates.length === 0 && topo.groups.length === 0 ? /* @__PURE__ */ jsx(EmptyNote, { inset: true, children: "Nothing matches these filters." }) : /* @__PURE__ */ jsxs(Fragment, { children: [
                /* @__PURE__ */ jsx(MapTopology, { topo, onToggleGroup: toggle, onOpenTarget }),
                /* @__PURE__ */ jsx(MapLegend, {})
              ] }),
              topo.matrix && /* @__PURE__ */ jsxs(Hint, { inset: true, children: [
                "This registry has ",
                data.nodes.targets.length,
                " targets, too many to draw as rows: the matrix below shows every one, and a group still opens its detail."
              ] })
            ]
          }
        ),
        /* @__PURE__ */ jsx(
          AttentionPanel,
          {
            items: attention,
            targets: topo.targets,
            onOpenTarget,
            onShow: (groups) => {
              setExpanded((e) => [.../* @__PURE__ */ new Set([...e, ...groups])]);
              set({ attentionOnly: false });
            }
          }
        )
      ] }),
      topo.matrix && /* @__PURE__ */ jsx(Section, { framed: true, title: "Gates \xD7 targets", count: topo.targets.length, children: /* @__PURE__ */ jsx(MapMatrix, { map: data, targets: topo.targets, onOpenTarget }) }),
      otherPartials(data.partial).length > 0 && /* @__PURE__ */ jsx(Callout, { tone: "neutral", label: "partial", children: otherPartials(data.partial).map((n) => /* @__PURE__ */ jsxs("div", { children: [
        n.field,
        ": ",
        n.reason
      ] }, n.field)) })
    ] });
  } else {
    body = /* @__PURE__ */ jsxs(
      Section,
      {
        framed: true,
        title: scopeGate ? `Lanes of ${scopeGate}` : "Where changes are, by gate type",
        meta: /* @__PURE__ */ jsx(Chip, { children: scopeGate ? "one gate type" : "aggregate across every instance" }),
        actions: scopeGate ? /* @__PURE__ */ jsx(TextLink, { onClick: () => setScopeGate(void 0), children: "All gate types \u2715" }) : void 0,
        children: [
          /* @__PURE__ */ jsx(MapLanes, { rows: lanes, partial: data.partial, empty: /* @__PURE__ */ jsx(EmptyNote, { inset: true, children: "No gate has a lane in this window." }) }),
          /* @__PURE__ */ jsx(Hint, { inset: true, children: scopeGate ? "One row per target this gate type guards." : "Click a gate type to scope the lanes to it, or open a target from the topology for the changes moving through it now." })
        ]
      }
    );
  }
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs(
      FilterBar,
      {
        end: /* @__PURE__ */ jsxs(Count, { children: [
          map.error ? "refresh failed \xB7 " : "",
          "live \xB7 updated ",
          iso ? `${relativeTime(iso, Math.max(now, map.updatedAt ?? 0))} ago` : "\u2026"
        ] }),
        children: [
          /* @__PURE__ */ jsx(WindowChips, { value: win, onChange: onWindow }),
          /* @__PURE__ */ jsx(FilterChips, { label: "View", options: [{ id: "topology", label: "Topology" }, { id: "lanes", label: "Lanes" }], value: view, onChange: setView }),
          /* @__PURE__ */ jsx(FilterGroup, { label: "Show", children: /* @__PURE__ */ jsx(FilterChip, { on: filters.attentionOnly, count: attnCount, onClick: () => set({ attentionOnly: !filters.attentionOnly }), title: "Dim everything that is healthy and guarded", children: "Needs attention only" }) }),
          tiers.length > 0 && /* @__PURE__ */ jsx(FilterChips, { label: "Registry", options: [{ id: "all", label: "All" }, ...tiers.map((r) => ({ id: r, label: r.charAt(0).toUpperCase() + r.slice(1) }))], value: filters.registry, onChange: (r) => set({ registry: r }) }),
          /* @__PURE__ */ jsx(SearchField, { label: "Search targets", placeholder: "target, app, group, gate", value: filters.query, onChange: (q) => set({ query: q }) })
        ]
      }
    ),
    map.error && /* @__PURE__ */ jsxs(Callout, { tone: "warn", title: "Couldn't refresh the Map", children: [
      readDeniedText(map.failure ?? map.error),
      " Showing the last read."
    ] }),
    data.truncated && /* @__PURE__ */ jsx(Callout, { tone: "warn", title: "This Map was cut short", children: "Clearance returned a truncated map for this window. Narrow it (a shorter window, or one group) before trusting a count." }),
    data.registry.conflicts.length > 0 && /* @__PURE__ */ jsxs(Callout, { tone: "warn", title: "Two sources declare the same target", children: [
      data.registry.conflicts.join("; "),
      ". The first source's declaration is the one shown."
    ] }),
    body,
    !empty && /* @__PURE__ */ jsxs(Hint, { children: [
      data.registry.targets,
      " declared targets from ",
      data.registry.sources.length,
      " ",
      data.registry.sources.length === 1 ? "source" : "sources",
      " \xB7 ",
      instances,
      " gate instances \xB7 window ",
      data.from.slice(0, 16).replace("T", " "),
      " to ",
      data.to.slice(11, 16),
      " UTC."
    ] })
  ] });
}

export { EmptyRegistry, MapView, WindowChips, lanesRows, readView, useMap, windowRange };
//# sourceMappingURL=MapView.esm.js.map
