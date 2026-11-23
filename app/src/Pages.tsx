import type { ReactNode } from 'react';
import { Navigate, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import {
  AttestationsView,
  CLEARANCE_VIEWS,
  ClearancesView,
  CoverageStrip,
  CoverageView,
  EvidenceView,
  isCoverageTab,
  useOpenExceptionCount,
  fontBody,
  MapTab,
  PageHeader,
  PolicyView,
  ProductMark,
  useMountedNow,
  useClearanceTokens,
  type ClearanceTokens,
  type ClearanceView,
} from '../../src';

// One route per Clearance page. Each is the package's host-agnostic view under the page header Backstage's
// ClearancePage draws (same titles and subtitles, from CLEARANCE_VIEWS); the router carries the view's state in the
// URL: ?app= (the picker), ?change= (a clearance), ?target= (a map target), ?scope=.

const useStyles = makeStyles<Theme, { t: ClearanceTokens }>(() => ({
  root: { background: ({ t }) => t.bg, minHeight: 'calc(100vh - 52px)', color: ({ t }) => t.textHi, fontFamily: fontBody, padding: '22px 24px 40px' },
  body: { paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 16 },
}));

function Page({ view, coverage = true, children }: { view: ClearanceView; coverage?: boolean; children: ReactNode }) {
  const t = useClearanceTokens();
  const c = useStyles({ t });
  const current = CLEARANCE_VIEWS.find(v => v.id === view)!;
  return (
    <main className={c.root}>
      <PageHeader eyebrow={<><ProductMark product="clearance" size={20} /> Clearance · {view === 'clearances' || view === 'attestations' ? 'deployment' : 'runtime'} boundary</>} title={current.label} subtitle={current.sub} />
      <div className={c.body}>
        {coverage && <CoverageStrip />}
        {children}
      </div>
    </main>
  );
}

function ClearancesPage() {
  const [params] = useSearchParams();
  const app = params.get('app') ?? undefined;
  // Keyed by app so the picker re-scopes the view rather than leaving it on the last app's filter.
  return <Page view="clearances"><ClearancesView key={app ?? ''} app={app} initial={params.get('change') ?? undefined} /></Page>;
}

function EvidencePage() {
  const [params] = useSearchParams();
  const app = params.get('app') ?? undefined;
  return <Page view="evidence"><EvidenceView key={app ?? ''} initialApp={app} /></Page>;
}

function CoveragePage() {
  const [params, setParams] = useSearchParams();
  const rawTab = params.get('tab');
  const open = useOpenExceptionCount(useMountedNow());
  return (
    <Page view="coverage" coverage={false}>
      <CoverageView tab={isCoverageTab(rawTab) ? rawTab : 'open'} scope={params.get('scope') ?? undefined} openCount={open.failed ? '?' : open.count} onScope={scope => setParams({ tab: isCoverageTab(rawTab) ? rawTab : 'open', ...(scope ? { scope } : {}) })} onTab={(t, scope) => { const keep = scope ?? params.get('scope'); setParams({ tab: t, ...(keep ? { scope: keep } : {}) }); }} />
    </Page>
  );
}

// The old Exceptions link (the Map's, a pasted URL): the same list, now the Coverage page's Open exceptions tab.
function ExceptionsRedirect() {
  const [params] = useSearchParams();
  const scope = params.get('scope');
  return <Navigate to={`/coverage?tab=open${scope ? `&scope=${encodeURIComponent(scope)}` : ''}`} replace />;
}

function AttestationsPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  return <Page view="attestations" coverage={false}><AttestationsView initial={params.get('change') ?? undefined} onOpenChange={id => navigate(`/clearances?change=${encodeURIComponent(id)}`)} /></Page>;
}

function MapPage() {
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  return (
    <Page view="map" coverage={false}>
      <MapTab
        target={params.get('target') ?? undefined}
        onOpenTarget={id => setParams(id ? { target: id } : {})}
        onNavigate={({ view, ...rest }) => navigate(`/${view}${Object.keys(rest).length ? `?${new URLSearchParams(rest)}` : ''}`)}
      />
    </Page>
  );
}

function PolicyPage() {
  return <Page view="policy" coverage={false}><PolicyView /></Page>;
}

export function Pages() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/clearances" replace />} />
      <Route path="/clearances" element={<ClearancesPage />} />
      <Route path="/evidence" element={<EvidencePage />} />
      <Route path="/coverage" element={<CoveragePage />} />
      <Route path="/exceptions" element={<ExceptionsRedirect />} />
      <Route path="/attestations" element={<AttestationsPage />} />
      <Route path="/map" element={<MapPage />} />
      <Route path="/policy" element={<PolicyPage />} />
      <Route path="*" element={<Navigate to="/clearances" replace />} />
    </Routes>
  );
}
