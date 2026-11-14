import { b64, keylessBundle, statement } from './bundleFixture';
import { decodeAttestation, decodeBase64, limitations, predicateRows } from './bundle';

it('decodes base64 and base64url UTF-8', () => {
  expect(decodeBase64(Buffer.from('é→ok', 'utf8').toString('base64'))).toBe('é→ok');
  expect(decodeBase64(b64({ a: '>>>???' }, true))).toBe('{"a":">>>???"}');
});

it('decodes a keyless Sigstore bundle: envelope, statement, certificate signer and the Rekor entry', () => {
  const d = decodeAttestation(keylessBundle());
  expect(d.payloadType).toBe('application/vnd.in-toto+json');
  expect(d.statementType).toBe('https://in-toto.io/Statement/v1');
  expect(d.predicateType).toBe('https://clearance.hangarplatform.dev/change-attestation/v1');
  expect(d.subject[0]).toEqual({ name: 'manifest-tree:example/gitops-gate-api/prod', digest: { sha256: 'c'.repeat(64) } });
  expect(d.signerKind).toBe('certificate');
  expect(d.tlog).toEqual([{ logIndex: 41872035, integratedTime: '2026-11-13T17:15:00.000Z' }]);
  expect(limitations(d)[0]).toContain('(é)');
});

it('labels the predicate fields a person reads', () => {
  const rows = Object.fromEntries(predicateRows(decodeAttestation(keylessBundle())).map(r => [r.label, r.value]));
  expect(rows).toMatchObject({
    'Change id': 'ch-1',
    App: 'gate-api',
    Environment: 'prod · hangar-prod',
    'Release id': 'rel-0142',
    'Tree digest': `sha256:${'c'.repeat(64)}`,
    Tier: '3',
    'Cleared by': 'people: user:erin (owner)',
    'Outcome seq': '42',
  });
});

it('a static-key bundle names the key; a bare DSSE envelope still decodes', () => {
  const keyed = JSON.stringify({ verificationMaterial: { publicKey: { hint: 'key-2026-11-a' } }, dsseEnvelope: { payload: b64(statement), payloadType: 'application/vnd.in-toto+json', signatures: [{ sig: 's', keyid: 'key-2026-11-a' }] } });
  const d = decodeAttestation(keyed);
  expect(d.signerKind).toBe('key');
  expect(d.keyHint).toBe('key-2026-11-a');
  expect(d.tlog).toEqual([]);
  const bare = decodeAttestation(JSON.stringify({ payload: b64(statement), payloadType: 'application/vnd.in-toto+json', signatures: [] }));
  expect(bare.signerKind).toBe('unknown');
  expect(bare.subject).toHaveLength(2);
});

it('says what is wrong with a bundle that cannot be read', () => {
  expect(() => decodeAttestation('not json')).toThrow('not JSON');
  expect(() => decodeAttestation('{}')).toThrow('no DSSE envelope payload');
  expect(() => decodeAttestation(keylessBundle('!!!!'))).toThrow('not a decodable');
});
