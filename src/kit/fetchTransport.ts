import { TransportError, type ClearanceTransport, type Query } from './transport';

// A ClearanceTransport over any fetch-shaped function: the host-agnostic transport. The standalone shell
// (app/src/transport.ts) builds it on same-origin fetch to `clearance web`; tests build it on a mock. A host that has
// its own client (Backstage's discovery and fetch APIs) writes its own adapter instead.

export type FetchLike = (url: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<Response>;

export interface FetchTransportOptions {
  fetch: FetchLike;
  /** Where `path` (clearance-api's `/v1/...`) is served: reads (GET) and writes (POST, DELETE) may differ. */
  url: (path: string, kind: 'read' | 'write') => string | Promise<string>;
}

export function createFetchTransport({ fetch, url }: FetchTransportOptions): ClearanceTransport {
  return {
    async get<T>(path: string, query?: Query): Promise<T> {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== '') q.set(k, String(v));
      const qs = q.toString();
      const res = await fetch(`${await url(path, 'read')}${qs ? `?${qs}` : ''}`);
      const body = await res.json().catch(() => undefined);
      if (!res.ok) throw new TransportError(path, res.status, body);
      return body as T;
    },
    async getText(path: string): Promise<string> {
      const res = await fetch(await url(path, 'read'));
      const text = await res.text();
      if (!res.ok) throw new TransportError(path, res.status, undefined, text);
      return text;
    },
    async post<T>(path: string, body?: Record<string, unknown>, headers?: Record<string, string>): Promise<T> {
      const res = await fetch(await url(path, 'write'), {
        method: 'POST',
        headers: body ? { 'Content-Type': 'application/json', ...headers } : headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new TransportError(path, res.status, out);
      return out as T;
    },
    async delete<T>(path: string): Promise<T> {
      const res = await fetch(await url(path, 'write'), { method: 'DELETE' });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new TransportError(path, res.status, out);
      return out as T;
    },
    async stream(path: string): Promise<ReadableStream<Uint8Array>> {
      const res = await fetch(await url(path, 'read'));
      if (!res.ok || !res.body) throw new TransportError(path, res.status, undefined, await res.text().catch(() => ''));
      return res.body;
    },
  };
}
