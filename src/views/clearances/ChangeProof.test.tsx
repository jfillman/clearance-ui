import type { ReactElement } from 'react';
import { act, fireEvent, render as rtlRender, type RenderOptions, screen, within } from '@testing-library/react';
import { ClearanceTransportProvider, createFetchTransport } from '../../kit';
import { attestationState, ChangeProof, nextStep, NOT_VERIFIABLE_NOTE, rekorUrl, verifyDisplay } from './ChangeProof';

const base = (over: Record<string, unknown> = {}) => ({
  id: 'ch-1', app: 'gate-api', env: 'prod', tier: 2, state: 'cleared', tree_digest: `sha256:${'e'.repeat(64)}`, policy_version: 'baseline-1', repo_policy_digest: null,
  expires_at: '2026-11-19T13:02:00Z', outcome: null, attestation: null, ...over,
}) as any;
const outcome = (over: Record<string, unknown> = {}) => ({ seq: 48266, hash: '71a9'.padEnd(64, '0'), applied: true, matched: true, at: '2026-11-12T13:15:00Z', provider: 'argocd agent', digest: `sha256:${'e'.repeat(64)}`, release: 'rel-0142', ...over });
const attestation = (over: Record<string, unknown> = {}) => ({ digest: `sha256:${'5'.repeat(64)}`, backend: 'keyless', key_id: 'key-2026-11-a', outcome_seq: 48266, record_seq: 48268, rekor_log_index: 41872035, rekor_uuid: '24296f', created_at: '2026-11-12T13:15:30Z', verification: null, ...over });
const rec = (seq: number, tool: string, over: Record<string, unknown> = {}) => ({ seq, hash: `${seq}`.padEnd(64, 'a'), tool, ts: `2026-11-12T13:${String(seq % 60).padStart(2, '0')}:00Z`, principal: 'user:dana', record: { tool, result: `result of ${tool}` }, ...over });

let config: any;
let verifyAnswer: any;
let records: any[];
const gets: string[] = [];
const mockApis: Record<string, unknown> = {
  'core.discovery': { getBaseUrl: async () => 'http://be/api/clearance' },
  'core.fetch': {
    fetch: async (url: string) => {
      const path = url.replace('http://be/api/clearance', '');
      gets.push(path);
      const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
      if (path.startsWith('/v1/attestation-config')) return ok(config);
      if (path.includes('/attestation/verify')) return verifyAnswer ? ok(verifyAnswer) : { ok: false, status: 404, json: async () => ({ error: 'no trust' }), text: async () => '{"error":"no trust"}' };
      if (path.endsWith('/attestation')) return { ok: true, status: 200, json: async () => ({}), text: async () => '{"mediaType":"bundle"}' };
      if (path.includes('/records')) return ok({ items: records, next: null });
      return { ok: false, status: 404, json: async () => ({ error: 'no' }), text: async () => '{}' };
    },
  },
};
// Everything renders under the fetch transport over this mock fetch, so the views' requests are checked as the wire sees them.
const render = (ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) =>
  rtlRender(ui, {
    wrapper: ({ children }) => (
      <ClearanceTransportProvider transport={createFetchTransport({ fetch: (mockApis['core.fetch'] as any).fetch, url: p => `http://be/api/clearance${p}` })}>{children}</ClearanceTransportProvider>
    ),
    ...options,
  });

const verifiableConfig = { verifiable: true, modes: ['keyless'], rekor_url: 'https://rekor.example', rekor_entry_url: 'https://rekor.example/entry?logIndex={log_index}', identity: 'id', issuer: 'iss', key_ids: ['key-2026-11-a'], verify_commands: ['clearance attest verify --file bundle.json \\', '  --subject sha256:abc'] };
const ok = { verified: true, cached: false, checked_at: '2026-11-12T14:00:00Z', digest: 'd', subject: 's', mode: 'keyless', key_id: 'key-2026-11-a', rekor: { log_index: 41872035, integrated_time: null, verified: true }, errors: [] };

beforeEach(() => {
  config = verifiableConfig;
  verifyAnswer = ok;
  records = [];
  gets.length = 0;
});

async function show(change: any) {
  await act(async () => {
    render(<ChangeProof change={change} />);
  });
}

