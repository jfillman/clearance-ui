import { useRef, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { Button, Callout, ControlError, Field, FilterChips, Hint, RESOLUTION_CAUSES, Tile, useClearanceWrite, type ObservationRecord, type ResolutionCause } from '../../kit';
import type { Row } from '../exceptions/ExceptionsView';
import { choiceById, RESOLVE_CHOICES, resolutionFor, type ResolveChoiceId } from './resolveMapping';

// The Resolve panel (board C4): the person's choices for one open exception, mapped to a resolution state by the table in
// resolveMapping.ts. It writes through the delegate path (useClearanceWrite: the clearance backend forwards the signed-in
// person's call, Clearance decides who may and records it). Each choice APPENDS a resolution record; the exception stays.
// Only an admin is offered it (the host's list shows it to nobody else), and a refusal (403) is shown, never hidden.

const useStyles = makeStyles<Theme>(() => ({
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  frow: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  grow: { flex: '1 1 260px', minWidth: 0 },
}));

export function ResolvePanel({ row, onDone }: { row: Row; onDone: (text: string, record?: ObservationRecord) => void }) {
  const c = useStyles();
  const write = useClearanceWrite();
  const [choiceId, setChoiceId] = useState<ResolveChoiceId>('adopt');
  const [cause, setCause] = useState<ResolutionCause | ''>('');
  const [text, setText] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string>();
  const choice = choiceById(choiceId);
  const built = resolutionFor(choiceId, { cause, text });
  const what = row.resource || row.source || `seq ${row.seq}`;

  const send = async () => {
    if (inFlight.current || !built.ok) return;
    const body = built.body;
    // Never the same resolution twice: a repeat is already in the history.
    const newest = row.history[0]?.resolution;
    if (newest && newest.state === body.state && (newest.cause ?? undefined) === body.cause && (newest.note ?? undefined) === body.note) {
      setConfirming(false);
      setError(undefined);
      onDone(`Already recorded: ${choice.label} — ${what}`);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const out = await write.resolveObservation(row.seq, body);
      setConfirming(false);
      setText('');
      // The record as Clearance answered it (its own seq), shown at once; the refresh brings the stored one.
      const record: ObservationRecord = { seq: out.seq, ts: new Date().toISOString(), scope: out.scope, about: { seq: row.seq }, resolution: { state: out.state, cause: out.cause, note: out.note ?? undefined, by: 'you' } };
      onDone(`Recorded: ${choice.label}${body.cause ? ` (${body.cause})` : ''} — ${what}. Resolution record seq ${out.seq}; the exception stays in the chain.`, record);
    } catch (e) {
      setConfirming(false);
      setError(e instanceof ControlError ? `Not recorded. ${e.refusal.rule ? `${e.refusal.rule}: ` : ''}${e.message}${e.refusal.status === 403 ? ' (admins only)' : ''}` : `Not recorded. ${String(e)}`);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <Tile className={c.form} aria-label="Resolve">
      <FilterChips label="Resolve as" options={RESOLVE_CHOICES.map(x => ({ id: x.id, label: x.label }))} value={choiceId} onChange={id => { setChoiceId(id as ResolveChoiceId); setConfirming(false); setError(undefined); }} />
      <Hint>{choice.help} It adds a resolution record; the exception is never removed.</Hint>
      <div className={c.frow}>
        {choice.needs === 'cause' && (
          <Field label="Cause (required)">
            {({ className }) => (
              <select aria-label="Cause" className={className} value={cause} onChange={e => { setCause(e.target.value as ResolutionCause); setConfirming(false); }}>
                <option value="">choose…</option>
                {RESOLUTION_CAUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            )}
          </Field>
        )}
        <div className={c.grow}>
          <Field label={choice.needs === 'reason' ? 'Reason (required)' : 'Note (optional)'}>
            {({ className }) => <input aria-label={choice.needs === 'reason' ? 'Reason' : 'Note'} className={className} maxLength={1000} placeholder={choice.needs === 'reason' ? 'why it stays as it is' : 'what happened, a link to the ticket'} value={text} onChange={e => { setText(e.target.value); setConfirming(false); }} />}
          </Field>
        </div>
      </div>
      {!confirming ? (
        <div className={c.frow}>
          <Button disabled={!built.ok || busy} onClick={() => setConfirming(true)}>Review resolution…</Button>
          {!built.ok && <Hint>{built.missing}</Hint>}
        </div>
      ) : (
        <Callout tone="warn" role="alertdialog" aria-label="Confirm resolution" actions={<><Button variant="primary" small disabled={busy} onClick={send}>Record resolution</Button><Button small disabled={busy} onClick={() => setConfirming(false)}>Back</Button></>}>
          Record <strong>{choice.label}</strong> ({choice.state}){built.ok && built.body.cause ? <> with cause <strong>{built.body.cause}</strong></> : null} for observation <strong>{row.seq}</strong>{row.scope ? <> in <strong>{row.scope}</strong></> : null}.
          It is written to the evidence chain under your name and cannot be edited or removed; a later resolution supersedes it and this one stays in the history.
        </Callout>
      )}
      {error && <Callout tone="bad">{error}</Callout>}
    </Tile>
  );
}
