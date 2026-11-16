import type { ClearanceTransport, Query, ReadOptions } from './transport';
import { TransportError } from './transport';

// A transport for view tests: answers come from a function, every call is recorded. No fetch, no host.

export interface FakeCall {
  method: 'GET' | 'GET_TEXT' | 'POST' | 'DELETE';
  path: string;
  query?: Query;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
  /** The abort signal a read was given, so a test can see it fired. */
  signal?: AbortSignal;
}

/** What answers a call: the JSON (or text) to serve, `undefined` for not found, or a TransportError-shaped refusal. */
export type FakeAnswer = unknown | { refuse: number; body?: unknown; retryAfterMs?: number };

export interface FakeTransport extends ClearanceTransport {
  calls: FakeCall[];
}

function raceAbort<T>(p: Promise<T>, signal: AbortSignal): Promise<T> {
  const abortError = () => Object.assign(new Error('The operation was aborted'), { name: 'AbortError' });
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise<T>((resolve, reject) => {
    signal.addEventListener('abort', () => reject(abortError()), { once: true });
    p.then(resolve, reject);
  });
}

export function createFakeTransport(answer: (call: FakeCall) => FakeAnswer | Promise<FakeAnswer>): FakeTransport {
  const calls: FakeCall[] = [];
  async function run<T>(call: FakeCall): Promise<T> {
    calls.push(call);
    const pending = Promise.resolve(answer(call));
    // A read given a signal ends with an AbortError when it fires, as fetch does.
    const a = (await (call.signal ? raceAbort(pending, call.signal) : pending)) as any;
    if (a === undefined) throw new TransportError(call.path, 404, { error: `no ${call.path}` });
    if (a && typeof a === 'object' && typeof a.refuse === 'number') throw new TransportError(call.path, a.refuse, a.body ?? {}, undefined, a.retryAfterMs);
    return a as T;
  }
  return {
    calls,
    get: <T,>(path: string, query?: Query, opts?: ReadOptions) => run<T>({ method: 'GET', path, query, signal: opts?.signal }),
    getText: path => run<string>({ method: 'GET_TEXT', path }),
    post: <T,>(path: string, body?: Record<string, unknown>, headers?: Record<string, string>) => run<T>({ method: 'POST', path, body, headers }),
    delete: <T,>(path: string) => run<T>({ method: 'DELETE', path }),
  };
}
