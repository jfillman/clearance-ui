import { useState, useRef, useCallback, useEffect } from 'react';
import { ReadError } from './read.esm.js';

const RETRY_BASE_MS = 3e3;
const RETRY_MAX_MS = 3e4;
const RETRY_ATTEMPTS = 3;
function isTransient(e) {
  return e instanceof ReadError && (e.status === 0 || e.status === 429 || e.status === 502 || e.status === 503 || e.status === 504);
}
function usePoll(key, fetcher, intervalMs) {
  const [state, setState] = useState({ loading: true });
  const [nonce, setNonce] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    let timer;
    setState((s) => ({ ...s, error: void 0, failure: void 0, loading: true }));
    let failures = 0;
    let gotData = false;
    async function tick() {
      let retryIn;
      if (typeof document === "undefined" || !document.hidden) {
        try {
          const data = await fetcherRef.current();
          failures = 0;
          gotData = true;
          if (!cancelled) setState({ data, updatedAt: Date.now(), loading: false });
        } catch (e) {
          failures += 1;
          if (!cancelled) {
            if (!gotData && isTransient(e) && failures <= RETRY_ATTEMPTS) {
              const hinted = e instanceof ReadError ? e.retryAfterMs : void 0;
              retryIn = Math.min(RETRY_MAX_MS, hinted ?? RETRY_BASE_MS * 2 ** (failures - 1));
            }
            setState((s) => ({ ...s, error: e instanceof Error ? e.message : String(e), failure: e, loading: false }));
          }
        }
      }
      if (cancelled) return;
      if (retryIn !== void 0) timer = setTimeout(tick, retryIn);
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

export { isTransient, usePoll };
//# sourceMappingURL=usePoll.esm.js.map
