import { useCallback, useEffect, useState } from 'react';
import type { ClearanceRead } from './read';
import type { CoverageStatement } from './types';

// One shared poll of GET /v1/coverage per (scope, from), for every component that shows it (W-5). Clearance computes
// a coverage statement with a bounded number of workers per replica (2), waits up to 3 s for a slot, then answers 503
// with `Retry-After: 5`; a large scope takes 3.5 s and up to 10 s under load, and the Backstage proxy gives up at 10 s.
// So the UI asks as little and as gently as it can:
//   - identical requests are one request: the banner and the Exceptions view of a scope share an entry and its answer;
//   - requests for different scopes run one at a time, never together;
//   - a refusal or a timeout is retried after `Retry-After` when the transport carries it, else after an exponential
//     back-off, and never costs the last good answer.

/** How often a visible page re-reads a scope. */
export const COVERAGE_POLL_MS = 5 * 60_000;
/** Coming back to the tab (focus, visible) re-reads a scope whose answer is older than this. */
export const COVERAGE_REFOCUS_MS = 60_000;
/**
 * How long a good answer keeps standing in for a failing one: three poll intervals, so two reads in a row can fail
 * (a busy server, a slow proxy) and the banner still shows what it knew, with its age. Past it the data is too old
 * to be called coverage and the banner says it is unavailable.
 */
export const COVERAGE_MAX_STALE_MS = 3 * COVERAGE_POLL_MS;
/** The first retry after a failure that sent no `Retry-After`; each further failure doubles it (the server's own hint is 5 s). */
export const COVERAGE_BACKOFF_BASE_MS = 5_000;
/** The longest wait between retries: a server that is struggling is asked at most every two minutes. */
export const COVERAGE_BACKOFF_CAP_MS = 120_000;
/** Reads in flight at once, across every scope on the page. The server admits 2 per replica for everyone. */
export const COVERAGE_CONCURRENCY = 1;
/** Of a retry delay, at most this fraction is added at random so several people's pages do not retry in step. */
const JITTER = 0.2;

/** Statuses where the server (or the proxy) is busy or timed out: worth saying "being computed" and retrying soon. */
export const isBusyStatus = (status: number | undefined): boolean => status === 503 || status === 429 || status === 504 || status === 502 || status === 408;

export interface CoverageSnapshot {
  data?: CoverageStatement;
  /** When `data` was read (ms since the epoch). */
  updatedAt?: number;
  /** The last read's failure, as thrown; cleared by the next good read. */
  failure?: unknown;
  /** The last failure was the server being busy or timing out, not a refusal. */
  busy: boolean;
  /** When the next retry is due after a failure (ms since the epoch). */
  retryAt?: number;
  loading: boolean;
}

interface Entry {
  scope: string;
  from?: string;
  snap: CoverageSnapshot;
  subscribers: Set<() => void>;
  /** When the next read is due (ms since the epoch). */
  nextAt: number;
  failures: number;
  inflight: boolean;
  queued: boolean;
}

export interface CoveragePollerOptions {
  now?: () => number;
  /** 0 to 1: added to a retry delay (a test passes 0). */
  random?: () => number;
  isHidden?: () => boolean;
}

/** The retry delay a failure asks for, in ms: `Retry-After` when sent (bounded), else exponential back-off; both capped. */
export function retryDelayMs(failures: number, retryAfterMs?: number): number {
  if (retryAfterMs !== undefined && retryAfterMs > 0) return Math.min(Math.max(retryAfterMs, 1_000), COVERAGE_BACKOFF_CAP_MS);
  return Math.min(COVERAGE_BACKOFF_BASE_MS * 2 ** Math.max(0, failures - 1), COVERAGE_BACKOFF_CAP_MS);
}

const retryAfterOf = (e: unknown): number | undefined => {
  const v = e && typeof e === 'object' ? (e as { retryAfterMs?: unknown }).retryAfterMs : undefined;
  return typeof v === 'number' ? v : undefined;
};
const statusOf = (e: unknown): number | undefined => {
  const v = e && typeof e === 'object' ? (e as { status?: unknown }).status : undefined;
  return typeof v === 'number' ? v : undefined;
};

