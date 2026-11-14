import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { useState, useMemo, useEffect, useRef } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { RESOLUTION_STATES, RESOLUTION_CAUSES } from '../../kit/types.esm.js';
import { fontScale, useClearanceTokens } from '../../kit/tokens.esm.js';
import { relativeTime, dateTime, shortPrincipal } from '../../kit/format.esm.js';
import { usePoll } from '../../kit/usePoll.esm.js';
import { useMountedNow } from '../../kit/now.esm.js';
import { Count, FilterBar, FilterSelect, FilterChips, FilterGroup, FilterChip, SearchField, TextLink, Hint, TabError, Callout, Button, Tile, Field, useTableKit, Section, EmptyNote, Checkbox, StatusChip, SectionTitle, Chip, FactGrid, Fact } from '../../kit/kit.esm.js';
import '../../kit/components.esm.js';
import '../../kit/FlightLog.esm.js';
import '../../kit/transport.esm.js';
import { useClearanceRead } from '../../kit/read.esm.js';
import { useClearanceWrite, BULK_RESOLUTION_LIMIT, ControlError } from '../../kit/write.esm.js';
import { useScopes, useCoverage, statusOf, readDeniedText, CoverageBanner } from '../../kit/coverage.esm.js';
import { DEFAULT_PAGE_SIZE, pageSlice, PAGE_SIZES, Pager } from '../../kit/Pager.esm.js';
import '../../kit/kitStyles.esm.js';
import { ExpandRow } from '../../kit/ExpandRow.esm.js';
import { historyOf, diffSummary, REDACTED } from './diff.esm.js';

