import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import { fontBody, useClearanceTokens } from '../kit/tokens.esm.js';
import 'react';
import { PageHeader, Subtabs } from '../kit/kit.esm.js';
import '../kit/components.esm.js';
import '../kit/FlightLog.esm.js';
import '../kit/transport.esm.js';
import { ProductMark } from '../kit/ProductMark.esm.js';
import { CoverageStrip } from '../kit/coverage.esm.js';
import '../kit/Pager.esm.js';
import '../kit/kitStyles.esm.js';
import '../kit/ExpandRow.esm.js';
import { EvidenceView } from './evidence/EvidenceView.esm.js';
import { PolicyView } from './policy/PolicyView.esm.js';
import { ClearancesView } from './clearances/ClearancesView.esm.js';
import { ExceptionsView } from './exceptions/ExceptionsView.esm.js';
import { MapTab } from './map/index.esm.js';
import { AttestationsView } from './attestations/AttestationsView.esm.js';

const CLEARANCE_VIEWS = [
  { id: "clearances", label: "Clearances", sub: "Every change to a protected environment, its tier from what the rendered manifests change, and who cleared it. Tiers 0 and 1 clear by policy; 2 and 3 wait for the app's owners (and an outside group for tier 3), never the proposer." },
  { id: "evidence", label: "Evidence", sub: "One record per decision. Each field says whether Clearance verified it or an integration only claimed it. Nothing here edits them." },
  { id: "exceptions", label: "Exceptions", sub: "What Clearance saw and did not clear, by coverage state: who did it, what changed and how each one ended. A scope whose feeds are not healthy is never reported clean. An admin resolves one here; the record is append-only and names them." },
  { id: "attestations", label: "Attestations", sub: "Every signed statement that Clearance cleared a change and a deploy applied it, with the log entry that proves when. Open a row for the change, its history and the bundle to verify offline." },
  { id: "map", label: "Map", sub: "What should be protected, who guards and watches it, and whether the evidence agrees: gate types, protected targets and the observers behind them on one page, with the problems pulled to the front. Open a target for its detail." },
  { id: "policy", label: "Policy", sub: "The rules every call is decided by, in the order they run, and the tools they govern. This page explains and tests; a change is a release or a PR." }
];
const useStyles = makeStyles(() => ({
  root: { background: ({ t }) => t.bg, minHeight: "100vh", color: ({ t }) => t.textHi, fontFamily: fontBody, padding: "22px 24px 40px" },
  // One 16px rhythm between the coverage banner, the filter bar and the panels (the kit's card gap), not per-element margins.
  body: { paddingTop: 20, display: "flex", flexDirection: "column", gap: 16 }
}));
function ClearancePage() {
  const t = useClearanceTokens();
  const c = useStyles({ t });
  const [params, setParams] = useSearchParams();
  const raw = params.get("view");
  const view = raw === "policy" || raw === "clearances" || raw === "exceptions" || raw === "attestations" || raw === "map" ? raw : "evidence";
  const current = CLEARANCE_VIEWS.find((v) => v.id === view);
  return /* @__PURE__ */ jsxs("div", { className: c.root, children: [
    /* @__PURE__ */ jsx(PageHeader, { eyebrow: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(ProductMark, { product: "clearance", size: 20 }),
      " Clearance \xB7 ",
      view === "clearances" || view === "attestations" ? "deployment" : "runtime",
      " boundary"
    ] }), title: current.label, subtitle: current.sub }),
    /* @__PURE__ */ jsx(Subtabs, { label: "Clearance sections", tabs: CLEARANCE_VIEWS.map((v) => ({ id: v.id, label: v.label })), value: view, onChange: (id) => setParams({ view: id }) }),
    /* @__PURE__ */ jsxs("div", { className: c.body, children: [
      view !== "exceptions" && view !== "policy" && view !== "attestations" && view !== "map" && /* @__PURE__ */ jsx(CoverageStrip, {}),
      view === "clearances" && /* @__PURE__ */ jsx(ClearancesView, { initial: params.get("change") ?? void 0 }),
      view === "evidence" && /* @__PURE__ */ jsx(EvidenceView, { initialApp: params.get("app") ?? void 0 }),
      view === "exceptions" && /* @__PURE__ */ jsx(ExceptionsView, { initialScope: params.get("scope") ?? void 0 }),
      view === "map" && /* @__PURE__ */ jsx(MapTab, { target: params.get("target") ?? void 0, onOpenTarget: (id) => setParams(id ? { view: "map", target: id } : { view: "map" }), onNavigate: (p) => setParams(p) }),
      view === "attestations" && /* @__PURE__ */ jsx(AttestationsView, { initial: params.get("change") ?? void 0, onOpenChange: (id) => setParams({ view: "clearances", change: id }) }),
      view === "policy" && /* @__PURE__ */ jsx(PolicyView, {})
    ] })
  ] });
}

export { CLEARANCE_VIEWS, ClearancePage };
//# sourceMappingURL=ClearancePage.esm.js.map
