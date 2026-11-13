import { Callout, Card, Chip, EmptyNote, Hint, PanelSkeleton, relativeTime, Section, StatusChip, TabError, TextLink, TierBadge, useTableKit, type EvidenceRecord, type StatusTone } from '../../kit';
import { EmptyRegistry, useMap, WindowChips } from './MapView';
import { MapLanes } from './MapLanes';
import { CoverageMix, ModeChip, statusTone, statusWord, useClock } from './parts';
import { useMapStyles } from './styles';
import type { WindowId } from './model';
import type { MapChange, ObserverRef, TargetNode } from './types';

// One protected environment (board C10, the Map's drill-down): who guards it and in what mode, who watches it and how healthy
// they are, the coverage mix, the same lanes as the Map scoped to this target, the changes moving through it now, and its
// exceptions and recent evidence, each linked to the tab pre-filtered to this target.

export type Navigate = (params: Record<string, string>) => void;

const OBSERVER_TONE: Record<string, StatusTone> = { healthy: 'ok', degraded: 'warn', blind: 'bad' };

function ageWords(seconds: number): string {
  if (seconds < 90) return `${Math.max(0, Math.round(seconds))} s`;
  if (seconds < 5400) return `${Math.round(seconds / 60)} m`;
  if (seconds < 172800) return `${Math.round(seconds / 3600)} h`;
  return `${Math.round(seconds / 86400)} d`;
}

const CHANGE_TONES: Record<string, StatusTone> = { holding: 'warn', cleared: 'ok', verified: 'ok', denied: 'bad' };
const changeTone = (state: string): StatusTone => CHANGE_TONES[state] ?? 'neutral';

const verifiedTone = (pct: number | null): StatusTone => {
  if (pct === null) return 'neutral';
  return pct >= 95 ? 'ok' : 'warn';
};

function ObserverRow({ o, now }: { o: ObserverRef; now: number }) {
  const c = useMapStyles();
  return (
    <li className={c.listRow}>
      <StatusChip tone={OBSERVER_TONE[o.state] ?? 'neutral'} dot title={o.stale ? 'No health record inside its interval' : undefined}>{o.stale && o.state === 'healthy' ? 'stale' : o.state}</StatusChip>
      <div className={c.grow}>
        <span className={c.rowName}>{o.provider}</span>
        <span className={c.rowMeta}>
          {o.source !== o.provider ? `${o.source} · ` : ''}
          {o.last_ts ? `health record ${relativeTime(o.last_ts, now)} ago` : 'never seen: no health record'}
          {o.failed_checks.length > 0 ? ` · failing: ${o.failed_checks.join(', ')}` : ''}
        </span>
      </div>
    </li>
  );
}

function recordLine(r: EvidenceRecord): string {
  const extra = r as unknown as { result?: unknown; coverage?: unknown };
  const parts = [typeof extra.coverage === 'string' ? extra.coverage : '', typeof extra.result === 'string' ? extra.result : ''].filter(Boolean);
  return parts.join(' · ');
}

function RecordRow({ r, now, exception }: { r: EvidenceRecord; now: number; exception?: boolean }) {
  const c = useMapStyles();
  const denied = r.decision === 'deny';
  const tone: StatusTone = exception || denied ? 'bad' : 'ok';
  const words = ['recorded', 'denied', 'exception'];
  const word = words[exception ? 2 : Number(denied)];
  return (
    <li className={c.listRow}>
      <StatusChip tone={tone}>{word}</StatusChip>
      <div className={c.grow}>
        <span className={c.rowName}>{r.tool}</span>
        {recordLine(r) && <span className={c.rowMeta}>{recordLine(r)}</span>}
      </div>
      <span className={c.rowMeta}>seq {r.seq.toLocaleString()} · {relativeTime(r.ts, now)} ago</span>
    </li>
  );
}

