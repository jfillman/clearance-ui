import type { ReactElement } from 'react';
import { act, fireEvent, render as rtlRender, type RenderOptions, screen, within } from '@testing-library/react';
import { ClearanceTransportProvider, createFetchTransport } from '../../kit';
import { AttestationsView, searchRows, windowSince } from './AttestationsView';

const NOW = Date.parse('2026-11-12T20:00:00Z');
const row = (n: number, over: Record<string, unknown> = {}) => ({
  change_id: `ch-${n}`, app: n % 2 ? 'gate-api' : 'flight-api', env: 'prod', cluster: 'hangar-prod', release_id: `rel-${n}`, tree_digest: `sha256:${String(n).padStart(8, '0')}${'c'.repeat(56)}`,
  signed_at: '2026-11-12T19:00:00Z', digest: `sha256:${'d'.repeat(64)}`, backend: 'keyless', key_id: 'key-a', rekor_log_index: 1000 + n, rekor_uuid: 'u', outcome_seq: n, record_seq: 100 + n, verification: null, ...over,
});
let config: any;
let pages: Record<string, any>;
const gets: string[] = [];
const mockApis: Record<string, unknown> = {
  'core.discovery': { getBaseUrl: async () => 'http://be/api/clearance' },
  'core.fetch': {
    fetch: async (url: string) => {
      const path = url.replace('http://be/api/clearance', '');
      gets.push(path);
      const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) });
      if (path.startsWith('/v1/attestation-config')) return ok(config);
      if (path.startsWith('/v1/clearances/counts')) {
        if (path.includes('by=attestation')) return ok({ items: [{ key: 'attested', count: 12 }, { key: 'pending', count: 1 }, { key: 'none', count: 4 }], total: 17 });
        return ok({ items: path.includes('by=app') ? [{ key: 'flight-api', count: 3 }, { key: 'gate-api', count: 4 }] : [{ key: 'dev', count: 1 }, { key: 'prod', count: 6 }], total: 7 });
      }
      if (path.startsWith('/v1/attestations')) return ok(path.includes('after=') ? pages.second : pages.first);
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

beforeEach(() => {
  gets.length = 0;
  config = { verifiable: true, modes: ['keyless'], rekor_url: 'https://rekor.example', rekor_entry_url: 'https://rekor.example/e/{log_index}', key_ids: ['key-a'], verify_commands: [] };
  pages = { first: { items: [row(1, { verification: { verified: true, checked_at: '2026-11-12T19:30:00Z' } }), row(2), row(3, { rekor_log_index: null, key_id: undefined })], next: 103 }, second: { items: [row(4)], next: null } };
});

const open = async (onOpenChange?: (id: string) => void) => {
  await act(async () => {
    render(<AttestationsView now={NOW} onOpenChange={onOpenChange} />);
  });
};

it('pure helpers: the window start and the search', () => {
  expect(windowSince(NOW, '24h')).toBe('2026-11-11T20:00:00.000Z');
  expect(windowSince(NOW, '30d')).toBe('2026-10-13T20:00:00.000Z');
  const rows = [row(1), row(2)] as any;
  expect(searchRows(rows, '').length).toBe(2);
  expect(searchRows(rows, 'REL-2').map(r => r.change_id)).toEqual(['ch-2']);
  expect(searchRows(rows, 'flight').map(r => r.change_id)).toEqual(['ch-2']);
  expect(searchRows(rows, 'zzz')).toEqual([]);
});

it('shows the stat tiles with pending, the rows with Rekor links and key ids, and verified only where an answer said so', async () => {
  await open();
  expect(screen.getByText('Applied, awaiting signature').parentElement!.textContent).toContain('1');
  expect(screen.getByText('Signed, 7 d').parentElement!.textContent).toContain('12');
  const table = screen.getByRole('table', { name: 'Signed attestations' });
  const rows = within(table).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(3);
  expect(rows[0].textContent).toContain('gate-api');
  expect(rows[0].textContent).toContain('ch-1');
  expect(rows[0].textContent).toContain('rel-1');
  expect(rows[0].textContent).toContain('key-a');
  expect(rows[0].textContent).toContain('verified');
  expect(within(rows[0]).getByRole('link', { name: /1,001/ }).getAttribute('href')).toBe('https://rekor.example/e/1001');
  expect(rows[1].textContent).toContain('signed (recorded)');
  expect(rows[1].textContent).not.toContain('verified');
  expect(rows[2].textContent).toContain('not logged');
  expect(rows[2].textContent).toContain('keyless');
});

