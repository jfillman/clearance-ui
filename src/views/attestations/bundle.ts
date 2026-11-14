// Reading a change attestation for people: the Sigstore bundle `GET /v1/clearances/{id}/attestation` serves, its DSSE
// envelope's payload (base64) decoded to the in-toto statement. Pure and defensive: a bundle from another version, or a
// bare DSSE envelope, still shows what it holds; a field that is absent is absent, never invented. Nothing here checks a
// signature: "verified" comes only from the server's verify answer.

export interface StatementSubject {
  name: string;
  digest: Record<string, string>;
}

export interface DecodedAttestation {
  payloadType: string;
  statementType?: string;
  predicateType?: string;
  subject: StatementSubject[];
  predicate: Record<string, unknown>;
  /** The envelope's signatures: the key id each names, when it names one. */
  signatures: Array<{ keyid?: string }>;
  /** `certificate` when the bundle carries a Fulcio chain (keyless), `key` when it names a key, else `unknown`. */
  signerKind: 'certificate' | 'key' | 'unknown';
  keyHint?: string;
  /** Rekor entries the bundle carries: the log index and the time the log integrated it. */
  tlog: Array<{ logIndex: number; integratedTime?: string }>;
}

const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const text = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/** base64 or base64url to a UTF-8 string. */
export function decodeBase64(b64: string): string {
  const std = b64.replace(/-/g, '+').replace(/_/g, '/').replace(/\s+/g, '');
  const bin = atob(std + '='.repeat((4 - (std.length % 4)) % 4));
  const bytes = Uint8Array.from(bin, ch => ch.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

const signatures0 = (env: Record<string, unknown>): Array<{ keyid?: string }> => (Array.isArray(env.signatures) ? env.signatures : []).map(s => ({ keyid: text(obj(s).keyid) }));

function signerKind(hasCert: boolean, named: boolean): DecodedAttestation['signerKind'] {
  if (hasCert) return 'certificate';
  return named ? 'key' : 'unknown';
}

/** Decodes a bundle (or a bare DSSE envelope) from its JSON text. Throws an Error that says what was wrong. */
export function decodeAttestation(bundleText: string): DecodedAttestation {
  let doc: Record<string, unknown>;
  try {
    doc = obj(JSON.parse(bundleText));
  } catch {
    throw new Error('The bundle is not JSON.');
  }
  const env = obj(doc.dsseEnvelope ?? (doc.payload ? doc : undefined));
  const payload = text(env.payload);
  if (!payload) throw new Error('The bundle carries no DSSE envelope payload.');
  let statement: Record<string, unknown>;
  try {
    statement = obj(JSON.parse(decodeBase64(payload)));
  } catch {
    throw new Error('The DSSE payload is not a decodable in-toto statement.');
  }
  const material = obj(doc.verificationMaterial);
  const chain = obj(material.x509CertificateChain);
  const hasCert = Boolean(material.certificate) || (Array.isArray(chain.certificates) && chain.certificates.length > 0);
  const hint = text(obj(material.publicKey).hint);
  const signatures = signatures0(env);
  const tlog = (Array.isArray(material.tlogEntries) ? material.tlogEntries : []).flatMap(e => {
    const entry = obj(e);
    const idx = Number(entry.logIndex);
    if (!Number.isFinite(idx)) return [];
    const secs = Number(entry.integratedTime);
    return [{ logIndex: idx, integratedTime: Number.isFinite(secs) && secs > 0 ? new Date(secs * 1000).toISOString() : undefined }];
  });
  return {
    payloadType: text(env.payloadType) ?? '',
    statementType: text(statement._type),
    predicateType: text(statement.predicateType),
    subject: (Array.isArray(statement.subject) ? statement.subject : []).map(s => ({ name: text(obj(s).name) ?? '', digest: Object.fromEntries(Object.entries(obj(obj(s).digest)).filter(([, v]) => typeof v === 'string')) as Record<string, string> })),
    predicate: obj(statement.predicate),
    signatures,
    signerKind: signerKind(hasCert, Boolean(hint) || signatures.some(s => s.keyid)),
    keyHint: hint ?? signatures.find(s => s.keyid)?.keyid,
    tlog,
  };
}

export interface PredicateRow {
  label: string;
  value: string;
}

const str = (v: unknown): string => (typeof v === 'string' || typeof v === 'number' ? String(v) : '');

/** The statement's predicate as labelled rows a person reads; a field the predicate does not hold gets no row. */
export function predicateRows(d: Pick<DecodedAttestation, 'subject' | 'predicate'>): PredicateRow[] {
  const p = d.predicate;
  const clearance = obj(p.clearance);
  const target = obj(p.target);
  const outcome = obj(p.outcome);
  const release = obj(p.release);
  const tree = d.subject[0]?.digest.sha256 ?? Object.values(d.subject[0]?.digest ?? {})[0];
  const approvals = (Array.isArray(p.approvals) ? p.approvals : []).map(a => {
    const x = obj(a);
    return `${str(x.person) || str(x.sub)}${x.role ? ` (${str(x.role)})` : ''}`;
  });
  const rows: Array<[string, string]> = [
    ['Change id', str(clearance.id)],
    ['App', str(target.app)],
    ['Environment', [str(target.env), str(target.cluster)].filter(Boolean).join(' · ')],
    ['Release id', str(release.id)],
    ['Tree digest', tree ? `sha256:${tree.replace(/^sha256:/, '')}` : ''],
    ['Tier', str(p.tier)],
    ['Cleared by', [str(clearance.cleared_by), approvals.join(', ')].filter(Boolean).join(': ')],
    ['Decided', str(clearance.decided_at)],
    ['Outcome seq', str(outcome.seq)],
  ];
  return rows.filter(([, v]) => v).map(([label, value]) => ({ label, value }));
}

/** What the statement says it does not establish. */
export function limitations(d: Pick<DecodedAttestation, 'predicate'>): string[] {
  return Array.isArray(d.predicate.limitations) ? d.predicate.limitations.filter((x): x is string => typeof x === 'string') : [];
}
