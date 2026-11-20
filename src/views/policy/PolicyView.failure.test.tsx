import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ClearanceTransportProvider, createFakeTransport, READ_TIMEOUT_MS, TransportError, type FakeTransport } from '../../kit';
import { PolicyView } from './PolicyView';

// I-5: the Clearance API answered 503 (its database starved during a build) and the page said "Loading…" for good. A
// failed or hung read is an error the person sees, with Retry, and a transient one is retried by itself.

const policy = { rules: [{ id: 'R001', name: 'deny-all', expression: 'true', pack: 'core' }], tools: [], packs: [] };

function view(transport: FakeTransport) {
  return render(<ClearanceTransportProvider transport={transport}><PolicyView now={Date.parse('2026-11-14T00:00:00Z')} /></ClearanceTransportProvider>);
}

const answerOthers = (path: string) => (path.startsWith('/v1/evidence/counts') || path.startsWith('/v1/agents') ? { items: [] } : undefined);
const policyCalls = (t: FakeTransport) => t.calls.filter(c => c.path === '/v1/policy').length;
const tick = (ms: number) => act(async () => { await jest.advanceTimersByTimeAsync(ms); });

describe('a read that fails does not leave the page loading', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('shows the API\'s message on a 503 with a body, and Retry brings the page back', async () => {
    let up = false;
    const policyAnswer = () => (up ? policy : { refuse: 503, body: { error: 'database busy, try again shortly' } });
    const t = createFakeTransport(({ path }) => (path === '/v1/policy' ? policyAnswer() : answerOthers(path)));
    view(t);
    await tick(0);
    const alert = screen.getAllByRole('alert')[0];
    expect(alert.textContent).toContain("Couldn't load the policy");
    expect(alert.textContent).toContain('database busy, try again shortly');
    expect(screen.queryByRole('status', { name: 'Loading…' })).toBeNull();
    // Let the automatic retries run out so Retry is the only way back.
    await tick(60_000);
    expect(policyCalls(t)).toBe(4);
    up = true;
    fireEvent.click(screen.getAllByRole('button', { name: 'Retry' })[0]);
    await tick(0);
    expect(screen.getByText('deny-all')).toBeTruthy();
    expect(screen.queryByText("Couldn't load the policy")).toBeNull();
  });

  it('reads a message the API sent under `message` too, and falls back to the status line without a body', async () => {
    const t = createFakeTransport(({ path }) => (path === '/v1/policy' ? { refuse: 503, body: { message: 'upstream starved' } } : answerOthers(path)));
    view(t);
    await tick(0);
    expect(screen.getAllByRole('alert')[0].textContent).toContain('upstream starved');
    const bare = createFakeTransport(({ path }) => (path === '/v1/policy' ? { refuse: 503 } : answerOthers(path)));
    view(bare);
    await tick(0);
    expect(screen.getAllByRole('alert').some(a => a.textContent?.includes('/v1/policy failed with 503'))).toBe(true);
  });

  it('retries a 503 by itself, honouring Retry-After, and recovers without a click', async () => {
    let n = 0;
    const flaky = () => (++n < 3 ? { refuse: 503, retryAfterMs: 2000 } : policy);
    const t = createFakeTransport(({ path }) => (path === '/v1/policy' ? flaky() : answerOthers(path)));
    view(t);
    await tick(0);
    expect(policyCalls(t)).toBe(1);
    expect(screen.getAllByRole('alert')[0].textContent).toContain("Couldn't load the policy");
    await tick(2000);
    expect(policyCalls(t)).toBe(2);
    await tick(2000);
    expect(screen.getByText('deny-all')).toBeTruthy();
  });

  it('does not retry a refusal that will not change (403)', async () => {
    const t = createFakeTransport(({ path }) => (path === '/v1/policy' ? { refuse: 403, body: { error: 'not yours' } } : answerOthers(path)));
    view(t);
    await tick(0);
    await tick(120_000);
    expect(policyCalls(t)).toBe(1);
    expect(screen.getAllByRole('alert')[0].textContent).toContain('not yours');
  });

  it('shows a network failure as an error with Retry', async () => {
    let up = false;
    const t = createFakeTransport(({ path }) => {
      if (path !== '/v1/policy') return answerOthers(path);
      if (up) return policy;
      throw new TypeError('Failed to fetch');
    });
    view(t);
    await tick(0);
    expect(screen.getAllByRole('alert')[0].textContent).toContain('Clearance could not be reached (Failed to fetch)');
    await tick(60_000);
    up = true;
    fireEvent.click(screen.getAllByRole('button', { name: 'Retry' })[0]);
    await tick(0);
    expect(screen.getByText('deny-all')).toBeTruthy();
  });

  it('gives up on a read that never answers, aborts it, and shows a timeout with Retry', async () => {
    let hang = true;
    const hung = () => (hang ? new Promise(() => {}) : policy);
    const t = createFakeTransport(({ path }) => (path === '/v1/policy' ? hung() : answerOthers(path)));
    view(t);
    await tick(0);
    expect(screen.getByRole('status', { name: 'Loading…' })).toBeTruthy();
    await tick(READ_TIMEOUT_MS);
    expect(t.calls.find(c => c.path === '/v1/policy')!.signal!.aborted).toBe(true);
    expect(screen.getAllByRole('alert')[0].textContent).toContain('/v1/policy did not answer within 30 s');
    expect(screen.queryByRole('status', { name: 'Loading…' })).toBeNull();
    // Out of automatic attempts (each also times out), then the person retries.
    await tick(READ_TIMEOUT_MS * 4 + 60_000);
    hang = false;
    fireEvent.click(screen.getAllByRole('button', { name: 'Retry' })[0]);
    await tick(0);
    expect(screen.getByText('deny-all')).toBeTruthy();
  });

  it('Retry shows loading again rather than the old error', async () => {
    const t = createFakeTransport(({ path }) => (path === '/v1/policy' ? { refuse: 400, body: { error: 'bad' } } : answerOthers(path)));
    view(t);
    await tick(0);
    t.get = () => new Promise(() => {}) as never;
    fireEvent.click(screen.getAllByRole('button', { name: 'Retry' })[0]);
    await tick(0);
    expect(screen.queryByText("Couldn't load the policy")).toBeNull();
    expect(screen.getByRole('status', { name: 'Loading…' })).toBeTruthy();
  });
});

it('a TransportError thrown by a host passes through unchanged as a read error with its status', async () => {
  const t = createFakeTransport(({ path }) => {
    if (path === '/v1/policy') throw new TransportError(path, 502, { error: 'bad gateway' });
    return answerOthers(path);
  });
  view(t);
  await waitFor(() => expect(screen.getAllByRole('alert')[0].textContent).toContain('bad gateway'));
});
