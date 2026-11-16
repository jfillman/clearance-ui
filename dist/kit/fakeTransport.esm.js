import { TransportError } from './transport.esm.js';

function raceAbort(p, signal) {
  const abortError = () => Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    signal.addEventListener("abort", () => reject(abortError()), { once: true });
    p.then(resolve, reject);
  });
}
function createFakeTransport(answer) {
  const calls = [];
  async function run(call) {
    calls.push(call);
    const pending = Promise.resolve(answer(call));
    const a = await (call.signal ? raceAbort(pending, call.signal) : pending);
    if (a === void 0) throw new TransportError(call.path, 404, { error: `no ${call.path}` });
    if (a && typeof a === "object" && typeof a.refuse === "number") throw new TransportError(call.path, a.refuse, a.body ?? {}, void 0, a.retryAfterMs);
    return a;
  }
  return {
    calls,
    get: (path, query, opts) => run({ method: "GET", path, query, signal: opts?.signal }),
    getText: (path) => run({ method: "GET_TEXT", path }),
    post: (path, body, headers) => run({ method: "POST", path, body, headers }),
    delete: (path) => run({ method: "DELETE", path })
  };
}

export { createFakeTransport };
//# sourceMappingURL=fakeTransport.esm.js.map
