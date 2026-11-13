import type { ReactNode } from 'react';
import { renderHook } from '@testing-library/react';
import { createFakeTransport } from './fakeTransport';
import { ClearanceTransportProvider, TransportError, useClearanceTransport } from './transport';
import { ReadError, useClearanceRead } from './read';
import { ControlError, useClearanceWrite } from './write';

// eslint-disable-next-line react/display-name
const wrap = (t: ReturnType<typeof createFakeTransport>) => ({ children }: { children?: ReactNode }) => <ClearanceTransportProvider transport={t}>{children}</ClearanceTransportProvider>;

it('a hook outside a provider says so', () => {
  const spy = jest.spyOn(console, 'error').mockImplementation(() => {});
  expect(() => renderHook(() => useClearanceTransport())).toThrow('No ClearanceTransport');
  spy.mockRestore();
});

it('the fake transport records calls, answers 404 for what it does not know, and refuses on request', async () => {
  const t = createFakeTransport(({ path }) => {
    if (path === '/v1/a') return { ok: 1 };
    return path === '/v1/no' ? { refuse: 403, body: { error: 'nope' } } : undefined;
  });
  await expect(t.get('/v1/a', { q: 1 })).resolves.toEqual({ ok: 1 });
  expect(await t.get('/v1/missing').catch((e: any) => e)).toMatchObject({ status: 404 });
  expect(await t.post('/v1/no', {}).catch((e: any) => e)).toBeInstanceOf(TransportError);
  expect(t.calls.map(c => `${c.method} ${c.path}`)).toEqual(['GET /v1/a', 'GET /v1/missing', 'POST /v1/no']);
});

it('reads map a refusal to ReadError with the answer\'s message or the status line', async () => {
  const t = createFakeTransport(({ path }) => {
    if (path === '/v1/a') return { refuse: 403, body: { error: 'not yours' } };
    return path === '/v1/b' ? { refuse: 503 } : '{"error":"x"}';
  });
  const { result } = renderHook(() => useClearanceRead(), { wrapper: wrap(t) });
  const a = await result.current.get<any>('/v1/a').catch((e: any) => e);
  expect(a).toBeInstanceOf(ReadError);
  expect([a.message, a.status]).toEqual(['not yours', 403]);
  expect((await result.current.get<any>('/v1/b').catch((e: any) => e)).message).toBe('/v1/b failed with 503');
  await expect(result.current.getText('/v1/t')).resolves.toBe('{"error":"x"}');
});

it('writes go out as POST or DELETE and a refusal is a ControlError with its rule and hint', async () => {
  const t = createFakeTransport(({ method, path }) => (method === 'POST' && path.endsWith('/freeze') ? { refuse: 403, body: { error: 'denied', rule: 'R9', hint: 'ask an admin' } } : { released: true, agent: 'a' }));
  const { result } = renderHook(() => useClearanceWrite(), { wrapper: wrap(t) });
  await expect(result.current.release('a')).resolves.toEqual({ released: true, agent: 'a' });
  const e = await result.current.freeze('s 1', 'why').catch((x: any) => x);
  expect(e).toBeInstanceOf(ControlError);
  expect(e.refusal).toEqual({ status: 403, error: 'denied', rule: 'R9', hint: 'ask an admin' });
  expect(t.calls).toEqual([
    { method: 'DELETE', path: '/v1/agents/a/hold' },
    { method: 'POST', path: '/v1/sessions/s%201/freeze', body: { reason: 'why' }, headers: undefined },
  ]);
});
