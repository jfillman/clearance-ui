import { Hint, Tooltip, useClearanceTokens } from '../../kit';
import type { KeyboardEvent } from 'react';
import { buildMatrix, type CellMode } from './model';
import { statusColor } from './parts';
import { useMapStyles } from './styles';
import type { MapResponse, TargetNode } from './types';

// The matrix (board C9 inset), for a registry past about 40 targets where target rows stop being readable: one row per gate
// type, one column per target, worst targets first. A cell is that gate type's mode on that target; a dashed red cell is a
// type that does not guard it. It scales to hundreds of columns, scrolling sideways with the gate names fixed.

const WORDS: Record<CellMode, string> = { enforce: 'enforcing', flag: 'flag mode', silent: 'declared, silent', none: 'does not guard it' };

export function MapMatrix({ map, targets, onOpenTarget }: { map: MapResponse; targets: TargetNode[]; onOpenTarget: (id: string) => void }) {
  const c = useMapStyles();
  const t = useClearanceTokens();
  const m = buildMatrix(map, targets);
  const cls: Record<CellMode, string> = { enforce: c.cellEnforce, flag: c.cellFlag, silent: c.cellSilent, none: c.cellNone };
  const open = (id: string) => (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onOpenTarget(id);
    }
  };
  return (
    <>
      <div className={c.matrixScroll}>
        <table className={c.matrix} aria-label={`Gates by targets: ${m.gateTypes.length} gate types, ${m.targets.length} targets, worst first`} data-testid="map-matrix">
          <thead>
            <tr>
              <th scope="col" className={c.matrixRowHead}><span className={c.visuallyHidden}>Gate type</span></th>
              {m.targets.map(x => (
                <th key={x.id} scope="col" style={{ padding: 0 }}>
                  <Tooltip title={`${x.name} · ${x.group}`}>
                    <span style={{ display: 'block', width: 16, height: 6, borderRadius: 2, backgroundColor: statusColor(t, x.status) }} aria-label={`${x.name}, ${x.status}`} />
                  </Tooltip>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {m.gateTypes.map(type => (
              <tr key={type}>
                <th scope="row" className={c.matrixRowHead}>{type}</th>
                {m.targets.map(x => {
                  const mode = m.cell(type, x);
                  return (
                    <Tooltip key={x.id} title={`${type} on ${x.name}: ${WORDS[mode]}`}>
                      <td className={`${c.matrixCell} ${cls[mode]}`} role="button" tabIndex={0} aria-label={`${type} on ${x.name}: ${WORDS[mode]}. Open detail`} onClick={() => onOpenTarget(x.id)} onKeyDown={open(x.id)} data-mode={mode} />
                    </Tooltip>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Hint inset>
        Gates × targets, worst first. Green enforces, amber is flag mode, grey is declared but silent, a dashed red cell is a gate type that does not guard that target. Click a cell to open the target.
      </Hint>
    </>
  );
}
