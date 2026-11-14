// A real-shaped Sigstore bundle (keyless, Rekor entry) for the decoder's and the views' tests.
export const statement = {
  _type: 'https://in-toto.io/Statement/v1',
  subject: [
    { name: 'manifest-tree:example/gitops-gate-api/prod', digest: { sha256: 'c'.repeat(64) } },
    { name: 'commit:example/gitops-gate-api', digest: { gitCommit: 'a'.repeat(40) } },
  ],
  predicateType: 'https://clearance.hangarplatform.dev/change-attestation/v1',
  predicate: {
    clearance: { id: 'ch-1', cleared_by: 'people', decided_at: '2026-11-12T18:00:00Z' },
    target: { cluster: 'hangar-prod', env: 'prod', app: 'gate-api' },
    tier: 3,
    approvals: [{ sub: 's1', iss: 'i', person: 'user:erin', via: 'tower', role: 'owner', at: '2026-11-12T17:59:00Z' }],
    outcome: { seq: 42, provider: 'argocd', applied: true, matched: true },
    release: { id: 'rel-0142' },
    limitations: ['It attests the decision, not the live state of the target (é).'],
  },
};
export const b64 = (o: unknown, urlSafe = false) => {
  const s = Buffer.from(JSON.stringify(o), 'utf8').toString('base64');
  return urlSafe ? s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') : s;
};
export const keylessBundle = (payload = b64(statement)) =>
  JSON.stringify({
    mediaType: 'application/vnd.dev.sigstore.bundle+json;version=0.2',
    verificationMaterial: {
      x509CertificateChain: { certificates: [{ rawBytes: 'MIIB' }] },
      tlogEntries: [{ logIndex: '41872035', integratedTime: '1794590100', logId: { keyId: 'x' } }],
    },
    dsseEnvelope: { payload, payloadType: 'application/vnd.in-toto+json', signatures: [{ sig: 'MEUC' }] },
  });

