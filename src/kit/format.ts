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

export function clock(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

/** `2026-10-31 01:13Z`: the day and minute, UTC, so a run or record can be placed in time (relativeTime says how long ago). */
export function dateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}Z`;
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
