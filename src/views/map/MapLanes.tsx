import type { ReactNode } from 'react';
import { Callout, StatusChip, Tooltip } from '../../kit';
import { lanePartials } from './model';
import { ModeChip } from './parts';
import { useMapStyles } from './styles';
import type { Lanes, PartialNote } from './types';

// The change lanes (boards C8, C11 and, scoped to one target, C10): each row is a gate (or a gate on a target), each change
// moves through six steps, and the numbers are the distinct changes that reached each step in the window. One component
// for all three scopes; the caller says what a row is. Never invents a number: what Clearance cannot yet join is marked
// and explained under the table (PartialNote), and a blind observer says so instead of a zero.

export interface LaneRow {
  key: string;
  label: ReactNode;
  sub?: string;
  /** enforce | flag | silent, for a gate on a target. */
  mode?: string;
  silent?: boolean;
  lanes: Lanes;
  holding: number;
  refused: number;
  /** An observer of this row is blind: Observed and Verified cannot be counted, so they are not shown as zero. */
  blind?: boolean;
  onSelect?: () => void;
  selected?: boolean;
}

const STEPS: Array<{ id: keyof Lanes; label: string; sub: string }> = [
  { id: 'requested', label: 'Requested', sub: 'deploy.request' },
  { id: 'tiered', label: 'Tiered', sub: 'tier + why' },
  { id: 'decided', label: 'Decided', sub: 'clear · hold · deny' },
  { id: 'applied', label: 'Applied', sub: 'deploy.outcome' },
  { id: 'observed', label: 'Observed', sub: 'observer saw it' },
  { id: 'verified', label: 'Verified', sub: 'matches the grant' },
];

export function MapLanes({ rows, partial = [], flagWord = 'would refuse', empty }: { rows: LaneRow[]; partial?: PartialNote[]; flagWord?: string; empty?: ReactNode }) {
  const c = useMapStyles();
  const notes = lanePartials(partial);
  const scopeCounted = new Set(notes.flatMap(n => n.field.replace(/^lanes\./, '').split(',')));
  if (rows.length === 0) return <>{empty ?? null}</>;
  return (
    <>
      <table className={c.lanes}>
        <thead>
          <tr>
            <th className={c.laneHead} scope="col">Gate · target</th>
            {STEPS.map(s => (
              <th key={s.id} className={c.laneHead} scope="col">
                {s.label}
                <span className={c.laneSub}>{s.sub}{scopeCounted.has(s.id) ? ' †' : ''}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(r => {
            const max = Math.max(1, ...STEPS.map(s => r.lanes[s.id]));
            return (
              <tr key={r.key} className={r.selected ? c.laneRowOn : undefined}>
                <td className={c.laneName}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    {r.onSelect ? (
                      <Tooltip title="Scope the lanes to this gate">
                        <span role="button" tabIndex={0} aria-pressed={!!r.selected} className={c.rowName} style={{ cursor: 'pointer' }} onClick={r.onSelect} onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), r.onSelect?.())}>
                          {r.label}
                        </span>
                      </Tooltip>
                    ) : (
                      <span className={c.rowName}>{r.label}</span>
                    )}
                    {r.mode && <ModeChip mode={r.mode} silent={r.silent} />}
                  </div>
                  {r.sub && <span className={c.rowMeta}>{r.sub}</span>}
                </td>
                {STEPS.map(s => {
                  const hatched = r.blind && (s.id === 'observed' || s.id === 'verified');
                  const n = r.lanes[s.id];
                  return (
                    <td key={s.id} className={c.laneCell}>
                      {hatched ? (
                        <Tooltip title="An observer of this target is blind: nothing can be observed or verified, so no number is shown">
                          <span><StatusChip tone="bad">coverage-unavailable</StatusChip></span>
                        </Tooltip>
                      ) : (
                        <>
                          <span className={c.laneNum}>{n.toLocaleString()}{scopeCounted.has(s.id) ? ' †' : ''}</span>
                          <span className={c.laneTrack} aria-hidden>
                            <span className={`${c.laneFill} ${s.id === 'verified' ? c.laneFillGood : ''}`} style={{ width: `${(100 * n) / max}%` }} />
                          </span>
                        </>
                      )}
                      {s.id === 'decided' && r.holding > 0 && <span className={`${c.laneExtra} ${c.laneExtraAmber}`}>{r.holding} holding</span>}
                      {s.id === 'decided' && r.refused > 0 && <span className={`${c.laneExtra} ${c.laneExtraBad}`}>{r.refused} {r.mode === 'flag' ? flagWord : 'refused'}</span>}
                      {s.id === 'applied' && r.lanes.applied > 0 && <span className={c.laneExtra}>{r.lanes.applied_matched} matched the grant</span>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
      {notes.map(n => (
        <Callout key={n.field} tone="neutral" label={`† partial: ${n.field}`}>
          {n.reason}
        </Callout>
      ))}
    </>
  );
}
