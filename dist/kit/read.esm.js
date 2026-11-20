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
const READ_TIMEOUT_MS = 3e4;
class ReadUnreachable extends ReadError {
  constructor(message, timedOut = false) {
    super(message, 0);
    this.timedOut = timedOut;
    this.name = "ReadUnreachable";
  }
  timedOut;
}
function bodyMessage(body) {
  if (!body || typeof body !== "object") return void 0;
  const b = body;
  for (const v of [b.error, b.message]) if (typeof v === "string" && v.trim()) return v;
  return void 0;
}
async function withDeadline(path, ms, outer, call) {
  const ctl = new AbortController();
  const onOuter = () => ctl.abort();
  if (outer?.aborted) ctl.abort();
  else outer?.addEventListener("abort", onOuter);
  let timer;
  let timedOut = false;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      ctl.abort();
      reject(new ReadUnreachable(`${path} did not answer within ${Math.round(ms / 1e3)} s`, true));
    }, ms);
  });
  try {
    return await Promise.race([call(ctl.signal), deadline]);
  } catch (e) {
    if (e instanceof ReadError || e instanceof TransportError) throw e;
    if (outer?.aborted) throw e;
    if (timedOut) throw new ReadUnreachable(`${path} did not answer within ${Math.round(ms / 1e3)} s`, true);
    throw new ReadUnreachable(`Clearance could not be reached (${e?.message ?? String(e)})`);
  } finally {
    if (timer) clearTimeout(timer);
    outer?.removeEventListener("abort", onOuter);
  }
}
const reads = /* @__PURE__ */ new WeakMap();
function readFor(transport) {
  let read = reads.get(transport);
  if (!read) {
    read = {
      async get(path, params, opts) {
        try {
          return await withDeadline(path, READ_TIMEOUT_MS, opts?.signal, (signal) => transport.get(path, params, { ...opts, signal }));
        } catch (e) {
          if (e instanceof TransportError) throw new ReadError(bodyMessage(e.body) ?? `${path} failed with ${e.status}`, e.status, e.retryAfterMs);
          throw e;
        }
      },
      async getText(path) {
        try {
          return await withDeadline(path, READ_TIMEOUT_MS, void 0, () => transport.getText(path));
        } catch (e) {
          if (e instanceof TransportError) {
            let message = `${path} failed with ${e.status}`;
            try {
              message = bodyMessage(JSON.parse(e.text ?? "")) ?? message;
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

export { READ_TIMEOUT_MS, ReadError, ReadUnreachable, useClearanceRead };
//# sourceMappingURL=read.esm.js.map
