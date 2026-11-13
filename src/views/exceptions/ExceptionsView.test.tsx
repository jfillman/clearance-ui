import type { ReactElement } from 'react';
import { act, fireEvent, render as rtlRender, type RenderOptions, screen, within } from '@testing-library/react';
import { ClearanceTransportProvider, createFetchTransport } from '../../kit';
import { diffSummary, historyOf } from './diff';
import { ExceptionsView, sortRows } from './ExceptionsView';

const NOW = Date.parse('2026-11-12T12:00:00Z');
const item = (seq: number, over: Record<string, unknown> = {}) => ({
  seq, ts: '2026-11-12T10:00:00Z', source: 'cloudtrail', coverage: 'out-of-band-detected', resource: 'sg/web', api: 'AuthorizeSecurityGroupIngress', tier: 2, assessment: null,
  cause: null, resolution: null, resolution_seq: null, resolved_at: null, resolved_by: null, source_verified: true, ...over,
});
let extra = 0;
let resolveNext = false;
const manyItems = () => Array.from({ length: extra }, (_, i) => item(10000 + i, { ts: new Date(Date.parse('2026-11-12T09:00:00Z') - i * 60000).toISOString(), resource: `bulk/${i}` }));
const statement = (state = 'degraded') => ({
  scope: 'acct-1', from: '2026-11-11T12:00:00Z', to: '2026-11-12T12:00:00Z', state, clean: false, truncated: false, text: '',
  cleared_and_verified: { count: 4, by_coverage: {}, items: [], truncated: false },
  seen_not_cleared: { count: 2, by_coverage: { 'out-of-band-detected': 1, 'observed-not-attributed': 1 }, truncated: false, items: [item(9723), item(9724, { coverage: 'observed-not-attributed', resource: 'role/ci', resolution: 'ratified', cause: null, resolved_by: 'user:erin' }), item(9725, { monitoring_protection: true, resource: 'trail/main', coverage: 'out-of-band-detected' }), ...manyItems()] },
  could_not_see: { seconds: 600, audit_gaps: [], segments: [{ source: 'cloudtrail', state: 'degraded', reason: 'reported', from: '2026-11-12T09:30:00Z', to: '2026-11-12T12:00:00Z', seconds: 600, seq: 3 }] },
  health: { sources: [{ source: 'cloudtrail', state: 'degraded', now: 'degraded', stale: false, failed_checks: ['delivery-lag'], last_seq: 3, last_ts: '2026-11-12T11:55:00Z', blind_seconds: 0, degraded_seconds: 600 }] },
  source_integrity: { observations: 3, verified: 3, unverified: 0, verified_by_record: 3, verified_later: 0 },
});
const observations = [
  { seq: 9723, ts: '2026-11-12T10:00:00Z', actor: { subject: 'arn:aws:iam::1:user/dana' }, action: { verb: 'create', api: 'AuthorizeSecurityGroupIngress' }, state_change: { before: { cidr: '10.0.0.0/8', password: 'hunter2' }, after: { cidr: '0.0.0.0/0', password: 'hunter3' } } },
  { seq: 9724, ts: '2026-11-12T10:01:00Z', actor: { subject: 'arn:aws:iam::1:role/ci' }, action: { verb: 'update' } },
];
const resolutions = [
  { seq: 9800, ts: '2026-11-12T11:00:00Z', about: { seq: 9724 }, resolution: { state: 'still-live', note: 'checking' } },
  { seq: 9810, ts: '2026-11-12T11:30:00Z', about: { seq: 9724 }, resolution: { state: 'ratified', by: 'user:default/erin', note: 'approved in CAB-12' } },
];
let admin = true;
let denied = false;
const posts: Array<{ path: string; body: any }> = [];
let postStatus = 200;
// Bulk: seqs the core skips or fails, and the 1-based bulk call that is refused outright (0: none).
let bulkSkip = new Set<number>();
let bulkFail = new Set<number>();
let bulkRefuseCall = 0;
let bulkCalls = 0;
let scopeList = ['acct-1'];
// Resolutions that live under another scope (a gate exception's: the change's cluster).
let otherScopeRes: unknown[] = [];
const mockApis: Record<string, unknown> = {
  'core.discovery': { getBaseUrl: async () => 'http://be/api/clearance' },
  'core.fetch': {
    fetch: async (url: string, init?: { method?: string; body?: string }) => {
      const path = url.replace('http://be/api/clearance', '');
      const j = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });
      if (init?.method === 'POST') {
        posts.push({ path, body: JSON.parse(init.body!) });
        if (path === '/v1/observations/resolutions') {
          bulkCalls += 1;
          if (bulkCalls === bulkRefuseCall) return j(502, { error: 'Clearance did not answer' });
          const b = JSON.parse(init.body!);
          return j(200, {
            batch: `bulk-${bulkCalls}`, state: b.state, cause: b.cause ?? null, note: b.note ?? null, by: 'user:dana', via: null, ts: '2026-11-12T12:00:05Z',
            recorded: b.items.filter((n: number) => !bulkSkip.has(n) && !bulkFail.has(n)).map((n: number) => ({ seq: n, record_seq: 20000 + n, scope: n === 700 ? 'hangar-prod' : 'acct-1' })),
            skipped: b.items.filter((n: number) => bulkSkip.has(n)).map((n: number) => ({ seq: n, reason: 'its newest resolution already says this' })),
            failed: b.items.filter((n: number) => bulkFail.has(n)).map((n: number) => ({ seq: n, error: 'refused' })),
          });
        }
        return postStatus === 200 ? j(200, { seq: 9900, about: 9723, state: 'ratified' }) : j(postStatus, { error: 'only Clearance admins may do this', rule: 'BACKSTAGE-ADMIN' });
      }
      if (path === '/scopes') return j(200, { scopes: scopeList, source: 'config' });
      if (path === '/me') return j(200, { person: 'user:dana', admin });
      if (denied && path.startsWith('/v1/')) return j(403, { error: 'GetCoverage needs your own Clearance sign-in' });
      if (path.startsWith('/v1/coverage')) return j(200, resolveNext ? { ...statement(), seen_not_cleared: { ...statement().seen_not_cleared, items: statement().seen_not_cleared.items.map(i => (i.seq === 9723 ? { ...i, resolution: 'ratified' } : i)) } } : statement());
      if (path.includes('kind=resolution')) return j(200, { items: path.includes('scope=acct-1') ? resolutions : otherScopeRes, next: null });
      if (path.startsWith('/v1/observations')) return j(200, { items: observations, next: null });
      if (path.startsWith('/v1/exceptions')) return j(200, { items: [{ seq: 700, ts: '2026-11-12T08:00:00Z', tool: 'deploy.exception', app: 'gate-api', exception: { kind: 'drift', actor: 'user:x', detail: 'replicas 2 -> 5' } }, { seq: 701, ts: '2026-11-12T08:10:00Z', tool: 'deploy.exception', exception: { kind: 'attempted-refused', actor: 'user:y' } }], next: null });
      return j(404, { error: 'no' });
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

const open = async () => {
  await act(async () => {
    render(<ExceptionsView now={NOW} />);
  });
};

beforeEach(() => {
  admin = true;
  denied = false;
  postStatus = 200;
  scopeList = ['acct-1'];
  otherScopeRes = [];
  extra = 0;
  resolveNext = false;
  posts.length = 0;
  bulkSkip = new Set();
  bulkFail = new Set();
  bulkRefuseCall = 0;
  bulkCalls = 0;
});
afterEach(() => {
  jest.useRealTimers();
});

it('summarises a diff without showing a secret-bearing value, and orders history newest first', () => {
  expect(diffSummary(observations[0] as any)).toBe('create AuthorizeSecurityGroupIngress: cidr: 10.0.0.0/8 → 0.0.0.0/0; password: changed (value withheld)');
  expect(diffSummary({ action: { verb: 'update' } } as any)).toBe('update');
  expect(historyOf(resolutions as any, 9724).map(r => r.seq)).toEqual([9810, 9800]);
});

it('shows redacted values as withheld and says when a whole state change was withheld', () => {
  expect(diffSummary({ action: { verb: 'update', api: 'PutParameter' }, state_change: { before: { value: '[redacted]' }, after: { value: '[redacted]', region: 'us-east-1' } }, redacted: ['state_change'] } as any)).toBe('update PutParameter: region: absent → us-east-1 (secret values withheld)');
  expect(diffSummary({ action: { verb: 'update' }, state_change: { before: 1, after: 2 }, redacted: ['state_change'] } as any)).toBe('update: 1 → 2');
  expect(diffSummary({ redacted: ['state_change'] } as any)).toBe('state change withheld');
});

it('shows the scope banner (degraded, the failing check, since when) and the observations by class with actor and diff', async () => {
  await open();
  const banner = screen.getByRole('region', { name: 'Coverage of acct-1' });
  expect(banner.getAttribute('data-state')).toBe('degraded');
  expect(banner.textContent).toContain('cloudtrail: delivery-lag');
  expect(banner.textContent).toContain('since 3 h ago');
  const table = screen.getByRole('region', { name: 'Seen, not cleared' });
  const row = within(table).getByText('sg/web').closest('tr')!;
  expect(row.textContent).toContain('out-of-band-detected');
  expect(row.textContent).toContain('dana');
  expect(row.textContent).toContain('cidr');
  expect(row.textContent).not.toContain('hunter');
  expect(within(table).getByText('role/ci').closest('tr')!.textContent).toContain('ratified');
});

it('filters by class and unresolved only', async () => {
  await open();
  const table = () => screen.getByRole('region', { name: 'Seen, not cleared' });
  fireEvent.click(within(screen.getByRole('group', { name: 'Class' })).getByText('observed-not-attributed'));
  expect(within(table()).queryByText('sg/web')).toBeNull();
  expect(within(table()).getByText('role/ci')).toBeTruthy();
  fireEvent.click(within(screen.getByRole('group', { name: 'Class' })).getByText('All'));
  fireEvent.click(screen.getByText('Unresolved only'));
  expect(within(table()).queryByText('role/ci')).toBeNull();
  expect(within(table()).getByText('sg/web')).toBeTruthy();
});

it('resolves as an admin: a reverted change needs its cause, the page confirms first, then posts', async () => {
  await open();
  fireEvent.click(within(screen.getByRole('region', { name: 'Seen, not cleared' })).getByText('sg/web').closest('tr')!);
  const detail = screen.getByRole('region', { name: 'Exception detail' });
  fireEvent.change(within(detail).getByLabelText('Resolution state'), { target: { value: 'reverted' } });
  const review = within(detail).getByText('Review resolution…') as HTMLButtonElement;
  expect(review.disabled).toBe(true);
  fireEvent.change(within(detail).getByLabelText('Cause'), { target: { value: 'human-initiated' } });
  fireEvent.change(within(detail).getByLabelText('Note'), { target: { value: 'rolled back by dana' } });
  fireEvent.click(review);
  expect(posts).toHaveLength(0); // confirmation first
  expect(within(detail).getByRole('alertdialog').textContent).toContain('cannot be edited or removed');
  await act(async () => {
    fireEvent.click(within(detail).getByText('Record resolution'));
  });
  expect(posts).toEqual([{ path: '/v1/observations/9723/resolution', body: { state: 'reverted', cause: 'human-initiated', note: 'rolled back by dana' } }]);
});

it('shows the history, hides Resolve for a person who is not an admin, and never offers it on monitoring protection', async () => {
  admin = false;
  await open();
  const table = screen.getByRole('region', { name: 'Seen, not cleared' });
  fireEvent.click(within(table).getByText('role/ci').closest('tr')!);
  const detail = screen.getByRole('region', { name: 'Exception detail' });
  const history = within(detail).getByRole('list', { name: /history/ });
  expect(within(history).getAllByRole('listitem').map(li => li.textContent)[0]).toContain('ratified');
  expect(within(history).getAllByRole('listitem')[1].textContent).toContain('still live');
  expect(detail.textContent).toContain('Only Clearance admins can resolve');
  expect(within(detail).queryByLabelText('Resolution state')).toBeNull();
  admin = true;
});

it('does not offer Resolve on an operation on the monitoring itself, nor on a refused attempt', async () => {
  await open();
  fireEvent.click(within(screen.getByRole('region', { name: 'Seen, not cleared' })).getByText('trail/main').closest('tr')!);
  expect(screen.getByRole('region', { name: 'Exception detail' }).textContent).toContain('never waved through');
  expect(screen.queryByLabelText('Resolution state')).toBeNull();
  fireEvent.click(within(screen.getByRole('region', { name: 'Gate exceptions' })).getByText('attempted-refused').closest('tr')!);
  expect(screen.getByRole('region', { name: 'Exception detail' }).textContent).toContain('nothing to resolve');
  fireEvent.click(within(screen.getByRole('region', { name: 'Gate exceptions' })).getByText('drift').closest('tr')!);
  expect(screen.getByLabelText('Resolution state')).toBeTruthy();
});

it("a core refusal comes back in its own words (admins only)", async () => {
  postStatus = 403;
  await open();
  fireEvent.click(within(screen.getByRole('region', { name: 'Seen, not cleared' })).getByText('sg/web').closest('tr')!);
  fireEvent.click(screen.getByText('Review resolution…'));
  await act(async () => {
    fireEvent.click(screen.getByText('Record resolution'));
  });
  // findBy: the refusal arrives after the write settles, which under a loaded CI run is later than act() waits.
  expect((await screen.findByRole('alert')).textContent).toContain('BACKSTAGE-ADMIN');
  expect(screen.getByRole('alert').textContent).toContain('admins only');
});

it('renders a clear needs-the-release state on 403, not a crash', async () => {
  denied = true;
  await open();
  expect(screen.getAllByRole('alert')[0].textContent).toContain('Needs the Clearance release with person reads');
  expect(screen.getByRole('region', { name: 'Coverage of acct-1' }).getAttribute('data-state')).toBe('unavailable');
});

const seenTable = () => screen.getByRole('region', { name: 'Seen, not cleared' });
const resources = () => within(seenTable()).getAllByRole('row').slice(1).filter(r => r.getAttribute('aria-selected') !== null).map(r => r.querySelectorAll("td")[3].textContent);

it('opens the details directly below the clicked row, one at a time, and collapses on a second click', async () => {
  await open();
  const rowOf = (name: string) => within(seenTable()).getByText(name).closest('tr')!;
  fireEvent.click(rowOf('sg/web'));
  const detail = screen.getByRole('region', { name: 'Exception detail' });
  expect(rowOf('sg/web').nextElementSibling!.contains(detail)).toBe(true); // inside the table, in the next row
  expect(detail.closest('table')).toBe(seenTable().querySelector('table'));
  const toggle = within(rowOf('sg/web')).getByRole('button', { expanded: true });
  expect(toggle).toBeTruthy();
  fireEvent.click(rowOf('role/ci'));
  expect(screen.getAllByRole('region', { name: 'Exception detail' })).toHaveLength(1);
  expect(rowOf('role/ci').nextElementSibling!.contains(screen.getByRole('region', { name: 'Exception detail' }))).toBe(true);
  expect(within(rowOf('sg/web')).getByRole('button', { expanded: false })).toBeTruthy();
  fireEvent.click(within(rowOf('role/ci')).getByRole('button')); // the toggle button itself collapses it
  expect(screen.queryByRole('region', { name: 'Exception detail' })).toBeNull();
});

it('confirms a recorded resolution in an aria-live note that fades away', async () => {
  jest.useFakeTimers();
  await open();
  fireEvent.click(within(seenTable()).getByText('sg/web').closest('tr')!);
  fireEvent.click(screen.getByText('Review resolution…'));
  expect(screen.getByRole('status').textContent).toBe('');
  await act(async () => {
    fireEvent.click(screen.getByText('Record resolution'));
  });
  expect(screen.getByRole('status').getAttribute('aria-live')).toBe('polite');
  expect(screen.getByRole('status').textContent).toBe('Recorded: ratified — sg/web');
  expect(screen.queryByRole('alert')).toBeNull();
  await act(async () => {
    jest.advanceTimersByTime(6000);
  });
  expect(screen.getByRole('status').textContent).toBe('');
});

it('says plainly that a resolution was not recorded when the core refuses it', async () => {
  postStatus = 403;
  await open();
  fireEvent.click(within(seenTable()).getByText('sg/web').closest('tr')!);
  fireEvent.click(screen.getByText('Review resolution…'));
  await act(async () => {
    fireEvent.click(screen.getByText('Record resolution'));
  });
  expect((await screen.findByRole('alert')).textContent).toContain('Not recorded.');
  expect(screen.getByRole('status').textContent).toBe('');
});

it('pages the table: 50 rows by default, a page-size choice, Previous and Next, and the page resets on a new filter', async () => {
  extra = 60; // 63 rows in all
  await open();
  expect(resources()).toHaveLength(50);
  const pager = () => within(seenTable()).getByRole('navigation', { name: 'Seen, not cleared pages' });
  expect(pager().textContent).toContain('1-50 of 63 · page 1 of 2');
  expect((within(pager()).getByText('Previous') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(within(pager()).getByText('Next'));
  expect(resources()).toHaveLength(13);
  expect(pager().textContent).toContain('51-63 of 63 · page 2 of 2');
  expect((within(pager()).getByText('Next') as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(within(pager()).getByLabelText('Rows per page'), { target: { value: '25' } });
  expect(resources()).toHaveLength(25);
  expect(pager().textContent).toContain('1-25 of 63 · page 1 of 3');
  fireEvent.click(within(pager()).getByText('Next'));
  fireEvent.click(screen.getByText('Unresolved only'));
  expect(pager().textContent).toContain('page 1 of');
});

it('sorts newest first by default, and by oldest, severity and resolution state', async () => {
  await open();
  const sortBox = screen.getByLabelText('Sort') as HTMLSelectElement;
  expect(sortBox.value).toBe('newest');
  // the three share a timestamp, so newest first falls back to the higher seq
  expect(resources()).toEqual(['trail/main', 'role/ci', 'sg/web']);
  fireEvent.change(sortBox, { target: { value: 'oldest' } });
  expect(resources()).toEqual(['sg/web', 'role/ci', 'trail/main']);
  fireEvent.change(sortBox, { target: { value: 'severity' } });
  expect(resources()).toEqual(['trail/main', 'sg/web', 'role/ci']); // out-of-band first, observed-not-attributed last
  fireEvent.change(sortBox, { target: { value: 'resolution' } });
  expect(resources()).toEqual(['trail/main', 'sg/web', 'role/ci']); // unresolved first, ratified last
});

it('sortRows orders by time, severity and resolution state, ties newest first', () => {
  const r = (seq: number, ts: string, klass: string, resolution: string | null = null) => ({ seq, ts, klass, resolution }) as any;
  const rows = [r(1, '2026-11-12T01:00:00Z', 'drift', 'ratified'), r(2, '2026-11-12T02:00:00Z', 'out-of-band-detected'), r(3, '2026-11-12T03:00:00Z', 'attempted-refused', 'still-live')];
  const seqs = (x: any[]) => x.map(y => y.seq);
  expect(seqs(sortRows(rows, 'newest'))).toEqual([3, 2, 1]);
  expect(seqs(sortRows(rows, 'oldest'))).toEqual([1, 2, 3]);
  expect(seqs(sortRows(rows, 'severity'))).toEqual([2, 1, 3]);
  expect(seqs(sortRows(rows, 'resolution'))).toEqual([2, 3, 1]);
});

it('keeps the confirmation visible when Unresolved only is on and the resolved row leaves the list', async () => {
  await open();
  fireEvent.click(screen.getByText('Unresolved only'));
  fireEvent.click(within(seenTable()).getByText('sg/web').closest('tr')!);
  fireEvent.click(screen.getByText('Review resolution…'));
  // the refreshed statement now carries the resolution, as the core would return it
  resolveNext = true;
  await act(async () => {
    fireEvent.click(screen.getByText('Record resolution'));
  });
  expect(within(seenTable()).queryByText('sg/web')).toBeNull();
  expect(screen.getByRole('status').textContent).toBe('Recorded: ratified — sg/web');
});

it('searches both tables (actor, resource, class, detail, resolution note), counts matches, closes the drawer and resets the page', async () => {
  extra = 60;
  await open();
  const box = screen.getByLabelText('Search exceptions');
  const gateTable = () => screen.getByRole('region', { name: 'Gate exceptions' });
  fireEvent.click(within(screen.getByRole('navigation', { name: 'Seen, not cleared pages' })).getByText('Next'));
  fireEvent.click(within(seenTable()).getAllByRole('row')[1]); // open a drawer on page 2
  expect(screen.getByRole('region', { name: 'Exception detail' })).toBeTruthy();
  jest.useFakeTimers();
  fireEvent.change(box, { target: { value: 'DRIFT' } }); // class of a gate row, case-insensitive
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
  expect(screen.queryByRole('region', { name: 'Exception detail' })).toBeNull();
  expect(within(seenTable()).queryByText('sg/web')).toBeNull();
  expect(within(gateTable()).getByText('gate-api')).toBeTruthy();
  expect(screen.getByText('1 matches')).toBeTruthy();
  fireEvent.change(box, { target: { value: 'dana' } }); // actor of an observation
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
  expect(resources()).toEqual(['sg/web']);
  expect(within(gateTable()).queryByText('gate-api')).toBeNull();
  fireEvent.change(box, { target: { value: 'approved in CAB-12' } }); // a resolution note
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
  expect(resources()).toEqual(['role/ci']);
  fireEvent.change(box, { target: { value: 'bulk/' } });
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
  expect(within(screen.getByRole('navigation', { name: 'Seen, not cleared pages' })).getByText(/1-50 of 60 · page 1 of 2/)).toBeTruthy(); // back to page one
  fireEvent.click(screen.getByText('Clear'));
  await act(async () => {
    jest.advanceTimersByTime(300);
  });
  expect(screen.queryByText(/matches/)).toBeNull();
});

it("shows a gate exception's resolution history even when it lives under another scope", async () => {
  scopeList = ['acct-1', 'hangar-prod'];
  otherScopeRes = [{ seq: 9900, ts: '2026-11-12T11:40:00Z', scope: 'hangar-prod', about: { seq: 700 }, resolution: { state: 'ratified', by: 'user:default/erin' } }];
  await open();
  fireEvent.click(within(screen.getByRole('region', { name: 'Gate exceptions' })).getByText('drift').closest('tr')!);
  const history = within(screen.getByRole('region', { name: 'Exception detail' })).getByRole('list', { name: /history/ });
  expect(history.textContent).toContain('ratified');
});

it('shows a recorded resolution in the history at once, and never posts the same one twice', async () => {
  await open();
  fireEvent.click(within(seenTable()).getByText('sg/web').closest('tr')!);
  fireEvent.click(screen.getByText('Review resolution…'));
  await act(async () => {
    fireEvent.click(screen.getByText('Record resolution'));
    fireEvent.click(screen.getByText('Record resolution'));
  });
  expect(posts).toHaveLength(1);
  const history = within(screen.getByRole('region', { name: 'Exception detail' })).getByRole('list', { name: /history/ });
  expect(history.textContent).toContain('ratified');
  // The same resolution again: it is already the newest, so nothing is sent.
  fireEvent.click(screen.getByText('Review resolution…'));
  await act(async () => {
    fireEvent.click(screen.getByText('Record resolution'));
  });
  expect(posts).toHaveLength(1);
  expect(screen.getByRole('status').textContent).toContain('Already recorded');
});

// ---- bulk resolution

const pageBox = (title: string) => within(screen.getByRole('region', { name: title })).getByLabelText(`Select all resolvable on this page of ${title}`) as HTMLInputElement;
const rowBox = (title: string, resource: string) => within(within(screen.getByRole('region', { name: title })).getByText(resource).closest('tr')!).getByRole('checkbox') as HTMLInputElement;
const bulkBar = () => screen.getByRole('region', { name: 'Resolve selected' });

it('offers a checkbox on resolvable rows only, and none to a person who is not an admin', async () => {
  await open();
  expect(rowBox('Seen, not cleared', 'sg/web')).toBeTruthy();
  expect(within(within(screen.getByRole('region', { name: 'Seen, not cleared' })).getByText('trail/main').closest('tr')!).queryByRole('checkbox')).toBeNull(); // monitoring protection
  expect(within(within(screen.getByRole('region', { name: 'Gate exceptions' })).getByText('gate-api').closest('tr')!).getByRole('checkbox')).toBeTruthy();
  expect(screen.queryByRole('region', { name: 'Resolve selected' })).toBeNull();
});

it('hides the checkboxes from a person who is not an admin', async () => {
  admin = false;
  await open();
  expect(screen.queryAllByRole('checkbox')).toHaveLength(0);
});

it('selects rows, the page, and all matching the current filters', async () => {
  extra = 60;
  await open();
  fireEvent.click(rowBox('Seen, not cleared', 'sg/web'));
  expect(within(bulkBar()).getByText('1 selected')).toBeTruthy();
  fireEvent.click(rowBox('Seen, not cleared', 'sg/web'));
  expect(screen.queryByRole('region', { name: 'Resolve selected' })).toBeNull();
  // the header box: the 50 resolvable rows of this page (monitoring protection is not selectable)
  fireEvent.click(pageBox('Seen, not cleared'));
  expect(within(bulkBar()).getByText('49 selected')).toBeTruthy();
  // all matching: 62 resolvable observations and the one resolvable gate exception
  fireEvent.click(within(bulkBar()).getByText('Select all 63 matching the current filters'));
  expect(within(bulkBar()).getByText('63 selected')).toBeTruthy();
  expect(within(bulkBar()).queryByText(/Select all/)).toBeNull();
  // a filter starts the selection again
  fireEvent.click(screen.getByText('Unresolved only'));
  expect(screen.queryByRole('region', { name: 'Resolve selected' })).toBeNull();
});

it('selects only what matches the filters when it selects all matching', async () => {
  await open();
  fireEvent.click(within(screen.getByRole('group', { name: 'Class' })).getByText('observed-not-attributed'));
  fireEvent.click(pageBox('Seen, not cleared'));
  expect(within(bulkBar()).getByText('1 selected')).toBeTruthy();
  expect(within(bulkBar()).queryByText(/Select all/)).toBeNull(); // nothing else matches
});

it('reviews before it records: lists what is recorded and what is skipped and why, with the same form', async () => {
  await open();
  fireEvent.click(pageBox('Seen, not cleared'));
  fireEvent.click(pageBox('Gate exceptions'));
  expect(within(bulkBar()).getByText('3 selected')).toBeTruthy(); // 9723, 9724 and the drift exception
  fireEvent.change(within(bulkBar()).getByLabelText('Bulk resolution state'), { target: { value: 'reverted' } });
  const review = within(bulkBar()).getByText('Review 3 resolutions…') as HTMLButtonElement;
  expect(review.disabled).toBe(true); // reverted needs its cause
  fireEvent.change(within(bulkBar()).getByLabelText('Bulk cause'), { target: { value: 'human-initiated' } });
  fireEvent.change(within(bulkBar()).getByLabelText('Bulk note'), { target: { value: 'ticket CAB-9' } });
  fireEvent.click(review);
  expect(posts).toHaveLength(0);
  const dialog = within(bulkBar()).getByRole('alertdialog');
  expect(dialog.textContent).toContain('3 exceptions');
  expect(dialog.textContent).toContain('reverted');
  expect(dialog.textContent).toContain('acct-1');
  expect(dialog.textContent).toContain('destination');
  expect(within(dialog).getByText('Record 3 resolutions')).toBeTruthy();
  // Back returns to the form without posting.
  fireEvent.click(within(dialog).getByText('Back'));
  expect(within(bulkBar()).queryByRole('alertdialog')).toBeNull();
  expect(posts).toHaveLength(0);
});

it("lists a row whose newest resolution already says the same as skipped, and does not send it", async () => {
  await open();
  fireEvent.click(rowBox('Seen, not cleared', 'role/ci')); // newest: ratified, note 'approved in CAB-12'
  fireEvent.click(rowBox('Seen, not cleared', 'sg/web'));
  fireEvent.change(within(bulkBar()).getByLabelText('Bulk note'), { target: { value: 'approved in CAB-12' } });
  fireEvent.click(within(bulkBar()).getByText('Review 2 resolutions…'));
  const dialog = within(bulkBar()).getByRole('alertdialog');
  expect(within(dialog).getByRole('list', { name: 'Skipped resolutions' }).textContent).toContain('seq 9724');
  expect(within(dialog).getByRole('list', { name: 'Skipped resolutions' }).textContent).toContain('already says this');
  await act(async () => {
    fireEvent.click(within(dialog).getByText('Record 1 resolutions'));
  });
  expect(posts).toEqual([{ path: '/v1/observations/resolutions', body: { items: [9723], state: 'ratified', note: 'approved in CAB-12' } }]);
  expect(screen.getByRole('status', { name: 'Bulk resolution result' }).textContent).toContain('Recorded 1 · skipped 1 · failed 0');
});

it('sends a large selection in chunks of 200, reports recorded, skipped and failed, and shows the history at once', async () => {
  extra = 450;
  bulkSkip = new Set([10001]);
  bulkFail = new Set([10002]);
  await open();
  fireEvent.click(pageBox('Seen, not cleared'));
  fireEvent.click(within(bulkBar()).getByText(/Select all \d+ matching/));
  // 452 resolvable observations (9723, 9724 and 450) and the drift exception
  expect(within(bulkBar()).getByText('453 selected')).toBeTruthy();
  fireEvent.change(within(bulkBar()).getByLabelText('Bulk note'), { target: { value: 'clean-up of old exceptions' } });
  fireEvent.click(within(bulkBar()).getByText('Review 453 resolutions…'));
  expect(within(bulkBar()).getByRole('alertdialog').textContent).not.toContain('will be skipped'); // 9724 is ratified, but with another note
  const record = within(bulkBar()).getByText(/Record \d+ resolutions/) as HTMLButtonElement;
  await act(async () => {
    fireEvent.click(record);
    fireEvent.click(record); // a second click while in flight is not a second batch
  });
  const bulk = posts.filter(p => p.path === '/v1/observations/resolutions');
  expect(bulk.map(p => p.body.items.length)).toEqual([200, 200, 53]);
  expect(bulk.every(p => p.body.state === 'ratified' && p.body.note === 'clean-up of old exceptions')).toBe(true);
  expect(new Set(bulk.flatMap(p => p.body.items)).size).toBe(bulk.reduce((n, p) => n + p.body.items.length, 0)); // no seq twice
  const result = screen.getByRole('status', { name: 'Bulk resolution result' });
  expect(result.textContent).toContain('Recorded 451 · skipped 1 · failed 1');
  expect(within(result).getByRole('list', { name: 'Failed resolutions' }).textContent).toContain('seq 10002: refused');
  // settled items leave the selection; the failed one stays selected to try again
  expect(within(bulkBar()).getByText('1 selected')).toBeTruthy();
  expect(bulkCalls).toBe(3);
});

it('keeps the unsent chunks selected and names them when a chunk is refused', async () => {
  extra = 250;
  bulkRefuseCall = 2;
  await open();
  fireEvent.click(pageBox('Seen, not cleared'));
  fireEvent.click(within(bulkBar()).getByText(/Select all \d+ matching/));
  fireEvent.click(within(bulkBar()).getByText(/Review \d+ resolutions…/));
  await act(async () => {
    fireEvent.click(within(bulkBar()).getByText(/Record \d+ resolutions/));
  });
  const result = screen.getByRole('status', { name: 'Bulk resolution result' });
  expect(result.textContent).toContain('Recorded 200');
  expect(result.textContent).toContain('failed 53'); // 253 selected: 200 recorded, the second chunk (53) refused
  expect(result.textContent).toContain('Clearance did not answer');
  expect(posts.filter(p => p.path === '/v1/observations/resolutions')).toHaveLength(2);
});
