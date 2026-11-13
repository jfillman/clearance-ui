import { useMemo } from 'react';
import { useClearanceTransport, TransportError } from './transport.esm.js';

class ReadError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
    this.name = "ReadError";
  }
  status;
}
function useClearanceRead() {
  const transport = useClearanceTransport();
  return useMemo(
    () => ({
      async get(path, params) {
        try {
          return await transport.get(path, params);
        } catch (e) {
          if (e instanceof TransportError) throw new ReadError(e.body?.error ?? `${path} failed with ${e.status}`, e.status);
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
    }),
    [transport]
  );
}

export { ReadError, useClearanceRead };
//# sourceMappingURL=read.esm.js.map
