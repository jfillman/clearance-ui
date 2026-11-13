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
  ) {
    super(`${path} failed with ${status}`);
    this.name = 'TransportError';
  }
}

export interface ClearanceTransport {
  /** GET `path` and parse the JSON answer. Undefined and empty query values are left out. Throws TransportError when not ok. */
  get<T>(path: string, query?: Query): Promise<T>;
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
