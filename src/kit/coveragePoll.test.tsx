import type { ReactNode } from 'react';
import { act, render, renderHook, screen } from '@testing-library/react';
import {
  COVERAGE_ABORT_GRACE_MS,
  COVERAGE_BACKOFF_BASE_MS,
  COVERAGE_BACKOFF_CAP_MS,
  COVERAGE_MAX_STALE_MS,
  COVERAGE_POLL_MS,
  COVERAGE_REQUEST_MS,
  COVERAGE_RETRY_AFTER_MAX_MS,
  COVERAGE_REFOCUS_MS,
  CoveragePoller,
  retryDelayMs,
  useCoveragePoll,
} from './coveragePoll';
import { CoverageBanner, CoverageStrip } from './coverage';
import { createFakeTransport, type FakeCall } from './fakeTransport';
import { ClearanceTransportProvider, parseRetryAfter, TransportError } from './transport';
import { createFetchTransport } from './fetchTransport';
import { ReadError, type ClearanceRead } from './read';
import type { CoverageStatement } from './types';

const T0 = Date.parse('2026-11-16T12:00:00Z');
const statement = (scope: string, n = 0): CoverageStatement =>
  ({
    scope, from: '', to: '', state: 'healthy', clean: true, truncated: false, text: '',
    cleared_and_verified: { count: n, by_coverage: {}, items: [], truncated: false },
    seen_not_cleared: { count: 0, by_coverage: {}, items: [], truncated: false },
    could_not_see: { seconds: 0, segments: [], audit_gaps: [] },
    health: { sources: [{ source: 'k8s', state: 'healthy', now: 'healthy', stale: false, failed_checks: [], last_seq: 1, last_ts: '2026-11-16T11:59:00Z', blind_seconds: 0, degraded_seconds: 0 }] },
    source_integrity: { observations: 0, verified: 0, unverified: 0, verified_by_record: 0, verified_later: 0 },
  }) as CoverageStatement;

/** A fake read whose every `/v1/coverage` call is recorded with when it started and answered by `answer`. */
function fakeApi(answer: (scope: string, n: number) => unknown | Promise<unknown>) {
  const started: Array<{ scope: string; at: number }> = [];
  const counts = new Map<string, number>();
  const t = createFakeTransport(async (call: FakeCall) => {
    const scope = String(call.query?.scope);
    started.push({ scope, at: Date.now() });
    const n = (counts.get(scope) ?? 0) + 1;
    counts.set(scope, n);
    return answer(scope, n);
  });
  const api: ClearanceRead = {
    get: async <T,>(path: string, params?: any, opts?: any) => {
      try {
        return await t.get<T>(path, params, opts);
      } catch (e) {
        if (e instanceof TransportError) throw new ReadError(e.message, e.status, e.retryAfterMs);
        throw e;
      }
    },
    getText: path => t.getText(path),
  };
  return { api, started, t };
}

const flush = async (ms = 0) => {
  await act(async () => {
    await jest.advanceTimersByTimeAsync(ms);
  });
};
const poller = (api: ClearanceRead, hidden = { v: false }) => new CoveragePoller(api, { random: () => 0, isHidden: () => hidden.v });

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(T0);
});
afterEach(() => {
  jest.useRealTimers();
});

