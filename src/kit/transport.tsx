import { createContext, useContext, type ReactNode } from 'react';

// How the kit and the views reach clearance-api. Nothing in the kit or the views knows how: a host supplies a
// ClearanceTransport through <ClearanceTransportProvider>. Backstage supplies one built on its discovery and fetch
// APIs (plugins/clearance, backstageTransport.tsx); a standalone web UI supplies its own. Paths are clearance-api's
// (`/v1/...`), relative to wherever the host reaches it.

export type Query = Record<string, string | number | undefined>;

/**
 * A request the answer refused. `status` is the HTTP status; `body` is the parsed JSON body when there was one (`get`
 * leaves it undefined on a non-JSON body, `post`/`delete` an empty object, as the kit always has); `text` is the raw
 * body for `getText`.
 */
export class TransportError extends Error {
  constructor(
    readonly path: string,
    readonly status: number,
    readonly body?: any,
    readonly text?: string,
    /** The answer's `Retry-After` in ms, when the host's transport can see response headers (a busy server sends it with 503/429). */
    readonly retryAfterMs?: number,
  ) {
    super(`${path} failed with ${status}`);
    this.name = 'TransportError';
  }
}

/** `Retry-After` is whole seconds or an HTTP date; answers the wait in ms, or undefined when absent or unreadable. */
export function parseRetryAfter(value: string | null | undefined, now: number = Date.now()): number | undefined {
  if (!value) return undefined;
  const v = value.trim();
  if (/^\d+$/.test(v)) return Number(v) * 1000;
  const at = Date.parse(v);
  return Number.isNaN(at) ? undefined : Math.max(0, at - now);
}

/** Options of a read. `signal` aborts the request (a host that cannot cancel may ignore it). */
export interface ReadOptions {
  signal?: AbortSignal;
}

export interface ClearanceTransport {
  /** GET `path` and parse the JSON answer. Undefined and empty query values are left out. Throws TransportError when not ok. */
  get<T>(path: string, query?: Query, opts?: ReadOptions): Promise<T>;
  /** GET `path` and return the body exactly as served: nothing is re-encoded (the attestation bundle). */
  getText(path: string): Promise<string>;
  /** POST `body` as JSON (the JSON content type is set when there is a body); `headers` are added. */
  post<T>(path: string, body?: Record<string, unknown>, headers?: Record<string, string>): Promise<T>;
  /** DELETE `path`, answering the JSON body. */
  delete<T>(path: string): Promise<T>;
  /** Optional: the answer's body as a stream, for a host that can serve one (not used by the views yet). */
  stream?(path: string): Promise<ReadableStream<Uint8Array>>;
}

const TransportContext = createContext<ClearanceTransport | undefined>(undefined);

export function ClearanceTransportProvider({ transport, children }: { transport: ClearanceTransport; children?: ReactNode }) {
  return <TransportContext.Provider value={transport}>{children}</TransportContext.Provider>;
}

export function useClearanceTransport(): ClearanceTransport {
  const transport = useContext(TransportContext);
  if (!transport) throw new Error('No ClearanceTransport: render inside <ClearanceTransportProvider>.');
  return transport;
}
