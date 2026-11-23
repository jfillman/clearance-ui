import { RESOLUTION_CAUSES } from '../../kit/types.esm.js';
import '@material-ui/core/styles';
import 'react';
import '../../kit/transport.esm.js';
import '../../kit/kit.esm.js';
import '../../kit/components.esm.js';
import '../../kit/FlightLog.esm.js';
import 'react/jsx-runtime';
import '../../kit/coverage.esm.js';
import '../../kit/Pager.esm.js';
import '@material-ui/core/Popper';
import '../../kit/kitStyles.esm.js';
import '../../kit/ExpandRow.esm.js';

const RESOLVE_CHOICES = [
  { id: "revert", label: "Revert", state: "reverted", needs: "cause", help: "The change was put back. Say why it happened." },
  { id: "adopt", label: "Adopt", state: "ratified", needs: null, help: "The change is the intended state: it is accepted as made." },
  { id: "accept", label: "Accept with a reason", state: "still-live", needs: "reason", help: "The change stays as it is for now. A reason is required." },
  { id: "break-glass", label: "Declared break-glass", state: "declared-break-glass", needs: null, help: "It was an emergency use, declared by a person." }
];
const choiceById = (id) => RESOLVE_CHOICES.find((c) => c.id === id);
function resolutionFor(id, input) {
  const choice = choiceById(id);
  const text = (input.text ?? "").trim();
  if (choice.needs === "cause" && !(input.cause && RESOLUTION_CAUSES.includes(input.cause))) return { ok: false, missing: "A reverted change needs its cause." };
  if (choice.needs === "reason" && !text) return { ok: false, missing: "Accepting a change needs a reason." };
  return {
    ok: true,
    body: { state: choice.state, ...choice.needs === "cause" && input.cause ? { cause: input.cause } : {}, ...text ? { note: text } : {} }
  };
}
const choiceForState = (state) => RESOLVE_CHOICES.find((c) => c.state === state);

export { RESOLVE_CHOICES, choiceById, choiceForState, resolutionFor };
//# sourceMappingURL=resolveMapping.esm.js.map
