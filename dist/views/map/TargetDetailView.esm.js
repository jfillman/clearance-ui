import { jsx, jsxs, Fragment } from 'react/jsx-runtime';
import '@material-ui/core/styles';
import { relativeTime } from '../../kit/format.esm.js';
import 'react';
import { useTableKit, TabError, PanelSkeleton, TextLink, Callout, Chip, StatusChip, Hint, Card, EmptyNote, Section } from '../../kit/kit.esm.js';
import '../../kit/components.esm.js';
import '../../kit/FlightLog.esm.js';
import '../../kit/transport.esm.js';
import '../../kit/coverage.esm.js';
import '../../kit/Pager.esm.js';
import { TierBadge } from '../../kit/tiers.esm.js';
import '../../kit/ExpandRow.esm.js';
import { useMap, EmptyRegistry, WindowChips } from './MapView.esm.js';
import { MapLanes } from './MapLanes.esm.js';
import { useClock, statusWord, statusTone, ModeChip, CoverageMix } from './parts.esm.js';
import { useMapStyles } from './styles.esm.js';

const OBSERVER_TONE = { healthy: "ok", degraded: "warn", blind: "bad" };
function ageWords(seconds) {
  if (seconds < 90) return `${Math.max(0, Math.round(seconds))} s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} m`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} d`;
}
const CHANGE_TONES = { holding: "warn", cleared: "ok", verified: "ok", denied: "bad" };
const changeTone = (state) => CHANGE_TONES[state] ?? "neutral";
const verifiedTone = (pct) => {
  if (pct === null) return "neutral";
  return pct >= 95 ? "ok" : "warn";
};
function ObserverRow({ o, now }) {
  const c = useMapStyles();
  return /* @__PURE__ */ jsxs("li", { className: c.listRow, children: [
    /* @__PURE__ */ jsx(StatusChip, { tone: OBSERVER_TONE[o.state] ?? "neutral", dot: true, title: o.stale ? "No health record inside its interval" : void 0, children: o.stale && o.state === "healthy" ? "stale" : o.state }),
    /* @__PURE__ */ jsxs("div", { className: c.grow, children: [
      /* @__PURE__ */ jsx("span", { className: c.rowName, children: o.provider }),
      /* @__PURE__ */ jsxs("span", { className: c.rowMeta, children: [
        o.source !== o.provider ? `${o.source} \xB7 ` : "",
        o.last_ts ? `health record ${relativeTime(o.last_ts, now)} ago` : "never seen: no health record",
        o.failed_checks.length > 0 ? ` \xB7 failing: ${o.failed_checks.join(", ")}` : ""
      ] })
    ] })
  ] });
}
function recordLine(r) {
  const extra = r;
  const parts = [typeof extra.coverage === "string" ? extra.coverage : "", typeof extra.result === "string" ? extra.result : ""].filter(Boolean);
  return parts.join(" \xB7 ");
}
function RecordRow({ r, now, exception }) {
  const c = useMapStyles();
  const denied = r.decision === "deny";
  const tone = exception || denied ? "bad" : "ok";
  const words = ["recorded", "denied", "exception"];
  const word = words[exception ? 2 : Number(denied)];
  return /* @__PURE__ */ jsxs("li", { className: c.listRow, children: [
    /* @__PURE__ */ jsx(StatusChip, { tone, children: word }),
    /* @__PURE__ */ jsxs("div", { className: c.grow, children: [
      /* @__PURE__ */ jsx("span", { className: c.rowName, children: r.tool }),
      recordLine(r) && /* @__PURE__ */ jsx("span", { className: c.rowMeta, children: recordLine(r) })
    ] }),
    /* @__PURE__ */ jsxs("span", { className: c.rowMeta, children: [
      "seq ",
      r.seq.toLocaleString(),
      " \xB7 ",
      relativeTime(r.ts, now),
      " ago"
    ] })
  ] });
}
function TargetDetailView({ id, win, onWindow, onBack, onNavigate }) {
  const c = useMapStyles();
  const tk = useTableKit();
  const now = useClock();
  const map = useMap(win, { target: id });
  const data = map.data;
  if (!data) return map.error ? /* @__PURE__ */ jsx(TabError, { error: map.failure ?? map.error, what: "this environment", onRetry: map.refresh }) : /* @__PURE__ */ jsx(PanelSkeleton, { rows: 6, label: "Reading this environment" });
  const node = data.nodes.targets.find((t) => t.id === id);
  const back = /* @__PURE__ */ jsxs("div", { className: c.crumbs, "aria-label": "Breadcrumb", role: "navigation", children: [
    /* @__PURE__ */ jsx(TextLink, { onClick: onBack, children: "Map" }),
    /* @__PURE__ */ jsx("span", { "aria-hidden": true, children: "\u203A" }),
    /* @__PURE__ */ jsx("span", { children: node?.group ?? "\u2026" }),
    /* @__PURE__ */ jsx("span", { "aria-hidden": true, children: "\u203A" }),
    /* @__PURE__ */ jsx("span", { "aria-current": "page", children: node?.name ?? id })
  ] });
  if (!node) {
    return /* @__PURE__ */ jsxs(Fragment, { children: [
      back,
      data.registry.targets === 0 ? /* @__PURE__ */ jsx(EmptyRegistry, { map: data }) : /* @__PURE__ */ jsx(Callout, { tone: "warn", title: `No declared target is named ${id}`, children: "It may have been removed from its source's declared set, or the link is stale. Go back to the Map to find it." }),
      /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx(TextLink, { onClick: onBack, children: "\u2039 Back to the map" }) })
    ] });
  }
  const detail = data.target ?? { changes: [], exceptions: [], evidence: [] };
  const flagged = node.gates.filter((g) => g.mode === "flag" && !g.silent).length;
  const blind = node.observers.some((o) => o.state === "blind");
  const evidenceParams = { view: "evidence", ...node.app ? { app: node.app } : {} };
  const exceptionParams = { view: "exceptions", ...node.scope ? { scope: node.scope } : {} };
  const laneRows = node.gates.map((g) => ({ key: g.instance, label: g.type, sub: g.instance, mode: g.mode, silent: g.silent, lanes: g.lanes, holding: g.holding, refused: g.refused, blind }));
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    back,
    /* @__PURE__ */ jsxs("div", { className: c.detailTitle, children: [
      /* @__PURE__ */ jsx("h2", { className: c.detailName, children: node.name }),
      node.env && /* @__PURE__ */ jsx(Chip, { children: node.env }),
      /* @__PURE__ */ jsx(Chip, { tone: "sky", title: "What kind of protected target it is", children: node.kind }),
      node.registry && /* @__PURE__ */ jsx(Chip, { title: "The registry tier it deploys from", children: node.registry }),
      /* @__PURE__ */ jsx(StatusChip, { tone: statusTone(node.status), dot: true, children: statusWord(node.status) }),
      /* @__PURE__ */ jsx(StatusChip, { tone: verifiedTone(node.verified_pct), title: "authorized-and-verified over everything assessed in the window", children: node.verified_pct === null ? "no coverage yet" : `${Math.round(node.verified_pct)}% authorized-and-verified` }),
      flagged > 0 && /* @__PURE__ */ jsxs(StatusChip, { tone: "warn", title: "Refusals are recorded, not enforced", children: [
        flagged,
        " gate",
        flagged > 1 ? "s" : "",
        " in flag mode"
      ] }),
      detail.exceptions.length > 0 && /* @__PURE__ */ jsxs(StatusChip, { tone: "bad", children: [
        detail.exceptions.length,
        " exception",
        detail.exceptions.length > 1 ? "s" : ""
      ] })
    ] }),
    /* @__PURE__ */ jsxs(Hint, { children: [
      "One protected environment: who guards it, who watches it, and every change on its way through. Owned by ",
      node.owner ?? "nobody declared",
      "; declared by ",
      node.source,
      "."
    ] }),
    /* @__PURE__ */ jsx(WindowChips, { value: win, onChange: onWindow }),
    map.error && /* @__PURE__ */ jsx(Callout, { tone: "warn", title: "Couldn't refresh", children: "Showing the last read." }),
    data.partial.some((n) => n.field.startsWith("targets.")) && !node.app && /* @__PURE__ */ jsx(Callout, { tone: "neutral", label: "partial", children: "This target declares no app, so Clearance cannot attribute decisions, holds or lanes to it." }),
    !node.scope && /* @__PURE__ */ jsx(Callout, { tone: "neutral", label: "partial", children: "This target declares no coverage scope, so it has no coverage mix or observer health." }),
    /* @__PURE__ */ jsxs("div", { className: c.twoUp, children: [
      /* @__PURE__ */ jsx(Card, { title: "Guarded by", meta: /* @__PURE__ */ jsxs(Chip, { children: [
        node.gates.length,
        " gate",
        node.gates.length === 1 ? "" : "s"
      ] }), children: node.gates.length === 0 ? /* @__PURE__ */ jsx(EmptyNote, { children: "No gate is declared for this target: changes reach it unchecked." }) : /* @__PURE__ */ jsx("ul", { className: c.listRows, children: node.gates.map((g) => /* @__PURE__ */ jsxs("li", { className: c.listRow, children: [
        /* @__PURE__ */ jsx(ModeChip, { mode: g.mode, silent: g.silent }),
        /* @__PURE__ */ jsxs("div", { className: c.grow, children: [
          /* @__PURE__ */ jsx("span", { className: c.rowName, children: g.type }),
          /* @__PURE__ */ jsxs("span", { className: c.rowMeta, children: [
            g.instance,
            g.attributed ? "" : " \xB7 records not attributed to this target"
          ] })
        ] }),
        /* @__PURE__ */ jsxs("span", { className: c.rowMeta, children: [
          g.decisions.toLocaleString(),
          " decisions",
          g.refused ? ` \xB7 ${g.refused} ${g.mode === "flag" ? "would refuse" : "refused"}` : ""
        ] })
      ] }, g.instance)) }) }),
      /* @__PURE__ */ jsxs(Card, { title: "Watched by", meta: /* @__PURE__ */ jsxs(Chip, { children: [
        node.observers.length,
        " observer",
        node.observers.length === 1 ? "" : "s"
      ] }), children: [
        node.observers.length === 0 ? /* @__PURE__ */ jsx(EmptyNote, { children: "No observer is declared: nothing can verify what was applied here." }) : /* @__PURE__ */ jsx("ul", { className: c.listRows, children: node.observers.map((o) => /* @__PURE__ */ jsx(ObserverRow, { o, now }, `${o.provider}/${o.source}`)) }),
        /* @__PURE__ */ jsx(Hint, { children: "If an observer goes blind, Observed and Verified below say so, and the mix gains a coverage-unavailable share." })
      ] }),
      /* @__PURE__ */ jsx(Card, { title: "Coverage, this window", meta: /* @__PURE__ */ jsx(Chip, { children: node.scope ?? "no scope" }), children: /* @__PURE__ */ jsx(CoverageMix, { coverage: node.coverage }) })
    ] }),
    /* @__PURE__ */ jsx(Section, { framed: true, title: "Changes through each gate, this environment", meta: /* @__PURE__ */ jsx(Chip, { children: "same lanes as the Map's Lanes view" }), children: /* @__PURE__ */ jsx(MapLanes, { rows: laneRows, partial: data.partial, empty: /* @__PURE__ */ jsx(EmptyNote, { inset: true, children: "No gate is declared for this target, so there are no lanes." }) }) }),
    /* @__PURE__ */ jsx(Section, { framed: true, title: "Changes moving now", count: detail.changes.length, children: detail.changes.length === 0 ? /* @__PURE__ */ jsx(EmptyNote, { inset: true, children: "No change is moving through this environment in this window (or none you may see)." }) : /* @__PURE__ */ jsxs("table", { className: tk.table, children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("th", { className: tk.th, children: "Tier" }),
        /* @__PURE__ */ jsx("th", { className: tk.th, children: "Change" }),
        /* @__PURE__ */ jsx("th", { className: tk.th, children: "State" }),
        /* @__PURE__ */ jsx("th", { className: tk.th, children: "Age" })
      ] }) }),
      /* @__PURE__ */ jsx("tbody", { children: detail.changes.map((ch) => /* @__PURE__ */ jsxs("tr", { children: [
        /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx(TierBadge, { tier: ch.tier }) }),
        /* @__PURE__ */ jsxs("td", { className: tk.td, children: [
          /* @__PURE__ */ jsxs(TextLink, { onClick: () => onNavigate({ view: "clearances", change: ch.id }), "aria-label": `Open change ${ch.repo} #${ch.pr}`, children: [
            ch.repo,
            " #",
            ch.pr
          ] }),
          /* @__PURE__ */ jsx("div", { className: tk.meta, children: [ch.owner ? `owner ${ch.owner}` : "", ch.cleared_by ? `cleared by ${ch.cleared_by}` : ""].filter(Boolean).join(" \xB7 ") })
        ] }),
        /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx(StatusChip, { tone: changeTone(ch.state), children: ch.state }) }),
        /* @__PURE__ */ jsx("td", { className: tk.td, children: ageWords(ch.age_seconds) })
      ] }, ch.id)) })
    ] }) }),
    /* @__PURE__ */ jsxs(
      Section,
      {
        framed: true,
        title: "Exceptions and recent evidence",
        actions: /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(TextLink, { onClick: () => onNavigate(exceptionParams), children: "Exceptions \u2192" }),
          /* @__PURE__ */ jsx(TextLink, { onClick: () => onNavigate(evidenceParams), children: "Evidence \u2192" })
        ] }),
        children: [
          detail.exceptions.length === 0 && detail.evidence.length === 0 ? /* @__PURE__ */ jsx(EmptyNote, { inset: true, children: "No exception and no deployment record for this target in this window." }) : /* @__PURE__ */ jsx("div", { className: c.pad, children: /* @__PURE__ */ jsxs("ul", { className: c.listRows, children: [
            detail.exceptions.map((r) => /* @__PURE__ */ jsx(RecordRow, { r, now, exception: true }, `x${r.seq}`)),
            detail.evidence.filter((r) => !detail.exceptions.some((x) => x.seq === r.seq)).map((r) => /* @__PURE__ */ jsx(RecordRow, { r, now }, `e${r.seq}`))
          ] }) }),
          /* @__PURE__ */ jsxs(Hint, { inset: true, children: [
            "The links open the tab pre-filtered to this target",
            node.app ? `: app ${node.app}` : "",
            node.scope ? `, scope ${node.scope}` : "",
            "."
          ] })
        ]
      }
    ),
    /* @__PURE__ */ jsx("div", { children: /* @__PURE__ */ jsx(TextLink, { onClick: onBack, children: "\u2039 Back to the map" }) })
  ] });
}

export { TargetDetailView };
//# sourceMappingURL=TargetDetailView.esm.js.map
