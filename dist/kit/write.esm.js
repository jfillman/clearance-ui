import { useMemo } from 'react';
import { useClearanceTransport, TransportError } from './transport.esm.js';

class ControlError extends Error {
  constructor(refusal) {
    super(refusal.hint ? `${refusal.error} (${refusal.hint})` : refusal.error);
    this.refusal = refusal;
  }
  refusal;
}
const BULK_RESOLUTION_LIMIT = 200;
function useClearanceWrite() {
  const transport = useClearanceTransport();
  return useMemo(() => {
    async function send(method, path, body) {
      try {
        return method === "DELETE" ? await transport.delete(path) : await transport.post(path, body);
      } catch (e) {
        if (e instanceof TransportError) {
          const out = e.body;
          throw new ControlError({ status: e.status, error: out?.error ?? `${path} failed with ${e.status}`, rule: out?.rule, hint: out?.hint });
        }
        throw e;
      }
    }
    return {
      freeze: (id, reason) => send("POST", `/v1/sessions/${encodeURIComponent(id)}/freeze`, { reason }),
      end: (id, reason) => send("POST", `/v1/sessions/${encodeURIComponent(id)}/end`, { reason }),
      hold: (agent, reason, hours) => send("POST", `/v1/agents/${encodeURIComponent(agent)}/hold`, hours === void 0 ? { reason } : { reason, hours }),
      release: (agent) => send("DELETE", `/v1/agents/${encodeURIComponent(agent)}/hold`),
      clearChange: (id) => send("POST", `/v1/clearances/${encodeURIComponent(id)}/clear`, {}),
      denyChange: (id, reason) => send("POST", `/v1/clearances/${encodeURIComponent(id)}/deny`, { reason }),
      resolveObservation: (seq, resolution) => send("POST", `/v1/observations/${encodeURIComponent(String(seq))}/resolution`, { ...resolution }),
      resolveObservations: (items, resolution) => send("POST", "/v1/observations/resolutions", { items, ...resolution }),
      runAgent: (agent, input) => send("POST", `/v1/agents/${encodeURIComponent(agent)}/runs`, input ? { input } : {})
    };
  }, [transport]);
}

export { BULK_RESOLUTION_LIMIT, ControlError, useClearanceWrite };
//# sourceMappingURL=write.esm.js.map
