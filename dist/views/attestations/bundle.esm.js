const obj = (v) => v && typeof v === "object" && !Array.isArray(v) ? v : {};
const text = (v) => typeof v === "string" && v ? v : void 0;
function decodeBase64(b64) {
  const std = b64.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
  const bin = atob(std + "=".repeat((4 - std.length % 4) % 4));
  const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}
const signatures0 = (env) => (Array.isArray(env.signatures) ? env.signatures : []).map((s) => ({ keyid: text(obj(s).keyid) }));
function signerKind(hasCert, named) {
  if (hasCert) return "certificate";
  return named ? "key" : "unknown";
}
function decodeAttestation(bundleText) {
  let doc;
  try {
    doc = obj(JSON.parse(bundleText));
  } catch {
    throw new Error("The bundle is not JSON.");
  }
  const env = obj(doc.dsseEnvelope ?? (doc.payload ? doc : void 0));
  const payload = text(env.payload);
  if (!payload) throw new Error("The bundle carries no DSSE envelope payload.");
  let statement;
  try {
    statement = obj(JSON.parse(decodeBase64(payload)));
  } catch {
    throw new Error("The DSSE payload is not a decodable in-toto statement.");
  }
  const material = obj(doc.verificationMaterial);
  const chain = obj(material.x509CertificateChain);
  const hasCert = Boolean(material.certificate) || Array.isArray(chain.certificates) && chain.certificates.length > 0;
  const hint = text(obj(material.publicKey).hint);
  const signatures = signatures0(env);
  const tlog = (Array.isArray(material.tlogEntries) ? material.tlogEntries : []).flatMap((e) => {
    const entry = obj(e);
    const idx = Number(entry.logIndex);
    if (!Number.isFinite(idx)) return [];
    const secs = Number(entry.integratedTime);
    return [{ logIndex: idx, integratedTime: Number.isFinite(secs) && secs > 0 ? new Date(secs * 1e3).toISOString() : void 0 }];
  });
  return {
    payloadType: text(env.payloadType) ?? "",
    statementType: text(statement._type),
    predicateType: text(statement.predicateType),
    subject: (Array.isArray(statement.subject) ? statement.subject : []).map((s) => ({ name: text(obj(s).name) ?? "", digest: Object.fromEntries(Object.entries(obj(obj(s).digest)).filter(([, v]) => typeof v === "string")) })),
    predicate: obj(statement.predicate),
    signatures,
    signerKind: signerKind(hasCert, Boolean(hint) || signatures.some((s) => s.keyid)),
    keyHint: hint ?? signatures.find((s) => s.keyid)?.keyid,
    tlog
  };
}
const str = (v) => typeof v === "string" || typeof v === "number" ? String(v) : "";
function predicateRows(d) {
  const p = d.predicate;
  const clearance = obj(p.clearance);
  const target = obj(p.target);
  const outcome = obj(p.outcome);
  const release = obj(p.release);
  const tree = d.subject[0]?.digest.sha256 ?? Object.values(d.subject[0]?.digest ?? {})[0];
  const approvals = (Array.isArray(p.approvals) ? p.approvals : []).map((a) => {
    const x = obj(a);
    return `${str(x.person) || str(x.sub)}${x.role ? ` (${str(x.role)})` : ""}`;
  });
  const rows = [
    ["Change id", str(clearance.id)],
    ["App", str(target.app)],
    ["Environment", [str(target.env), str(target.cluster)].filter(Boolean).join(" \xB7 ")],
    ["Release id", str(release.id)],
    ["Tree digest", tree ? `sha256:${tree.replace(/^sha256:/, "")}` : ""],
    ["Tier", str(p.tier)],
    ["Cleared by", [str(clearance.cleared_by), approvals.join(", ")].filter(Boolean).join(": ")],
    ["Decided", str(clearance.decided_at)],
    ["Outcome seq", str(outcome.seq)]
  ];
  return rows.filter(([, v]) => v).map(([label, value]) => ({ label, value }));
}
function limitations(d) {
  return Array.isArray(d.predicate.limitations) ? d.predicate.limitations.filter((x) => typeof x === "string") : [];
}

export { decodeAttestation, decodeBase64, limitations, predicateRows };
//# sourceMappingURL=bundle.esm.js.map