describe('pure states', () => {
  it('walks a change to its attestation: holding, cleared with no outcome, applied and unsigned, mismatch, signed, denied', () => {
    expect(attestationState(base({ state: 'holding' }))).toBe('waiting-for-clear');
    expect(attestationState(base())).toBe('waiting-for-outcome');
    expect(attestationState(base({ outcome: outcome() }))).toBe('not-yet-signed');
    expect(attestationState(base({ outcome: outcome({ matched: false }) }))).toBe('not-attested');
    expect(attestationState(base({ outcome: outcome({ applied: false }) }))).toBe('not-attested');
    expect(attestationState(base({ outcome: outcome(), attestation: attestation() }))).toBe('signed');
    expect(attestationState(base({ state: 'denied' }))).toBe('not-applicable');
    expect(attestationState(base({ state: 'expired' }))).toBe('not-applicable');
    expect(nextStep(base({ state: 'denied' }))).toBeUndefined();
    expect(nextStep(base({ state: 'holding' }))!.title).toBe('Holding for a person');
  });

  it('shows verified only from an answer with verified true; no trust is signed (recorded), never verified', () => {
    expect(verifyDisplay({ verifiable: true, answer: ok as any }).kind).toBe('verified');
    expect(verifyDisplay({ verifiable: true, answer: { ...ok, verified: false, errors: ['bad sig'] } as any })).toMatchObject({ kind: 'failed', errors: ['bad sig'] });
    expect(verifyDisplay({ verifiable: false })).toEqual({ kind: 'recorded', note: NOT_VERIFIABLE_NOTE });
    expect(verifyDisplay({ verifiable: false, brief: null }).kind).toBe('recorded');
    expect(verifyDisplay({ verifiable: true }).kind).toBe('unchecked');
    expect(verifyDisplay({ verifiable: true, brief: { verified: true, checked_at: 'x' } }).kind).toBe('verified');
    expect(verifyDisplay({ verifiable: true, brief: { verified: false, checked_at: 'x' } }).kind).toBe('failed');
  });

  it('fills the Rekor template and says nothing without one', () => {
    expect(rekorUrl(verifiableConfig, 41872035)).toBe('https://rekor.example/entry?logIndex=41872035');
    expect(rekorUrl(verifiableConfig, null)).toBeUndefined();
    expect(rekorUrl(undefined, 5)).toBeUndefined();
    expect(rekorUrl({ rekor_entry_url: '' }, 5)).toBeUndefined();
  });
});

describe('the change history timeline', () => {
  it('lists the deploy records in order with who, when, seq and short hash, and opens a record', async () => {
    records = [rec(48231, 'deploy.request'), rec(48262, 'deploy.clear')];
    await show(base({ state: 'cleared' }));
    const hist = screen.getByRole('region', { name: 'Change history' });
    const items = within(hist).getAllByRole('listitem');
    expect(items).toHaveLength(3); // two records and the pending step
    expect(items[0].textContent).toContain('deploy.request');
    expect(items[0].textContent).toContain('change registered');
    expect(items[0].textContent).toContain('dana');
    expect(items[0].textContent).toContain('seq 48,231');
    expect(items[0].textContent).toContain('48231a…aa');
    expect(items[1].textContent).toContain('deploy.clear');
    expect(items[2].textContent).toContain('Waiting for a deploy outcome');
    expect(gets.some(g => g.startsWith('/v1/clearances/ch-1/records?limit=100'))).toBe(true);
    fireEvent.click(within(items[0]).getByRole('button', { name: /Record seq 48231/ }));
    expect(within(hist).getByRole('region', { name: 'Record 48231' }).textContent).toContain('result of deploy.request');
  });

  it('says so when a change has no records, and a denied one has no pending step', async () => {
    records = [rec(1, 'deploy.request'), rec(2, 'deploy.deny', { record: { result: 'R014 no receipt' } })];
    await show(base({ state: 'denied' }));
    const hist = screen.getByRole('region', { name: 'Change history' });
    expect(within(hist).getAllByRole('listitem')).toHaveLength(2);
    expect(hist.textContent).toContain('R014 no receipt');
  });
});