/** The shared poller for one transport: entries by (scope, from), one reader at a time, one timer. */
export class CoveragePoller {
  private entries = new Map<string, Entry>();
  private queue: Entry[] = [];
  private running = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private listening = false;
  private readonly now: () => number;
  private readonly random: () => number;
  private readonly isHidden: () => boolean;

  constructor(private readonly api: ClearanceRead, opts: CoveragePollerOptions = {}) {
    this.now = opts.now ?? Date.now;
    this.random = opts.random ?? Math.random;
    this.isHidden = opts.isHidden ?? (() => typeof document !== 'undefined' && document.hidden);
  }

  private key = (scope: string, from?: string) => `${scope}:${from ?? ''}`;

  /** Starts (or joins) the poll of a scope; the callback runs on every change. Returns the way to stop listening. */
  subscribe(scope: string, from: string | undefined, onChange: () => void): () => void {
    const k = this.key(scope, from);
    let e = this.entries.get(k);
    if (!e) {
      this.prune();
      e = { scope, from, snap: { busy: false, loading: true }, subscribers: new Set(), nextAt: 0, failures: 0, inflight: false, queued: false };
      this.entries.set(k, e);
    }
    const first = e.subscribers.size === 0;
    e.subscribers.add(onChange);
    if (first && !e.inflight && !e.queued) {
      // The first reader of a new or idle entry. A cached answer younger than the refocus age is served as it is
      // (nothing polls the same key twice); a failing entry waits for its retry time; anything else is read now.
      const { updatedAt, retryAt } = e.snap;
      const t = this.now();
      if (retryAt !== undefined) e.nextAt = Math.max(t, retryAt);
      else if (updatedAt !== undefined && t - updatedAt < COVERAGE_REFOCUS_MS) e.nextAt = updatedAt + COVERAGE_POLL_MS;
      else e.nextAt = t;
    }
    this.listen();
    this.schedule();
    return () => {
      e!.subscribers.delete(onChange);
      if (e!.subscribers.size === 0) {
        e!.nextAt = Number.POSITIVE_INFINITY;
        e!.queued = false;
        this.queue = this.queue.filter(q => q !== e);
        if (![...this.entries.values()].some(x => x.subscribers.size > 0)) this.unlisten();
      }
    };
  }

  snapshot(scope: string, from?: string): CoverageSnapshot {
    return this.entries.get(this.key(scope, from))?.snap ?? { busy: false, loading: true };
  }

  /** Reads this scope as soon as the queue allows (after a write that changed what it says). */
  refresh(scope: string, from?: string): void {
    const e = this.entries.get(this.key(scope, from));
    if (!e || e.subscribers.size === 0) return;
    e.nextAt = this.now();
    this.schedule();
  }

  private notify(e: Entry) {
    for (const f of [...e.subscribers]) f();
  }

  /** Drops entries nobody shows whose answer is too old to stand in for anything. */
  private prune() {
    for (const [k, e] of this.entries) {
      if (e.subscribers.size === 0 && (e.snap.updatedAt === undefined || this.now() - e.snap.updatedAt > COVERAGE_MAX_STALE_MS)) this.entries.delete(k);
    }
  }

  private onVisible = () => {
    if (this.isHidden()) return;
    const t = this.now();
    for (const e of this.entries.values()) {
      if (e.subscribers.size === 0 || e.inflight || e.queued) continue;
      // Older than the refocus age: read now. A failing entry already waits for its own retry time; leave it.
      if (e.snap.retryAt === undefined && (e.snap.updatedAt === undefined || t - e.snap.updatedAt > COVERAGE_REFOCUS_MS)) e.nextAt = t;
    }
    this.schedule();
  };

  private listen() {
    if (this.listening || typeof document === 'undefined') return;
    this.listening = true;
    document.addEventListener('visibilitychange', this.onVisible);
    window.addEventListener('focus', this.onVisible);
  }

