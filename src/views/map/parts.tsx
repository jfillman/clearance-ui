import { Fragment, useEffect, useState } from 'react';
import { StatusChip, Tooltip, useClearanceTokens, type ClearanceTokens, type StatusTone } from '../../kit';
import { COVERAGE_ORDER } from './model';
import { useMapStyles } from './styles';
import type { Counts, GateMix, MapStatus } from './types';

// Small pieces the Map's views share: the mode and status chips, the coverage mix and the gate mix words.

const TONES: Record<string, StatusTone> = { down: 'bad', attention: 'warn', ok: 'ok' };
/** A clock that ticks, for "updated 8 s ago": the poll only re-renders every 30 s. */
export function useClock(ms = 5000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [ms]);
  return now;
}

export const statusTone = (s: MapStatus | string): StatusTone => TONES[s] ?? 'ok';
export const statusWord = (s: MapStatus | string): string => (s in TONES ? s : 'ok');

const MODE_TONES: Record<string, StatusTone> = { flag: 'warn', enforce: 'ok' };
export const modeTone = (mode: string, silent?: boolean): StatusTone => (silent ? 'neutral' : MODE_TONES[mode] ?? 'neutral');

/** enforce refuses; flag records what it would refuse and lets it through; silent: declared, but no record of the window names it. */
export const MODE_WHY: Record<string, string> = {
  enforce: 'Enforcing: a refusal stops the change',
  flag: 'Flag mode: a refusal is recorded, not enforced',
  silent: 'Declared, but no record of this window names it',
};

export function ModeChip({ mode, silent }: { mode: string; silent?: boolean }) {
  const word = silent ? 'silent' : mode;
  return (
    <StatusChip tone={modeTone(mode, silent)} title={MODE_WHY[word] ?? word}>
      {word}
    </StatusChip>
  );
}

export const mixWords = (m: GateMix): string => `${m.enforce} enforce · ${m.flag} flag · ${m.silent} silent`;

export const statusColor = (t: ClearanceTokens, s: MapStatus | string): string => ({ down: t.bad, attention: t.amber }[s as 'down' | 'attention'] ?? t.good);

export const coverageColors = (t: ClearanceTokens): Record<string, string> => ({
  'authorized-and-verified': t.good,
  'observed-not-attributed': t.amber,
  'out-of-band-detected': t.bad,
  'coverage-unavailable': t.textFaint,
  'break-glass': t.amberLine,
  'attempted-refused': t.skyLine,
  unassessed: t.line,
});

const COVERAGE_WHY: Record<string, string> = {
  'authorized-and-verified': 'Observed, and it matches a grant',
  'observed-not-attributed': 'Observed, and nothing says who did it',
  'out-of-band-detected': 'Observed with no grant',
  'coverage-unavailable': 'An observer was blind: it cannot be called verified',
  'break-glass': 'Declared break-glass by a person',
  'attempted-refused': 'Attempted and refused: Clearance doing its job',
  unassessed: 'Observed, and no assessment is about it yet',
};

/** The coverage mix as one bar and its list: every state with its count, so a state that is zero is said, not left out. */
export function CoverageMix({ coverage, label = 'Coverage mix' }: { coverage: Counts; label?: string }) {
  const c = useMapStyles();
  const t = useClearanceTokens();
  const colors = coverageColors(t);
  const keys = [...COVERAGE_ORDER, ...Object.keys(coverage).filter(k => !(COVERAGE_ORDER as readonly string[]).includes(k))];
  const total = keys.reduce((n, k) => n + (coverage[k] ?? 0), 0);
  return (
    <Fragment>
      <div className={c.mixBar} role="img" aria-label={`${label}: ${total === 0 ? 'nothing observed in this window' : keys.filter(k => coverage[k]).map(k => `${coverage[k]} ${k}`).join(', ')}`}>
        {keys.filter(k => coverage[k]).map(k => (
          <Tooltip key={k} title={`${k}: ${coverage[k]}`}>
            <span className={c.mixSeg} style={{ width: `${(100 * coverage[k]) / total}%`, backgroundColor: colors[k] ?? t.line }} />
          </Tooltip>
        ))}
      </div>
      <ul className={c.mixList} aria-label={`${label} by state`}>
        {keys.map(k => (
          <li key={k} className={c.mixLine}>
            <Tooltip title={COVERAGE_WHY[k] ?? k}>
              <span className={c.mixKey}>
                <i className={c.mixDot} style={{ backgroundColor: colors[k] ?? t.line }} aria-hidden />
                {k}
              </span>
            </Tooltip>
            <span>{coverage[k] ?? 0}</span>
          </li>
        ))}
      </ul>
    </Fragment>
  );
}
