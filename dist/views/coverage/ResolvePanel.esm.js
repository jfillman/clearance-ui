import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useState, useRef } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { RESOLUTION_CAUSES } from '../../kit/types.esm.js';
import '../../kit/transport.esm.js';
import { Tile, FilterChips, Hint, Field, Button, Callout } from '../../kit/kit.esm.js';
import '../../kit/components.esm.js';
import '../../kit/FlightLog.esm.js';
import { useClearanceWrite, ControlError } from '../../kit/write.esm.js';
import '../../kit/coverage.esm.js';
import '../../kit/Pager.esm.js';
import '@material-ui/core/Popper';
import '../../kit/kitStyles.esm.js';
import '../../kit/ExpandRow.esm.js';
import { choiceById, resolutionFor, RESOLVE_CHOICES } from './resolveMapping.esm.js';

const useStyles = makeStyles(() => ({
  form: { display: "flex", flexDirection: "column", gap: 10 },
  frow: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" },
  grow: { flex: "1 1 260px", minWidth: 0 }
}));
function ResolvePanel({ row, onDone }) {
  const c = useStyles();
  const write = useClearanceWrite();
  const [choiceId, setChoiceId] = useState("adopt");
  const [cause, setCause] = useState("");
  const [text, setText] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState();
  const choice = choiceById(choiceId);
  const built = resolutionFor(choiceId, { cause, text });
  const what = row.resource || row.source || `seq ${row.seq}`;
  const send = async () => {
    if (inFlight.current || !built.ok) return;
    const body = built.body;
    const newest = row.history[0]?.resolution;
    if (newest && newest.state === body.state && (newest.cause ?? void 0) === body.cause && (newest.note ?? void 0) === body.note) {
      setConfirming(false);
      setError(void 0);
      onDone(`Already recorded: ${choice.label} \u2014 ${what}`);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(void 0);
    try {
      const out = await write.resolveObservation(row.seq, body);
      setConfirming(false);
      setText("");
      const record = { seq: out.seq, ts: (/* @__PURE__ */ new Date()).toISOString(), scope: out.scope, about: { seq: row.seq }, resolution: { state: out.state, cause: out.cause, note: out.note ?? void 0, by: "you" } };
      onDone(`Recorded: ${choice.label}${body.cause ? ` (${body.cause})` : ""} \u2014 ${what}. Resolution record seq ${out.seq}; the exception stays in the chain.`, record);
    } catch (e) {
      setConfirming(false);
      setError(e instanceof ControlError ? `Not recorded. ${e.refusal.rule ? `${e.refusal.rule}: ` : ""}${e.message}${e.refusal.status === 403 ? " (admins only)" : ""}` : `Not recorded. ${String(e)}`);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs(Tile, { className: c.form, "aria-label": "Resolve", children: [
    /* @__PURE__ */ jsx(FilterChips, { label: "Resolve as", options: RESOLVE_CHOICES.map((x) => ({ id: x.id, label: x.label })), value: choiceId, onChange: (id) => {
      setChoiceId(id);
      setConfirming(false);
      setError(void 0);
    } }),
    /* @__PURE__ */ jsxs(Hint, { children: [
      choice.help,
      " It adds a resolution record; the exception is never removed."
    ] }),
    /* @__PURE__ */ jsxs("div", { className: c.frow, children: [
      choice.needs === "cause" && /* @__PURE__ */ jsx(Field, { label: "Cause (required)", children: ({ className }) => /* @__PURE__ */ jsxs("select", { "aria-label": "Cause", className, value: cause, onChange: (e) => {
        setCause(e.target.value);
        setConfirming(false);
      }, children: [
        /* @__PURE__ */ jsx("option", { value: "", children: "choose\u2026" }),
        RESOLUTION_CAUSES.map((s) => /* @__PURE__ */ jsx("option", { value: s, children: s }, s))
      ] }) }),
      /* @__PURE__ */ jsx("div", { className: c.grow, children: /* @__PURE__ */ jsx(Field, { label: choice.needs === "reason" ? "Reason (required)" : "Note (optional)", children: ({ className }) => /* @__PURE__ */ jsx("input", { "aria-label": choice.needs === "reason" ? "Reason" : "Note", className, maxLength: 1e3, placeholder: choice.needs === "reason" ? "why it stays as it is" : "what happened, a link to the ticket", value: text, onChange: (e) => {
        setText(e.target.value);
        setConfirming(false);
      } }) }) })
    ] }),
    !confirming ? /* @__PURE__ */ jsxs("div", { className: c.frow, children: [
      /* @__PURE__ */ jsx(Button, { disabled: !built.ok || busy, onClick: () => setConfirming(true), children: "Review resolution\u2026" }),
      !built.ok && /* @__PURE__ */ jsx(Hint, { children: built.missing })
    ] }) : /* @__PURE__ */ jsxs(Callout, { tone: "warn", role: "alertdialog", "aria-label": "Confirm resolution", actions: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Button, { variant: "primary", small: true, disabled: busy, onClick: send, children: "Record resolution" }),
      /* @__PURE__ */ jsx(Button, { small: true, disabled: busy, onClick: () => setConfirming(false), children: "Back" })
    ] }), children: [
      "Record ",
      /* @__PURE__ */ jsx("strong", { children: choice.label }),
      " (",
      choice.state,
      ")",
      built.ok && built.body.cause ? /* @__PURE__ */ jsxs(Fragment, { children: [
        " with cause ",
        /* @__PURE__ */ jsx("strong", { children: built.body.cause })
      ] }) : null,
      " for observation ",
      /* @__PURE__ */ jsx("strong", { children: row.seq }),
      row.scope ? /* @__PURE__ */ jsxs(Fragment, { children: [
        " in ",
        /* @__PURE__ */ jsx("strong", { children: row.scope })
      ] }) : null,
      ". It is written to the evidence chain under your name and cannot be edited or removed; a later resolution supersedes it and this one stays in the history."
    ] }),
    error && /* @__PURE__ */ jsx(Callout, { tone: "bad", children: error })
  ] });
}

export { ResolvePanel };
//# sourceMappingURL=ResolvePanel.esm.js.map
