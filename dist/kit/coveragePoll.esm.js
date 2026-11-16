import { useState, useEffect, useCallback } from 'react';

const COVERAGE_POLL_MS = 5 * 6e4;
const COVERAGE_REFOCUS_MS = 6e4;
const COVERAGE_MAX_STALE_MS = 3 * COVERAGE_POLL_MS;
const COVERAGE_BACKOFF_BASE_MS = 5e3;
const COVERAGE_BACKOFF_CAP_MS = 12e4;
const COVERAGE_RETRY_AFTER_MAX_MS = 60 * 6e4;
const COVERAGE_REQUEST_MS = 3e4;
const COVERAGE_ABORT_GRACE_MS = 1e4;
const COVERAGE_CONCURRENCY = 1;
const JITTER = 0.2;
const isBusyStatus = (status) => status === 503 || status === 429 || status === 504 || status === 502 || status === 408;
function retryDelayMs(failures, retryAfterMs) {
  if (retryAfterMs !== void 0 && retryAfterMs > 0) return Math.min(Math.max(retryAfterMs, 1e3), COVERAGE_RETRY_AFTER_MAX_MS);
  return Math.min(COVERAGE_BACKOFF_BASE_MS * 2 ** Math.max(0, failures - 1), COVERAGE_BACKOFF_CAP_MS);
}
const retryAfterOf = (e) => {
  const v = e && typeof e === "object" ? e.retryAfterMs : void 0;
  return typeof v === "number" ? v : void 0;
};
const statusOf = (e) => {
  const v = e && typeof e === "object" ? e.status : void 0;
  return typeof v === "number" ? v : void 0;
};
class CoveragePoller {
  constructor(api, opts = {}) {
    this.api = api;
    this.now = opts.now ?? Date.now;
    this.random = opts.random ?? Math.random;
    this.isHidden = opts.isHidden ?? (() => typeof document !== "undefined" && document.hidden);
  }
  api;
  entries = /* @__PURE__ */ new Map();
  queue = [];
  running = 0;
  timer;
  listening = false;
  now;
  random;
  isHidden;
  key = (scope, from) => `${scope}:${from ?? ""}`;
  /** Starts (or joins) the poll of a scope; the callback runs on every change. Returns the way to stop listening. */
  subscribe(scope, from, onChange) {
    const k = this.key(scope, from);
    let e = this.entries.get(k);
    if (!e) {
      this.prune();
      e = { scope, from, snap: { busy: false, loading: true }, subscribers: /* @__PURE__ */ new Set(), nextAt: 0, failures: 0, inflight: false, queued: false, refreshPending: false, cancelled: false };
      this.entries.set(k, e);
    }
    const first = e.subscribers.size === 0;
    e.subscribers.add(onChange);
    if (first && !e.inflight && !e.queued) {
      const { updatedAt, retryAt } = e.snap;
      const t = this.now();
      if (retryAt !== void 0) e.nextAt = Math.max(t, retryAt);
      else if (updatedAt !== void 0 && t - updatedAt < COVERAGE_REFOCUS_MS) e.nextAt = updatedAt + COVERAGE_POLL_MS;
      else e.nextAt = t;
    }
    this.listen();
    this.schedule();
    return () => {
      e.subscribers.delete(onChange);
      if (e.subscribers.size === 0) {
        e.nextAt = Number.POSITIVE_INFINITY;
        e.queued = false;
        this.queue = this.queue.filter((q) => q !== e);
        if (e.inflight && e.abort) {
          e.cancelled = true;
          e.abort.abort();
        }
        if (![...this.entries.values()].some((x) => x.subscribers.size > 0)) this.unlisten();
      }
    };
  }
  snapshot(scope, from) {
    return this.entries.get(this.key(scope, from))?.snap ?? { busy: false, loading: true };
  }
  /** Reads this scope as soon as the queue allows (after a write that changed what it says). */
  refresh(scope, from) {
    const e = this.entries.get(this.key(scope, from));
    if (!e || e.subscribers.size === 0) return;
    if (e.inflight) {
      e.refreshPending = true;
      return;
    }
    e.nextAt = this.now();
    this.schedule();
  }
  notify(e) {
    for (const f of [...e.subscribers]) f();
  }
  /** Drops entries nobody shows whose answer is too old to stand in for anything. */
  prune() {
    for (const [k, e] of this.entries) {
      if (e.subscribers.size === 0 && (e.snap.updatedAt === void 0 || this.now() - e.snap.updatedAt > COVERAGE_MAX_STALE_MS)) this.entries.delete(k);
    }
  }
  onVisible = () => {
    if (this.isHidden()) return;
    const t = this.now();
    for (const e of this.entries.values()) {
      if (e.subscribers.size === 0 || e.inflight || e.queued) continue;
      if (e.snap.retryAt === void 0 && (e.snap.updatedAt === void 0 || t - e.snap.updatedAt > COVERAGE_REFOCUS_MS)) e.nextAt = t;
    }
    this.schedule();
  };
  listen() {
    if (this.listening || typeof document === "undefined") return;
    this.listening = true;
    document.addEventListener("visibilitychange", this.onVisible);
    window.addEventListener("focus", this.onVisible);
  }
  unlisten() {
    if (!this.listening) return;
    this.listening = false;
    document.removeEventListener("visibilitychange", this.onVisible);
    window.removeEventListener("focus", this.onVisible);
    if (this.timer) clearTimeout(this.timer);
    this.timer = void 0;
  }
  /** Queues what is due and arms one timer for what is due next. Nothing is read while the tab is hidden. */
  schedule() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = void 0;
    if (this.isHidden()) return;
    const t = this.now();
    let next = Number.POSITIVE_INFINITY;
    const due = [...this.entries.values()].filter((e) => e.subscribers.size > 0 && !e.inflight && !e.queued).sort((a, b) => a.nextAt - b.nextAt);
    for (const e of due) {
      if (e.nextAt <= t) {
        e.queued = true;
        this.queue.push(e);
      } else next = Math.min(next, e.nextAt);
    }
    this.pump();
    if (Number.isFinite(next)) this.timer = setTimeout(() => this.schedule(), Math.max(0, next - t));
  }
  pump() {
    while (this.running < COVERAGE_CONCURRENCY && this.queue.length > 0) {
      const e = this.queue.shift();
      e.queued = false;
      if (e.subscribers.size === 0) continue;
      this.running++;
      void this.read(e).finally(() => {
        this.running--;
        this.schedule();
      });
    }
  }
  async read(e) {
    e.inflight = true;
    e.snap = { ...e.snap, loading: true };
    this.notify(e);
    const ac = new AbortController();
    e.abort = ac;
    let timedOut = false;
    let timer;
    try {
      const req = this.api.get("/v1/coverage", { scope: e.scope, from: e.from }, { signal: ac.signal });
      req.catch(() => {
      });
      const expired = new Promise((_, reject) => {
        timer = setTimeout(() => {
          timedOut = true;
          ac.abort();
          reject(new Error("coverage read timed out"));
        }, COVERAGE_REQUEST_MS);
      });
      const data = await Promise.race([req, expired]);
      if (data === null || typeof data !== "object") throw new Error("coverage read returned no statement");
      e.failures = 0;
      e.snap = { data, updatedAt: this.now(), busy: false, loading: false };
      e.nextAt = this.now() + COVERAGE_POLL_MS;
    } catch (err) {
      if (e.cancelled) {
        e.snap = { ...e.snap, loading: false };
      } else {
        e.failures++;
        const status = statusOf(err);
        const busy = status === void 0 || isBusyStatus(status);
        const delay = busy ? retryDelayMs(e.failures, retryAfterOf(err)) * (1 + JITTER * this.random()) : COVERAGE_POLL_MS;
        e.nextAt = this.now() + delay;
        e.snap = { ...e.snap, failure: err, busy, retryAt: busy ? e.nextAt : void 0, loading: false };
      }
    } finally {
      clearTimeout(timer);
    }
    if (timedOut) this.notify(e);
    if (timedOut || e.cancelled) await new Promise((resolve) => setTimeout(resolve, COVERAGE_ABORT_GRACE_MS));
    e.inflight = false;
    e.abort = void 0;
    if (e.cancelled) {
      e.cancelled = false;
      if (e.subscribers.size > 0) e.nextAt = this.now();
    }
    if (e.refreshPending) {
      e.refreshPending = false;
      e.nextAt = this.now();
    }
    this.notify(e);
  }
}
const pollers = /* @__PURE__ */ new WeakMap();
function coveragePollerFor(api) {
  let p = pollers.get(api);
  if (!p) {
    p = new CoveragePoller(api);
    pollers.set(api, p);
  }
  return p;
}
function useCoveragePoll(api, scope, from, poller = coveragePollerFor(api)) {
  const [, setVersion] = useState(0);
  useEffect(() => {
    if (!scope) return void 0;
    return poller.subscribe(scope, from, () => setVersion((v) => v + 1));
  }, [poller, scope, from]);
  const updatedAt = scope ? poller.snapshot(scope, from).updatedAt : void 0;
  useEffect(() => {
    if (updatedAt === void 0) return void 0;
    const id = setTimeout(() => setVersion((v) => v + 1), Math.max(0, updatedAt + COVERAGE_MAX_STALE_MS - Date.now()) + 1);
    return () => clearTimeout(id);
  }, [updatedAt]);
  const refresh = useCallback(() => {
    if (scope) poller.refresh(scope, from);
  }, [poller, scope, from]);
  const snap = scope ? poller.snapshot(scope, from) : { busy: false, loading: false };
  const age = snap.updatedAt === void 0 ? void 0 : Date.now() - snap.updatedAt;
  const usable = snap.data !== void 0 && age !== void 0 && age < COVERAGE_MAX_STALE_MS;
  return {
    ...snap,
    data: usable ? snap.data : void 0,
    error: usable ? void 0 : snap.failure,
    stale: usable && snap.failure !== void 0,
    refresh
  };
}

export { COVERAGE_ABORT_GRACE_MS, COVERAGE_BACKOFF_BASE_MS, COVERAGE_BACKOFF_CAP_MS, COVERAGE_CONCURRENCY, COVERAGE_MAX_STALE_MS, COVERAGE_POLL_MS, COVERAGE_REFOCUS_MS, COVERAGE_REQUEST_MS, COVERAGE_RETRY_AFTER_MAX_MS, CoveragePoller, coveragePollerFor, isBusyStatus, retryDelayMs, useCoveragePoll };
//# sourceMappingURL=coveragePoll.esm.js.map
