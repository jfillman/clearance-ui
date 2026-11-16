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
          return await transport.get<T>(path, params, opts);
        } catch (e) {
          if (e instanceof TransportError) throw new ReadError(e.body?.error ?? `${path} failed with ${e.status}`, e.status, e.retryAfterMs);
          throw e;
        }
      },
      async getText(path: string): Promise<string> {
        try {
          return await transport.getText(path);
        } catch (e) {
          if (e instanceof TransportError) {
            let message = `${path} failed with ${e.status}`;
            try {
              message = JSON.parse(e.text ?? '')?.error ?? message;
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
