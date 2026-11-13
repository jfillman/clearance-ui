import type { ObservationRecord } from '../../kit';

// What an observation changed, in one line, from its state_change {before, after}. Clearance redacts secret-bearing keys
// for a person; this masks them again by name (never shows a value it would not show in a log).

const SECRETISH = /secret|password|passwd|token|credential|private|api[-_]?key|auth/i;
const WITHHELD = 'withheld';
/** Clearance replaces a secret-bearing value with this string for a person (v0.41.0, `redacted` names the field). */
export const REDACTED = '[redacted]';
const clip = (v: unknown, n = 48): string => {
  if (v === REDACTED) return WITHHELD;
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  const out = s === undefined ? 'absent' : s;
  return out.length > n ? `${out.slice(0, n - 1)}…` : out;
};
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export function diffSummary(r: Pick<ObservationRecord, 'action' | 'state_change' | 'redacted'>, max = 3): string {
  const verb = [r.action?.verb, r.action?.api].filter(Boolean).join(' ');
  const sc = r.state_change;
  if (!sc || (sc.before === undefined && sc.after === undefined)) return verb || (r.redacted?.includes('state_change') ? `state change ${WITHHELD}` : 'no state recorded');
  const before = isObj(sc.before) ? sc.before : undefined;
  const after = isObj(sc.after) ? sc.after : undefined;
  if (!before && !after) return `${verb}: ${clip(sc.before)} → ${clip(sc.after)}`;
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])].filter(k => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]));
  const hidden = (k: string) => SECRETISH.test(k) || before?.[k] === REDACTED || after?.[k] === REDACTED;
  const shown = keys.slice(0, max).map(k => (hidden(k) ? `${k}: changed (value ${WITHHELD})` : `${k}: ${clip(before?.[k], 24)} → ${clip(after?.[k], 24)}`));
  const more = keys.length > max ? ` (+${keys.length - max} more)` : '';
  const note = r.redacted?.includes('state_change') && !shown.some(x => x.includes(WITHHELD)) ? ' (secret values withheld)' : '';
  return `${verb ? `${verb}: ` : ''}${shown.join('; ') || 'no field differs'}${more}${note}`;
}

/** The resolution records about one seq, newest first. */
export function historyOf(resolutions: ObservationRecord[], seq: number): ObservationRecord[] {
  return resolutions.filter(r => r.about?.seq === seq).sort((a, b) => b.seq - a.seq);
}
