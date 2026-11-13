import { jsx } from 'react/jsx-runtime';
import { createContext, useContext } from 'react';

class TransportError extends Error {
  constructor(path, status, body, text) {
    super(`${path} failed with ${status}`);
    this.path = path;
    this.status = status;
    this.body = body;
    this.text = text;
    this.name = "TransportError";
  }
  path;
  status;
  body;
  text;
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

export { ClearanceTransportProvider, TransportError, useClearanceTransport };
//# sourceMappingURL=transport.esm.js.map
