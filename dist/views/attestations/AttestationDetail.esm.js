import { jsxs, jsx, Fragment } from 'react/jsx-runtime';
import { useState, useEffect } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { dateTime } from '../../kit/format.esm.js';
import { usePoll } from '../../kit/usePoll.esm.js';
import { Section, Chip, Callout, PanelSkeleton, FactGrid, Fact, YamlBlock, Button, TextLink } from '../../kit/kit.esm.js';
import '../../kit/components.esm.js';
import '../../kit/FlightLog.esm.js';
import '../../kit/transport.esm.js';
import { useClearanceRead, ReadError } from '../../kit/read.esm.js';
import '../../kit/coverage.esm.js';
import '../../kit/Pager.esm.js';
import '../../kit/kitStyles.esm.js';
import '../../kit/ExpandRow.esm.js';
import { verifiableOf, verifyDisplay, rekorUrl, VerifyChip, RekorIndex, ChangeHistory, saveAsFile } from '../clearances/ChangeProof.esm.js';
import { decodeAttestation, predicateRows, limitations } from './bundle.esm.js';

const useStyles = makeStyles(() => ({
  stack: { display: "flex", flexDirection: "column", gap: 16, padding: 12 },
  pad: { padding: "12px 18px", display: "flex", flexDirection: "column", gap: 12 },
  chips: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" },
  actions: { display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center" },
  selectable: { userSelect: "text", overflowWrap: "anywhere" },
  list: { margin: 0, paddingLeft: 18 }
}));
function AttestationDetail({ row, onOpenChange }) {
  const c = useStyles();
  const api = useClearanceRead();
  const id = encodeURIComponent(row.change_id);
  const config = usePoll("attestation-config", () => api.get("/v1/attestation-config").catch(() => void 0), 0);
  const verifiable = verifiableOf(config);
  const change = usePoll(`clearance-${row.change_id}`, () => api.get(`/v1/clearances/${id}`).catch(() => void 0), 3e4);
  const verify = usePoll(
    `attestation-verify-${row.change_id}-${row.digest}-${verifiable}`,
    () => verifiable ? api.get(`/v1/clearances/${id}/attestation/verify`).catch((e) => e instanceof ReadError && e.status === 404 ? void 0 : Promise.reject(e)) : Promise.resolve(void 0),
    0
  );
  const [bundle, setBundle] = useState();
  const [saveError, setSaveError] = useState();
  useEffect(() => {
    let live = true;
    setBundle(void 0);
    api.getText(`/v1/clearances/${id}/attestation`).then(
      (t) => {
        if (!live) return;
        try {
          setBundle({ text: t, decoded: decodeAttestation(t) });
        } catch (e) {
          setBundle({ text: t, error: e instanceof Error ? e.message : String(e) });
        }
      },
      (e) => live && setBundle({ text: "", error: e instanceof Error ? e.message : String(e) })
    );
    return () => {
      live = false;
    };
  }, [api, id, row.digest]);
  const d = bundle?.decoded;
  const display = verifyDisplay({ verifiable, answer: verify.data, brief: row.verification });
  const index = d?.tlog[0]?.logIndex ?? row.rekor_log_index;
  const integrated = d?.tlog[0]?.integratedTime ?? verify.data?.rekor.integrated_time ?? void 0;
  const url = rekorUrl(config.data, index);
  const commands = (config.data?.verify_commands ?? []).join("\n");
  const keyId = verify.data?.key_id ?? d?.keyHint ?? row.key_id;
  const identity = verify.data?.identity ?? config.data?.identity;
  const issuer = verify.data?.issuer ?? config.data?.issuer;
  const keyless = d ? d.signerKind === "certificate" : !row.key_id;
  const download = () => {
    if (!bundle?.text) return;
    try {
      saveAsFile(bundle.text, `attestation-${row.change_id}.json`);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  };
  const rows = d ? predicateRows(d) : [];
  const said = d ? limitations(d) : [];
  const first = d?.subject[0];
  return /* @__PURE__ */ jsxs("div", { className: c.stack, children: [
    /* @__PURE__ */ jsx(Section, { framed: true, "aria-label": "Attestation detail", title: `${row.app} \xB7 ${row.env}`, meta: /* @__PURE__ */ jsx(VerifyChip, { display }), count: /* @__PURE__ */ jsx("span", { className: c.selectable, children: row.change_id }), children: /* @__PURE__ */ jsxs("div", { className: c.pad, children: [
      /* @__PURE__ */ jsxs("div", { className: c.chips, children: [
        /* @__PURE__ */ jsxs(Chip, { children: [
          "backend: ",
          row.backend
        ] }),
        index !== null && index !== void 0 && /* @__PURE__ */ jsx(Chip, { children: "logged in Rekor" })
      ] }),
      display.kind === "verified" && /* @__PURE__ */ jsxs(Callout, { tone: "ok", children: [
        "Clearance re-checked the signature at ",
        dateTime(display.at),
        display.detail ? ` (${display.detail})` : "",
        "."
      ] }),
      display.kind === "recorded" && /* @__PURE__ */ jsx(Callout, { tone: "info", children: display.note }),
      display.kind === "failed" && /* @__PURE__ */ jsx(Callout, { tone: "bad", title: "The signature did not verify", children: display.errors.length ? display.errors.join("; ") : "Clearance reported verified: false." }),
      verify.error && !verify.data && /* @__PURE__ */ jsxs(Callout, { tone: "warn", children: [
        "The check could not run: ",
        verify.error
      ] })
    ] }) }),
    /* @__PURE__ */ jsx(Section, { framed: true, level: 2, "aria-label": "Signed statement", title: "Signed statement", meta: /* @__PURE__ */ jsx("span", { className: c.selectable, children: "in-toto, decoded from the DSSE bundle" }), children: /* @__PURE__ */ jsxs("div", { className: c.pad, children: [
      !bundle && /* @__PURE__ */ jsx(PanelSkeleton, { rows: 3, label: "Loading the bundle\u2026" }),
      bundle?.error && /* @__PURE__ */ jsx(Callout, { tone: "bad", title: "The bundle could not be read", children: bundle.error }),
      d && /* @__PURE__ */ jsxs(Fragment, { children: [
        /* @__PURE__ */ jsxs(FactGrid, { min: 260, children: [
          /* @__PURE__ */ jsx(Fact, { label: "Payload type", children: /* @__PURE__ */ jsx("span", { className: c.selectable, children: d.payloadType || "\u2014" }) }),
          /* @__PURE__ */ jsx(Fact, { label: "Predicate type", children: /* @__PURE__ */ jsx("span", { className: c.selectable, children: d.predicateType || "\u2014" }) }),
          first && /* @__PURE__ */ jsx(Fact, { label: "Subject", children: /* @__PURE__ */ jsx("span", { className: c.selectable, children: first.name }) }),
          first && Object.entries(first.digest).map(([alg, v]) => /* @__PURE__ */ jsx(Fact, { label: `Subject digest (${alg})`, children: /* @__PURE__ */ jsx("span", { className: c.selectable, children: v }) }, alg))
        ] }),
        /* @__PURE__ */ jsx(FactGrid, { min: 260, children: rows.map((r) => /* @__PURE__ */ jsx(Fact, { label: r.label, children: /* @__PURE__ */ jsx("span", { className: c.selectable, children: r.value }) }, r.label)) }),
        said.length > 0 && /* @__PURE__ */ jsx(Callout, { tone: "info", label: "What this does not establish", children: /* @__PURE__ */ jsx("ul", { className: c.list, children: said.map((l) => /* @__PURE__ */ jsx("li", { children: l }, l)) }) })
      ] })
    ] }) }),
    /* @__PURE__ */ jsx(Section, { framed: true, level: 2, "aria-label": "Signer and log entry", title: "Signer and log entry", children: /* @__PURE__ */ jsxs("div", { className: c.pad, children: [
      /* @__PURE__ */ jsxs(FactGrid, { min: 260, children: [
        /* @__PURE__ */ jsx(Fact, { label: "Signed", children: dateTime(row.signed_at) }),
        keyless ? /* @__PURE__ */ jsxs(Fragment, { children: [
          /* @__PURE__ */ jsx(Fact, { label: "Signer", children: "keyless (Fulcio certificate in the bundle)" }),
          identity && /* @__PURE__ */ jsx(Fact, { label: "Certificate identity", children: /* @__PURE__ */ jsx("span", { className: c.selectable, children: identity }) }),
          issuer && /* @__PURE__ */ jsx(Fact, { label: "Certificate issuer", children: /* @__PURE__ */ jsx("span", { className: c.selectable, children: issuer }) })
        ] }) : /* @__PURE__ */ jsx(Fact, { label: "Key id", children: /* @__PURE__ */ jsx("span", { className: c.selectable, children: keyId || "\u2014" }) }),
        /* @__PURE__ */ jsx(Fact, { label: "Rekor log index", children: index === null || index === void 0 ? "not logged" : /* @__PURE__ */ jsx(RekorIndex, { index, url }) }),
        integrated && /* @__PURE__ */ jsx(Fact, { label: "Log integrated", children: dateTime(integrated) }),
        row.rekor_uuid && /* @__PURE__ */ jsx(Fact, { label: "Rekor uuid", children: /* @__PURE__ */ jsx("span", { className: c.selectable, children: row.rekor_uuid }) }),
        /* @__PURE__ */ jsx(Fact, { label: "DSSE digest", children: /* @__PURE__ */ jsx("span", { className: c.selectable, children: row.digest }) })
      ] }),
      keyless && !verify.data && (identity || issuer) && /* @__PURE__ */ jsx("span", { className: c.selectable, children: "The identity shown is the one this Clearance trusts; the server verify confirms the certificate matches it." })
    ] }) }),
    change.data ? /* @__PURE__ */ jsx(ChangeHistory, { change: change.data }) : /* @__PURE__ */ jsx(PanelSkeleton, { rows: 2, label: "Loading the change history\u2026" }),
    /* @__PURE__ */ jsx(Section, { framed: true, level: 2, "aria-label": "Verify and download", title: "Verify it yourself", children: /* @__PURE__ */ jsxs("div", { className: c.pad, children: [
      commands && /* @__PURE__ */ jsx(YamlBlock, { title: "Offline verify command", text: commands, "aria-label": "Offline verify command", maxHeight: 200 }),
      /* @__PURE__ */ jsxs("div", { className: c.actions, children: [
        /* @__PURE__ */ jsx(Button, { variant: "primary", disabled: !bundle?.text, onClick: download, children: "Download bundle" }),
        verifiable && /* @__PURE__ */ jsx(Button, { disabled: verify.loading, onClick: verify.refresh, children: "Verify again" }),
        onOpenChange && /* @__PURE__ */ jsx(TextLink, { onClick: () => onOpenChange(row.change_id), children: "Open the change in Clearances" })
      ] }),
      saveError && /* @__PURE__ */ jsx(Callout, { tone: "bad", children: saveError })
    ] }) })
  ] });
}

export { AttestationDetail };
//# sourceMappingURL=AttestationDetail.esm.js.map