describe('outcome and attestation, by state', () => {
  it('holding: no outcome and not applicable yet', async () => {
    await show(base({ state: 'holding' }));
    expect(screen.getByRole('region', { name: 'Outcome' }).textContent).toContain('unattached: not cleared');
    const a = screen.getByRole('region', { name: 'Attestation' });
    expect(a.textContent).toContain('not applicable yet');
    expect(within(a).queryByRole('button', { name: 'Download bundle' })).toBeNull();
  });

  it('cleared and not applied: not yet signed, waiting for an outcome', async () => {
    await show(base());
    expect(screen.getByRole('region', { name: 'Outcome' }).textContent).toContain('Not reported yet');
    const a = screen.getByRole('region', { name: 'Attestation' });
    expect(a.textContent).toContain('not yet signed');
    expect(a.textContent).toContain('no deploy outcome has been reported');
  });

  it('applied but unsigned: not yet signed, the signer is retrying', async () => {
    await show(base({ outcome: outcome() }));
    const o = screen.getByRole('region', { name: 'Outcome' });
    expect(o.textContent).toContain('applied');
    expect(o.textContent).toContain('matched the cleared tree');
    expect(o.textContent).toContain('rel-0142');
    expect(o.textContent).toContain('argocd agent');
    expect(screen.getByRole('region', { name: 'Attestation' }).textContent).toContain('retrying');
  });

  it('an outcome that did not match is not attested and says why', async () => {
    await show(base({ outcome: outcome({ matched: false, exception: 77 }) }));
    expect(screen.getByRole('region', { name: 'Outcome' }).textContent).toContain('did not match');
    expect(screen.getByRole('region', { name: 'Attestation' }).textContent).toContain('not attested');
  });

  it('signed and verifiable: DSSE digest, key, Rekor link, seqs, what it proves, the server command, and verified from the answer', async () => {
    await show(base({ outcome: outcome(), attestation: attestation() }));
    const a = screen.getByRole('region', { name: 'Attestation' });
    expect(a.textContent).toContain('verified');
    expect(a.textContent).not.toContain('signed (recorded)');
    expect(a.textContent).toContain(`sha256:${'5'.repeat(64)}`);
    expect(a.textContent).toContain('key-2026-11-a');
    expect(within(a).getByRole('link', { name: /41,872,035/ }).getAttribute('href')).toBe('https://rekor.example/entry?logIndex=41872035');
    expect(a.textContent).toContain('Binds outcome');
    expect(a.textContent).toContain('seq 48,266');
    expect(a.textContent).toContain('seq 48,268');
    expect(a.textContent).toContain('What this proves');
    expect(within(a).getByRole('region', { name: 'Offline verify command' }).textContent).toContain('clearance attest verify --file bundle.json');
    expect(gets.some(g => g === '/v1/clearances/ch-1/attestation/verify')).toBe(true);
  });

  it('a failed verification is shown as failed with the server\'s reasons, never as verified', async () => {
    verifyAnswer = { ...ok, verified: false, errors: ['signature mismatch'] };
    await show(base({ outcome: outcome(), attestation: attestation() }));
    const a = screen.getByRole('region', { name: 'Attestation' });
    expect(a.textContent).toContain('verification failed');
    expect(a.textContent).toContain('signature mismatch');
    expect(within(a).queryByText('verified')).toBeNull();
  });

  it('no trust configured: signed (recorded) with the note, never verified, and no verify call is made', async () => {
    config = { ...verifiableConfig, verifiable: false, verify_commands: ['clearance attest verify --file b.json'] };
    verifyAnswer = undefined;
    await show(base({ outcome: outcome(), attestation: attestation() }));
    const a = screen.getByRole('region', { name: 'Attestation' });
    expect(a.textContent).toContain('signed (recorded)');
    expect(a.textContent).toContain('no trust configured');
    expect(within(a).queryByText('verified')).toBeNull();
    expect(gets.some(g => g.includes('/verify'))).toBe(false);
    expect(within(a).queryByRole('button', { name: 'Verify again' })).toBeNull();
    expect(a.textContent).toContain('clearance attest verify --file b.json');
  });

  it('denied: no outcome, attestation not applicable', async () => {
    await show(base({ state: 'denied' }));
    expect(screen.getByRole('region', { name: 'Outcome' }).textContent).toContain('a denied change never deploys');
    expect(screen.getByRole('region', { name: 'Attestation' }).textContent).toContain('not applicable');
  });

  it('Download bundle fetches the bundle as served and saves it as a file', async () => {
    const created: Blob[] = [];
    (URL as any).createObjectURL = (b: Blob) => {
      created.push(b);
      return 'blob:x';
    };
    (URL as any).revokeObjectURL = () => undefined;
    const clicked: string[] = [];
    const realClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function fakeClick(this: HTMLAnchorElement) {
      clicked.push(this.download);
    };
    try {
      await show(base({ outcome: outcome(), attestation: attestation() }));
      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: 'Download bundle' }));
      });
      expect(gets).toContain('/v1/clearances/ch-1/attestation');
      expect(clicked).toEqual(['attestation-ch-1.json']);
      expect(await new Response(created[0]).text()).toBe('{"mediaType":"bundle"}');
    } finally {
      HTMLAnchorElement.prototype.click = realClick;
    }
  });
});
