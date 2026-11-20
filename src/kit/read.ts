import { useMemo } from 'react';
import { TransportError, useClearanceTransport, type ClearanceTransport, type Query, type ReadOptions } from './transport';

// Reads from clearance-api through the host's transport (in Backstage: the clearance backend, /api/clearance/v1/*,
// which forwards them for the signed-in person: the delegate model). Every read is scoped by Clearance to that
// person. Shared by the Clearance and Autopilot plugins.

export type Params = Query;

/** A read Clearance (or the proxy) refused or failed: `status` is the HTTP status, so a view can tell 403 from 503. */
export class ReadError extends Error {
  constructor(message: string, readonly status: number, readonly retryAfterMs?: number) {
    super(message);
    this.name = 'ReadError';
  }
}

/** How long a read may take before it is given up as a timeout, so a spinner never waits on a hung connection. */
export const READ_TIMEOUT_MS = 30_000;

/** A read that never got an answer: the network failed or it timed out. `status` is 0; a view may offer Retry. */
export class ReadUnreachable extends ReadError {
  constructor(message: string, readonly timedOut = false) {
    super(message, 0);
    this.name = 'ReadUnreachable';
  }
}

/** The message a refused answer carries: the API's `error` (or `message`) when its body has one. */
function bodyMessage(body: unknown): string | undefined {
  if (!body || typeof body !== 'object') return undefined;
  const b = body as { error?: unknown; message?: unknown };
  for (const v of [b.error, b.message]) if (typeof v === 'string' && v.trim()) return v;
  return undefined;
}

/**
 * Runs `call` with an AbortSignal (joined with the caller's) that fires after `ms`, and rejects at the deadline even when
 * the host's transport ignores the signal. A timeout or a network failure becomes a ReadUnreachable.
 */
async function withDeadline<T>(path: string, ms: number, outer: AbortSignal | undefined, call: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const ctl = new AbortController();
  const onOuter = () => ctl.abort();
  if (outer?.aborted) ctl.abort();
  else outer?.addEventListener('abort', onOuter);
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      ctl.abort();
      reject(new ReadUnreachable(`${path} did not answer within ${Math.round(ms / 1000)} s`, true));
    }, ms);
  });
  try {
    return await Promise.race([call(ctl.signal), deadline]);
  } catch (e) {
    if (e instanceof ReadError || e instanceof TransportError) throw e;
    // The caller's own abort is theirs to handle; anything else that is not an answer is the network.
    if (outer?.aborted) throw e;
    if (timedOut) throw new ReadUnreachable(`${path} did not answer within ${Math.round(ms / 1000)} s`, true);
    throw new ReadUnreachable(`Clearance could not be reached (${(e as { message?: unknown } | null)?.message ?? String(e)})`);
  } finally {
    if (timer) clearTimeout(timer);
    outer?.removeEventListener('abort', onOuter);
  }
}

export interface ClearanceRead {
  get<T>(path: string, params?: Params, opts?: ReadOptions): Promise<T>;
  /** The answer's body exactly as served, for a file the person saves (the attestation bundle): nothing is re-encoded. */
  getText(path: string): Promise<string>;
}

// One ClearanceRead per transport, so every component of a host gets the same object: anything shared per read (the
// coverage poller) keys on it.
const reads = new WeakMap<ClearanceTransport, ClearanceRead>();

function readFor(transport: ClearanceTransport): ClearanceRead {
  let read = reads.get(transport);
  if (!read) {
    read = {
      async get<T>(path: string, params?: Params, opts?: ReadOptions): Promise<T> {
        try {
          return await withDeadline(path, READ_TIMEOUT_MS, opts?.signal, signal => transport.get<T>(path, params, { ...opts, signal }));
        } catch (e) {
          if (e instanceof TransportError) throw new ReadError(bodyMessage(e.body) ?? `${path} failed with ${e.status}`, e.status, e.retryAfterMs);
          throw e;
        }
      },
      async getText(path: string): Promise<string> {
        try {
          return await withDeadline(path, READ_TIMEOUT_MS, undefined, () => transport.getText(path));
        } catch (e) {
          if (e instanceof TransportError) {
            let message = `${path} failed with ${e.status}`;
            try {
              message = bodyMessage(JSON.parse(e.text ?? '')) ?? message;
            } catch {
              // not JSON: keep the status line
            }
            throw new ReadError(message, e.status);
          }
          throw e;
        }
      },
    };
    reads.set(transport, read);
  }
  return read;
}

export function useClearanceRead(): ClearanceRead {
  const transport = useClearanceTransport();
  return useMemo(() => readFor(transport), [transport]);
}
