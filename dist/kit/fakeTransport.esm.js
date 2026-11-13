import { TransportError } from './transport.esm.js';

function createFakeTransport(answer) {
  const calls = [];
  async function run(call) {
    calls.push(call);
    const a = await answer(call);
    if (a === void 0) throw new TransportError(call.path, 404, { error: `no ${call.path}` });
    if (a && typeof a === "object" && typeof a.refuse === "number") throw new TransportError(call.path, a.refuse, a.body ?? {});
    return a;
  }
  return {
    calls,
    get: (path, query) => run({ method: "GET", path, query }),
    getText: (path) => run({ method: "GET_TEXT", path }),
    post: (path, body, headers) => run({ method: "POST", path, body, headers }),
    delete: (path) => run({ method: "DELETE", path })
  };
}

export { createFakeTransport };
//# sourceMappingURL=fakeTransport.esm.js.map
