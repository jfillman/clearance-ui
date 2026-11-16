import { useMemo } from 'react';
import { useClearanceTransport, TransportError } from './transport.esm.js';

class ReadError extends Error {
  constructor(message, status, retryAfterMs) {
    super(message);
    this.status = status;
    this.retryAfterMs = retryAfterMs;
    this.name = "ReadError";
  }
  status;
  retryAfterMs;
}
const reads = /* @__PURE__ */ new WeakMap();
function readFor(transport) {
  let read = reads.get(transport);
  if (!read) {
    read = {
      async get(path, params, opts) {
        try {
          return await transport.get(path, params, opts);
        } catch (e) {
          if (e instanceof TransportError) throw new ReadError(e.body?.error ?? `${path} failed with ${e.status}`, e.status, e.retryAfterMs);
          throw e;
        }
      },
      async getText(path) {
        try {
          return await transport.getText(path);
        } catch (e) {
          if (e instanceof TransportError) {
            let message = `${path} failed with ${e.status}`;
            try {
              message = JSON.parse(e.text ?? "")?.error ?? message;
            } catch {
            }
            throw new ReadError(message, e.status);
          }
          throw e;
        }
      }
    };
    reads.set(transport, read);
  }
  return read;
}
function useClearanceRead() {
  const transport = useClearanceTransport();
  return useMemo(() => readFor(transport), [transport]);
}

export { ReadError, useClearanceRead };
//# sourceMappingURL=read.esm.js.map
