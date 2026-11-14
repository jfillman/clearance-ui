import { useEffect, useMemo, useRef, useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import {
  BULK_RESOLUTION_LIMIT,
  Button,
  Callout,
  Checkbox,
  Chip,
  ControlError,
  Count,
  CoverageBanner,
  dateTime,
  DEFAULT_PAGE_SIZE,
  EmptyNote,
  ExpandRow,
  Fact,
  FactGrid,
  Field,
  FilterBar,
  FilterChip,
  FilterChips,
  FilterGroup,
  FilterSelect,
  fontScale,
  Hint,
  Pager,
  PAGE_SIZES,
  pageSlice,
  readDeniedText,
  relativeTime,
  RESOLUTION_CAUSES,
  RESOLUTION_STATES,
  SearchField,
  Section,
  SectionTitle,
  shortPrincipal,
  StatusChip,
  statusOf,
  TabError,
  TextLink,
  Tile,
  useClearanceRead,
  useClearanceWrite,
  useClearanceTokens,
  useCoverage,
  useMountedNow,
  usePoll,
  useScopes,
  useTableKit,
  type CoverageStatement,
  type ObservationRecord,
  type ObserveItem,
  type Page,
  type Resolution,
  type ResolutionCause,
  type ResolutionState,
  type StatusTone,
} from '../../kit';
import { diffSummary, historyOf, REDACTED } from './diff';

// Exceptions (O-5; clearance docs/clearance-api.md "Observations and the coverage statement"): what Clearance SAW and did
// not clear, by coverage state and class, with who did it, what changed and how each one ended, newest resolution first.
// Read for any signed-in person (owner decision 2026-11-12). An admin may resolve one (reverted with its cause, ratified,
// declared break-glass, still live): an append-only record on the Clearance core, naming them, that never edits an
// earlier one. A gate exception (out-of-band, drift, untraced apply, digest mismatch) resolves the same way; an attempt
// that was refused and an operation on the monitoring itself are never waved through, and say so.

const DAY = 86_400_000;
const WINDOWS = [
  { id: '24h', label: '24 hours', ms: DAY },
  { id: '7d', label: '7 days', ms: 7 * DAY },
  { id: '30d', label: '30 days', ms: 30 * DAY },
];
const RESOLVABLE_GATE = new Set(['out-of-band', 'drift', 'untraced-apply', 'digest-mismatch']);
const STATE_WORDS: Record<string, string> = { reverted: 'reverted', ratified: 'ratified', 'declared-break-glass': 'declared break-glass', 'still-live': 'still live' };

// A class is a state of what Clearance saw: out of band or a mismatch is bad, seen but not attributed or drifted waits
// on a person, a break-glass use is a person's own call (warn). A refused attempt is Clearance doing its job: neutral.
const COVERAGE_TONE: Record<string, StatusTone> = {
  'out-of-band-detected': 'bad',
  'out-of-band': 'bad',
  'digest-mismatch': 'bad',
  'untraced-apply': 'bad',
  drift: 'warn',
  'observed-not-attributed': 'warn',
  'break-glass': 'warn',
  'attempted-refused': 'neutral',
  unassessed: 'neutral',
};
// How an exception ended: put right or accepted is ok; still live or declared break-glass still needs a person's eye.
const RESOLUTION_TONE: Record<string, StatusTone> = { reverted: 'ok', ratified: 'ok', 'still-live': 'warn', 'declared-break-glass': 'warn' };

interface Row {
  seq: number;
  ts: string;
  scope: string;
  klass: string;
  source: string;
  resource: string;
  actor: string;
  diff: string;
  resolution: string | null;
  cause: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  history: ObservationRecord[];
  resolvable: false | true;
  whyNot?: string;
  gate: boolean;
}

// Layout only: every look (panels, tables, filters, chips, buttons, notes) is the kit's.
const useStyles = makeStyles<Theme>(() => ({
  scroll: { overflowX: 'auto' },
  inlineDetail: { padding: '12px 18px', display: 'flex', flexDirection: 'column', gap: 12 },
  detailHead: { display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' },
  hist: { margin: 0, paddingLeft: 18, fontSize: fontScale.md },
  form: { display: 'flex', flexDirection: 'column', gap: 10 },
  frow: { display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' },
  grow: { flex: '1 1 260px', minWidth: 0 },
  notice: { transition: 'opacity 600ms', opacity: 1 },
  noticeFading: { opacity: 0 },
  stack: { display: 'flex', flexDirection: 'column', gap: 16 },
  page: { display: 'flex', flexDirection: 'column', gap: 16 },
}));

/** Rows from the coverage statement's seen-not-cleared items joined with the observation and resolution records. */
export function observationRows(scope: string, cov: CoverageStatement | undefined, observations: ObservationRecord[], resolutions: ObservationRecord[]): Row[] {
  const bySeq = new Map(observations.map(o => [o.seq, o]));
  return (cov?.seen_not_cleared.items ?? []).map((it: ObserveItem) => {
    const rec = bySeq.get(it.seq);
    const mon = !!it.monitoring_protection || !!rec?.action?.protects_monitoring;
    return {
      seq: it.seq,
      ts: it.ts,
      scope,
      klass: it.coverage,
      source: it.source,
      resource: it.resource ?? (rec?.resource ? [rec.resource.kind, rec.resource.namespace, rec.resource.name].filter(Boolean).join('/') : ''),
      actor: rec?.actor?.subject ?? '',
      diff: rec ? diffSummary(rec) : [it.api].filter(Boolean).join(' '),
      resolution: it.resolution,
      cause: it.cause,
      resolvedBy: it.resolved_by,
      resolvedAt: it.resolved_at,
      history: historyOf(resolutions, it.seq),
      resolvable: !mon,
      whyNot: mon ? 'An operation on the monitoring itself is never waved through: it stays in the packet as it is.' : undefined,
      gate: false,
    };
  });
}

/** An exception's detail in one line; a value Clearance redacted for this reader reads "withheld". */
const detailText = (d: unknown): string => {
  if (d === undefined || d === null || d === '') return '';
  const text = typeof d === 'string' ? d : JSON.stringify(d);
  return text.split(JSON.stringify(REDACTED)).join('"withheld"').split(REDACTED).join('withheld').slice(0, 120);
};

const notResolvableWhy = (kind: string): string | undefined => {
  if (RESOLVABLE_GATE.has(kind)) return undefined;
  if (kind === 'monitoring-protection') return 'An operation on the monitoring itself is never waved through.';
  return 'A refused attempt landed nothing: there is nothing to resolve.';
};

const plainResolution = (row: Row): string => {
  if (!row.resolution) return 'none recorded';
  return `${row.resolution}${row.cause ? ` (${row.cause})` : ''}`;
};

/** Rows from /v1/exceptions: the gate's own (deploy.exception) with the kind as their class. */
export function gateRows(records: ObservationRecord[], resolutions: ObservationRecord[]): Row[] {
  return records
    .filter(r => r.tool === 'deploy.exception' || (r as { exception?: unknown }).exception)
    .map(r => {
      const x = ((r as { exception?: Record<string, unknown> }).exception ?? {}) as { kind?: string; actor?: string; detail?: unknown };
      const detail = detailText(x.detail);
      const kind = x.kind ?? 'exception';
      const history = historyOf(resolutions, r.seq);
      const newest = history[0]?.resolution;
      return {
        seq: r.seq,
        ts: r.ts,
        scope: '',
        klass: kind,
        source: 'gate',
        resource: String((r as { app?: string }).app ?? (r as { target?: string }).target ?? ''),
        actor: x.actor ?? '',
        diff: detail,
        resolution: newest?.state ?? null,
        cause: newest?.cause ?? null,
        resolvedBy: newest?.by ?? null,
        resolvedAt: history[0]?.ts ?? null,
        history,
        resolvable: RESOLVABLE_GATE.has(kind),
        whyNot: notResolvableWhy(kind),
        gate: true,
      };
    });
}

function ResolveForm({ row, onDone }: { row: Row; onDone: (text: string, record?: ObservationRecord) => void }) {
  const c = useStyles();
  const write = useClearanceWrite();
  const [state, setState] = useState<ResolutionState>('ratified');
  const [cause, setCause] = useState<ResolutionCause | ''>('');
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState<string>();
  const needsCause = state === 'reverted';
  const ready = !needsCause || !!cause;
  const body: Resolution = { state, ...(needsCause && cause ? { cause } : {}), ...(note.trim() ? { note: note.trim() } : {}) };
  const send = async () => {
    // One request at a time, and never the same resolution twice: a repeat is already in the history.
    if (inFlight.current) return;
    const newest = row.history[0]?.resolution;
    if (newest && newest.state === body.state && (newest.cause ?? undefined) === body.cause && (newest.note ?? undefined) === body.note) {
      setConfirming(false);
      setError(undefined);
      onDone(`Already recorded: ${STATE_WORDS[state]} — ${row.resource || row.source || `seq ${row.seq}`}`);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(undefined);
    try {
      const out = await write.resolveObservation(row.seq, body);
      setConfirming(false);
      setNote('');
      // The record as Clearance answered it, shown at once; the refresh brings the stored one (same seq).
      const record: ObservationRecord = { seq: out.seq, ts: new Date().toISOString(), scope: out.scope, about: { seq: row.seq }, resolution: { state: out.state, cause: out.cause, note: out.note ?? undefined, by: 'you' } };
      onDone(`Recorded: ${STATE_WORDS[state]}${needsCause && cause ? ` (${cause})` : ''} — ${row.resource || row.source || `seq ${row.seq}`}`, record);
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
      <div className={c.frow}>
        <Field label="How it ended">
          {({ className }) => (
            <select aria-label="Resolution state" className={className} value={state} onChange={e => { setState(e.target.value as ResolutionState); setConfirming(false); }}>
              {RESOLUTION_STATES.map(s => <option key={s} value={s}>{STATE_WORDS[s]}</option>)}
            </select>
          )}
        </Field>
        {needsCause && (
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
          <Field label="Note (optional)">
            {({ className }) => <input aria-label="Note" className={className} maxLength={1000} placeholder="what happened, a link to the ticket" value={note} onChange={e => { setNote(e.target.value); setConfirming(false); }} />}
          </Field>
        </div>
      </div>
      {!confirming ? (
        <div className={c.frow}>
          <Button disabled={!ready || busy} onClick={() => setConfirming(true)}>Review resolution…</Button>
          {!ready && <Hint>A reverted change needs its cause.</Hint>}
        </div>
      ) : (
        <Callout tone="warn" role="alertdialog" aria-label="Confirm resolution" actions={<><Button variant="primary" small disabled={busy} onClick={send}>Record resolution</Button><Button small disabled={busy} onClick={() => setConfirming(false)}>Back</Button></>}>
          Record <strong>{STATE_WORDS[state]}</strong>{needsCause && cause ? <> (cause <strong>{cause}</strong>)</> : null} for observation <strong>{row.seq}</strong>{row.scope ? <> in <strong>{row.scope}</strong></> : null}.
          It is written to the evidence chain under your name and cannot be edited or removed; a later resolution supersedes it and this one stays in the history.
        </Callout>
      )}
      {error && <Callout tone="bad">{error}</Callout>}
    </Tile>
  );
}

const rowKey = (r: Row) => `${r.gate ? 'gate' : 'obs'}-${r.seq}`;

type RecordedHandler = (text: string | undefined, records?: ObservationRecord | ObservationRecord[]) => void;

const rowName = (r: Row) => `${r.klass} ${r.resource || r.source || ''}`.trim();

/** Whether the row's newest resolution already says what `body` would write (the core skips it too). */
const alreadyResolved = (r: Row, body: Resolution): boolean => {
  const newest = r.history[0]?.resolution;
  return !!newest && newest.state === body.state && (newest.cause ?? undefined) === body.cause && (newest.note ?? undefined) === body.note;
};

interface Review {
  body: Resolution;
  send: Row[];
  skip: Array<{ row: Row; reason: string }>;
}

interface BulkSummary {
  recorded: number;
  skipped: number;
  failed: Array<{ seq: number; error: string }>;
}

/** The selection's bulk resolution: one form, a review that freezes the selection, then chunks of 200 to the core. */
function BulkResolve({ picked, matching, onSelectAllMatching, onClear, onSettled, onChanged }: {
  picked: Row[];
  matching: number;
  onSelectAllMatching: () => void;
  onClear: () => void;
  onSettled: (seqs: string[]) => void;
  onChanged: RecordedHandler;
}) {
  const c = useStyles();
  const write = useClearanceWrite();
  const [state, setState] = useState<ResolutionState>('ratified');
  const [cause, setCause] = useState<ResolutionCause | ''>('');
  const [note, setNote] = useState('');
  const [review, setReview] = useState<Review>();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [summary, setSummary] = useState<BulkSummary>();
  const needsCause = state === 'reverted';
  const ready = !needsCause || !!cause;
  const body: Resolution = { state, ...(needsCause && cause ? { cause } : {}), ...(note.trim() ? { note: note.trim() } : {}) };

  const startReview = () => {
    const skip: Review['skip'] = [];
    const send: Row[] = [];
    for (const row of picked) {
      if (!row.resolvable) skip.push({ row, reason: row.whyNot ?? 'not resolvable' });
      else if (alreadyResolved(row, body)) skip.push({ row, reason: 'its newest resolution already says this' });
      else send.push(row);
    }
    setSummary(undefined);
    setReview({ body, send, skip });
  };

  const record = async () => {
    // One batch at a time: the selection was frozen at review time, and a second click is the same batch again.
    if (inFlight.current || !review) return;
    inFlight.current = true;
    setBusy(true);
    const { body: sent, send, skip } = review;
    const out: BulkSummary = { recorded: 0, skipped: skip.length, failed: [] };
    const records: ObservationRecord[] = [];
    const settled = skip.map(s => rowKey(s.row));
    const byRecordedSeq = new Map(send.map(r => [r.seq, r]));
    try {
      for (let i = 0; i < send.length; i += BULK_RESOLUTION_LIMIT) {
        const chunk = send.slice(i, i + BULK_RESOLUTION_LIMIT);
        try {
          const answer = await write.resolveObservations(chunk.map(r => r.seq), sent);
          out.skipped += answer.skipped.length;
          out.failed.push(...answer.failed);
          for (const done of answer.recorded) {
            out.recorded += 1;
            records.push({ seq: done.record_seq, ts: answer.ts, scope: done.scope, about: { seq: done.seq }, resolution: { state: answer.state, cause: answer.cause, note: answer.note ?? undefined, by: 'you' } });
          }
          for (const done of [...answer.recorded, ...answer.skipped]) {
            const row = byRecordedSeq.get(done.seq);
            if (row) settled.push(rowKey(row));
          }
        } catch (e) {
          // This chunk and every later one were not recorded: name them, keep them selected to try again.
          const why = e instanceof ControlError ? `${e.refusal.rule ? `${e.refusal.rule}: ` : ''}${e.message}${e.refusal.status === 403 ? ' (admins only)' : ''}` : String(e);
          out.failed.push(...send.slice(i).map(r => ({ seq: r.seq, error: why })));
          break;
        }
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
    setSummary(out);
    setReview(undefined);
    setNote('');
    onSettled(settled);
    onChanged(undefined, records);
  };

  if (picked.length === 0 && !summary) return null;
  const scopes = [...new Set((review?.send ?? []).map(r => r.scope).filter(Boolean))];
  const gateCount = (review?.send ?? []).filter(r => r.gate).length;
  return (
    <div className={c.stack}>
      {summary && (
        <Callout tone={summary.failed.length ? 'warn' : 'ok'} aria-label="Bulk resolution result" actions={<Button small onClick={() => setSummary(undefined)}>Dismiss</Button>}>
          <strong>Recorded {summary.recorded} · skipped {summary.skipped} · failed {summary.failed.length}</strong>
          {summary.failed.length > 0 && (
            <ul className={c.hist} aria-label="Failed resolutions">
              {summary.failed.map(f => <li key={f.seq}>seq {f.seq}: {f.error}</li>)}
            </ul>
          )}
        </Callout>
      )}
      {picked.length > 0 && (
        <Tile className={c.form} role="region" aria-label="Resolve selected">
          <div className={c.frow}>
            <Count>{picked.length} selected</Count>
            {picked.length < matching && <TextLink onClick={onSelectAllMatching}>Select all {matching} matching the current filters</TextLink>}
            <TextLink onClick={onClear}>Clear selection</TextLink>
          </div>
          <div className={c.frow}>
            <Field label="How it ended">
              {({ className }) => (
                <select aria-label="Bulk resolution state" className={className} disabled={busy} value={state} onChange={e => { setState(e.target.value as ResolutionState); setReview(undefined); }}>
                  {RESOLUTION_STATES.map(st => <option key={st} value={st}>{STATE_WORDS[st]}</option>)}
                </select>
              )}
            </Field>
            {needsCause && (
              <Field label="Cause (required)">
                {({ className }) => (
                  <select aria-label="Bulk cause" className={className} disabled={busy} value={cause} onChange={e => { setCause(e.target.value as ResolutionCause); setReview(undefined); }}>
                    <option value="">choose…</option>
                    {RESOLUTION_CAUSES.map(x => <option key={x} value={x}>{x}</option>)}
                  </select>
                )}
              </Field>
            )}
            <div className={c.grow}>
              <Field label="Note (optional)">
                {({ className }) => <input aria-label="Bulk note" className={className} maxLength={1000} placeholder="what happened, a link to the ticket" value={note} disabled={busy} onChange={e => { setNote(e.target.value); setReview(undefined); }} />}
              </Field>
            </div>
          </div>
          {!review ? (
            <div className={c.frow}>
              <Button variant="primary" disabled={!ready || busy} onClick={startReview}>Review {picked.length} resolutions…</Button>
              {!ready && <Hint>A reverted change needs its cause.</Hint>}
            </div>
          ) : (
            <Callout tone="warn" role="alertdialog" aria-label="Confirm bulk resolution" actions={<><Button variant="primary" small disabled={busy || review.send.length === 0} onClick={record}>Record {review.send.length} resolutions</Button><Button small disabled={busy} onClick={() => setReview(undefined)}>Back</Button></>}>
              Record <strong>{STATE_WORDS[review.body.state]}</strong>{review.body.cause ? <> (cause <strong>{review.body.cause}</strong>)</> : null} for <strong>{review.send.length}</strong> {review.send.length === 1 ? 'exception' : 'exceptions'}
              {scopes.length > 0 ? <> in <strong>{scopes.join(', ')}</strong></> : null}{gateCount > 0 ? <>{scopes.length > 0 ? ' and' : ' in'} the scope of {gateCount === 1 ? 'its' : 'their'} destination for {gateCount} gate {gateCount === 1 ? 'exception' : 'exceptions'}</> : null}.
              Each is written as its own record under your name, sharing one batch id; none can be edited or removed, and a later resolution supersedes it.
              {review.skip.length > 0 && (
                <>
                  <p>{review.skip.length} will be skipped:</p>
                  <ul className={c.hist} aria-label="Skipped resolutions">
                    {review.skip.map(x => <li key={rowKey(x.row)}>seq {x.row.seq} {rowName(x.row)}: {x.reason}</li>)}
                  </ul>
                </>
              )}
            </Callout>
          )}
        </Tile>
      )}
    </div>
  );
}

function RowDetail({ row, admin, onChanged, now }: { row: Row; admin: boolean; onChanged: RecordedHandler; now: number }) {
  const t = useClearanceTokens();
  const c = useStyles();
  return (
    <section className={c.inlineDetail} style={{ borderLeft: `3px solid ${t.amber}` }} aria-label="Exception detail">
      <div className={c.detailHead}>
        <SectionTitle level={2}>{row.klass}</SectionTitle>
        <Chip>{row.gate ? 'gate exception' : 'observation'}</Chip>
        <Count>seq {row.seq}{row.scope ? ` · ${row.scope}` : ''}</Count>
      </div>
      <FactGrid min={220}>
        <Fact label="When">{dateTime(row.ts)} ({relativeTime(row.ts, now)})</Fact>
        <Fact label="Actor">{row.actor || 'not attributed'}</Fact>
        <Fact label="What changed">{row.diff || 'no detail recorded'}</Fact>
        <Fact label="Resolution history">
          {row.history.length === 0 ? plainResolution(row) : (
            <ol className={c.hist} reversed aria-label="Resolution history, newest first">
              {row.history.map(h => (
                <li key={h.seq}>
                  <strong>{STATE_WORDS[h.resolution?.state ?? ''] ?? h.resolution?.state}</strong>{h.resolution?.cause ? ` (${h.resolution.cause})` : ''} by {shortPrincipal(h.resolution?.by) || 'its collector'} <Count>{dateTime(h.ts)} · seq {h.seq}</Count>
                  {h.resolution?.note ? <Hint>{h.resolution.note}</Hint> : null}
                </li>
              ))}
            </ol>
          )}
        </Fact>
      </FactGrid>
      {!row.resolvable && <Hint>{row.whyNot}</Hint>}
      {row.resolvable && admin && <ResolveForm key={row.seq} row={row} onDone={onChanged} />}
      {row.resolvable && !admin && <Hint>Only Clearance admins can resolve an exception. You can read everything here.</Hint>}
    </section>
  );
}

const SORTS = [
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'severity', label: 'Severity' },
  { id: 'resolution', label: 'Resolution state' },
] as const;
type SortId = (typeof SORTS)[number]['id'];

// Most worrying first: something changed outside the gate, then what was seen but not attributed, then the rest.
const SEVERITY: Record<string, number> = { 'out-of-band-detected': 0, 'out-of-band': 0, 'digest-mismatch': 1, 'untraced-apply': 2, drift: 3, 'observed-not-attributed': 4, 'break-glass': 5, 'attempted-refused': 6, unassessed: 7 };
const severityOf = (k: string): number => SEVERITY[k] ?? 8;
// Unresolved first (they need someone), then still live, then the ones that ended.
const RESOLUTION_ORDER: Record<string, number> = { 'still-live': 1, 'declared-break-glass': 2, ratified: 3, reverted: 4 };
const resolutionOf = (r: Row): number => (r.resolution ? RESOLUTION_ORDER[r.resolution] ?? 5 : 0);

/** A sorted copy; every order falls back to newest first, then seq, so it is stable. */
export function sortRows(rows: Row[], sort: SortId): Row[] {
  const time = (r: Row) => Date.parse(r.ts) || 0;
  const newest = (x: Row, y: Row) => time(y) - time(x) || y.seq - x.seq;
  const by: Record<SortId, (x: Row, y: Row) => number> = {
    newest,
    oldest: (x, y) => -newest(x, y),
    severity: (x, y) => severityOf(x.klass) - severityOf(y.klass) || newest(x, y),
    resolution: (x, y) => resolutionOf(x) - resolutionOf(y) || newest(x, y),
  };
  return [...rows].sort(by[sort]);
}

/** Whether a row matches the search box: case-insensitive substring over who, what, where, class, scope, detail and how it ended. */
export function matchesSearch(r: Row, q: string): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [r.actor, r.resource, r.klass, r.scope, r.source, r.diff, r.resolution, r.cause, r.resolvedBy, ...r.history.flatMap(h => [h.resolution?.state, h.resolution?.cause, h.resolution?.note, h.resolution?.by])];
  return hay.some(v => typeof v === 'string' && v.toLowerCase().includes(needle));
}

const COLUMNS = ['When', 'Class', 'Resource', 'Actor', 'What changed', 'Resolution'];

function RowTable({ title, rows, selected, onSelect, now, admin, onChanged, pageSize, onPageSize, picked, onPick }: { title: string; rows: Row[]; selected?: string; onSelect: (key: string | undefined) => void; now: number; admin: boolean; onChanged: RecordedHandler; pageSize: number; onPageSize: (n: number) => void; picked: Set<string>; onPick: (keys: string[], on: boolean) => void }) {
  const c = useStyles();
  const tk = useTableKit();
  const [page, setPage] = useState(0);
  const slice = pageSlice(rows, page, pageSize);
  const pageKeys = slice.rows.filter(r => r.resolvable).map(rowKey);
  const pageAll = pageKeys.length > 0 && pageKeys.every(k => picked.has(k));
  const cols = admin ? ['', ...COLUMNS] : COLUMNS;
  return (
    <Section framed aria-label={title} title={title} count={`${rows.length} shown`}>
      {rows.length === 0 ? (
        <EmptyNote inset>Nothing here for this filter.</EmptyNote>
      ) : (
        <div className={c.scroll}>
          <table className={tk.table}>
            <thead>
              <tr>
                {admin && (
                  <th className={tk.th}>
                    <Checkbox aria-label={`Select all resolvable on this page of ${title}`} disabled={pageKeys.length === 0} checked={pageAll} onChange={() => onPick(pageKeys, !pageAll)} />
                  </th>
                )}
                {COLUMNS.map(h => <th key={h} className={tk.th}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {slice.rows.map(r => {
                const key = rowKey(r);
                const isOpen = selected === key;
                const toggle = () => onSelect(isOpen ? undefined : key);
                return (
                  <ExpandRow key={key} id={`exc-${key}`} open={isOpen} onToggle={toggle} colSpan={cols.length} label={`Details for ${r.klass} ${r.resource || r.source}, seq ${r.seq}`} details={<RowDetail row={r} admin={admin} onChanged={onChanged} now={now} />}>
                    {admin && (
                      <td className={tk.td} onClick={e => e.stopPropagation()}>
                        {r.resolvable && <Checkbox aria-label={`Select ${rowName(r)}, seq ${r.seq}`} checked={picked.has(key)} onChange={() => onPick([key], !picked.has(key))} />}
                      </td>
                    )}
                    <td className={tk.td}>
                      <TextLink expanded={isOpen} title={dateTime(r.ts)} aria-label={`${isOpen ? 'Hide' : 'Show'} details for ${r.klass} ${r.resource || r.source}, seq ${r.seq}`}>
                        {relativeTime(r.ts, now)}
                      </TextLink>
                    </td>
                    <td className={tk.td}><StatusChip tone={COVERAGE_TONE[r.klass] ?? 'neutral'}>{r.klass}</StatusChip></td>
                    <td className={`${tk.td} ${tk.meta}`}>{r.resource || r.source}</td>
                    <td className={`${tk.td} ${tk.meta}`}>{shortPrincipal(r.actor) || '—'}</td>
                    <td className={`${tk.td} ${tk.meta}`}>{r.diff || '—'}</td>
                    <td className={tk.td}>
                      {r.resolution ? <StatusChip tone={RESOLUTION_TONE[r.resolution] ?? 'warn'}>{STATE_WORDS[r.resolution] ?? r.resolution}</StatusChip> : <StatusChip tone="neutral">none recorded</StatusChip>}
                    </td>
                  </ExpandRow>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {rows.length > PAGE_SIZES[0] && (
        <Pager label={`${title} pages`} total={rows.length} page={slice.page} pageSize={pageSize} onPage={n => { setPage(n); onSelect(undefined); }} onPageSize={n => { onPageSize(n); setPage(0); onSelect(undefined); }} />
      )}
    </Section>
  );
}

export function ExceptionsView({ now: nowProp, initialScope }: { now?: number; initialScope?: string }) {
  const c = useStyles();
  const api = useClearanceRead();
  const now = useMountedNow(nowProp);
  const [scope, setScope] = useState<string | undefined>(initialScope);
  const [windowId, setWindowId] = useState('24h');
  const [klass, setKlass] = useState('all');
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string>();
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<SortId>('newest');
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const win = WINDOWS.find(w => w.id === windowId)!;
  const from = new Date(now - win.ms).toISOString();

  const scopes = useScopes();
  const me = usePoll<{ admin: boolean }>('me', () => api.get('/me'), 0);
  const active = scope ?? scopes.data?.scopes[0];
  const cov = useCoverage(api, active, from);
  const obs = usePoll<Page<ObservationRecord> | undefined>(`obs:${active}:${from}`, async () => (active ? api.get('/v1/observations', { scope: active, kind: 'observation', since: from, limit: 200 }) : undefined), 60_000);
  // Resolutions of every scope, not the active one only: a gate exception carries no scope and its resolutions live under
  // the change's cluster (seq 17884: hangar-prod while hangar-dev was shown), so its history would never appear.
  const allScopes = useMemo(() => [...new Set([...(scopes.data?.scopes ?? []), ...(active ? [active] : [])])], [scopes.data, active]);
  const res = usePoll<Page<ObservationRecord> | undefined>(
    `res:${allScopes.join(',')}`,
    async () => {
      if (allScopes.length === 0) return undefined;
      const pages = await Promise.all(allScopes.map(sc => api.get<Page<ObservationRecord>>('/v1/observations', { scope: sc, kind: 'resolution', limit: 200 })));
      return { items: pages.flatMap(p => p.items), next: null } as Page<ObservationRecord>;
    },
    60_000,
  );
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [justRecorded, setJustRecorded] = useState<ObservationRecord[]>([]);
  const gate = usePoll<Page<ObservationRecord>>(`gate:${from}`, () => api.get('/v1/exceptions', { since: from, limit: 100 }), 60_000);
  const [notice, setNotice] = useState<string>();
  const [fading, setFading] = useState(false);
  // The confirmation lives here, not in the row's form: with "Unresolved only" on, the resolved row leaves the list.
  useEffect(() => {
    if (!notice) return undefined;
    const fade = setTimeout(() => setFading(true), 5000);
    const gone = setTimeout(() => setNotice(undefined), 5700);
    return () => {
      clearTimeout(fade);
      clearTimeout(gone);
    };
  }, [notice]);
  // Light debounce; a changed search starts again at page one (the tables remount on tableKey) with no drawer open.
  useEffect(() => {
    const id = setTimeout(() => {
      setQuery(search);
      setSelected(undefined);
    }, 200);
    return () => clearTimeout(id);
  }, [search]);
  const refresh = () => {
    cov.refresh();
    obs.refresh();
    res.refresh();
    gate.refresh();
  };
  const recorded: RecordedHandler = (text, record) => {
    const more = ([] as ObservationRecord[]).concat(record ?? []);
    if (more.length) setJustRecorded(prev => [...prev, ...more]);
    if (text) {
      setFading(false);
      setNotice(text);
    }
    refresh();
  };

  const resolutions = useMemo(() => {
    const stored = res.data?.items ?? [];
    const seen = new Set(stored.map(r => r.seq));
    return [...stored, ...justRecorded.filter(r => !seen.has(r.seq))];
  }, [res.data, justRecorded]);
  const rows = useMemo(() => observationRows(active ?? '', cov.data, obs.data?.items ?? [], resolutions), [active, cov.data, obs.data, resolutions]);
  const gates = useMemo(() => gateRows(gate.data?.items ?? [], resolutions), [gate.data, resolutions]);
  const classes = useMemo(() => [...new Set([...rows, ...gates].map(r => r.klass))].sort(), [rows, gates]);
  const keep = (r: Row) => (klass === 'all' || r.klass === klass) && (!open || !r.resolution) && matchesSearch(r, query);
  const shownObs = useMemo(() => sortRows(rows.filter(keep), sort), [rows, sort, klass, open, query]); // eslint-disable-line react-hooks/exhaustive-deps
  const shownGate = useMemo(() => sortRows(gates.filter(keep), sort), [gates, sort, klass, open, query]); // eslint-disable-line react-hooks/exhaustive-deps
  // A new filter, sort, scope or window starts again at page one (the tables remount on this key).
  const tableKey = `${active}|${windowId}|${klass}|${open}|${sort}|${query}`;
  // The selection is of what is on screen: a new filter, scope or window starts it again.
  useEffect(() => setPicked(new Set()), [tableKey]);
  const admin = !!me.data?.admin;
  const byKey = useMemo(() => new Map([...rows, ...gates].map(r => [rowKey(r), r])), [rows, gates]);
  const matchingKeys = useMemo(() => [...shownObs, ...shownGate].filter(r => r.resolvable).map(rowKey), [shownObs, shownGate]);
  const pick = (keys: string[], on: boolean) => setPicked(prev => {
    const next = new Set(prev);
    for (const k of keys) {
      if (on) next.add(k);
      else next.delete(k);
    }
    return next;
  });
  const pickedRows = [...picked].map(k => byKey.get(k)).filter((r): r is Row => !!r);

  const readError = scopes.failure ?? (cov.data ? undefined : cov.failure) ?? (obs.data ? undefined : obs.failure);
  const denied = statusOf(readError) === 403;

  const filterEnd = (
    <>
      {query.trim() && <span role="status" aria-live="polite"><Count>{shownObs.length + shownGate.length} matches</Count></span>}
      <Count>{me.data?.admin ? 'You are a Clearance admin: you may resolve.' : 'Read only: resolving is for Clearance admins.'}</Count>
    </>
  );

  return (
    <div className={c.page}>
      <FilterBar end={filterEnd}>
        <FilterSelect label="Scope" value={active ?? ''} disabled={!scopes.data?.scopes.length} options={(scopes.data?.scopes ?? []).map(s => ({ value: s, label: s }))} onChange={v => { setScope(v); setSelected(undefined); }} />
        <FilterChips label="Window" options={WINDOWS.map(w => ({ id: w.id, label: w.label }))} value={windowId} onChange={setWindowId} />
        <FilterChips label="Class" options={[{ id: 'all', label: 'All' }, ...classes.map(k => ({ id: k, label: k }))]} value={klass} onChange={setKlass} />
        <FilterGroup label="Resolution">
          <FilterChip on={open} onClick={() => setOpen(o => !o)}>Unresolved only</FilterChip>
        </FilterGroup>
        <FilterSelect label="Sort" value={sort} options={SORTS.map(o => ({ value: o.id, label: o.label }))} onChange={v => { setSort(v as SortId); setSelected(undefined); }} />
        <SearchField label="Search exceptions" placeholder="actor, resource, class, detail, note" value={search} onChange={setSearch} />
        {search && <TextLink onClick={() => setSearch('')}>Clear</TextLink>}
      </FilterBar>

      {scopes.data && scopes.data.scopes.length === 0 && !scopes.failure && (
        <Hint>No observed scope is known. Clearance does not list its scopes yet; set <code>clearance.observeScopes</code> in Backstage's config until it does.</Hint>
      )}
      {readError !== undefined && <TabError error={new Error(readDeniedText(readError))} what="exceptions" />}

      {active && <CoverageBanner scope={active} statement={cov.data} error={cov.data ? undefined : cov.failure} now={now} />}

      <div className={`${c.notice} ${fading ? c.noticeFading : ''}`} role="status" aria-live="polite" style={notice ? undefined : { position: 'absolute', width: 1, height: 1, overflow: 'hidden' }}>
        {notice && <Callout tone="ok" role="presentation">{notice}</Callout>}
      </div>

      {admin && (
        <BulkResolve
          picked={pickedRows}
          matching={matchingKeys.length}
          onSelectAllMatching={() => setPicked(new Set(matchingKeys))}
          onClear={() => setPicked(new Set())}
          onSettled={keys => pick(keys, false)}
          onChanged={recorded}
        />
      )}

      <div className={c.stack}>
        {active && !denied && (
          <>
            <RowTable key={`obs|${tableKey}`} title="Seen, not cleared" rows={shownObs} selected={selected} onSelect={setSelected} now={now} admin={admin} onChanged={recorded} pageSize={pageSize} onPageSize={setPageSize} picked={picked} onPick={pick} />
            {cov.data?.seen_not_cleared.truncated && <Hint>The statement lists the first 200; narrow the window to see the rest.</Hint>}
          </>
        )}
        <RowTable key={`gate|${tableKey}`} title="Gate exceptions" rows={shownGate} selected={selected} onSelect={setSelected} now={now} admin={admin} onChanged={recorded} pageSize={pageSize} onPageSize={setPageSize} picked={picked} onPick={pick} />
      </div>
    </div>
  );
}
