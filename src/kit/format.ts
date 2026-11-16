/** `user:jfillman` -> `jfillman`; `autopilot-runs/triage-agent` stays; `group:default/x` -> `x`. */
export const shortPrincipal = (p: string | null | undefined): string => (p ? p.replace(/^(user|group):([^/]+\/)?/, '') : '');

/** A workload principal (`<namespace>/<serviceaccount>`), as opposed to a person (`user:`). */
export const isWorkload = (p: string | null | undefined): boolean => !!p && !p.startsWith('user:');

export function relativeTime(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return '';
  const ms = now - new Date(iso).getTime();
  const s = Math.round(Math.abs(ms) / 1000);
  let text: string;
  if (s < 60) text = `${s}s`;
  else if (s < 3600) text = `${Math.round(s / 60)} min`;
  else if (s < 86400) text = `${Math.round(s / 3600)} h`;
  else text = `${Math.round(s / 86400)} d`;
  return ms >= 0 ? text : `in ${text}`;
}

// Times are shown in the viewer's own time zone and locale (the way Tower does: Date#toLocaleString), with the UTC
// moment on hover (`utcDateTime`, `whenTitle`, the <Time> component). A test pins `timeZone` and `locale`; the views
// pass neither, so the browser's own are used.

export interface TimeOptions {
  /** An IANA zone ("UTC", "America/Toronto"); the viewer's own when left out. */
  timeZone?: string;
  /** A BCP 47 tag ("en-US"); the viewer's own when left out. */
  locale?: string;
}

const parse = (iso: string | null | undefined): Date | undefined => {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
};

/** The moment of day in the viewer's zone, as Tower's `toLocaleTimeString`: `9:13:42 AM`. */
export function clock(iso: string | null | undefined, o: TimeOptions = {}): string {
  const d = parse(iso);
  if (!d) return iso ?? '';
  return d.toLocaleTimeString(o.locale, { timeZone: o.timeZone });
}

/** The date and time in the viewer's zone, as Tower's `formatDateTime` (`Date#toLocaleString`): `10/31/2026, 9:13:42 AM`. */
export function dateTime(iso: string | null | undefined, o: TimeOptions = {}): string {
  const d = parse(iso);
  if (!d) return iso ?? '';
  return d.toLocaleString(o.locale, { timeZone: o.timeZone });
}

/** A compact month, day and minute in the viewer's zone, for a table cell: `10/31, 09:13`. */
export function dateTimeShort(iso: string | null | undefined, o: TimeOptions = {}): string {
  const d = parse(iso);
  if (!d) return iso ?? '';
  return d.toLocaleString(o.locale, { timeZone: o.timeZone, month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
}

/** `2026-10-31 01:13Z`: the same moment in UTC, to the minute (`seconds` adds them), the value shown on hover. */
export function utcDateTime(iso: string | null | undefined, seconds = false): string {
  const d = parse(iso);
  if (!d) return iso ?? '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}${seconds ? `:${p(d.getUTCSeconds())}` : ''}Z`;
}

/** A hover for text that is not itself a time (a "3 min ago"): the local time and the UTC time. */
export function whenTitle(iso: string | null | undefined, o: TimeOptions = {}): string {
  const d = parse(iso);
  if (!d) return iso ?? '';
  return `${dateTime(iso, o)} (${utcDateTime(iso, true)})`;
}

/** 182000 -> 182k; 2100000 -> 2.1M. */
export function compact(n: number | undefined): string {
  if (n === undefined || n === null) return '';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}k`;
  return String(n);
}

/** The ratio used of limit, clamped to [0, 1]; 0 when there is no limit. */
export function ratio(used: number | undefined, limit: number | undefined): number {
  if (!limit || limit <= 0) return 0;
  return Math.max(0, Math.min(1, (used ?? 0) / limit));
}

/** Where an agent's loop runs: the server's `runsIn` (clearance v0.23.0), else from the runtime image an older server
 *  shows (none, or the all-zero placeholder digest the first bundled definitions carried, means the person's client). */
export function runsInOf(d: { runsIn?: 'cluster' | 'client'; runtime?: { image?: string | null } | null }): 'cluster' | 'client' {
  if (d.runsIn) return d.runsIn;
  const image = d.runtime?.image ?? '';
  return image && !/@sha256:0{64}$/.test(image) ? 'cluster' : 'client';
}

/** The words for where a run's loop runs, and the one-line why. */
export const RUNS_IN_TEXT: Record<'cluster' | 'client', { label: string; why: string }> = {
  cluster: { label: 'in-cluster', why: 'An AgentRun pod runs the loop with its runtime image; its model calls go through Clearance and count against the budget.' },
  client: { label: 'your MCP client', why: 'No runtime: a person opens a session from their own MCP client, which is the loop. Clearance enforces every tool call; model calls are the client\'s own and are not counted.' },
};

/** onMouseDown for a clickable control inside Tower's nested-scroll page: a native click-to-focus there scrolls the
 *  wrong ancestor to the top. The click still fires; keyboard focus is untouched. */
export const preventFocusScroll = (e: { preventDefault: () => void }) => e.preventDefault();