const DAY = 864e5;
const WINDOWS = [
  { id: "24h", label: "24 hours", ms: DAY },
  { id: "7d", label: "7 days", ms: 7 * DAY },
  { id: "30d", label: "30 days", ms: 30 * DAY }
];
const RESOLVABLE_GATE = /* @__PURE__ */ new Set(["out-of-band", "drift", "untraced-apply", "digest-mismatch"]);
const STATE_WORDS = { reverted: "reverted", ratified: "ratified", "declared-break-glass": "declared break-glass", "still-live": "still live" };
const COVERAGE_TONE = {
  "out-of-band-detected": "bad",
  "out-of-band": "bad",
  "digest-mismatch": "bad",
  "untraced-apply": "bad",
  drift: "warn",
  "observed-not-attributed": "warn",
  "break-glass": "warn",
  "attempted-refused": "neutral",
  unassessed: "neutral"
};
const RESOLUTION_TONE = { reverted: "ok", ratified: "ok", "still-live": "warn", "declared-break-glass": "warn" };
const useStyles = makeStyles(() => ({
  scroll: { overflowX: "auto" },
  inlineDetail: { padding: "12px 18px", display: "flex", flexDirection: "column", gap: 12 },
  detailHead: { display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" },
  hist: { margin: 0, paddingLeft: 18, fontSize: fontScale.md },
  form: { display: "flex", flexDirection: "column", gap: 10 },
  frow: { display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" },
  grow: { flex: "1 1 260px", minWidth: 0 },
  notice: { transition: "opacity 600ms", opacity: 1 },
  noticeFading: { opacity: 0 },
  stack: { display: "flex", flexDirection: "column", gap: 16 },
  page: { display: "flex", flexDirection: "column", gap: 16 }
}));
function observationRows(scope, cov, observations, resolutions) {
  const bySeq = new Map(observations.map((o) => [o.seq, o]));
  return (cov?.seen_not_cleared.items ?? []).map((it) => {
    const rec = bySeq.get(it.seq);
    const mon = !!it.monitoring_protection || !!rec?.action?.protects_monitoring;
    return {
      seq: it.seq,
      ts: it.ts,
      scope,
      klass: it.coverage,
      source: it.source,
      resource: it.resource ?? (rec?.resource ? [rec.resource.kind, rec.resource.namespace, rec.resource.name].filter(Boolean).join("/") : ""),
      actor: rec?.actor?.subject ?? "",
      diff: rec ? diffSummary(rec) : [it.api].filter(Boolean).join(" "),
      resolution: it.resolution,
      cause: it.cause,
      resolvedBy: it.resolved_by,
      resolvedAt: it.resolved_at,
      history: historyOf(resolutions, it.seq),
      resolvable: !mon,
      whyNot: mon ? "An operation on the monitoring itself is never waved through: it stays in the packet as it is." : void 0,
      gate: false
    };
  });
}
const detailText = (d) => {
  if (d === void 0 || d === null || d === "") return "";
  const text = typeof d === "string" ? d : JSON.stringify(d);
  return text.split(JSON.stringify(REDACTED)).join('"withheld"').split(REDACTED).join("withheld").slice(0, 120);
};
const notResolvableWhy = (kind) => {
  if (RESOLVABLE_GATE.has(kind)) return void 0;
  if (kind === "monitoring-protection") return "An operation on the monitoring itself is never waved through.";
  return "A refused attempt landed nothing: there is nothing to resolve.";
};
const plainResolution = (row) => {
  if (!row.resolution) return "none recorded";
  return `${row.resolution}${row.cause ? ` (${row.cause})` : ""}`;
};
function gateRows(records, resolutions) {
  return records.filter((r) => r.tool === "deploy.exception" || r.exception).map((r) => {
    const x = r.exception ?? {};
    const detail = detailText(x.detail);
    const kind = x.kind ?? "exception";
    const history = historyOf(resolutions, r.seq);
    const newest = history[0]?.resolution;
    return {
      seq: r.seq,
      ts: r.ts,
      scope: "",
      klass: kind,
      source: "gate",
      resource: String(r.app ?? r.target ?? ""),
      actor: x.actor ?? "",
      diff: detail,
      resolution: newest?.state ?? null,
      cause: newest?.cause ?? null,
      resolvedBy: newest?.by ?? null,
      resolvedAt: history[0]?.ts ?? null,
      history,
      resolvable: RESOLVABLE_GATE.has(kind),
      whyNot: notResolvableWhy(kind),
      gate: true
    };
  });
}
function ResolveForm({ row, onDone }) {
  const c = useStyles();
  const write = useClearanceWrite();
  const [state, setState] = useState("ratified");
  const [cause, setCause] = useState("");
  const [note, setNote] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState();
  const needsCause = state === "reverted";
  const ready = !needsCause || !!cause;
  const body = { state, ...needsCause && cause ? { cause } : {}, ...note.trim() ? { note: note.trim() } : {} };
  const send = async () => {
    if (inFlight.current) return;
    const newest = row.history[0]?.resolution;
    if (newest && newest.state === body.state && (newest.cause ?? void 0) === body.cause && (newest.note ?? void 0) === body.note) {
      setConfirming(false);
      setError(void 0);
      onDone(`Already recorded: ${STATE_WORDS[state]} \u2014 ${row.resource || row.source || `seq ${row.seq}`}`);
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setError(void 0);
    try {
      const out = await write.resolveObservation(row.seq, body);
      setConfirming(false);
      setNote("");
      const record = { seq: out.seq, ts: (/* @__PURE__ */ new Date()).toISOString(), scope: out.scope, about: { seq: row.seq }, resolution: { state: out.state, cause: out.cause, note: out.note ?? void 0, by: "you" } };
      onDone(`Recorded: ${STATE_WORDS[state]}${needsCause && cause ? ` (${cause})` : ""} \u2014 ${row.resource || row.source || `seq ${row.seq}`}`, record);
    } catch (e) {
      setConfirming(false);
      setError(e instanceof ControlError ? `Not recorded. ${e.refusal.rule ? `${e.refusal.rule}: ` : ""}${e.message}${e.refusal.status === 403 ? " (admins only)" : ""}` : `Not recorded. ${String(e)}`);
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };
  return /* @__PURE__ */ jsxs(Tile, { className: c.form, "aria-label": "Resolve", children: [
    /* @__PURE__ */ jsxs("div", { className: c.frow, children: [
      /* @__PURE__ */ jsx(Field, { label: "How it ended", children: ({ className }) => /* @__PURE__ */ jsx("select", { "aria-label": "Resolution state", className, value: state, onChange: (e) => {
        setState(e.target.value);
        setConfirming(false);
      }, children: RESOLUTION_STATES.map((s) => /* @__PURE__ */ jsx("option", { value: s, children: STATE_WORDS[s] }, s)) }) }),
      needsCause && /* @__PURE__ */ jsx(Field, { label: "Cause (required)", children: ({ className }) => /* @__PURE__ */ jsxs("select", { "aria-label": "Cause", className, value: cause, onChange: (e) => {
        setCause(e.target.value);
        setConfirming(false);
      }, children: [
        /* @__PURE__ */ jsx("option", { value: "", children: "choose\u2026" }),
        RESOLUTION_CAUSES.map((s) => /* @__PURE__ */ jsx("option", { value: s, children: s }, s))
      ] }) }),
      /* @__PURE__ */ jsx("div", { className: c.grow, children: /* @__PURE__ */ jsx(Field, { label: "Note (optional)", children: ({ className }) => /* @__PURE__ */ jsx("input", { "aria-label": "Note", className, maxLength: 1e3, placeholder: "what happened, a link to the ticket", value: note, onChange: (e) => {
        setNote(e.target.value);
        setConfirming(false);
      } }) }) })
    ] }),
    !confirming ? /* @__PURE__ */ jsxs("div", { className: c.frow, children: [
      /* @__PURE__ */ jsx(Button, { disabled: !ready || busy, onClick: () => setConfirming(true), children: "Review resolution\u2026" }),
      !ready && /* @__PURE__ */ jsx(Hint, { children: "A reverted change needs its cause." })
    ] }) : /* @__PURE__ */ jsxs(Callout, { tone: "warn", role: "alertdialog", "aria-label": "Confirm resolution", actions: /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx(Button, { variant: "primary", small: true, disabled: busy, onClick: send, children: "Record resolution" }),
      /* @__PURE__ */ jsx(Button, { small: true, disabled: busy, onClick: () => setConfirming(false), children: "Back" })
    ] }), children: [
      "Record ",
      /* @__PURE__ */ jsx("strong", { children: STATE_WORDS[state] }),
      needsCause && cause ? /* @__PURE__ */ jsxs(Fragment, { children: [
        " (cause ",
        /* @__PURE__ */ jsx("strong", { children: cause }),
        ")"
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
const rowKey = (r) => `${r.gate ? "gate" : "obs"}-${r.seq}`;
const rowName = (r) => `${r.klass} ${r.resource || r.source || ""}`.trim();
const alreadyResolved = (r, body) => {
  const newest = r.history[0]?.resolution;
  return !!newest && newest.state === body.state && (newest.cause ?? void 0) === body.cause && (newest.note ?? void 0) === body.note;
};
function BulkResolve({ picked, matching, onSelectAllMatching, onClear, onSettled, onChanged }) {
  const c = useStyles();
  const write = useClearanceWrite();
  const [state, setState] = useState("ratified");
  const [cause, setCause] = useState("");
  const [note, setNote] = useState("");
  const [review, setReview] = useState();
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [summary, setSummary] = useState();
  const needsCause = state === "reverted";
  const ready = !needsCause || !!cause;
  const body = { state, ...needsCause && cause ? { cause } : {}, ...note.trim() ? { note: note.trim() } : {} };
  const startReview = () => {
    const skip = [];
    const send = [];
    for (const row of picked) {
      if (!row.resolvable) skip.push({ row, reason: row.whyNot ?? "not resolvable" });
      else if (alreadyResolved(row, body)) skip.push({ row, reason: "its newest resolution already says this" });
      else send.push(row);
    }
    setSummary(void 0);
    setReview({ body, send, skip });
  };
  const record = async () => {
    if (inFlight.current || !review) return;
    inFlight.current = true;
    setBusy(true);
    const { body: sent, send, skip } = review;
    const out = { recorded: 0, skipped: skip.length, failed: [] };
    const records = [];
    const settled = skip.map((s) => rowKey(s.row));
    const byRecordedSeq = new Map(send.map((r) => [r.seq, r]));
    try {
      for (let i = 0; i < send.length; i += BULK_RESOLUTION_LIMIT) {
        const chunk = send.slice(i, i + BULK_RESOLUTION_LIMIT);
        try {
          const answer = await write.resolveObservations(chunk.map((r) => r.seq), sent);
          out.skipped += answer.skipped.length;
          out.failed.push(...answer.failed);
          for (const done of answer.recorded) {
            out.recorded += 1;
            records.push({ seq: done.record_seq, ts: answer.ts, scope: done.scope, about: { seq: done.seq }, resolution: { state: answer.state, cause: answer.cause, note: answer.note ?? void 0, by: "you" } });
          }
          for (const done of [...answer.recorded, ...answer.skipped]) {
            const row = byRecordedSeq.get(done.seq);
            if (row) settled.push(rowKey(row));
          }
        } catch (e) {
          const why = e instanceof ControlError ? `${e.refusal.rule ? `${e.refusal.rule}: ` : ""}${e.message}${e.refusal.status === 403 ? " (admins only)" : ""}` : String(e);
          out.failed.push(...send.slice(i).map((r) => ({ seq: r.seq, error: why })));
          break;
        }
      }
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
    setSummary(out);
    setReview(void 0);
    setNote("");
    onSettled(settled);
    onChanged(void 0, records);
  };
  if (picked.length === 0 && !summary) return null;
  const scopes = [...new Set((review?.send ?? []).map((r) => r.scope).filter(Boolean))];
  const gateCount = (review?.send ?? []).filter((r) => r.gate).length;
  return /* @__PURE__ */ jsxs("div", { className: c.stack, children: [
    summary && /* @__PURE__ */ jsxs(Callout, { tone: summary.failed.length ? "warn" : "ok", "aria-label": "Bulk resolution result", actions: /* @__PURE__ */ jsx(Button, { small: true, onClick: () => setSummary(void 0), children: "Dismiss" }), children: [
      /* @__PURE__ */ jsxs("strong", { children: [
        "Recorded ",
        summary.recorded,
        " \xB7 skipped ",
        summary.skipped,
        " \xB7 failed ",
        summary.failed.length
      ] }),
      summary.failed.length > 0 && /* @__PURE__ */ jsx("ul", { className: c.hist, "aria-label": "Failed resolutions", children: summary.failed.map((f) => /* @__PURE__ */ jsxs("li", { children: [
        "seq ",
        f.seq,
        ": ",
        f.error
      ] }, f.seq)) })
    ] }),
    picked.length > 0 && /* @__PURE__ */ jsxs(Tile, { className: c.form, role: "region", "aria-label": "Resolve selected", children: [
      /* @__PURE__ */ jsxs("div", { className: c.frow, children: [
        /* @__PURE__ */ jsxs(Count, { children: [
          picked.length,
          " selected"
        ] }),
        picked.length < matching && /* @__PURE__ */ jsxs(TextLink, { onClick: onSelectAllMatching, children: [
          "Select all ",
          matching,
          " matching the current filters"
        ] }),
        /* @__PURE__ */ jsx(TextLink, { onClick: onClear, children: "Clear selection" })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: c.frow, children: [
        /* @__PURE__ */ jsx(Field, { label: "How it ended", children: ({ className }) => /* @__PURE__ */ jsx("select", { "aria-label": "Bulk resolution state", className, disabled: busy, value: state, onChange: (e) => {
          setState(e.target.value);
          setReview(void 0);
        }, children: RESOLUTION_STATES.map((st) => /* @__PURE__ */ jsx("option", { value: st, children: STATE_WORDS[st] }, st)) }) }),
        needsCause && /* @__PURE__ */ jsx(Field, { label: "Cause (required)", children: ({ className }) => /* @__PURE__ */ jsxs("select", { "aria-label": "Bulk cause", className, disabled: busy, value: cause, onChange: (e) => {
          setCause(e.target.value);
          setReview(void 0);
        }, children: [
          /* @__PURE__ */ jsx("option", { value: "", children: "choose\u2026" }),
          RESOLUTION_CAUSES.map((x) => /* @__PURE__ */ jsx("option", { value: x, children: x }, x))
        ] }) }),
        /* @__PURE__ */ jsx("div", { className: c.grow, children: /* @__PURE__ */ jsx(Field, { label: "Note (optional)", children: ({ className }) => /* @__PURE__ */ jsx("input", { "aria-label": "Bulk note", className, maxLength: 1e3, placeholder: "what happened, a link to the ticket", value: note, disabled: busy, onChange: (e) => {
          setNote(e.target.value);
          setReview(void 0);
        } }) }) })
      ] }),
      !review ? /* @__PURE__ */ jsxs("div", { className: c.frow, children: [
        /* @__PURE__ */ jsxs(Button, { variant: "primary", disabled: !ready || busy, onClick: startReview, children: [
          "Review ",
          picked.length,
          " resolutions\u2026"
        ] }),
        !ready && /* @__PURE__ */ jsx(Hint, { children: "A reverted change needs its cause." })
      ] }) : /* @__PURE__ */ jsxs(Callout, { tone: "warn", role: "alertdialog", "aria-label": "Confirm bulk resolution", actions: /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs(Button, { variant: "primary", small: true, disabled: busy || review.send.length === 0, onClick: record, children: [
          "Record ",
          review.send.length,
          " resolutions"
        ] }),
        /* @__PURE__ */ jsx(Button, { small: true, disabled: busy, onClick: () => setReview(void 0), children: "Back" })
      ] }), children: [
        "Record ",
        /* @__PURE__ */ jsx("strong", { children: STATE_WORDS[review.body.state] }),
        review.body.cause ? /* @__PURE__ */ jsxs(Fragment, { children: [
          " (cause ",
          /* @__PURE__ */ jsx("strong", { children: review.body.cause }),
          ")"
        ] }) : null,
        " for ",
        /* @__PURE__ */ jsx("strong", { children: review.send.length }),
        " ",
        review.send.length === 1 ? "exception" : "exceptions",
        scopes.length > 0 ? /* @__PURE__ */ jsxs(Fragment, { children: [
          " in ",
          /* @__PURE__ */ jsx("strong", { children: scopes.join(", ") })
        ] }) : null,
        gateCount > 0 ? /* @__PURE__ */ jsxs(Fragment, { children: [
          scopes.length > 0 ? " and" : " in",
          " the scope of ",
          gateCount === 1 ? "its" : "their",
          " destination for ",
          gateCount,
          " gate ",
          gateCount === 1 ? "exception" : "exceptions"
        ] }) : null,
        ". Each is written as its own record under your name, sharing one batch id; none can be edited or removed, and a later resolution supersedes it.",
        review.skip.length > 0 && /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsxs("p", { children: [
            review.skip.length,
            " will be skipped:"
          ] }),
          /* @__PURE__ */ jsx("ul", { className: c.hist, "aria-label": "Skipped resolutions", children: review.skip.map((x) => /* @__PURE__ */ jsxs("li", { children: [
            "seq ",
            x.row.seq,
            " ",
            rowName(x.row),
            ": ",
            x.reason
          ] }, rowKey(x.row))) })
        ] })
      ] })
    ] })
  ] });
}
function RowDetail({ row, admin, onChanged, now }) {
  const t = useClearanceTokens();
  const c = useStyles();
  return /* @__PURE__ */ jsxs("section", { className: c.inlineDetail, style: { borderLeft: `3px solid ${t.amber}` }, "aria-label": "Exception detail", children: [
    /* @__PURE__ */ jsxs("div", { className: c.detailHead, children: [
      /* @__PURE__ */ jsx(SectionTitle, { level: 2, children: row.klass }),
      /* @__PURE__ */ jsx(Chip, { children: row.gate ? "gate exception" : "observation" }),
      /* @__PURE__ */ jsxs(Count, { children: [
        "seq ",
        row.seq,
        row.scope ? ` \xB7 ${row.scope}` : ""
      ] })
    ] }),
    /* @__PURE__ */ jsxs(FactGrid, { min: 220, children: [
      /* @__PURE__ */ jsxs(Fact, { label: "When", children: [
        dateTime(row.ts),
        " (",
        relativeTime(row.ts, now),
        ")"
      ] }),
      /* @__PURE__ */ jsx(Fact, { label: "Actor", children: row.actor || "not attributed" }),
      /* @__PURE__ */ jsx(Fact, { label: "What changed", children: row.diff || "no detail recorded" }),
      /* @__PURE__ */ jsx(Fact, { label: "Resolution history", children: row.history.length === 0 ? plainResolution(row) : /* @__PURE__ */ jsx("ol", { className: c.hist, reversed: true, "aria-label": "Resolution history, newest first", children: row.history.map((h) => /* @__PURE__ */ jsxs("li", { children: [
        /* @__PURE__ */ jsx("strong", { children: STATE_WORDS[h.resolution?.state ?? ""] ?? h.resolution?.state }),
        h.resolution?.cause ? ` (${h.resolution.cause})` : "",
        " by ",
        shortPrincipal(h.resolution?.by) || "its collector",
        " ",
        /* @__PURE__ */ jsxs(Count, { children: [
          dateTime(h.ts),
          " \xB7 seq ",
          h.seq
        ] }),
        h.resolution?.note ? /* @__PURE__ */ jsx(Hint, { children: h.resolution.note }) : null
      ] }, h.seq)) }) })
    ] }),
    !row.resolvable && /* @__PURE__ */ jsx(Hint, { children: row.whyNot }),
    row.resolvable && admin && /* @__PURE__ */ jsx(ResolveForm, { row, onDone: onChanged }, row.seq),
    row.resolvable && !admin && /* @__PURE__ */ jsx(Hint, { children: "Only Clearance admins can resolve an exception. You can read everything here." })
  ] });
}
const SORTS = [
  { id: "newest", label: "Newest first" },
  { id: "oldest", label: "Oldest first" },
  { id: "severity", label: "Severity" },
  { id: "resolution", label: "Resolution state" }
];
const SEVERITY = { "out-of-band-detected": 0, "out-of-band": 0, "digest-mismatch": 1, "untraced-apply": 2, drift: 3, "observed-not-attributed": 4, "break-glass": 5, "attempted-refused": 6, unassessed: 7 };
const severityOf = (k) => SEVERITY[k] ?? 8;
const RESOLUTION_ORDER = { "still-live": 1, "declared-break-glass": 2, ratified: 3, reverted: 4 };
const resolutionOf = (r) => r.resolution ? RESOLUTION_ORDER[r.resolution] ?? 5 : 0;
function sortRows(rows, sort) {
  const time = (r) => Date.parse(r.ts) || 0;
  const newest = (x, y) => time(y) - time(x) || y.seq - x.seq;
  const by = {
    newest,
    oldest: (x, y) => -newest(x, y),
    severity: (x, y) => severityOf(x.klass) - severityOf(y.klass) || newest(x, y),
    resolution: (x, y) => resolutionOf(x) - resolutionOf(y) || newest(x, y)
  };
  return [...rows].sort(by[sort]);
}
function matchesSearch(r, q) {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const hay = [r.actor, r.resource, r.klass, r.scope, r.source, r.diff, r.resolution, r.cause, r.resolvedBy, ...r.history.flatMap((h) => [h.resolution?.state, h.resolution?.cause, h.resolution?.note, h.resolution?.by])];
  return hay.some((v) => typeof v === "string" && v.toLowerCase().includes(needle));
}
const COLUMNS = ["When", "Class", "Resource", "Actor", "What changed", "Resolution"];
function RowTable({ title, rows, selected, onSelect, now, admin, onChanged, pageSize, onPageSize, picked, onPick }) {
  const c = useStyles();
  const tk = useTableKit();
  const [page, setPage] = useState(0);
  const slice = pageSlice(rows, page, pageSize);
  const pageKeys = slice.rows.filter((r) => r.resolvable).map(rowKey);
  const pageAll = pageKeys.length > 0 && pageKeys.every((k) => picked.has(k));
  const cols = admin ? ["", ...COLUMNS] : COLUMNS;
  return /* @__PURE__ */ jsxs(Section, { framed: true, "aria-label": title, title, count: `${rows.length} shown`, children: [
    rows.length === 0 ? /* @__PURE__ */ jsx(EmptyNote, { inset: true, children: "Nothing here for this filter." }) : /* @__PURE__ */ jsx("div", { className: c.scroll, children: /* @__PURE__ */ jsxs("table", { className: tk.table, children: [
      /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsxs("tr", { children: [
        admin && /* @__PURE__ */ jsx("th", { className: tk.th, children: /* @__PURE__ */ jsx(Checkbox, { "aria-label": `Select all resolvable on this page of ${title}`, disabled: pageKeys.length === 0, checked: pageAll, onChange: () => onPick(pageKeys, !pageAll) }) }),
        COLUMNS.map((h) => /* @__PURE__ */ jsx("th", { className: tk.th, children: h }, h))
      ] }) }),
      /* @__PURE__ */ jsx("tbody", { children: slice.rows.map((r) => {
        const key = rowKey(r);
        const isOpen = selected === key;
        const toggle = () => onSelect(isOpen ? void 0 : key);
        return /* @__PURE__ */ jsxs(ExpandRow, { id: `exc-${key}`, open: isOpen, onToggle: toggle, colSpan: cols.length, label: `Details for ${r.klass} ${r.resource || r.source}, seq ${r.seq}`, details: /* @__PURE__ */ jsx(RowDetail, { row: r, admin, onChanged, now }), children: [
          admin && /* @__PURE__ */ jsx("td", { className: tk.td, onClick: (e) => e.stopPropagation(), children: r.resolvable && /* @__PURE__ */ jsx(Checkbox, { "aria-label": `Select ${rowName(r)}, seq ${r.seq}`, checked: picked.has(key), onChange: () => onPick([key], !picked.has(key)) }) }),
          /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx(TextLink, { expanded: isOpen, title: dateTime(r.ts), "aria-label": `${isOpen ? "Hide" : "Show"} details for ${r.klass} ${r.resource || r.source}, seq ${r.seq}`, children: relativeTime(r.ts, now) }) }),
          /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx(StatusChip, { tone: COVERAGE_TONE[r.klass] ?? "neutral", children: r.klass }) }),
          /* @__PURE__ */ jsx("td", { className: `${tk.td} ${tk.meta}`, children: r.resource || r.source }),
          /* @__PURE__ */ jsx("td", { className: `${tk.td} ${tk.meta}`, children: shortPrincipal(r.actor) || "\u2014" }),
          /* @__PURE__ */ jsx("td", { className: `${tk.td} ${tk.meta}`, children: r.diff || "\u2014" }),
          /* @__PURE__ */ jsx("td", { className: tk.td, children: r.resolution ? /* @__PURE__ */ jsx(StatusChip, { tone: RESOLUTION_TONE[r.resolution] ?? "warn", children: STATE_WORDS[r.resolution] ?? r.resolution }) : /* @__PURE__ */ jsx(StatusChip, { tone: "neutral", children: "none recorded" }) })
        ] }, key);
      }) })
    ] }) }),
    rows.length > PAGE_SIZES[0] && /* @__PURE__ */ jsx(Pager, { label: `${title} pages`, total: rows.length, page: slice.page, pageSize, onPage: (n) => {
      setPage(n);
      onSelect(void 0);
    }, onPageSize: (n) => {
      onPageSize(n);
      setPage(0);
      onSelect(void 0);
    } })
  ] });
}
function ExceptionsView({ now: nowProp, initialScope }) {
  const c = useStyles();
  const api = useClearanceRead();
  const now = useMountedNow(nowProp);
  const [scope, setScope] = useState(initialScope);
  const [windowId, setWindowId] = useState("24h");
  const [klass, setKlass] = useState("all");
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState();
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("newest");
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const win = WINDOWS.find((w) => w.id === windowId);
  const from = new Date(now - win.ms).toISOString();
  const scopes = useScopes();
  const me = usePoll("me", () => api.get("/me"), 0);
  const active = scope ?? scopes.data?.scopes[0];
  const cov = useCoverage(api, active, from);
  const obs = usePoll(`obs:${active}:${from}`, async () => active ? api.get("/v1/observations", { scope: active, kind: "observation", since: from, limit: 200 }) : void 0, 6e4);
  const allScopes = useMemo(() => [.../* @__PURE__ */ new Set([...scopes.data?.scopes ?? [], ...active ? [active] : []])], [scopes.data, active]);
  const res = usePoll(
    `res:${allScopes.join(",")}`,
    async () => {
      if (allScopes.length === 0) return void 0;
      const pages = await Promise.all(allScopes.map((sc) => api.get("/v1/observations", { scope: sc, kind: "resolution", limit: 200 })));
      return { items: pages.flatMap((p) => p.items), next: null };
    },
    6e4
  );
  const [picked, setPicked] = useState(/* @__PURE__ */ new Set());
  const [justRecorded, setJustRecorded] = useState([]);
  const gate = usePoll(`gate:${from}`, () => api.get("/v1/exceptions", { since: from, limit: 100 }), 6e4);
  const [notice, setNotice] = useState();
  const [fading, setFading] = useState(false);
  useEffect(() => {
    if (!notice) return void 0;
    const fade = setTimeout(() => setFading(true), 5e3);
    const gone = setTimeout(() => setNotice(void 0), 5700);
    return () => {
      clearTimeout(fade);
      clearTimeout(gone);
    };
  }, [notice]);
  useEffect(() => {
    const id = setTimeout(() => {
      setQuery(search);
      setSelected(void 0);
    }, 200);
    return () => clearTimeout(id);
  }, [search]);
  const refresh = () => {
    cov.refresh();
    obs.refresh();
    res.refresh();
    gate.refresh();
  };
  const recorded = (text, record) => {
    const more = [].concat(record ?? []);
    if (more.length) setJustRecorded((prev) => [...prev, ...more]);
    if (text) {
      setFading(false);
      setNotice(text);
    }
    refresh();
  };
  const resolutions = useMemo(() => {
    const stored = res.data?.items ?? [];
    const seen = new Set(stored.map((r) => r.seq));
    return [...stored, ...justRecorded.filter((r) => !seen.has(r.seq))];
  }, [res.data, justRecorded]);
  const rows = useMemo(() => observationRows(active ?? "", cov.data, obs.data?.items ?? [], resolutions), [active, cov.data, obs.data, resolutions]);
  const gates = useMemo(() => gateRows(gate.data?.items ?? [], resolutions), [gate.data, resolutions]);
  const classes = useMemo(() => [...new Set([...rows, ...gates].map((r) => r.klass))].sort(), [rows, gates]);
  const keep = (r) => (klass === "all" || r.klass === klass) && (!open || !r.resolution) && matchesSearch(r, query);
  const shownObs = useMemo(() => sortRows(rows.filter(keep), sort), [rows, sort, klass, open, query]);
  const shownGate = useMemo(() => sortRows(gates.filter(keep), sort), [gates, sort, klass, open, query]);
  const tableKey = `${active}|${windowId}|${klass}|${open}|${sort}|${query}`;
  useEffect(() => setPicked(/* @__PURE__ */ new Set()), [tableKey]);
  const admin = !!me.data?.admin;
  const byKey = useMemo(() => new Map([...rows, ...gates].map((r) => [rowKey(r), r])), [rows, gates]);
  const matchingKeys = useMemo(() => [...shownObs, ...shownGate].filter((r) => r.resolvable).map(rowKey), [shownObs, shownGate]);
  const pick = (keys, on) => setPicked((prev) => {
    const next = new Set(prev);
    for (const k of keys) {
      if (on) next.add(k);
      else next.delete(k);
    }
    return next;
  });
  const pickedRows = [...picked].map((k) => byKey.get(k)).filter((r) => !!r);
  const readError = scopes.failure ?? (cov.data ? void 0 : cov.failure) ?? (obs.data ? void 0 : obs.failure);
  const denied = statusOf(readError) === 403;
  const filterEnd = /* @__PURE__ */ jsxs(Fragment, { children: [
    query.trim() && /* @__PURE__ */ jsx("span", { role: "status", "aria-live": "polite", children: /* @__PURE__ */ jsxs(Count, { children: [
      shownObs.length + shownGate.length,
      " matches"
    ] }) }),
    /* @__PURE__ */ jsx(Count, { children: me.data?.admin ? "You are a Clearance admin: you may resolve." : "Read only: resolving is for Clearance admins." })
  ] });
  return /* @__PURE__ */ jsxs("div", { className: c.page, children: [
    /* @__PURE__ */ jsxs(FilterBar, { end: filterEnd, children: [
      /* @__PURE__ */ jsx(FilterSelect, { label: "Scope", value: active ?? "", disabled: !scopes.data?.scopes.length, options: (scopes.data?.scopes ?? []).map((s) => ({ value: s, label: s })), onChange: (v) => {
        setScope(v);
        setSelected(void 0);
      } }),
      /* @__PURE__ */ jsx(FilterChips, { label: "Window", options: WINDOWS.map((w) => ({ id: w.id, label: w.label })), value: windowId, onChange: setWindowId }),
      /* @__PURE__ */ jsx(FilterChips, { label: "Class", options: [{ id: "all", label: "All" }, ...classes.map((k) => ({ id: k, label: k }))], value: klass, onChange: setKlass }),
      /* @__PURE__ */ jsx(FilterGroup, { label: "Resolution", children: /* @__PURE__ */ jsx(FilterChip, { on: open, onClick: () => setOpen((o) => !o), children: "Unresolved only" }) }),
      /* @__PURE__ */ jsx(FilterSelect, { label: "Sort", value: sort, options: SORTS.map((o) => ({ value: o.id, label: o.label })), onChange: (v) => {
        setSort(v);
        setSelected(void 0);
      } }),
      /* @__PURE__ */ jsx(SearchField, { label: "Search exceptions", placeholder: "actor, resource, class, detail, note", value: search, onChange: setSearch }),
      search && /* @__PURE__ */ jsx(TextLink, { onClick: () => setSearch(""), children: "Clear" })
    ] }),
    scopes.data && scopes.data.scopes.length === 0 && !scopes.failure && /* @__PURE__ */ jsxs(Hint, { children: [
      "No observed scope is known. Clearance does not list its scopes yet; set ",
      /* @__PURE__ */ jsx("code", { children: "clearance.observeScopes" }),
      " in Backstage's config until it does."
    ] }),
    readError !== void 0 && /* @__PURE__ */ jsx(TabError, { error: new Error(readDeniedText(readError)), what: "exceptions" }),
    active && /* @__PURE__ */ jsx(CoverageBanner, { scope: active, statement: cov.data, error: cov.data ? void 0 : cov.failure, now }),
    /* @__PURE__ */ jsx("div", { className: `${c.notice} ${fading ? c.noticeFading : ""}`, role: "status", "aria-live": "polite", style: notice ? void 0 : { position: "absolute", width: 1, height: 1, overflow: "hidden" }, children: notice && /* @__PURE__ */ jsx(Callout, { tone: "ok", role: "presentation", children: notice }) }),
    admin && /* @__PURE__ */ jsx(
      BulkResolve,
      {
        picked: pickedRows,
        matching: matchingKeys.length,
        onSelectAllMatching: () => setPicked(new Set(matchingKeys)),
        onClear: () => setPicked(/* @__PURE__ */ new Set()),
        onSettled: (keys) => pick(keys, false),
        onChanged: recorded
      }
    ),
    /* @__PURE__ */ jsxs("div", { className: c.stack, children: [
      active && !denied && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsx(RowTable, { title: "Seen, not cleared", rows: shownObs, selected, onSelect: setSelected, now, admin, onChanged: recorded, pageSize, onPageSize: setPageSize, picked, onPick: pick }, `obs|${tableKey}`),
        cov.data?.seen_not_cleared.truncated && /* @__PURE__ */ jsx(Hint, { children: "The statement lists the first 200; narrow the window to see the rest." })
      ] }),
      /* @__PURE__ */ jsx(RowTable, { title: "Gate exceptions", rows: shownGate, selected, onSelect: setSelected, now, admin, onChanged: recorded, pageSize, onPageSize: setPageSize, picked, onPick: pick }, `gate|${tableKey}`)
    ] })
  ] });
}

export { ExceptionsView, gateRows, matchesSearch, observationRows, sortRows };
//# sourceMappingURL=ExceptionsView.esm.js.map
