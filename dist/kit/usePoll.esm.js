import { useState, useRef, useCallback, useEffect } from 'react';

function usePoll(key, fetcher, intervalMs) {
  const [state, setState] = useState({ loading: true });
  const [nonce, setNonce] = useState(0);
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const refresh = useCallback(() => setNonce((n) => n + 1), []);
  useEffect(() => {
    let cancelled = false;
    let timer;
    setState((s) => ({ ...s, loading: true }));
    async function tick() {
      if (typeof document === "undefined" || !document.hidden) {
        try {
          const data = await fetcherRef.current();
          if (!cancelled) setState({ data, updatedAt: Date.now(), loading: false });
        } catch (e) {
          if (!cancelled) setState((s) => ({ ...s, error: e instanceof Error ? e.message : String(e), failure: e, loading: false }));
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

export { usePoll };
//# sourceMappingURL=usePoll.esm.js.map
