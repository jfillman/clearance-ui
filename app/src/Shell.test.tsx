import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { createFakeTransport } from '../../src';
import { Shell } from './Shell';
import { PAGES } from './TopNav';
import type { WebSession } from './session';

// A smoke render of every page on the fake transport: no network, no cookie. The fake answers 404 for what it does not
// know, so each page also shows it can say "no" without crashing. Pages that need the shell (nav, picker, theme) get it.

const session: WebSession = { user: 'user:dana', csrf: 'x', expires: '2026-11-13T20:00:00Z', auth_time: '2026-11-13T19:00:00Z', gateway: false };

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (q: string) => ({ matches: false, media: q, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
});

const answers = ({ path, query }: { path: string; query?: Record<string, unknown> }) => {
  if (path === '/v1/clearances/counts' && query?.by === 'app') return { items: [{ key: 'gate-api', count: 4 }, { key: 'flight-api', count: 2 }], total: 6 };
  if (path === '/v1/clearances/counts') return { items: [], total: 0 };
  if (path === '/v1/coverage' || path === '/v1/scopes') return { scopes: [] };
  return undefined;
};

async function show(route: string, transport = createFakeTransport(answers)) {
  await act(async () => {
    render(<Shell transport={transport} session={async () => session} router={body => <MemoryRouter initialEntries={[route]}>{body}</MemoryRouter>} />);
  });
  return transport;
}

describe.each(PAGES.map(p => [p.label, p.path]))('%s', (label, path) => {
  it(`renders at ${path} under the top nav, with its own heading`, async () => {
    await show(path);
    expect(screen.getByRole('navigation', { name: 'Clearance pages' })).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1, name: label })).toBeTruthy();
    expect(screen.getByText('user:dana')).toBeTruthy();
  });
});

it('has a link for each of the six pages and nothing else', async () => {
  await show('/evidence');
  const nav = screen.getByRole('navigation', { name: 'Clearance pages' });
  expect(Array.from(nav.querySelectorAll('a')).map(a => a.textContent)).toEqual(['Clearances', 'Evidence', 'Exceptions', 'Attestations', 'Map', 'Policy']);
});

it('the app picker lists the apps Clearance has seen, and keeps the picked app on the nav links', async () => {
  await show('/clearances?app=gate-api');
  const select = screen.getByLabelText('App') as HTMLSelectElement;
  expect(Array.from(select.options).map(o => o.value)).toEqual(['', 'flight-api', 'gate-api']);
  expect(select.value).toBe('gate-api');
  expect(screen.getByRole('link', { name: 'Evidence' }).getAttribute('href')).toBe('/evidence?app=gate-api');
});

it('an unknown path lands on Clearances', async () => {
  await show('/nowhere');
  expect(screen.getByRole('heading', { level: 1, name: 'Clearances' })).toBeTruthy();
});

it('every read the shell makes is a GET', async () => {
  const t = await show('/policy');
  expect(t.calls.length).toBeGreaterThan(0);
  expect(t.calls.every(c => c.method === 'GET')).toBe(true);
});
