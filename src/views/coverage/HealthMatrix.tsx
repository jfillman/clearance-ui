import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { Count, EmptyNote, fontMono, fontScale, Hint, Section, Tooltip, useClearanceTokens, useTableKit, type ClearanceTokens } from '../../kit';
import { matrixSummary, type DayState, type HealthMatrix as Matrix, type MatrixCell } from './healthModel';

// The scope-by-day health matrix (board C4): a row per scope, a column per day, a cell the worst state any feed reported
// that day. Colour is never the only carrier: every cell has its word in its label and the legend says what each means.

const WORD: Record<DayState, string> = { healthy: 'healthy', degraded: 'degraded', blind: 'blind', none: 'no health record' };

const useStyles = makeStyles<Theme, { t: ClearanceTokens }>(() => ({
  scroll: { overflowX: 'auto', padding: '4px 16px 12px' },
  grid: { borderCollapse: 'separate', borderSpacing: 3 },
  rowHead: { textAlign: 'left', fontFamily: fontMono, fontSize: fontScale.sm, color: ({ t }) => t.textHi, paddingRight: 12, whiteSpace: 'nowrap', fontWeight: 400 },
  dayHead: { fontFamily: fontMono, fontSize: fontScale.xs, color: ({ t }) => t.textLo, fontWeight: 400, padding: 0, textAlign: 'center' },
  cell: { width: 28, height: 22, borderRadius: 3, display: 'block', boxSizing: 'border-box' },
  legend: { display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', padding: '0 16px 12px' },
  key: { display: 'inline-flex', gap: 6, alignItems: 'center', fontSize: fontScale.sm, color: ({ t }) => t.textLo },
  swatch: { width: 12, height: 12, borderRadius: 3, display: 'inline-block', boxSizing: 'border-box' },
}));

const fill = (t: ClearanceTokens, s: DayState, partial?: boolean, unread?: boolean): React.CSSProperties => {
  // A row whose health could not be read is never drawn from whatever records came back: hatched, not a verdict.
  if (unread) return { background: `repeating-linear-gradient(45deg, ${t.bad} 0 2px, transparent 2px 6px)`, border: `1px solid ${t.bad}` };
  if (partial) return { background: 'transparent', border: `1px dashed ${t.textFaint}` };
  if (s === 'healthy') return { background: t.good };
  if (s === 'degraded') return { background: t.amber };
  if (s === 'blind') return { background: t.bad };
  return { background: t.panelAlt, border: `1px solid ${t.line}` };
};

const cellLabel = (scope: string, c: MatrixCell): string => {
  if (c.partial && c.state === 'none') return `${scope}, ${c.day}: not loaded, too many records to read this far back`;
  const base = `${scope}, ${c.day}: ${WORD[c.state]}`;
  const more = [c.records ? `${c.records} ${c.records === 1 ? 'record' : 'records'}` : '', c.failed.length ? `failed: ${c.failed.join(', ')}` : '', c.sources.length ? `from ${c.sources.join(', ')}` : ''].filter(Boolean).join('; ');
  return `${base}${more ? ` (${more})` : ''}${c.partial ? '; only part of this day was read' : ''}`;
};

export function HealthMatrix({ matrix }: { matrix: Matrix }) {
  const t = useClearanceTokens();
  const c = useStyles({ t });
  const tk = useTableKit();
  const sum = matrixSummary(matrix);
  const count = matrix.rows.length === 0 ? undefined : [
    `${sum.unhealthy} of ${sum.scopes} scopes not healthy every day`,
    sum.notLoaded ? `${sum.notLoaded} ${sum.notLoaded === 1 ? 'day' : 'days'} not loaded` : '',
    sum.unread ? `${sum.unread} ${sum.unread === 1 ? 'scope' : 'scopes'} not read` : '',
    sum.silentToday ? `${sum.silentToday} silent today` : '',
  ].filter(Boolean).join(' · ');
  return (
    <Section framed aria-label="Health by scope and day" title="Health by scope and day" count={count}>
      {matrix.rows.length === 0 ? (
        <EmptyNote inset>
          Nothing is linked to observe yet: no cluster, cloud account or other scope is reporting to Clearance, so there is no health to show. This is not a clean bill: a scope that is not watched is not covered.
        </EmptyNote>
      ) : (
        <>
          <div className={c.scroll}>
            <table className={c.grid} aria-label={`Feed health: ${matrix.rows.length} scopes by ${matrix.days.length} days, newest day last`} data-testid="health-matrix">
              <thead>
                <tr>
                  <th scope="col" className={tk.th}><span style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>Scope</span></th>
                  {matrix.days.map(d => <th key={d} scope="col" className={c.dayHead}>{d.slice(8)}</th>)}
                </tr>
              </thead>
              <tbody>
                {matrix.rows.map(r => (
                  <tr key={r.scope}>
                    <th scope="row" className={c.rowHead}>{r.scope}{r.error ? <Count> not read</Count> : null}</th>
                    {r.cells.map(cell => (
                      <td key={cell.day} style={{ padding: 0 }}>
                        <Tooltip title={r.error ? `${r.scope}: health not read (${r.error})` : cellLabel(r.scope, cell)}>
                          <span className={c.cell} style={fill(t, cell.state, cell.partial, !!r.error)} role="img" aria-label={r.error ? `${r.scope}, ${cell.day}: health not read` : cellLabel(r.scope, cell)} data-state={r.error ? 'error' : cell.state} />
                        </Tooltip>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className={c.legend} aria-label="Legend">
            {(['healthy', 'degraded', 'blind', 'none'] as DayState[]).map(s => (
              <span key={s} className={c.key}><i className={c.swatch} style={fill(t, s)} aria-hidden />{WORD[s]}</span>
            ))}
            <span className={c.key}><i className={c.swatch} style={fill(t, 'none', true)} aria-hidden />not loaded</span>
            <span className={c.key}><i className={c.swatch} style={fill(t, 'none', false, true)} aria-hidden />not read (error)</span>
          </div>
          <Hint inset>A day is the worst state any feed reported in it (UTC). A day with no record is shown as no record, never as healthy.</Hint>
        </>
      )}
    </Section>
  );
}
