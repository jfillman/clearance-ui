import type { ClearanceTransport, Query } from './transport';
import { TransportError } from './transport';

// A transport for view tests: answers come from a function, every call is recorded. No fetch, no host.

export interface FakeCall {
  method: 'GET' | 'GET_TEXT' | 'POST' | 'DELETE';
  path: string;
  query?: Query;
  body?: Record<string, unknown>;
  headers?: Record<string, string>;
}

/** What answers a call: the JSON (or text) to serve, `undefined` for not found, or a TransportError-shaped refusal. */
export type FakeAnswer = unknown | { refuse: number; body?: unknown };

export interface FakeTransport extends ClearanceTransport {
  calls: FakeCall[];
}

export function createFakeTransport(answer: (call: FakeCall) => FakeAnswer | Promise<FakeAnswer>): FakeTransport {
  const calls: FakeCall[] = [];
  async function run<T>(call: FakeCall): Promise<T> {
    calls.push(call);
    const a = (await answer(call)) as any;
    if (a === undefined) throw new TransportError(call.path, 404, { error: `no ${call.path}` });
    if (a && typeof a === 'object' && typeof a.refuse === 'number') throw new TransportError(call.path, a.refuse, a.body ?? {});
    return a as T;
  }
  return {
    calls,
    get: <T,>(path: string, query?: Query) => run<T>({ method: 'GET', path, query }),
    getText: path => run<string>({ method: 'GET_TEXT', path }),
    post: <T,>(path: string, body?: Record<string, unknown>, headers?: Record<string, string>) => run<T>({ method: 'POST', path, body, headers }),
    delete: <T,>(path: string) => run<T>({ method: 'DELETE', path }),
  };
}
