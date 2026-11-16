import { jsx } from 'react/jsx-runtime';
import { createContext, useContext } from 'react';

class TransportError extends Error {
  constructor(path, status, body, text, retryAfterMs) {
    super(`${path} failed with ${status}`);
    this.path = path;
    this.status = status;
    this.body = body;
    this.text = text;
    this.retryAfterMs = retryAfterMs;
    this.name = "TransportError";
  }
  path;
  status;
  body;
  text;
  retryAfterMs;
}
function parseRetryAfter(value, now = Date.now()) {
  if (!value) return void 0;
  const v = value.trim();
  if (/^\d+$/.test(v)) return Number(v) * 1e3;
  const at = Date.parse(v);
  return Number.isNaN(at) ? void 0 : Math.max(0, at - now);
}
const TransportContext = createContext(void 0);
function ClearanceTransportProvider({ transport, children }) {
  return /* @__PURE__ */ jsx(TransportContext.Provider, { value: transport, children });
}
function useClearanceTransport() {
  const transport = useContext(TransportContext);
  if (!transport) throw new Error("No ClearanceTransport: render inside <ClearanceTransportProvider>.");
  return transport;
}

export { ClearanceTransportProvider, TransportError, parseRetryAfter, useClearanceTransport };
//# sourceMappingURL=transport.esm.js.map