export function TargetDetailView({ id, win, onWindow, onBack, onNavigate }: { id: string; win: WindowId; onWindow: (w: WindowId) => void; onBack: () => void; onNavigate: Navigate }) {
  const c = useMapStyles();
  const tk = useTableKit();
  const now = useClock();
  const map = useMap(win, { target: id });
  const data = map.data;
  if (!data) return map.error ? <TabError error={map.failure ?? map.error} what="this environment" onRetry={map.refresh} /> : <PanelSkeleton rows={6} label="Reading this environment" />;
  const node: TargetNode | undefined = data.nodes.targets.find(t => t.id === id);
  const back = (
    <div className={c.crumbs} aria-label="Breadcrumb" role="navigation">
      <TextLink onClick={onBack}>Map</TextLink>
      <span aria-hidden>›</span>
      <span>{node?.group ?? '…'}</span>
      <span aria-hidden>›</span>
      <span aria-current="page">{node?.name ?? id}</span>
    </div>
  );
  if (!node) {
    return (
      <>
        {back}
        {data.registry.targets === 0 ? <EmptyRegistry map={data} /> : <Callout tone="warn" title={`No declared target is named ${id}`}>It may have been removed from its source&apos;s declared set, or the link is stale. Go back to the Map to find it.</Callout>}
        <div><TextLink onClick={onBack}>‹ Back to the map</TextLink></div>
      </>
    );
  }
  const detail = data.target ?? { changes: [], exceptions: [], evidence: [] };
  const flagged = node.gates.filter(g => g.mode === 'flag' && !g.silent).length;
  const blind = node.observers.some(o => o.state === 'blind');
  const evidenceParams: Record<string, string> = { view: 'evidence', ...(node.app ? { app: node.app } : {}) };
  const exceptionParams: Record<string, string> = { view: 'exceptions', ...(node.scope ? { scope: node.scope } : {}) };
  const laneRows = node.gates.map(g => ({ key: g.instance, label: g.type, sub: g.instance, mode: g.mode, silent: g.silent, lanes: g.lanes, holding: g.holding, refused: g.refused, blind }));
  return (
    <>
      {back}
      <div className={c.detailTitle}>
        <h2 className={c.detailName}>{node.name}</h2>
        {node.env && <Chip>{node.env}</Chip>}
        <Chip tone="sky" title="What kind of protected target it is">{node.kind}</Chip>
        {node.registry && <Chip title="The registry tier it deploys from">{node.registry}</Chip>}
        <StatusChip tone={statusTone(node.status)} dot>{statusWord(node.status)}</StatusChip>
        <StatusChip tone={verifiedTone(node.verified_pct)} title="authorized-and-verified over everything assessed in the window">{node.verified_pct === null ? 'no coverage yet' : `${Math.round(node.verified_pct)}% authorized-and-verified`}</StatusChip>
        {flagged > 0 && <StatusChip tone="warn" title="Refusals are recorded, not enforced">{flagged} gate{flagged > 1 ? 's' : ''} in flag mode</StatusChip>}
        {detail.exceptions.length > 0 && <StatusChip tone="bad">{detail.exceptions.length} exception{detail.exceptions.length > 1 ? 's' : ''}</StatusChip>}
      </div>
      <Hint>One protected environment: who guards it, who watches it, and every change on its way through. Owned by {node.owner ?? 'nobody declared'}; declared by {node.source}.</Hint>
      <WindowChips value={win} onChange={onWindow} />
      {map.error && <Callout tone="warn" title="Couldn't refresh">Showing the last read.</Callout>}
      {data.partial.some(n => n.field.startsWith('targets.')) && !node.app && (
        <Callout tone="neutral" label="partial">This target declares no app, so Clearance cannot attribute decisions, holds or lanes to it.</Callout>
      )}
      {!node.scope && <Callout tone="neutral" label="partial">This target declares no coverage scope, so it has no coverage mix or observer health.</Callout>}

      <div className={c.twoUp}>
        <Card title="Guarded by" meta={<Chip>{node.gates.length} gate{node.gates.length === 1 ? '' : 's'}</Chip>}>
          {node.gates.length === 0 ? (
            <EmptyNote>No gate is declared for this target: changes reach it unchecked.</EmptyNote>
          ) : (
            <ul className={c.listRows}>
              {node.gates.map(g => (
                <li key={g.instance} className={c.listRow}>
                  <ModeChip mode={g.mode} silent={g.silent} />
                  <div className={c.grow}>
                    <span className={c.rowName}>{g.type}</span>
                    <span className={c.rowMeta}>{g.instance}{g.attributed ? '' : ' · records not attributed to this target'}</span>
                  </div>
                  <span className={c.rowMeta}>{g.decisions.toLocaleString()} decisions{g.refused ? ` · ${g.refused} ${g.mode === 'flag' ? 'would refuse' : 'refused'}` : ''}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Watched by" meta={<Chip>{node.observers.length} observer{node.observers.length === 1 ? '' : 's'}</Chip>}>
          {node.observers.length === 0 ? <EmptyNote>No observer is declared: nothing can verify what was applied here.</EmptyNote> : <ul className={c.listRows}>{node.observers.map(o => <ObserverRow key={`${o.provider}/${o.source}`} o={o} now={now} />)}</ul>}
          <Hint>If an observer goes blind, Observed and Verified below say so, and the mix gains a coverage-unavailable share.</Hint>
        </Card>
        <Card title="Coverage, this window" meta={<Chip>{node.scope ?? 'no scope'}</Chip>}>
          <CoverageMix coverage={node.coverage} />
        </Card>
      </div>

      <Section framed title="Changes through each gate, this environment" meta={<Chip>same lanes as the Map&apos;s Lanes view</Chip>}>
        <MapLanes rows={laneRows} partial={data.partial} empty={<EmptyNote inset>No gate is declared for this target, so there are no lanes.</EmptyNote>} />
      </Section>

      <Section framed title="Changes moving now" count={detail.changes.length}>
        {detail.changes.length === 0 ? (
          <EmptyNote inset>No change is moving through this environment in this window (or none you may see).</EmptyNote>
        ) : (
          <table className={tk.table}>
            <thead>
              <tr>
                <th className={tk.th}>Tier</th>
                <th className={tk.th}>Change</th>
                <th className={tk.th}>State</th>
                <th className={tk.th}>Age</th>
              </tr>
            </thead>
            <tbody>
              {detail.changes.map((ch: MapChange) => (
                <tr key={ch.id}>
                  <td className={tk.td}><TierBadge tier={ch.tier} /></td>
                  <td className={tk.td}>
                    <TextLink onClick={() => onNavigate({ view: 'clearances', change: ch.id })} aria-label={`Open change ${ch.repo} #${ch.pr}`}>{ch.repo} #{ch.pr}</TextLink>
                    <div className={tk.meta}>{[ch.owner ? `owner ${ch.owner}` : '', ch.cleared_by ? `cleared by ${ch.cleared_by}` : ''].filter(Boolean).join(' · ')}</div>
                  </td>
                  <td className={tk.td}><StatusChip tone={changeTone(ch.state)}>{ch.state}</StatusChip></td>
                  <td className={tk.td}>{ageWords(ch.age_seconds)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section
        framed
        title="Exceptions and recent evidence"
        actions={
          <>
            <TextLink onClick={() => onNavigate(exceptionParams)}>Exceptions →</TextLink>
            <TextLink onClick={() => onNavigate(evidenceParams)}>Evidence →</TextLink>
          </>
        }
      >
        {detail.exceptions.length === 0 && detail.evidence.length === 0 ? (
          <EmptyNote inset>No exception and no deployment record for this target in this window.</EmptyNote>
        ) : (
          <div className={c.pad}>
            <ul className={c.listRows}>
              {detail.exceptions.map(r => <RecordRow key={`x${r.seq}`} r={r} now={now} exception />)}
              {detail.evidence.filter(r => !detail.exceptions.some(x => x.seq === r.seq)).map(r => <RecordRow key={`e${r.seq}`} r={r} now={now} />)}
            </ul>
          </div>
        )}
        <Hint inset>The links open the tab pre-filtered to this target{node.app ? `: app ${node.app}` : ''}{node.scope ? `, scope ${node.scope}` : ''}.</Hint>
      </Section>
      <div><TextLink onClick={onBack}>‹ Back to the map</TextLink></div>
    </>
  );
}
