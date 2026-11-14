import { useSearchParams } from 'react-router-dom';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { fontBody, CoverageStrip, PageHeader, ProductMark, Subtabs, useClearanceTokens, type ClearanceTokens } from '../kit';
import { EvidenceView } from './evidence/EvidenceView';
import { PolicyView } from './policy/PolicyView';
import { ClearancesView } from './clearances/ClearancesView';
import { ExceptionsView } from './exceptions/ExceptionsView';
import { MapTab } from './map';
import { AttestationsView } from './attestations/AttestationsView';

// The Clearance page: its own header and tab bar, views by ?view=clearances|evidence|exceptions|map|policy (map&target=<id> is one environment's detail; evidence&app= and exceptions&scope= arrive pre-filtered from it) (clearances&change=<id>
// is the clearance-gate check's PR-comment link). Tower reads these; nothing here
// edits a record or a rule (a policy change is a Clearance release or a PR).

export type ClearanceView = 'clearances' | 'evidence' | 'exceptions' | 'attestations' | 'map' | 'policy';
export const CLEARANCE_VIEWS: Array<{ id: ClearanceView; label: string; sub: string }> = [
  { id: 'clearances', label: 'Clearances', sub: 'Every change to a protected environment, its tier from what the rendered manifests change, and who cleared it. Tiers 0 and 1 clear by policy; 2 and 3 wait for the app\'s owners (and an outside group for tier 3), never the proposer.' },
  { id: 'evidence', label: 'Evidence', sub: 'One record per decision. Each field says whether Clearance verified it or an integration only claimed it. Nothing here edits them.' },
  { id: 'exceptions', label: 'Exceptions', sub: 'What Clearance saw and did not clear, by coverage state: who did it, what changed and how each one ended. A scope whose feeds are not healthy is never reported clean. An admin resolves one here; the record is append-only and names them.' },
  { id: 'attestations', label: 'Attestations', sub: 'Every signed statement that Clearance cleared a change and a deploy applied it, with the log entry that proves when. Open a row for the change, its history and the bundle to verify offline.' },
  { id: 'map', label: 'Map', sub: 'What should be protected, who guards and watches it, and whether the evidence agrees: gate types, protected targets and the observers behind them on one page, with the problems pulled to the front. Open a target for its detail.' },
  { id: 'policy', label: 'Policy', sub: 'The rules every call is decided by, in the order they run, and the tools they govern. This page explains and tests; a change is a release or a PR.' },
];

const useStyles = makeStyles<Theme, { t: ClearanceTokens }>(() => ({
  root: { background: ({ t }) => t.bg, minHeight: '100vh', color: ({ t }) => t.textHi, fontFamily: fontBody, padding: '22px 24px 40px' },
  // One 16px rhythm between the coverage banner, the filter bar and the panels (the kit's card gap), not per-element margins.
  body: { paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 16 },
}));

export function ClearancePage() {
  const t = useClearanceTokens();
  const c = useStyles({ t });
  const [params, setParams] = useSearchParams();
  const raw = params.get('view');
  const view: ClearanceView = raw === 'policy' || raw === 'clearances' || raw === 'exceptions' || raw === 'attestations' || raw === 'map' ? raw : 'evidence';
  const current = CLEARANCE_VIEWS.find(v => v.id === view)!;
  return (
    <div className={c.root}>
      <PageHeader eyebrow={<><ProductMark product="clearance" size={20} /> Clearance · {view === 'clearances' || view === 'attestations' ? 'deployment' : 'runtime'} boundary</>} title={current.label} subtitle={current.sub} />
      <Subtabs label="Clearance sections" tabs={CLEARANCE_VIEWS.map(v => ({ id: v.id, label: v.label }))} value={view} onChange={id => setParams({ view: id })} />
      <div className={c.body}>
        {view !== 'exceptions' && view !== 'policy' && view !== 'attestations' && view !== 'map' && <CoverageStrip />}
        {view === 'clearances' && <ClearancesView initial={params.get('change') ?? undefined} />}
        {view === 'evidence' && <EvidenceView initialApp={params.get('app') ?? undefined} />}
        {view === 'exceptions' && <ExceptionsView initialScope={params.get('scope') ?? undefined} />}
        {view === 'map' && <MapTab target={params.get('target') ?? undefined} onOpenTarget={id => setParams(id ? { view: 'map', target: id } : { view: 'map' })} onNavigate={p => setParams(p)} />}
        {view === 'attestations' && <AttestationsView initial={params.get('change') ?? undefined} onOpenChange={id => setParams({ view: 'clearances', change: id })} />}
        {view === 'policy' && <PolicyView />}
      </div>
    </div>
  );
}