describe('shared coverage poll', () => {
  it('de-duplicates: two consumers of one (scope, from) make one request and both get the answer', async () => {
    const { api, started } = fakeApi(scope => statement(scope, 7));
    const p = poller(api);
    const a = renderHook(() => useCoveragePoll(api, 'prod', undefined, p));
    const b = renderHook(() => useCoveragePoll(api, 'prod', undefined, p));
    await flush();
    expect(started).toHaveLength(1);
    expect(a.result.current.data?.cleared_and_verified.count).toBe(7);
    expect(b.result.current.data?.cleared_and_verified.count).toBe(7);
    // a later mount inside the refocus age reads nothing
    await flush(COVERAGE_REFOCUS_MS - 1000);
    const c = renderHook(() => useCoveragePoll(api, 'prod', undefined, p));
    await flush();
    expect(started).toHaveLength(1);
    expect(c.result.current.data).toBeDefined();
    // a different `from` is a different key
    renderHook(() => useCoveragePoll(api, 'prod', '2026-11-15T00:00:00Z', p));
    await flush();
    expect(started).toHaveLength(2);
  });

  it('runs different scopes one at a time, never together', async () => {
    let inFlight = 0;
    let most = 0;
    const { api, started } = fakeApi(async scope => {
      inFlight++;
      most = Math.max(most, inFlight);
      await new Promise(r => setTimeout(r, 3500));
      inFlight--;
      return statement(scope);
    });
    const p = poller(api);
    for (const s of ['a', 'b', 'c']) renderHook(() => useCoveragePoll(api, s, undefined, p));
    await flush(0);
    expect(started.map(s => s.scope)).toEqual(['a']);
    await flush(3500);
    expect(started.map(s => s.scope)).toEqual(['a', 'b']);
    await flush(3500);
    expect(started.map(s => s.scope)).toEqual(['a', 'b', 'c']);
    await flush(3500);
    expect(most).toBe(1);
  });

  it('re-reads every five minutes while visible', async () => {
    const { api, started } = fakeApi(scope => statement(scope));
    const p = poller(api);
    renderHook(() => useCoveragePoll(api, 'prod', undefined, p));
    await flush();
    await flush(COVERAGE_POLL_MS - 1);
    expect(started).toHaveLength(1);
    await flush(1);
    expect(started).toHaveLength(2);
  });

  it('honours Retry-After on a 503, then backs off without it, growing to the cap', async () => {
    const { api, started } = fakeApi((_s, n) => (n === 1 ? { refuse: 503, retryAfterMs: 7000 } : { refuse: 503 }));
    const p = poller(api);
    const { result } = renderHook(() => useCoveragePoll(api, 'prod', undefined, p));
    await flush();
    expect(result.current.busy).toBe(true);
    expect(result.current.retryAt).toBe(T0 + 7000);
    await flush(6999);
    expect(started).toHaveLength(1);
    await flush(1);
    expect(started).toHaveLength(2);
    // no header from here: the 2nd failure waits 10 s, then 20 s, 40 s, 80 s, then the cap
    await flush(60 * 60_000);
    const gaps = started.slice(1).map((s, i) => s.at - started[i].at).slice(1);
    expect(gaps.slice(0, 5)).toEqual([10000, 20000, 40000, 80000, COVERAGE_BACKOFF_CAP_MS]);
    expect(gaps.every(g => g <= COVERAGE_BACKOFF_CAP_MS)).toBe(true);
    expect(gaps[gaps.length - 1]).toBe(COVERAGE_BACKOFF_CAP_MS);
  });

  it('the delay grows 5 s, 10 s, 20 s and stops at the cap; a Retry-After is bounded by it', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 20].map(n => retryDelayMs(n))).toEqual([5000, 10000, 20000, 40000, 80000, 120000, 120000, 120000]);
    expect(COVERAGE_BACKOFF_BASE_MS).toBe(5000);
    expect(retryDelayMs(1, 5000)).toBe(5000);
    expect(retryDelayMs(1, 600_000)).toBe(600_000); // the server's own wait is not shortened
    expect(retryDelayMs(1, 99 * 3_600_000)).toBe(COVERAGE_RETRY_AFTER_MAX_MS);
    expect(retryDelayMs(1, 0)).toBe(5000);
  });

  it('keeps the last good answer through failures, with its age, until it is too old', async () => {
    let fail = false;
    const { api } = fakeApi(scope => (fail ? { refuse: 503 } : statement(scope, 3)));
    const p = poller(api);
    const { result } = renderHook(() => useCoveragePoll(api, 'prod', undefined, p));
    await flush();
    expect(result.current.stale).toBe(false);
    fail = true;
    await flush(COVERAGE_POLL_MS);
    expect(result.current.data?.cleared_and_verified.count).toBe(3);
    expect(result.current.stale).toBe(true);
    expect(result.current.error).toBeUndefined();
    expect(result.current.updatedAt).toBe(T0);
    await flush(COVERAGE_MAX_STALE_MS);
    expect(result.current.data).toBeUndefined();
    expect(result.current.error).toBeDefined();
    fail = false;
    await flush(COVERAGE_BACKOFF_CAP_MS);
    expect(result.current.data?.cleared_and_verified.count).toBe(3);
    expect(result.current.stale).toBe(false);
  });

  it('a 200 with no statement is a failed read: nothing is stored as data, and it is retried with back-off', async () => {
    let n = 0;
    const empty = { get: (async () => (++n === 1 ? undefined : statement('prod'))) as ClearanceRead['get'], getText: async () => '' } as ClearanceRead;
    const p = poller(empty);
    const { result } = renderHook(() => useCoveragePoll(empty, 'prod', undefined, p));
    await flush();
    expect(result.current.data).toBeUndefined();
    expect(result.current.busy).toBe(true);
    await flush(COVERAGE_BACKOFF_BASE_MS);
    expect(result.current.data).toBeDefined();
  });

  it('a refusal (403) is not retried fast: it waits for the next ordinary poll', async () => {
    const { api, started } = fakeApi(() => ({ refuse: 403, body: { error: 'no' } }));
    const p = poller(api);
    const { result } = renderHook(() => useCoveragePoll(api, 'prod', undefined, p));
    await flush();
    expect(result.current.busy).toBe(false);
    expect(result.current.retryAt).toBeUndefined();
    await flush(COVERAGE_POLL_MS - 1);
    expect(started).toHaveLength(1);
    await flush(1);
    expect(started).toHaveLength(2);
  });

  it('a request that fails with no status (timeout, network) is retried with back-off', async () => {
    let n = 0;
    const { api, started } = fakeApi(() => {
      if (++n === 1) throw new Error('network down');
      return statement('prod');
    });
    const p = poller(api);
    const { result } = renderHook(() => useCoveragePoll(api, 'prod', undefined, p));
    await flush();
    expect(result.current.busy).toBe(true);
    await flush(COVERAGE_BACKOFF_BASE_MS);
    expect(started).toHaveLength(2);
    expect(result.current.data).toBeDefined();
  });

  it('reads again on focus when the answer is older than a minute, and not when it is fresher', async () => {
    const { api, started } = fakeApi(scope => statement(scope));
    const p = poller(api);
    renderHook(() => useCoveragePoll(api, 'prod', undefined, p));
    await flush();
    await flush(COVERAGE_REFOCUS_MS - 5000);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await flush();
    expect(started).toHaveLength(1);
    await flush(6000);
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await flush();
    expect(started).toHaveLength(2);
  });

  it('does not read while the tab is hidden, and catches up when it is visible again', async () => {
    const hidden = { v: true };
    const { api, started } = fakeApi(scope => statement(scope));
    const p = poller(api, hidden);
    renderHook(() => useCoveragePoll(api, 'prod', undefined, p));
    await flush(COVERAGE_POLL_MS * 2);
    expect(started).toHaveLength(0);
    hidden.v = false;
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await flush();
    expect(started).toHaveLength(1);
  });

  it('stops reading when the last consumer leaves', async () => {
    const { api, started } = fakeApi(scope => statement(scope));
    const p = poller(api);
    const h = renderHook(() => useCoveragePoll(api, 'prod', undefined, p));
    await flush();
    h.unmount();
    await flush(COVERAGE_POLL_MS * 3);
    expect(started).toHaveLength(1);
  });

  it('aborts a stalled read at the deadline, and starts nothing else until the grace period has passed', async () => {
    const { api, started, t } = fakeApi(scope => (scope === 'a' ? new Promise(() => {}) : statement(scope)));
    const p = poller(api);
    const a = renderHook(() => useCoveragePoll(api, 'a', undefined, p));
    renderHook(() => useCoveragePoll(api, 'b', undefined, p));
    await flush(COVERAGE_REQUEST_MS - 1);
    expect(t.calls[0].signal?.aborted).toBe(false);
    await flush(1);
    expect(t.calls[0].signal?.aborted).toBe(true);
    expect(a.result.current.busy).toBe(true);
    // the request has settled (aborted), but the server may still be computing: the one slot stays held
    await flush(COVERAGE_ABORT_GRACE_MS - 1);
    expect(started.map(s => s.scope)).toEqual(['a']);
    await flush(1);
    expect(started.map(s => s.scope).slice(0, 2)).toEqual(['a', 'b']); // then a's own retry, once b has been read
  });

  it('the timed-out scope itself is not asked again before the grace period and its back-off have passed', async () => {
    const { api, started } = fakeApi(() => new Promise(() => {}));
    const p = poller(api);
    renderHook(() => useCoveragePoll(api, 'a', undefined, p));
    await flush(COVERAGE_REQUEST_MS + COVERAGE_ABORT_GRACE_MS - 1);
    expect(started).toHaveLength(1);
    await flush(COVERAGE_BACKOFF_BASE_MS);
    expect(started).toHaveLength(2);
  });

  it('leaving aborts the read in flight, reports no failure, and holds the slot for the grace period', async () => {
    const { api, started, t } = fakeApi(scope => (scope === 'a' ? new Promise(() => {}) : statement(scope)));
    const p = poller(api);
    const a = renderHook(() => useCoveragePoll(api, 'a', undefined, p));
    await flush();
    a.unmount();
    expect(t.calls[0].signal?.aborted).toBe(true);
    renderHook(() => useCoveragePoll(api, 'b', undefined, p));
    await flush(COVERAGE_ABORT_GRACE_MS - 1);
    expect(started.map(s => s.scope)).toEqual(['a']);
    await flush(1);
    expect(started.map(s => s.scope)).toEqual(['a', 'b']);
    expect(p.snapshot('a').failure).toBeUndefined();
    expect(p.snapshot('a').busy).toBe(false);
  });

  it('a scope shown again while its read is being abandoned is read once the grace period ends', async () => {
    let n = 0;
    const { api, started } = fakeApi(scope => (++n === 1 ? new Promise(() => {}) : statement(scope)));
    const p = poller(api);
    const a = renderHook(() => useCoveragePoll(api, 'a', undefined, p));
    await flush();
    a.unmount();
    const again = renderHook(() => useCoveragePoll(api, 'a', undefined, p));
    await flush(COVERAGE_ABORT_GRACE_MS);
    expect(started).toHaveLength(2);
    expect(again.result.current.data).toBeDefined();
  });

  it('a refresh asked for while a read is out is read again when it settles', async () => {
    let release: (v: unknown) => void = () => {};
    const { api, started } = fakeApi((scope, n) => (n === 1 ? new Promise(r => (release = r)) : statement(scope, 9)));
    const p = poller(api);
    const { result } = renderHook(() => useCoveragePoll(api, 'prod', undefined, p));
    await flush();
    act(() => result.current.refresh());
    await flush();
    expect(started).toHaveLength(1);
    release(statement('prod', 1));
    await flush();
    expect(started).toHaveLength(2);
    expect(result.current.data?.cleared_and_verified.count).toBe(9);
  });

  it('an expired good answer disappears on its own, without another poll', async () => {
    let fail = false;
    const { api } = fakeApi(scope => (fail ? new Promise(() => {}) : statement(scope, 3)));
    const p = poller(api);
    const { result } = renderHook(() => useCoveragePoll(api, 'prod', undefined, p));
    await flush();
    fail = true;
    // the next reads hang until their deadline: nothing notifies the hook near the expiry itself
    await flush(COVERAGE_MAX_STALE_MS - 1000);
    expect(result.current.data).toBeDefined();
    await flush(2000);
    expect(result.current.data).toBeUndefined();
  });

  it('refresh() reads the scope now', async () => {
    const { api, started } = fakeApi(scope => statement(scope));
    const p = poller(api);
    const { result } = renderHook(() => useCoveragePoll(api, 'prod', undefined, p));
    await flush();
    act(() => result.current.refresh());
    await flush();
    expect(started).toHaveLength(2);
  });
});