  private unlisten() {
    if (!this.listening) return;
    this.listening = false;
    document.removeEventListener('visibilitychange', this.onVisible);
    window.removeEventListener('focus', this.onVisible);
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
  }

  /** Queues what is due and arms one timer for what is due next. Nothing is read while the tab is hidden. */
  private schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.isHidden()) return; // the visibility listener schedules again when the tab is back
    const t = this.now();
    let next = Number.POSITIVE_INFINITY;
    const due = [...this.entries.values()].filter(e => e.subscribers.size > 0 && !e.inflight && !e.queued).sort((a, b) => a.nextAt - b.nextAt);
    for (const e of due) {
      if (e.nextAt <= t) {
        e.queued = true;
        this.queue.push(e);
      } else next = Math.min(next, e.nextAt);
    }
    this.pump();
    if (Number.isFinite(next)) this.timer = setTimeout(() => this.schedule(), Math.max(0, next - t));
  }

  private pump() {
    while (this.running < COVERAGE_CONCURRENCY && this.queue.length > 0) {
      const e = this.queue.shift()!;
      e.queued = false;
      if (e.subscribers.size === 0) continue;
      this.running++;
      void this.read(e).finally(() => {
        this.running--;
        this.schedule();
      });
    }
  }

  private async read(e: Entry) {
    e.inflight = true;
    e.snap = { ...e.snap, loading: true };
    this.notify(e);
    try {
      const data = await this.api.get<CoverageStatement>('/v1/coverage', { scope: e.scope, from: e.from });
      e.failures = 0;
      e.snap = { data, updatedAt: this.now(), busy: false, loading: false };
      e.nextAt = this.now() + COVERAGE_POLL_MS;
    } catch (err) {
      e.failures++;
      const status = statusOf(err);
      const busy = status === undefined || isBusyStatus(status); // no status: the request itself failed or timed out
      // A refusal (401/403/404...) will not clear by asking again soon: it waits for the next ordinary poll.
      const delay = busy ? retryDelayMs(e.failures, retryAfterOf(err)) * (1 + JITTER * this.random()) : COVERAGE_POLL_MS;
      e.nextAt = this.now() + delay;
      e.snap = { ...e.snap, failure: err, busy, retryAt: busy ? e.nextAt : undefined, loading: false };
    } finally {
      e.inflight = false;
    }
    this.notify(e);
  }
}

const pollers = new WeakMap<ClearanceRead, CoveragePoller>();

/** The poller shared by everything reading through this `api` (one per transport: `useClearanceRead` is memoised). */
export function coveragePollerFor(api: ClearanceRead): CoveragePoller {
  let p = pollers.get(api);
  if (!p) {
    p = new CoveragePoller(api);
    pollers.set(api, p);
  }
  return p;
}

export interface CoverageRead extends CoverageSnapshot {
  /** The failure to show: only when there is no good answer, or the good answer is older than COVERAGE_MAX_STALE_MS. */
  error?: unknown;
  /** `data` is older than the last try: the last read failed and `data` is what was known before. */
  stale: boolean;
  refresh: () => void;
}

/** The coverage statement of one scope (the last day unless `from` says otherwise), shared with every other reader of it. */
export function useCoveragePoll(api: ClearanceRead, scope: string | undefined, from?: string, poller: CoveragePoller = coveragePollerFor(api)): CoverageRead {
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (!scope) return undefined;
    return poller.subscribe(scope, from, () => setVersion(v => v + 1));
  }, [poller, scope, from]);
  const refresh = useCallback(() => {
    if (scope) poller.refresh(scope, from);
  }, [poller, scope, from]);
  const snap: CoverageSnapshot = scope ? poller.snapshot(scope, from) : { busy: false, loading: false };
  const age = snap.updatedAt === undefined ? undefined : Date.now() - snap.updatedAt;
  const usable = snap.data !== undefined && age !== undefined && age < COVERAGE_MAX_STALE_MS;
  return {
    ...snap,
    data: usable ? snap.data : undefined,
    error: usable ? undefined : snap.failure,
    stale: usable && snap.failure !== undefined,
    refresh,
  };
}
