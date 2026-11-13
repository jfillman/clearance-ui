import { jsxs, Fragment, jsx } from 'react/jsx-runtime';
import { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { tokensForTheme, fontScale, fontMono } from '../../kit/tokens.esm.js';
import { dateTime, shortPrincipal } from '../../kit/format.esm.js';
import { usePoll } from '../../kit/usePoll.esm.js';
import { TextLink, StatusChip, Section, TabError, PanelSkeleton, EmptyNote, Tooltip, YamlBlock, Button, Chip, FactGrid, Fact, Callout } from '../../kit/kit.esm.js';
import '../../kit/components.esm.js';
import '../../kit/FlightLog.esm.js';
import '../../kit/transport.esm.js';
import { useClearanceRead, ReadError } from '../../kit/read.esm.js';
import '../../kit/coverage.esm.js';
import '../../kit/Pager.esm.js';
import '../../kit/kitStyles.esm.js';

const useStyles = makeStyles((theme) => {
  const t = tokensForTheme(theme);
  return {
    pad: { padding: "12px 18px", display: "flex", flexDirection: "column", gap: 12 },
    chips: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
    actions: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
    timeline: { listStyle: "none", margin: 0, padding: "4px 18px 8px", display: "flex", flexDirection: "column" },
    event: { display: "grid", gridTemplateColumns: "88px 22px minmax(0, 1fr) auto", gap: 10, alignItems: "start", padding: "8px 0", borderBottom: `1px solid ${t.lineSoft}` },
    when: { fontFamily: fontMono, fontSize: fontScale.sm, color: t.textLo },
    glyph: { width: 20, height: 20, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: fontMono, fontSize: fontScale.xs, border: `1px solid ${t.line}`, color: t.textLo },
    glyphOk: { borderColor: t.good, color: t.good },
    glyphBad: { borderColor: t.bad, color: t.bad },
    glyphWait: { borderColor: t.amber, color: t.amberText, borderStyle: "dashed" },
    what: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 },
    detail: { fontSize: fontScale.sm, color: t.textLo, overflowWrap: "anywhere" },
    code: { fontFamily: fontMono },
    raw: { gridColumn: "1 / -1" },
    selectable: { userSelect: "text", fontFamily: fontMono, fontSize: fontScale.sm, overflowWrap: "anywhere" }
  };
});
function attestationState(change) {
  if (change.attestation) return "signed";
  if (change.state === "holding") return "waiting-for-clear";
  if (change.state !== "cleared") return "not-applicable";
  if (!change.outcome) return "waiting-for-outcome";
  return change.outcome.applied && change.outcome.matched ? "not-yet-signed" : "not-attested";
}
function rekorUrl(config, index) {
  if (index === null || index === void 0 || !config?.rekor_entry_url) return void 0;
  return config.rekor_entry_url.replace("{log_index}", String(index));
}
const NOT_VERIFIABLE_NOTE = "This Clearance has no trust configured, so it cannot re-check the signature. The state shown is what the core recorded. Verify offline with the command below.";
function verifyDisplay(args) {
  const { verifiable, answer, brief } = args;
  if (answer) {
    if (answer.verified === true) return { kind: "verified", at: answer.checked_at, detail: [answer.mode, answer.key_id ?? answer.identity].filter(Boolean).join(" \xB7 ") };
    return { kind: "failed", at: answer.checked_at, errors: answer.errors ?? [] };
  }
  if (brief) {
    return brief.verified === true ? { kind: "verified", at: brief.checked_at, detail: "" } : { kind: "failed", at: brief.checked_at, errors: [] };
  }
  if (verifiable === false) return { kind: "recorded", note: NOT_VERIFIABLE_NOTE };
  return { kind: "unchecked", note: "Signed and recorded. Not re-checked yet." };
}
function VerifyChip({ display }) {
  if (display.kind === "verified") return /* @__PURE__ */ jsx(StatusChip, { tone: "ok", title: `The server re-checked the signature at ${dateTime(display.at)}`, children: "verified" });
  if (display.kind === "failed") return /* @__PURE__ */ jsx(StatusChip, { tone: "bad", title: `The server's check failed at ${dateTime(display.at)}`, children: "verification failed" });
  return /* @__PURE__ */ jsx(StatusChip, { tone: "neutral", title: display.note, children: "signed (recorded)" });
}
function shortDigest(d) {
  if (!d) return "";
  if (d.length <= 24) return d;
  return `${d.slice(0, d.includes(":") ? 15 : 8)}\u2026${d.slice(-4)}`;
}
function RekorIndex({ index, url }) {
  if (index === null || index === void 0) return /* @__PURE__ */ jsx(Fragment, { children: "none" });
  const text = index.toLocaleString("en-US");
  return url ? /* @__PURE__ */ jsxs(TextLink, { href: url, children: [
    text,
    " \u2197"
  ] }) : /* @__PURE__ */ jsx(Fragment, { children: text });
}
function verifiableOf(config) {
  if (config.data) return config.data.verifiable;
  return config.loading ? void 0 : false;
}
function cursorOf(later, first) {
  if (later !== void 0) return later;
  return typeof first === "number" ? first : null;
}
const TOOL_TEXT = {
  "deploy.request": { what: "change registered", tone: "ok" },
  "deploy.clear": { what: "cleared", tone: "ok" },
  "deploy.answer": { what: "answered the waiting deployment", tone: "ok" },
  "deploy.deny": { what: "denied", tone: "bad" },
  "deploy.revoke": { what: "revoked: a new head replaced it", tone: "warn" },
  "deploy.expire": { what: "expired", tone: "warn" },
  "deploy.exception": { what: "applied with no grant", tone: "bad" },
  "deploy.outcome": { what: "outcome reported", tone: "ok" },
  "deploy.attestation": { what: "signed and logged", tone: "ok" }
};
const str = (v) => typeof v === "string" ? v : "";
function recordDetail(item) {
  const r = item.record ?? {};
  const att = r.attestation ?? {};
  const parts = [];
  if (item.tool === "deploy.attestation") {
    if (att.backend) parts.push(String(att.backend));
    if (att.rekor_log_index !== void 0 && att.rekor_log_index !== null) parts.push(`Rekor log index ${att.rekor_log_index}`);
    if (att.outcome_seq !== void 0) parts.push(`binds outcome seq ${att.outcome_seq}`);
  }
  const said = str(r.result) || str(r.reason);
  if (said) parts.push(said);
  if (item.principal) parts.push(shortPrincipal(item.principal));
  return parts.join(" \xB7 ");
}
function nextStep(change) {
  switch (attestationState(change)) {
    case "waiting-for-clear":
      return { title: "Holding for a person", detail: `Expires ${dateTime(change.expires_at)}.` };
    case "waiting-for-outcome":
      return { title: "Waiting for a deploy outcome", detail: "The core signs after the first outcome that applied what was cleared." };
    case "not-yet-signed":
      return { title: "Waiting for the signature", detail: "The deploy applied what was cleared. The signer is retrying or attestation is off." };
    default:
      return void 0;
  }
}
function ChangeHistory({ change }) {
  const c = useStyles();
  const api = useClearanceRead();
  const [extra, setExtra] = useState([]);
  const [after, setAfter] = useState(void 0);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState();
  const first = usePoll(`change-records-${change.id}-${change.state}-${change.attestation ? "a" : ""}`, () => api.get(`/v1/clearances/${encodeURIComponent(change.id)}/records`, { limit: 100 }), 3e4);
  const items = [...first.data?.items ?? [], ...extra];
  const next = cursorOf(after, first.data?.next);
  const more = async () => {
    if (next === null) return;
    setBusy(true);
    try {
      const page = await api.get(`/v1/clearances/${encodeURIComponent(change.id)}/records`, { limit: 100, after: next });
      setExtra((prev) => [...prev, ...page.items]);
      setAfter(typeof page.next === "number" ? page.next : null);
    } finally {
      setBusy(false);
    }
  };
  const pending = nextStep(change);
  const glyphTone = { ok: c.glyphOk, bad: c.glyphBad, warn: "", plain: "" };
  const glyph = (i, tone) => /* @__PURE__ */ jsx("span", { className: `${c.glyph} ${glyphTone[tone]}`, "aria-hidden": true, children: i });
  return /* @__PURE__ */ jsxs(Section, { framed: true, level: 2, "aria-label": "Change history", title: "Change history", meta: /* @__PURE__ */ jsx("span", { className: c.detail, children: "the change's records on the evidence chain" }), count: first.data ? `${items.length} record${items.length === 1 ? "" : "s"}` : void 0, children: [
    first.error && !first.data && /* @__PURE__ */ jsx("div", { className: c.pad, children: /* @__PURE__ */ jsx(TabError, { error: first.failure ?? first.error, what: "the change history", onRetry: first.refresh }) }),
    first.loading && !first.data && /* @__PURE__ */ jsx(PanelSkeleton, { rows: 3, label: "Loading the change history\u2026" }),
    first.data && items.length === 0 && /* @__PURE__ */ jsx(EmptyNote, { inset: true, children: "No records for this change yet." }),
    (items.length > 0 || pending) && /* @__PURE__ */ jsxs("ol", { className: c.timeline, children: [
      items.map((it, i) => {
        const t = TOOL_TEXT[it.tool] ?? { what: "", tone: "plain" };
        const detail = recordDetail(it);
        return /* @__PURE__ */ jsxs("li", { className: c.event, children: [
          /* @__PURE__ */ jsx(Tooltip, { title: dateTime(it.ts), children: /* @__PURE__ */ jsx("span", { className: c.when, children: dateTime(it.ts).slice(5) }) }),
          glyph(i + 1, t.tone),
          /* @__PURE__ */ jsxs("div", { className: c.what, children: [
            /* @__PURE__ */ jsxs("span", { children: [
              /* @__PURE__ */ jsx("b", { className: c.code, children: it.tool }),
              t.what && /* @__PURE__ */ jsxs(Fragment, { children: [
                " \xB7 ",
                t.what
              ] })
            ] }),
            detail && /* @__PURE__ */ jsx("span", { className: c.detail, children: detail })
          ] }),
          /* @__PURE__ */ jsxs(TextLink, { expanded: open === it.seq, "aria-label": `Record seq ${it.seq}`, title: it.hash, onClick: () => setOpen(open === it.seq ? void 0 : it.seq), children: [
            "seq ",
            it.seq.toLocaleString("en-US"),
            " \xB7 ",
            it.hash.slice(0, 6),
            "\u2026",
            it.hash.slice(-2)
          ] }),
          open === it.seq && /* @__PURE__ */ jsx("div", { className: c.raw, children: /* @__PURE__ */ jsx(YamlBlock, { text: JSON.stringify(it.record, null, 2), "aria-label": `Record ${it.seq}`, maxHeight: 320 }) })
        ] }, it.seq);
      }),
      pending && /* @__PURE__ */ jsxs("li", { className: c.event, children: [
        /* @__PURE__ */ jsx("span", { className: c.when, children: "now" }),
        /* @__PURE__ */ jsx("span", { className: `${c.glyph} ${c.glyphWait}`, "aria-hidden": true, children: items.length + 1 }),
        /* @__PURE__ */ jsxs("div", { className: c.what, children: [
          /* @__PURE__ */ jsx("b", { children: pending.title }),
          /* @__PURE__ */ jsx("span", { className: c.detail, children: pending.detail })
        ] }),
        /* @__PURE__ */ jsx("span", {})
      ] })
    ] }),
    next !== null && /* @__PURE__ */ jsx("div", { className: c.pad, children: /* @__PURE__ */ jsx("div", { className: c.actions, children: /* @__PURE__ */ jsx(Button, { small: true, disabled: busy, onClick: more, children: "Load more records" }) }) }),
    /* @__PURE__ */ jsx("div", { className: c.pad, children: /* @__PURE__ */ jsx("span", { className: c.detail, children: "Also recorded when they happen: deploy.revoke (a new head replaces a cleared change), deploy.expire (the TTL passes), deploy.exception (applied with no grant). Each shows here with its seq and hash." }) })
  ] });
}
function noOutcomeText(state) {
  if (state === "holding") return /* @__PURE__ */ jsxs(Fragment, { children: [
    "Nothing to show: the change has not been cleared. An outcome reported now would be recorded as ",
    /* @__PURE__ */ jsx("b", { children: "unattached: not cleared" }),
    " and never attested."
  ] });
  if (state === "cleared") return /* @__PURE__ */ jsx(Fragment, { children: "Not reported yet. The deploy reports an outcome when it applies what was cleared; the signer then attests it." });
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    "None: a ",
    state,
    " change never deploys. An outcome reported for it would be recorded as ",
    /* @__PURE__ */ jsxs("b", { children: [
      "unattached: ",
      state
    ] }),
    ", and neither the change nor an attestation would follow."
  ] });
}
function OutcomePanel({ change }) {
  const c = useStyles();
  const o = change.outcome;
  let body;
  if (!o) {
    const text = noOutcomeText(change.state);
    body = /* @__PURE__ */ jsx(Callout, { tone: "neutral", children: text });
  } else {
    body = /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: c.chips, children: [
        /* @__PURE__ */ jsx(StatusChip, { tone: o.applied ? "ok" : "bad", children: o.applied ? "applied" : "not applied" }),
        /* @__PURE__ */ jsx(StatusChip, { tone: o.matched ? "ok" : "bad", children: o.matched ? "matched the cleared tree" : "did not match the cleared tree" }),
        o.exception !== void 0 && o.exception !== null && /* @__PURE__ */ jsxs(Chip, { tone: "bad", children: [
          "exception seq ",
          o.exception
        ] })
      ] }),
      /* @__PURE__ */ jsxs(FactGrid, { min: 220, children: [
        /* @__PURE__ */ jsx(Fact, { label: "When", children: dateTime(o.at) }),
        o.provider && /* @__PURE__ */ jsx(Fact, { label: "Provider", children: o.provider }),
        (o.digest || o.plan_digest) && /* @__PURE__ */ jsx(Fact, { label: o.plan_digest ? "Plan digest" : "Applied digest", children: /* @__PURE__ */ jsx("span", { className: c.selectable, children: shortDigest(o.plan_digest ?? o.digest) }) }),
        o.release && /* @__PURE__ */ jsx(Fact, { label: "Release", children: /* @__PURE__ */ jsx("span", { className: c.selectable, children: o.release }) }),
        /* @__PURE__ */ jsxs(Fact, { label: "Record", children: [
          "seq ",
          o.seq.toLocaleString("en-US"),
          o.hash ? ` \xB7 ${o.hash.slice(0, 6)}\u2026${o.hash.slice(-2)}` : ""
        ] })
      ] }),
      /* @__PURE__ */ jsx("span", { className: c.detail, children: "The provider reported this outcome. The core did not observe the target." }),
      !o.matched && /* @__PURE__ */ jsx(Callout, { tone: "bad", children: "The outcome did not match what was cleared. It is recorded as an exception, and no attestation follows." })
    ] });
  }
  return /* @__PURE__ */ jsx(Section, { framed: true, level: 2, "aria-label": "Outcome", title: "Outcome", children: /* @__PURE__ */ jsx("div", { className: c.pad, children: body }) });
}
function saveAsFile(text, name) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
function AttestationPanel({ change }) {
  const c = useStyles();
  const api = useClearanceRead();
  const state = attestationState(change);
  const att = change.attestation;
  const config = usePoll("attestation-config", () => api.get("/v1/attestation-config").catch(() => void 0), 0);
  const verifiable = verifiableOf(config);
  const verify = usePoll(
    `attestation-verify-${change.id}-${att?.digest ?? ""}-${verifiable}`,
    () => att && verifiable ? api.get(`/v1/clearances/${encodeURIComponent(change.id)}/attestation/verify`).catch((e) => e instanceof ReadError && e.status === 404 ? void 0 : Promise.reject(e)) : Promise.resolve(void 0),
    0
  );
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState();
  const download = async () => {
    setSaving(true);
    setSaveError(void 0);
    try {
      saveAsFile(await api.getText(`/v1/clearances/${encodeURIComponent(change.id)}/attestation`), `attestation-${change.id}.json`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  const subtitle = /* @__PURE__ */ jsx("span", { className: c.detail, children: "signed statement about this change" });
  let body;
  if (state === "signed" && att) {
    const display = verifyDisplay({ verifiable, answer: verify.data, brief: att.verification });
    const url = rekorUrl(config.data, att.rekor_log_index);
    const commands = (config.data?.verify_commands ?? []).join("\n");
    body = /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsxs("div", { className: c.chips, children: [
        /* @__PURE__ */ jsx(VerifyChip, { display }),
        att.rekor_log_index !== null && /* @__PURE__ */ jsx(Chip, { children: "logged in Rekor" }),
        /* @__PURE__ */ jsxs(Chip, { children: [
          "backend: ",
          att.backend
        ] })
      ] }),
      /* @__PURE__ */ jsxs("span", { className: c.detail, children: [
        "Signed ",
        dateTime(att.created_at),
        ".",
        display.kind === "verified" ? ` Re-checked by Clearance at ${dateTime(display.at)}${display.detail ? ` (${display.detail})` : ""}.` : ""
      ] }),
      display.kind === "recorded" && /* @__PURE__ */ jsx(Callout, { tone: "info", children: display.note }),
      display.kind === "failed" && /* @__PURE__ */ jsx(Callout, { tone: "bad", title: "The signature did not verify", children: display.errors.length ? display.errors.join("; ") : "Clearance reported verified: false." }),
      verify.error && !verify.data && /* @__PURE__ */ jsxs(Callout, { tone: "warn", children: [
        "The check could not run: ",
        verify.error
      ] }),
      /* @__PURE__ */ jsxs(FactGrid, { min: 220, children: [
        /* @__PURE__ */ jsx(Fact, { label: "DSSE digest", children: /* @__PURE__ */ jsx("span", { className: c.selectable, children: att.digest }) }),
        /* @__PURE__ */ jsx(Fact, { label: "Key id", children: /* @__PURE__ */ jsx("span", { className: c.selectable, children: att.key_id || "keyless" }) }),
        /* @__PURE__ */ jsx(Fact, { label: "Rekor log index", children: /* @__PURE__ */ jsx(RekorIndex, { index: att.rekor_log_index, url }) }),
        att.rekor_uuid && /* @__PURE__ */ jsx(Fact, { label: "Rekor uuid", children: /* @__PURE__ */ jsx("span", { className: c.selectable, children: att.rekor_uuid }) }),
        /* @__PURE__ */ jsxs(Fact, { label: "Binds outcome", children: [
          "seq ",
          att.outcome_seq.toLocaleString("en-US")
        ] }),
        /* @__PURE__ */ jsxs(Fact, { label: "Attestation record", children: [
          "seq ",
          att.record_seq.toLocaleString("en-US")
        ] })
      ] }),
      /* @__PURE__ */ jsxs(Callout, { tone: "info", label: "What this proves", children: [
        "Clearance cleared exactly this manifest tree (",
        shortDigest(change.tree_digest),
        ") under policy ",
        change.policy_version,
        change.repo_policy_digest ? " and clearance.yaml" : "",
        ", and a deploy reported applying it, signed",
        att.rekor_log_index !== null ? " and logged" : "",
        " at ",
        dateTime(att.created_at),
        ". It does not prove what the cluster looks like now."
      ] }),
      commands && /* @__PURE__ */ jsxs("div", { children: [
        /* @__PURE__ */ jsx(YamlBlock, { title: "Verify it yourself, offline", text: commands, "aria-label": "Offline verify command", maxHeight: 200 }),
        /* @__PURE__ */ jsx("span", { className: c.detail, children: "Download the bundle first. Placeholders in angle brackets come from your trust root; tools that read a Sigstore bundle read the same file." })
      ] }),
      /* @__PURE__ */ jsxs("div", { className: c.actions, children: [
        /* @__PURE__ */ jsx(Button, { variant: "primary", disabled: saving, onClick: download, children: "Download bundle" }),
        verifiable && /* @__PURE__ */ jsx(Button, { disabled: verify.loading, onClick: verify.refresh, children: "Verify again" })
      ] }),
      saveError && /* @__PURE__ */ jsx(Callout, { tone: "bad", children: saveError })
    ] });
  } else {
    const [chip, tone, text] = {
      "waiting-for-clear": ["not applicable yet", "neutral", "An attestation follows clearing and an applied deploy. Nothing is signed for a holding change."],
      "waiting-for-outcome": ["not yet signed", "warn", "Cleared, and no deploy outcome has been reported. The core signs after the first outcome that applied what was cleared."],
      "not-yet-signed": ["not yet signed", "warn", "The deploy applied what was cleared and no attestation is stored yet: the signer is waiting or retrying, or attestation is off for this Clearance. It appears here when signed."],
      "not-attested": ["not attested", "bad", "The outcome did not apply or did not match the cleared tree, so nothing is signed. The mismatch is an exception on the evidence chain."],
      "not-applicable": ["not applicable", "neutral", "Denied changes are never attested, and neither are expired or superseded ones, changes in exception, or outcomes that did not match the cleared tree."],
      signed: ["signed", "ok", ""]
    }[state];
    body = /* @__PURE__ */ jsxs(Fragment, { children: [
      /* @__PURE__ */ jsx("div", { className: c.chips, children: /* @__PURE__ */ jsx(StatusChip, { tone, dot: tone === "warn", children: chip }) }),
      /* @__PURE__ */ jsx(Callout, { tone: tone === "bad" || tone === "warn" ? tone : "neutral", children: text })
    ] });
  }
  return /* @__PURE__ */ jsx(Section, { framed: true, level: 2, "aria-label": "Attestation", title: "Attestation", meta: subtitle, children: /* @__PURE__ */ jsx("div", { className: c.pad, children: body }) });
}
function ChangeProof({ change }) {
  return /* @__PURE__ */ jsxs(Fragment, { children: [
    /* @__PURE__ */ jsx(ChangeHistory, { change }),
    /* @__PURE__ */ jsx(OutcomePanel, { change }),
    /* @__PURE__ */ jsx(AttestationPanel, { change })
  ] });
}

export { AttestationPanel, ChangeHistory, ChangeProof, NOT_VERIFIABLE_NOTE, OutcomePanel, RekorIndex, VerifyChip, attestationState, cursorOf, nextStep, recordDetail, rekorUrl, saveAsFile, shortDigest, verifiableOf, verifyDisplay };
//# sourceMappingURL=ChangeProof.esm.js.map