describe('Retry-After on the transport', () => {
  it('parses seconds and dates, and ignores junk', () => {
    expect(parseRetryAfter('5')).toBe(5000);
    expect(parseRetryAfter('Mon, 16 Nov 2026 12:00:09 GMT', T0)).toBe(9000);
    expect(parseRetryAfter('soon')).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });

  it('the fetch transport passes the abort signal to fetch', async () => {
    let seen: AbortSignal | undefined;
    const fetch = async (_u: string, init?: { signal?: AbortSignal }) => {
      seen = init?.signal;
      return { ok: true, status: 200, headers: { get: () => null }, json: async () => ({}) } as unknown as Response;
    };
    const ac = new AbortController();
    await createFetchTransport({ fetch, url: p => p }).get('/v1/coverage', undefined, { signal: ac.signal });
    expect(seen).toBe(ac.signal);
  });

  it('an abort between the headers and the body rejects with AbortError instead of resolving with no body', async () => {
    const ac = new AbortController();
    const fetch = async () =>
      ({
        ok: true,
        status: 200,
        headers: { get: () => null },
        json: async () => {
          // headers have arrived; the abort lands before the body is read
          ac.abort();
          throw Object.assign(new Error('aborted'), { name: 'AbortError' });
        },
      }) as unknown as Response;
    const p = createFetchTransport({ fetch, url: u => u }).get('/v1/coverage', undefined, { signal: ac.signal });
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('an empty body still reads as undefined on a call with no signal, and a 204 write still resolves', async () => {
    const empty = (status: number) => async () => ({ ok: status < 300, status, headers: { get: () => null }, json: async () => { throw new SyntaxError('no body'); } }) as unknown as Response;
    const t = createFetchTransport({ fetch: empty(200), url: u => u });
    await expect(t.get('/v1/x')).resolves.toBeUndefined();
    await expect(createFetchTransport({ fetch: empty(204), url: u => u }).post('/v1/x', {})).resolves.toEqual({});
    await expect(createFetchTransport({ fetch: empty(204), url: u => u }).delete('/v1/x')).resolves.toEqual({});
  });

  it('the fetch transport carries it from a 503 to the TransportError', async () => {
    const fetch = async () => ({ ok: false, status: 503, headers: { get: (h: string) => (h === 'Retry-After' ? '5' : null) }, json: async () => ({ error: 'busy' }) }) as unknown as Response;
    const t = createFetchTransport({ fetch, url: p => p });
    const e: any = await t.get('/v1/coverage').catch(x => x);
    expect(e).toBeInstanceOf(TransportError);
    expect(e.retryAfterMs).toBe(5000);
  });
});

describe('coverage banners', () => {
  // eslint-disable-next-line react/display-name
  const wrap = (t: ReturnType<typeof createFakeTransport>) => ({ children }: { children?: ReactNode }) => <ClearanceTransportProvider transport={t}>{children}</ClearanceTransportProvider>;

  it('says coverage is being computed, with a countdown, when busy and nothing is known yet', () => {
    render(<CoverageBanner scope="prod" busy retryAt={Date.now() + 5000} />);
    const r = screen.getByRole('region', { name: 'Coverage of prod' });
    expect(r.getAttribute('data-state')).toBe('computing');
    expect(r.textContent).toContain('Coverage is being computed. Retrying in 5 s.');
    expect(r.textContent).not.toContain('unavailable');
  });

  it('counts down each second', async () => {
    render(<CoverageBanner scope="prod" busy retryAt={Date.now() + 5000} />);
    await flush(2000);
    expect(screen.getByRole('region', { name: 'Coverage of prod' }).textContent).toContain('Retrying in 3 s.');
  });

  it('keeps the statement and says how old it is when the latest try failed', () => {
    render(<CoverageBanner scope="prod" statement={statement('prod')} staleSince={Date.now() - 6 * 60_000} retryAt={Date.now() + 10_000} />);
    const r = screen.getByRole('region', { name: 'Coverage of prod' });
    expect(r.getAttribute('data-state')).toBe('healthy');
    expect(r.textContent).toContain('read 6 min ago');
    expect(r.textContent).toContain('Retrying in 10 s.');
  });

  it('shows unavailable for a refusal, and plain reading while the first read is out', () => {
    const { rerender } = render(<CoverageBanner scope="prod" error={new ReadError('x', 403)} />);
    expect(screen.getByRole('region', { name: 'Coverage of prod' }).getAttribute('data-state')).toBe('unavailable');
    rerender(<CoverageBanner scope="prod" />);
    expect(screen.getByRole('region', { name: 'Coverage of prod' }).getAttribute('data-state')).toBe('loading');
  });

  it('a strip of three scopes asks for them one after another, and a busy first answer shows as computing, not unavailable', async () => {
    const started: string[] = [];
    const t = createFakeTransport(async ({ path, query }) => {
      if (path === '/scopes') return { scopes: ['a', 'b', 'c'] };
      started.push(String(query?.scope));
      await new Promise(r => setTimeout(r, 1000));
      return query?.scope === 'a' ? { refuse: 503, retryAfterMs: 5000 } : statement(String(query?.scope));
    });
    render(<CoverageStrip />, { wrapper: wrap(t) });
    await flush(0);
    await flush(0);
    expect(started).toEqual(['a']);
    await flush(1000);
    expect(screen.getByRole('region', { name: 'Coverage of a' }).getAttribute('data-state')).toBe('computing');
    expect(started).toEqual(['a', 'b']);
    await flush(2000);
    expect(started).toEqual(['a', 'b', 'c']);
    expect(screen.getByRole('region', { name: 'Coverage of b' }).getAttribute('data-state')).toBe('healthy');
  });
});
