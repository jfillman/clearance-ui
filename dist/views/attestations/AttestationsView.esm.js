import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { useState, useMemo, useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { relativeTime, dateTime } from '../../kit/format.esm.js';
import { usePoll } from '../../kit/usePoll.esm.js';
import { useMountedNow } from '../../kit/now.esm.js';
import { useTableKit, StatRow, Card, Stat, Section, FilterBar, FilterSelect, FilterChips, SearchField, Callout, TabError, PanelSkeleton, EmptyNote, Tooltip, Button } from '../../kit/kit.esm.js';
import '../../kit/components.esm.js';
import '../../kit/FlightLog.esm.js';
import '../../kit/transport.esm.js';
import { useClearanceRead } from '../../kit/read.esm.js';
import '../../kit/coverage.esm.js';
import { DEFAULT_PAGE_SIZE, pageSlice, Pager } from '../../kit/Pager.esm.js';
import '../../kit/kitStyles.esm.js';
import { cursorOf, verifiableOf, rekorUrl, shortDigest, RekorIndex, VerifyChip, verifyDisplay } from '../clearances/ChangeProof.esm.js';

const WINDOWS = [
  { id: "24h", label: "24 h" },
  { id: "7d", label: "7 d" },
  { id: "30d", label: "30 d" }
];
const WINDOW_MS = { "24h": 24 * 36e5, "7d": 7 * 24 * 36e5, "30d": 30 * 24 * 36e5 };
const FETCH_LIMIT = 100;
const windowSince = (now, w) => new Date(Math.floor((now - WINDOW_MS[w]) / 6e4) * 6e4).toISOString();
function searchRows(rows, q) {
  const needle = q.trim().toLowerCase();
  if (!needle) return rows;
  return rows.filter((r) => [r.change_id, r.app, r.env, r.release_id ?? "", r.tree_digest, r.digest, r.key_id ?? ""].some((v) => v.toLowerCase().includes(needle)));
}
const RECHECK = {
  undefined: { value: "\u2026" },
  true: { value: "on", caption: "rows show verified once Clearance re-checks them" },
  false: { value: "off", caption: "no trust configured: rows show signed (recorded)" }
};
function keysCaption(config, verifiable) {
  if (config?.key_ids?.length) return `${config.key_ids.length} trusted: ${config.key_ids.join(", ")}`;
  return verifiable === false ? "none configured to re-check with" : void 0;
}
const useStyles = makeStyles(() => ({
  scroll: { overflowX: "auto" },
  pad: { padding: "12px 18px", display: "flex", flexDirection: "column", gap: 12 },
  more: { padding: "8px 18px" }
}));
function AttestationsView({ now: nowProp, onOpenChange }) {
  const c = useStyles();
  const tk = useTableKit();
  const api = useClearanceRead();
  const now = useMountedNow(nowProp);
  const [win, setWin] = useState("7d");
  const [app, setApp] = useState("");
  const [env, setEnv] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE);
  const since = useMemo(() => windowSince(now, win), [now, win]);
  const key = `${since}|${app}|${env}`;
  const config = usePoll("attestation-config", () => api.get("/v1/attestation-config").catch(() => void 0), 0);
  const apps = usePoll("attestations-apps", () => api.get("/v1/clearances/counts", { by: "app" }), 3e5);
  const envs = usePoll("attestations-envs", () => api.get("/v1/clearances/counts", { by: "env" }), 3e5);
  const counts = usePoll(`attestation-counts-${key}`, () => api.get("/v1/clearances/counts", { by: "attestation", app, env, since }), 6e4);
  const first = usePoll(`attestations-${key}`, () => api.get("/v1/attestations", { app, env, since, limit: FETCH_LIMIT }), 6e4);
  const [extra, setExtra] = useState([]);
  const [after, setAfter] = useState(void 0);
  const [busy, setBusy] = useState(false);
  const [moreError, setMoreError] = useState();
  useEffect(() => {
    setExtra([]);
    setAfter(void 0);
    setPage(0);
  }, [key]);
  const rows = [...first.data?.items ?? [], ...extra];
  const next = cursorOf(after, first.data?.next);
  const loadOlder = async () => {
    if (next === null) return;
    setBusy(true);
    setMoreError(void 0);
    try {
      const p = await api.get("/v1/attestations", { app, env, since, limit: FETCH_LIMIT, after: next });
      setExtra((prev) => [...prev, ...p.items]);
      setAfter(typeof p.next === "number" ? p.next : null);
    } catch (e) {
      setMoreError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };
  const shown = searchRows(rows, query);
  const slice = pageSlice(shown, page, pageSize);
  const count = (k) => counts.data?.items.find((i) => i.key === k)?.count ?? 0;
  const verifiable = verifiableOf(config);
  const keysInUse = new Set(rows.map((r) => r.key_id).filter(Boolean)).size;
  const options = (items, all) => [{ value: "", label: all }, ...(items?.items ?? []).filter((i) => i.key).map((i) => ({ value: i.key, label: i.key }))];
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsxs(StatRow, { children: [
      /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsx(Stat, { label: `Signed, ${WINDOWS.find((w) => w.id === win).label}`, value: counts.data ? count("attested") : "\u2026", caption: config.data?.modes?.length ? config.data.modes.join(", ") : void 0 }) }),
      /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsx(Stat, { label: "Applied, awaiting signature", value: counts.data ? count("pending") : "\u2026", tone: count("pending") ? "warn" : void 0, caption: "the signer is waiting or retrying, or attestation is off" }) }),
      /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsx(Stat, { label: "Signing keys on these rows", value: keysInUse, caption: keysCaption(config.data, verifiable) }) }),
      /* @__PURE__ */ jsx(Card, { children: /* @__PURE__ */ jsx(Stat, { label: "Server re-check", value: RECHECK[String(verifiable)].value, tone: verifiable ? "ok" : void 0, caption: RECHECK[String(verifiable)].caption }) })
    ] }),
    /* @__PURE__ */ jsxs(Section, { framed: true, "aria-label": "Attestations", title: "Signed attestations", count: `${shown.length} shown \xB7 newest first`, children: [
      /* @__PURE__ */ jsxs("div", { className: c.pad, children: [
        /* @__PURE__ */ jsxs(FilterBar, { children: [
          /* @__PURE__ */ jsx(FilterSelect, { label: "App", value: app, options: options(apps.data, "any app"), onChange: setApp }),
          /* @__PURE__ */ jsx(FilterSelect, { label: "Env", value: env, options: options(envs.data, "any env"), onChange: setEnv }),
          /* @__PURE__ */ jsx(FilterChips, { label: "Window", options: WINDOWS, value: win, onChange: setWin }),
          /* @__PURE__ */ jsx(SearchField, { label: "Search attestations", placeholder: "Search change, release id or digest", value: query, onChange: (v) => {
            setQuery(v);
            setPage(0);
          } })
        ] }),
        verifiable === false && /* @__PURE__ */ jsx(Callout, { tone: "info", children: "This Clearance has no trust configured, so it cannot re-check a signature. Rows show \u201Csigned (recorded)\u201D, the state the core recorded. Download a bundle from its change and verify it offline." })
      ] }),
      first.error && !first.data && /* @__PURE__ */ jsx("div", { className: c.pad, children: /* @__PURE__ */ jsx(TabError, { error: first.failure ?? first.error, what: "attestations", onRetry: first.refresh }) }),
      first.loading && !first.data && /* @__PURE__ */ jsx(PanelSkeleton, { rows: 4, label: "Loading attestations\u2026" }),
      first.data && rows.length === 0 && /* @__PURE__ */ jsxs(EmptyNote, { inset: true, children: [
        "No attestations signed in this window",
        app ? ` for ${app}` : "",
        env ? ` in ${env}` : "",
        ". One is signed after a cleared change is applied."
      ] }),
      first.data && rows.length > 0 && shown.length === 0 && /* @__PURE__ */ jsxs(EmptyNote, { inset: true, children: [
        "No loaded attestation matches \u201C",
        query,
        "\u201D.",
        next !== null ? " Older ones are not loaded yet." : ""
      ] }),
      slice.rows.length > 0 && /* @__PURE__ */ jsx("div", { className: c.scroll, children: /* @__PURE__ */ jsxs("table", { className: tk.table, "aria-label": "Signed attestations", children: [
        /* @__PURE__ */ jsx("thead", { children: /* @__PURE__ */ jsx("tr", { children: ["App", "Env", "Change", "Release", "Tree", "Signed", "Rekor index", "Key id", "State"].map((h) => /* @__PURE__ */ jsx("th", { className: tk.th, children: h }, h)) }) }),
        /* @__PURE__ */ jsx("tbody", { children: slice.rows.map((r) => {
          const url = rekorUrl(config.data, r.rekor_log_index);
          return /* @__PURE__ */ jsxs("tr", { className: tk.rowLink, tabIndex: 0, "aria-label": `Open change ${r.change_id}`, onClick: () => onOpenChange?.(r.change_id), onKeyDown: (e) => (e.key === "Enter" || e.key === " ") && onOpenChange?.(r.change_id), children: [
            /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx("b", { children: r.app }) }),
            /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx("span", { className: tk.meta, children: r.env }) }),
            /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx("span", { className: tk.meta, children: r.change_id }) }),
            /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx("span", { className: tk.meta, children: r.release_id ?? "\u2014" }) }),
            /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx(Tooltip, { title: r.tree_digest, children: /* @__PURE__ */ jsx("span", { className: tk.meta, children: shortDigest(r.tree_digest) }) }) }),
            /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx(Tooltip, { title: dateTime(r.signed_at), children: /* @__PURE__ */ jsxs("span", { className: tk.meta, children: [
              relativeTime(r.signed_at, now),
              " ago"
            ] }) }) }),
            /* @__PURE__ */ jsx("td", { className: tk.td, onClick: (e) => e.stopPropagation(), onKeyDown: (e) => e.stopPropagation(), children: r.rekor_log_index === null ? /* @__PURE__ */ jsx("span", { className: tk.meta, children: "not logged" }) : /* @__PURE__ */ jsx(RekorIndex, { index: r.rekor_log_index, url }) }),
            /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx("span", { className: tk.meta, children: r.key_id || "keyless" }) }),
            /* @__PURE__ */ jsx("td", { className: tk.td, children: /* @__PURE__ */ jsx(VerifyChip, { display: verifyDisplay({ verifiable, brief: r.verification }) }) })
          ] }, r.record_seq);
        }) })
      ] }) }),
      shown.length > 0 && /* @__PURE__ */ jsx(Pager, { total: shown.length, page: slice.page, pageSize, onPage: setPage, onPageSize: (n) => {
        setPageSize(n);
        setPage(0);
      }, label: "Attestation pages" }),
      next !== null && /* @__PURE__ */ jsx("div", { className: c.more, children: /* @__PURE__ */ jsx(Button, { small: true, disabled: busy, onClick: loadOlder, children: "Load older attestations" }) }),
      moreError && /* @__PURE__ */ jsx("div", { className: c.pad, children: /* @__PURE__ */ jsx(Callout, { tone: "bad", children: moreError }) })
    ] })
  ] });
}

export { AttestationsView, searchRows, windowSince };
//# sourceMappingURL=AttestationsView.esm.js.map
