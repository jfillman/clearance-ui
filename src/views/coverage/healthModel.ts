import type { ObservationRecord } from '../../kit';

// The scope-by-day health matrix (board C4) from GET /v1/observations/health: the observation.health records (healthy,
// degraded or blind per source, with the checks that produced it) and the observation.audit-gap records written when a
// feed dropped. A day is the worst state any feed reported in it (UTC), and a day with no record at all is its own
// state, "no record": a scope with no health record is never shown as healthy.

export type DayState = 'healthy' | 'degraded' | 'blind' | 'none';

export interface MatrixCell {
  day: string;
  state: DayState;
  /** Health and audit-gap records that fell on this day. */
  records: number;
  /** The checks that failed on this day, once each. */
  failed: string[];
  sources: string[];
  /** The records for this day were not all read (the page budget ran out): the cell is "not loaded", never a verdict. */
  partial?: boolean;
}

export interface MatrixRow {
  scope: string;
  cells: MatrixCell[];
  /** The page budget ran out before the window did: days before this time were not read (the newest records come first). */
  coveredFrom?: string;
  error?: string;
}

export interface HealthMatrix {
  days: string[];
  rows: MatrixRow[];
}

const DAY = 86_400_000;
const RANK: Record<DayState, number> = { none: 0, healthy: 1, degraded: 2, blind: 3 };

/** The UTC date (YYYY-MM-DD) of a time. */
export const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10);

/** The last `count` UTC days ending today, oldest first. */
export function lastDays(now: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => dayOf(now - (count - 1 - i) * DAY));
}

/** The first instant of the matrix window, for `since`. */
export const windowStart = (now: number, count: number): string => `${lastDays(now, count)[0]}T00:00:00Z`;

interface HealthLike {
  health?: { state?: string; checks?: Array<{ name?: string; ok?: boolean }> };
  gap?: { state?: string };
  source?: { name?: string } | string;
  tool?: string;
  kind?: string;
}

/** What one record says: its state, the checks that failed and its source; undefined when it is neither a health nor an audit-gap record. */
export function healthOf(rec: ObservationRecord): { state: Exclude<DayState, 'none'>; failed: string[]; source?: string } | undefined {
  const r = rec as unknown as HealthLike;
  const source = typeof r.source === 'string' ? r.source : r.source?.name;
  const s = r.health?.state;
  if (s === 'healthy' || s === 'degraded' || s === 'blind') return { state: s, failed: (r.health?.checks ?? []).filter(c => c.ok === false && c.name).map(c => String(c.name)), source };
  // A dropped feed is blind for the day whatever the gap's own state word is.
  if (r.gap || r.tool === 'observation.audit-gap' || r.kind === 'observation.audit-gap') return { state: 'blind', failed: [], source };
  return undefined;
}

export function buildHealthMatrix(scopes: string[], byScope: Record<string, ObservationRecord[]>, now: number, count: number, meta: Record<string, { coveredFrom?: string; error?: string }> = {}): HealthMatrix {
  const days = lastDays(now, count);
  const rows = scopes.map<MatrixRow>(scope => {
    const cells = new Map<string, MatrixCell>(days.map(d => [d, { day: d, state: 'none', records: 0, failed: [], sources: [] }]));
    for (const rec of byScope[scope] ?? []) {
      const h = healthOf(rec);
      const t = Date.parse(rec.ts);
      const cell = h && Number.isFinite(t) ? cells.get(dayOf(t)) : undefined;
      if (!h || !cell) continue;
      cell.records += 1;
      if (RANK[h.state] > RANK[cell.state]) cell.state = h.state;
      for (const f of h.failed) if (!cell.failed.includes(f)) cell.failed.push(f);
      if (h.source && !cell.sources.includes(h.source)) cell.sources.push(h.source);
    }
    const from = meta[scope]?.coveredFrom;
    // The oldest day read may hold only part of its records, and any day before it none: say so instead of calling it quiet.
    const cutDay = from ? dayOf(Date.parse(from)) : undefined;
    const out = days.map(d => {
      const cell = cells.get(d)!;
      if (cutDay && d < cutDay) return { ...cell, state: 'none' as DayState, records: 0, failed: [], sources: [], partial: true };
      return cutDay && d === cutDay ? { ...cell, partial: true } : cell;
    });
    return { scope, cells: out, ...meta[scope] };
  });
  return { days, rows };
}

export interface MatrixSummary {
  scopes: number;
  /** Scopes with a degraded or blind day, or a day with no record (no record is never healthy). */
  unhealthy: number;
  /** Scopes with no health record today. */
  silentToday: number;
  /** Days (over all scopes) that were not, or only partly, read: unknown, never counted healthy. */
  notLoaded: number;
  /** Scopes whose health could not be read at all: unknown. */
  unread: number;
}

/** The matrix's headline numbers. Anything not read is counted as unknown, never as healthy. */
export function matrixSummary(m: HealthMatrix): MatrixSummary {
  const out: MatrixSummary = { scopes: m.rows.length, unhealthy: 0, silentToday: 0, notLoaded: 0, unread: 0 };
  for (const r of m.rows) {
    if (r.error) {
      out.unread += 1;
      continue;
    }
    const unknown = (c: MatrixCell) => !!c.partial && (c.state === 'none' || c.state === 'healthy');
    out.notLoaded += r.cells.filter(unknown).length;
    if (r.cells.some(c => c.state === 'degraded' || c.state === 'blind' || (c.state === 'none' && !c.partial))) out.unhealthy += 1;
    const last = r.cells[r.cells.length - 1];
    if (last && last.state === 'none' && !last.partial) out.silentToday += 1;
  }
  return out;
}
