import type { ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { DecisionChip, TierChip } from './components';
import { Chip, type Tone } from './kit';
import { clock, preventFocusScroll } from './format';
import { fontMono, fontScale, tokensForTheme } from './tokens';
import type { EvidenceRecord } from './types';

// The flight log: a task's evidence records as Clearance wrote them, oldest first. One row per record: when, a
// glyph for what kind of step it was, what happened, and the verdict. Nothing here edits a record. A long log scrolls
// inside its own box (maxHeight); a record's detail opens in place, directly below its row.

/** The flight log's own scroll height, so a long run never pushes the page; the caller's header and footer stay put. */
export const FLIGHT_LOG_MAX_HEIGHT = 480;

const useStyles = makeStyles<Theme>(theme => {
  const t = tokensForTheme(theme);
  return {
  log: { display: 'flex', flexDirection: 'column', overflowY: 'auto', overscrollBehavior: 'contain' },
  item: { display: 'flex', flexDirection: 'column' },
  open: { padding: '8px 10px 12px 74px', background: t.panelAlt, borderTop: `1px dashed ${t.line}` },
  row: {
    display: 'grid',
    gridTemplateColumns: '64px 28px minmax(0, 1fr) auto',
    gap: 10,
    alignItems: 'start',
    padding: '7px 0',
    borderTop: `1px solid ${t.lineSoft}`,
    fontSize: fontScale.md,
    color: t.textHi,
    textAlign: 'left',
    background: 'none',
    border: 'none',
    width: '100%',
    font: 'inherit',
    cursor: 'pointer',
  },
  rowStatic: { cursor: 'default' },
  selected: { background: t.panelAlt },
  time: { fontFamily: fontMono, fontSize: fontScale.sm, color: t.textFaint, paddingTop: 2 },
  glyph: { display: 'inline-flex', justifyContent: 'center', paddingTop: 1 },
  what: { minWidth: 0 },
  detail: { fontSize: fontScale.sm, color: t.textLo, marginTop: 2, wordBreak: 'break-word' },
  };
});

type Kind = 'session' | 'run' | 'model' | 'human' | 'provenance' | 'tool';

function kindOf(r: EvidenceRecord): Kind {
  if (r.tool.startsWith('session.')) return 'session';
  if (r.tool.startsWith('run.')) return 'run';
  if (r.tool.startsWith('model.')) return 'model';
  if (r.tool.startsWith('human.')) return 'human';
  if (r.tool.startsWith('provenance.')) return 'provenance';
  return 'tool';
}

function Glyph({ r }: { r: EvidenceRecord }) {
  const k = kindOf(r);
  if (k === 'tool') return <TierChip tier={r.tier ?? 0} />;
  const letter = { session: 'S', run: 'R', model: 'M', human: 'H', provenance: 'P' }[k];
  const kindTone: Record<Exclude<Kind, 'tool'>, Tone> = { session: 'neutral', run: 'neutral', model: 'sky', human: 'amber', provenance: 'neutral' };
  return <Chip tone={r.decision === 'deny' ? 'bad' : kindTone[k]} title={k}>{letter}</Chip>;
}

/** The one-line account of a record: the tool, and what it acted on or produced. */
export function summarize(r: EvidenceRecord): { title: string; detail?: string } {
  const eff = (r.effect ?? {}) as Record<string, unknown>;
  switch (r.tool) {
    case 'session.open':
      return { title: `Session opened`, detail: `${r.agent ?? ''} as ${r.principal}` };
    case 'session.open_triggered':
      return { title: `Session opened by a trigger`, detail: `${r.agent ?? ''} as ${r.principal}` };
    case 'session.close':
      return { title: 'Session closed', detail: r.result };
    case 'session.freeze':
      return { title: 'Frozen by a person', detail: `${r.principal} · ${r.result}` };
    case 'session.end':
      return { title: 'Ended by a person', detail: `${r.principal} · ${r.result}` };
    case 'trigger.hold':
      return { title: 'Triggers held', detail: `${r.principal} · ${r.result}` };
    case 'trigger.release':
      return { title: 'Triggers released', detail: `${r.principal} · ${r.result}` };
    case 'run.spawn':
      return { title: 'Child run started', detail: r.result };
    case 'run.launch':
      return { title: 'AgentRun created', detail: r.result };
    case 'human.request':
      return { title: 'Asked a person', detail: r.result };
    case 'human.answer':
      return { title: 'A person answered', detail: `${r.principal} · ${r.result}` };
    case 'provenance.verify':
      return { title: `Agent gates on ${r.target ?? ''}`, detail: r.result };
    case 'deploy.request':
      return { title: `Change registered: ${r.target ?? ''}`, detail: r.result };
    case 'deploy.clear':
      return { title: `Change cleared: ${r.target ?? ''}`, detail: `${r.principal} · ${r.result}` };
    case 'deploy.deny':
      return { title: `Change denied: ${r.target ?? ''}`, detail: `${r.principal} · ${r.result}` };
    case 'deploy.expire':
      return { title: `Change expired: ${r.target ?? ''}`, detail: r.result };
    case 'definition.load':
      return { title: `Definition loaded: ${r.agent ?? ''}`, detail: r.result };
    case 'definition.unload':
      return { title: `Definition unloaded: ${r.agent ?? ''}`, detail: r.result };
    case 'definition.reject':
      return { title: `Pin rejected: ${r.agent ?? ''}`, detail: `${r.target ?? ''} · ${r.result}` };
    default:
      break;
  }
  if (r.tool.startsWith('model.')) return { title: `Model call`, detail: r.result };
  const bits: string[] = [];
  if (eff.pr) bits.push(`PR #${eff.pr}${eff.repo ? ` on ${eff.repo}` : ''}`);
  if (r.app) bits.push(r.app);
  if (r.decision === 'deny' && r.result) bits.push(r.result);
  else if (r.result && r.result !== 'ok') bits.push(r.result);
  return { title: r.tool, detail: bits.join(' · ') || undefined };
}

/**
 * The log. `onSelect` makes each row a button; with `detail`, the selected record's detail opens in place directly
 * below its row (aria-expanded on the row). `maxHeight` (px) bounds the list, which then scrolls on its own; pass 0 for
 * an unbounded list.
 */
export function FlightLog({ records, selected, onSelect, detail, empty, maxHeight = FLIGHT_LOG_MAX_HEIGHT }: {
  records: EvidenceRecord[];
  selected?: number;
  onSelect?: (r: EvidenceRecord) => void;
  detail?: (r: EvidenceRecord) => ReactNode;
  empty?: ReactNode;
  maxHeight?: number;
}) {
  const c = useStyles();
  const sorted = [...records].sort((a, b) => a.seq - b.seq);
  if (sorted.length === 0) return <>{empty ?? null}</>;
  return (
    <div className={c.log} role="list" aria-label="Flight log" style={maxHeight ? { maxHeight } : undefined}>
      {sorted.map(r => {
        const s = summarize(r);
        const Row: any = onSelect ? 'button' : 'div';
        const isOpen = selected === r.seq;
        const detailId = `flight-log-record-${r.seq}`;
        return (
          <div key={r.seq} role="listitem" className={c.item}>
            <Row
              type={onSelect ? 'button' : undefined}
              className={[c.row, onSelect ? '' : c.rowStatic, isOpen ? c.selected : ''].join(' ')}
              onClick={onSelect ? () => onSelect(r) : undefined}
              onMouseDown={onSelect ? preventFocusScroll : undefined}
              aria-current={isOpen && !detail ? 'true' : undefined}
              aria-expanded={onSelect && detail ? isOpen : undefined}
              aria-controls={onSelect && detail && isOpen ? detailId : undefined}
            >
              <span className={c.time}>{clock(r.ts)}</span>
              <span className={c.glyph}><Glyph r={r} /></span>
              <span className={c.what}>
                <b>{s.title}</b>
                {s.detail && <div className={c.detail}>{s.detail}</div>}
              </span>
              <DecisionChip decision={r.decision} rule={r.rule} />
            </Row>
            {isOpen && detail && (
              <div id={detailId} className={c.open} aria-label={`Record ${r.seq}`}>
                {detail(r)}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
