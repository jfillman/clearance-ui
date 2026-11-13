import { TransportError } from '../../src/kit';
import { createShellTransport } from './transport';
import type { WebSession } from './session';

const session: WebSession = { user: 'user:dana', csrf: 'csrf-token-1', expires: '2026-11-13T20:00:00Z', auth_time: '2026-11-13T19:00:00Z', gateway: false };

interface Call { url: string; init?: any }
function setup(answer: (url: string, init?: any) => { status: number; body?: unknown; headers?: Record<string, string> }) {
  const calls: Call[] = [];
  const assigned: string[] = [];
  const fetch = (async (url: string, init?: any) => {
    calls.push({ url, init });
    const a = answer(url, init);
    const headers = a.headers ?? {};
    return {
      ok: a.status >= 200 && a.status < 300,
      status: a.status,
      headers: { get: (k: string) => headers[k] ?? null },
      json: async () => a.body,
      text: async () => (typeof a.body === 'string' ? a.body : JSON.stringify(a.body ?? '')),
    };
  }) as any;
  const shell = createShellTransport({ fetch, navigator: { assign: u => assigned.push(u) }, returnTo: () => '/evidence?app=gate-api' });
  return { shell, calls, assigned };
}
const ok = (url: string) => (url === '/auth/session' ? { status: 200, body: session } : { status: 200, body: { done: true } });

it('reads go to /api/read, with the query, on the same origin and the session cookie, and send no CSRF token', async () => {
  const { shell, calls } = setup(ok);
  await shell.transport.get('/v1/evidence', { app: 'gate-api', limit: 20, empty: '', none: undefined });
  expect(calls).toHaveLength(1);
  expect(calls[0].url).toBe('/api/read/v1/evidence?app=gate-api&limit=20');
  expect(calls[0].init.credentials).toBe('same-origin');
  expect(calls[0].init.headers['X-CSRF-Token']).toBeUndefined();
});

it('every non-GET goes to /api/write with the session\'s CSRF token from /auth/session, fetched once', async () => {
  const { shell, calls } = setup(ok);
  await shell.transport.post('/v1/sessions/s1/freeze', { reason: 'test' });
  await shell.transport.delete('/v1/agents/a1/hold');
  await shell.transport.post('/v1/clearances/c1/clear');
  const sent = calls.filter(c => c.url !== '/auth/session');
  expect(sent.map(c => `${c.init.method} ${c.url}`)).toEqual(['POST /api/write/v1/sessions/s1/freeze', 'DELETE /api/write/v1/agents/a1/hold', 'POST /api/write/v1/clearances/c1/clear']);
  for (const c of sent) expect(c.init.headers['X-CSRF-Token']).toBe('csrf-token-1');
  expect(sent[0].init.headers['Content-Type']).toBe('application/json');
  expect(sent[0].init.body).toBe(JSON.stringify({ reason: 'test' }));
  expect(calls.filter(c => c.url === '/auth/session')).toHaveLength(1);
});

it('a 401 on a read goes to /auth/login with the page to return to, and the page still sees the refusal', async () => {
  const { shell, assigned } = setup(() => ({ status: 401, body: { error: 'sign in' } }));
  await expect(shell.transport.get('/v1/evidence')).rejects.toBeInstanceOf(TransportError);
  expect(assigned).toEqual([`/auth/login?return=${encodeURIComponent('/evidence?app=gate-api')}`]);
});

it('no session at /auth/session sends the person to sign in and a write is not sent without a token', async () => {
  const { shell, calls, assigned } = setup(() => ({ status: 401, body: { error: 'unauthenticated' } }));
  await expect(shell.transport.post('/v1/clearances/c1/clear')).rejects.toMatchObject({ status: 401 });
  expect(assigned).toEqual([`/auth/login?return=${encodeURIComponent('/evidence?app=gate-api')}`]);
  expect(calls.map(c => c.url)).toEqual(['/auth/session']);
});

it('a 401 with X-Clearance-Reauth (a stale sign-in on a write) goes where the header says, and the write is not replayed', async () => {
  const reauth = '/auth/login?reauth=1&max_age=300&return=%2Fclearances';
  const { shell, calls, assigned } = setup(url =>
    url === '/auth/session' ? { status: 200, body: session } : { status: 401, body: { error: 'sign in again', rule: 'DG-AUTH-NOT-FRESH', max_age: '5m0s', age: '47m0s' }, headers: { 'X-Clearance-Reauth': reauth } },
  );
  const err = await shell.transport.post('/v1/clearances/c1/clear').catch(e => e);
  expect(err).toBeInstanceOf(TransportError);
  expect((err as any).body.rule).toBe('DG-AUTH-NOT-FRESH');
  expect(assigned).toEqual([reauth]);
  expect(calls.filter(c => c.url === '/api/write/v1/clearances/c1/clear')).toHaveLength(1);
});

it('never navigates off the server for a reauth header that is not an /auth/ path', async () => {
  const { shell, assigned } = setup(() => ({ status: 401, body: {}, headers: { 'X-Clearance-Reauth': 'https://evil.example/steal' } }));
  await shell.transport.get('/v1/evidence').catch(() => undefined);
  expect(assigned).toEqual([`/auth/login?return=${encodeURIComponent('/evidence?app=gate-api')}`]);
});

it('a refusal that is not a 401 (a 403) is the page\'s to show: no navigation', async () => {
  const { shell, assigned } = setup(() => ({ status: 403, body: { error: 'not yours' } }));
  await expect(shell.transport.post('/v1/clearances/c1/clear')).rejects.toMatchObject({ status: 403 });
  expect(assigned).toEqual([]);
});
