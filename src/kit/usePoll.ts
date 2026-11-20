import { useCallback, useEffect, useRef, useState } from 'react';
import { ReadError } from './read';

export interface Polled<T> {
  data?: T;
  error?: string;
  /** The error as thrown (a ReadError carries its HTTP status), for a view that tells 403 from 503. */
  failure?: unknown;
  loading: boolean;
  updatedAt?: number;
  refresh: () => void;
}

const RETRY_BASE_MS = 3_000;
const RETRY_MAX_MS = 30_000;
const RETRY_ATTEMPTS = 3;

/** Worth trying again unprompted: the network or a timeout (status 0), or a server that is busy or restarting. */
export function isTransient(e: unknown): boolean {
  return e instanceof ReadError && (e.status === 0 || e.status === 429 || e.status === 502 || e.status === 503 || e.status === 504);
}

/**
 * Calls `fetcher` now and every `intervalMs` while the page is visible, keeping the last good data on a failure.
 * `key` restarts the loop when what is fetched changes. `intervalMs` 0 fetches once.
 * A failure before any data (a 503 while the database is busy, a timeout) is retried by itself, a few times with
 * back-off (honouring Retry-After); after that the error stays for the view to show with a Retry (`refresh`).
 * `refresh` clears the error and shows loading again.
 */
export function usePoll<T>(key: string, fetcher: () => Promise<T>, intervalMs: number): Polled<T> {
  const [state, setState] = useState<Omit<Polled<T>, 'refresh'>>({ loading: true });
  const [nonce, setNonce] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const refresh = useCallback(() => setNonce(n => n + 1), []);

  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    setState(s => ({ ...s, error: undefined, failure: undefined, loading: true }));
    let failures = 0;
    let gotData = false;
    async function tick() {
      let retryIn: number | undefined;
      if (typeof document === 'undefined' || !document.hidden) {
        try {
          const data = await fetcherRef.current();
          failures = 0;
          gotData = true;
          if (!cancelled) setState({ data, updatedAt: Date.now(), loading: false });
        } catch (e) {
          failures += 1;
          if (!cancelled) {
            if (!gotData && isTransient(e) && failures <= RETRY_ATTEMPTS) {
              const hinted = e instanceof ReadError ? e.retryAfterMs : undefined;
              retryIn = Math.min(RETRY_MAX_MS, hinted ?? RETRY_BASE_MS * 2 ** (failures - 1));
            }
            setState(s => ({ ...s, error: e instanceof Error ? e.message : String(e), failure: e, loading: false }));
          }
        }
      }
      if (cancelled) return;
      if (retryIn !== undefined) timer = setTimeout(tick, retryIn);
      else if (intervalMs > 0) timer = setTimeout(tick, intervalMs);
    }
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [key, intervalMs, nonce]);

  return { ...state, refresh };
}