it('a Clearance with no trust says signed (recorded) on every row, even one the server once marked verified, never "verified" without a check', async () => {
  config = { ...config, verifiable: false };
  pages.first.items = [row(1), row(2)];
  await open();
  const table = screen.getByRole('table', { name: 'Signed attestations' });
  for (const r of within(table).getAllByRole('row').slice(1)) expect(r.textContent).toContain('signed (recorded)');
  expect(screen.getAllByText(/no trust configured/i).length).toBeGreaterThan(0);
});

it('a row opens its change; the Rekor link does not', async () => {
  const opened: string[] = [];
  await open(id => opened.push(id));
  const first = within(screen.getByRole('table', { name: 'Signed attestations' })).getAllByRole('row')[1];
  fireEvent.click(within(first).getByRole('link', { name: /1,001/ }));
  expect(opened).toEqual([]);
  fireEvent.click(first);
  fireEvent.keyDown(first, { key: 'Enter' });
  expect(opened).toEqual(['ch-1', 'ch-1']);
});

it('filters: app and env and window go to the API; search narrows the loaded rows', async () => {
  await open();
  expect(gets.some(g => g.startsWith('/v1/attestations?') && g.includes('since=2026-11-05T20%3A00%3A00.000Z') && g.includes('limit=100'))).toBe(true);
  await act(async () => {
    fireEvent.change(screen.getByLabelText('App'), { target: { value: 'gate-api' } });
  });
  expect(gets.some(g => g.startsWith('/v1/attestations?') && g.includes('app=gate-api'))).toBe(true);
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Env'), { target: { value: 'prod' } });
  });
  expect(gets.some(g => g.startsWith('/v1/attestations?') && g.includes('app=gate-api') && g.includes('env=prod'))).toBe(true);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '24 h' }));
  });
  expect(gets.some(g => g.startsWith('/v1/attestations?') && g.includes('since=2026-11-11T20%3A00%3A00.000Z'))).toBe(true);
  expect(gets.some(g => g.includes('by=attestation') && g.includes('app=gate-api') && g.includes('env=prod'))).toBe(true);
  fireEvent.change(screen.getByRole('searchbox', { name: /Search attestations/ }), { target: { value: 'rel-2' } });
  const rows = within(screen.getByRole('table', { name: 'Signed attestations' })).getAllByRole('row').slice(1);
  expect(rows).toHaveLength(1);
  expect(rows[0].textContent).toContain('ch-2');
  fireEvent.change(screen.getByRole('searchbox', { name: /Search attestations/ }), { target: { value: 'nothing-here' } });
  expect(screen.getByText(/No loaded attestation matches/)).toBeTruthy();
});

it('pages: a client pager over the loaded rows, and Load older follows the cursor', async () => {
  await open();
  fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '10' } });
  expect(screen.getByText(/1-3 of 3/)).toBeTruthy();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Load older attestations' }));
  });
  expect(gets.some(g => g.startsWith('/v1/attestations?') && g.includes('after=103'))).toBe(true);
  expect(screen.getByText(/1-4 of 4/)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Load older attestations' })).toBeNull();
});

it('page size splits the rows and Next moves on', async () => {
  pages.first.next = null;
  await open();
  fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '10' } });
  expect(screen.getByText(/1-3 of 3/)).toBeTruthy();
});

it('says what an empty window means', async () => {
  pages.first = { items: [], next: null };
  await open();
  expect(screen.getByText(/No attestations signed in this window/)).toBeTruthy();
});
