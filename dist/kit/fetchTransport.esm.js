import { TransportError } from './transport.esm.js';

function createFetchTransport({ fetch, url }) {
  return {
    async get(path, query) {
      const q = new URLSearchParams();
      for (const [k, v] of Object.entries(query ?? {})) if (v !== void 0 && v !== "") q.set(k, String(v));
      const qs = q.toString();
      const res = await fetch(`${await url(path, "read")}${qs ? `?${qs}` : ""}`);
      const body = await res.json().catch(() => void 0);
      if (!res.ok) throw new TransportError(path, res.status, body);
      return body;
    },
    async getText(path) {
      const res = await fetch(await url(path, "read"));
      const text = await res.text();
      if (!res.ok) throw new TransportError(path, res.status, void 0, text);
      return text;
    },
    async post(path, body, headers) {
      const res = await fetch(await url(path, "write"), {
        method: "POST",
        headers: body ? { "Content-Type": "application/json", ...headers } : headers,
        body: body ? JSON.stringify(body) : void 0
      });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new TransportError(path, res.status, out);
      return out;
    },
    async delete(path) {
      const res = await fetch(await url(path, "write"), { method: "DELETE" });
      const out = await res.json().catch(() => ({}));
      if (!res.ok) throw new TransportError(path, res.status, out);
      return out;
    },
    async stream(path) {
      const res = await fetch(await url(path, "read"));
      if (!res.ok || !res.body) throw new TransportError(path, res.status, void 0, await res.text().catch(() => ""));
      return res.body;
    }
  };
}

export { createFetchTransport };
//# sourceMappingURL=fetchTransport.esm.js.map
