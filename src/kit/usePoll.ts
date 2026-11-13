import { useCallback, useEffect, useRef, useState } from 'react';

export interface Polled<T> {
  data?: T;
  error?: string;
  /** The error as thrown (a ReadError carries its HTTP status), for a view that tells 403 from 503. */
  failure?: unknown;
  loading: boolean;
  updatedAt?: number;
  refresh: () => void;
}

/**
 * Calls `fetcher` now and every `intervalMs` while the page is visible, keeping the last good data on a failure.
 * `key` restarts the loop when what is fetched changes. `intervalMs` 0 fetches once.
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
    setState(s => ({ ...s, loading: true }));
    async function tick() {
      if (typeof document === 'undefined' || !document.hidden) {
        try {
          const data = await fetcherRef.current();
          if (!cancelled) setState({ data, updatedAt: Date.now(), loading: false });
        } catch (e) {
          if (!cancelled) setState(s => ({ ...s, error: e instanceof Error ? e.message : String(e), failure: e, loading: false }));
        }
      }
      if (!cancelled && intervalMs > 0) timer = setTimeout(tick, intervalMs);
    }
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [key, intervalMs, nonce]);

  return { ...state, refresh };
}
