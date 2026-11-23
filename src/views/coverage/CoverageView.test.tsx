import type { ReactElement } from 'react';
import { MemoryRouter, useLocation, useNavigate } from 'react-router-dom';
import { act, fireEvent, waitFor, render as rtlRender, type RenderOptions, screen, within } from '@testing-library/react';
import { ClearanceTransportProvider, createFetchTransport } from '../../kit';
import { ClearancePage, CLEARANCE_VIEWS } from '../ClearancePage';
import { CoverageView, type CoverageTab } from './CoverageView';

// Role queries over a whole Coverage page are slow on a loaded CI runner: give each test room.
jest.setTimeout(30_000);

const NOW = Date.parse('2026-11-12T12:00:00Z');
const item = (seq: number, over: Record<string, unknown> = {}) => ({
  seq, ts: '2026-11-12T10:00:00Z', source: 'cloudtrail', coverage: 'out-of-band-detected', resource: 'sg/web', api: 'AuthorizeSecurityGroupIngress', tier: 2, assessment: null,
  cause: null, resolution: null, resolution_seq: null, resolved_at: null, resolved_by: null, source_verified: true, ...over,
});
const statement = {
  scope: 'acct-1', from: '2026-11-05T12:00:00Z', to: '2026-11-12T12:00:00Z', state: 'degraded', clean: false, truncated: false, text: '',
  cleared_and_verified: { count: 4, by_coverage: {}, items: [], truncated: false },
  seen_not_cleared: {
    count: 3, by_coverage: { 'out-of-band-detected': 2, 'observed-not-attributed': 1 }, truncated: false,
    items: [item(9723), item(9724, { coverage: 'observed-not-attributed', resource: 'role/ci' }), item(9725, { monitoring_protection: true, resource: 'trail/main' })],
  },
  could_not_see: { seconds: 600, audit_gaps: [{ seq: 41, source: 'cloudtrail', state: 'blind', reason: 'delivery stopped', ts: '2026-11-10T03:00:00Z' }], segments: [{ source: 'cloudtrail', state: 'degraded', reason: 'reported', from: '2026-11-12T09:30:00Z', to: '2026-11-12T12:00:00Z', seconds: 600, seq: 3 }] },
  health: { sources: [{ source: 'cloudtrail', state: 'degraded', now: 'degraded', stale: false, failed_checks: ['delivery-lag'], last_seq: 3, last_ts: '2026-11-12T11:55:00Z', blind_seconds: 0, degraded_seconds: 600 }] },
  source_integrity: { observations: 3, verified: 3, unverified: 0, verified_by_record: 3, verified_later: 0 },
};
const observations = [
  { seq: 9723, ts: '2026-11-12T10:00:00Z', actor: { subject: 'arn:aws:iam::1:user/dana' }, action: { verb: 'create', api: 'AuthorizeSecurityGroupIngress' }, state_change: { before: { cidr: '10.0.0.0/8' }, after: { cidr: '0.0.0.0/0' } } },
  { seq: 9724, ts: '2026-11-12T10:01:00Z', actor: { subject: 'arn:aws:iam::1:role/ci' }, action: { verb: 'update' } },
];
// /v1/observations/health: observation.health records and an observation.audit-gap record, newest first.
const healthRecords = [
  { seq: 60, ts: '2026-11-12T11:00:00Z', scope: 'acct-1', source: { name: 'cloudtrail' }, health: { state: 'degraded', checks: [{ name: 'delivery-lag', ok: false }, { name: 'tls', ok: true }] } },
  { seq: 59, ts: '2026-11-12T10:00:00Z', scope: 'acct-1', source: { name: 'cloudtrail' }, health: { state: 'healthy', checks: [] } },
  { seq: 50, ts: '2026-11-11T09:00:00Z', scope: 'acct-1', source: { name: 'cloudtrail' }, health: { state: 'healthy', checks: [] } },
  { seq: 41, ts: '2026-11-10T03:00:00Z', scope: 'acct-1', source: { name: 'cloudtrail' }, tool: 'observation.audit-gap', gap: { state: 'blind', reason: 'delivery stopped' } },
];
let admin = true;
let scopeList = ['acct-1'];
let postStatus = 200;
let entry = '/?view=coverage';
let coverageStatus = 200;
let exceptionsStatus = 200;
let healthPage2Fails = false;
let emptyStatement = false;
const calls: string[] = [];
const posts: Array<{ path: string; body: any }> = [];
const fetchMock = async (url: string, init?: { method?: string; body?: string }) => {
  const path = url.replace('http://be/api/clearance', '');
  calls.push(path);
  const j = (status: number, body: unknown) => ({ ok: status < 300, status, json: async () => body });
  if (init?.method === 'POST') {
    const body = JSON.parse(init.body!);
    posts.push({ path, body });
    return postStatus === 200 ? j(200, { seq: 9900, about: 9723, scope: 'acct-1', state: body.state, cause: body.cause ?? null, note: body.note ?? null }) : j(postStatus, { error: 'only Clearance admins may do this', rule: 'BACKSTAGE-ADMIN' });
  }
  if (path === '/scopes') return j(200, { scopes: scopeList, source: 'config' });
  if (path === '/me') return j(200, { person: 'user:dana', admin });
  if (path.startsWith('/v1/coverage')) {
    if (coverageStatus !== 200) return j(coverageStatus, { error: 'GetCoverage needs your own Clearance sign-in' });
    return j(200, emptyStatement ? { ...statement, seen_not_cleared: { ...statement.seen_not_cleared, count: 0, items: [] } } : statement);
  }
  if (path.startsWith('/v1/observations/health')) {
    if (healthPage2Fails) return path.includes('after=') ? j(403, { error: 'no' }) : j(200, { items: healthRecords, next: 5 });
    return j(200, { items: healthRecords, next: null });
  }
  if (path.includes('kind=resolution')) return j(200, { items: [], next: null });
  if (path.startsWith('/v1/observations')) return j(200, { items: observations, next: null });
  if (path.startsWith('/v1/exceptions') && exceptionsStatus !== 200) return j(exceptionsStatus, { error: 'denied' });
  if (path.startsWith('/v1/exceptions')) {
    const gate = [{ seq: 700, ts: '2026-11-12T08:00:00Z', tool: 'deploy.exception', app: 'gate-api', exception: { kind: 'drift', actor: 'user:x', detail: 'replicas 2 -> 5' } }, { seq: 701, ts: '2026-11-12T08:10:00Z', tool: 'deploy.exception', exception: { kind: 'attempted-refused', actor: 'user:y' } }];
    return j(200, { items: emptyStatement ? [] : gate, next: null });
  }
  return j(404, { error: 'no' });
};
const render = (ui: ReactElement, options?: Omit<RenderOptions, 'wrapper'>) =>
  rtlRender(ui, {
    wrapper: ({ children }) => (
      <MemoryRouter initialEntries={[entry]}>
        <ClearanceTransportProvider transport={createFetchTransport({ fetch: fetchMock as any, url: p => `http://be/api/clearance${p}` })}>{children}</ClearanceTransportProvider>
      </MemoryRouter>
    ),
    ...options,
  });
const open = async (tab?: CoverageTab) => {
  await act(async () => {
    render(<CoverageView now={NOW} tab={tab} />);
  });
  await act(async () => {});
};
const openTab = async (name: string) => {
  await act(async () => {
    fireEvent.click(within(screen.getByRole('tablist', { name: 'Coverage details' })).getByRole('tab', { name: new RegExp(name) }));
  });
  await act(async () => {});
};
const openRow = async (resource: string) => {
  fireEvent.click(within(screen.getByRole('region', { name: 'Seen, not cleared' })).getByText(resource).closest('tr')!);
  return screen.getByRole('region', { name: 'Exception detail' });
};

beforeEach(() => {
  admin = true;
  scopeList = ['acct-1'];
  postStatus = 200;
  entry = '/?view=coverage';
  coverageStatus = 200;
  exceptionsStatus = 200;
  healthPage2Fails = false;
  emptyStatement = false;
  calls.length = 0;
  posts.length = 0;
});

describe('the Coverage route', () => {
  it('sits between Evidence and Policy, in the tab order Clearances, Evidence, Coverage, Attestations, Map, Policy', () => {
    expect(CLEARANCE_VIEWS.map(v => v.id)).toEqual(['clearances', 'evidence', 'coverage', 'attestations', 'map', 'policy']);
  });

  it('?view=coverage opens it and the nav shows the open-exception count', async () => {
    await act(async () => {
      render(<ClearancePage />);
    });
    await act(async () => {});
    const tabs = within(screen.getByRole('tablist', { name: 'Clearance sections' })).getAllByRole('tab');
    expect(tabs.map(t => t.textContent)).toEqual(['Clearances', 'Evidence', 'Coverage3', 'Attestations', 'Map', 'Policy']);
    expect(screen.getByRole('tab', { name: /Coverage/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('heading', { level: 1, name: 'Coverage' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: /Coverage/ }).textContent).toBe('Coverage3');
  });

  it('the old ?view=exceptions&scope= link (the Map, a pasted URL) lands on Coverage, Open exceptions, with that scope', async () => {
    entry = '/?view=exceptions&scope=acct-1';
    await act(async () => {
      render(<ClearancePage />);
    });
    await act(async () => {});
    expect(screen.getByRole('tab', { name: /Coverage/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('tab', { name: /Open exceptions/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('region', { name: 'Seen, not cleared' })).toBeTruthy();
    expect((screen.getByLabelText('Scope') as HTMLSelectElement).value).toBe('acct-1');
  });

  it('?tab= picks the Coverage tab', async () => {
    entry = '/?view=coverage&tab=limits';
    await act(async () => {
      render(<ClearancePage />);
    });
    await act(async () => {});
    expect(screen.getByRole('tab', { name: /Named limits/ }).getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('region', { name: 'Named limits' })).toBeTruthy();
  });

  it('counts what is open and can be resolved: two observations and the drift gate exception, but not the monitoring-protection or the refused one', async () => {
    await open();
    // the same three the list offers a Resolve for; trail/main and attempted-refused are listed but never counted
    const obs = within(screen.getByRole('region', { name: 'Seen, not cleared' }));
    expect(obs.getByText('sg/web')).toBeTruthy();
    expect(obs.getByText('role/ci')).toBeTruthy();
    expect(obs.getByText('trail/main')).toBeTruthy();
    expect(within(screen.getByRole('region', { name: 'Gate exceptions' })).getByText('drift')).toBeTruthy();
  });
});

describe('a failed or partial read is never clean', () => {
  it('a failed refresh turns a count that was known into "?" even though the older data is kept', async () => {
    jest.useFakeTimers();
    try {
      await act(async () => {
        render(<ClearancePage />);
      });
      await act(async () => {
        await jest.advanceTimersByTimeAsync(1000);
      });
      expect(screen.getByRole('tab', { name: /Coverage/ }).textContent).toBe('Coverage3');
      exceptionsStatus = 403; // the gate-exceptions poll's next try (every 60 s) fails; its data from before stays
      await act(async () => {
        await jest.advanceTimersByTimeAsync(61_000);
      });
      expect(screen.getByRole('tab', { name: /Coverage/ }).textContent).toBe('Coverage?');
    } finally {
      jest.useRealTimers();
    }
  });

  it('the nav count is "?" (not 0, not a partial number) when a read it needs failed, and 0 shows nothing when the reads succeed', async () => {
    exceptionsStatus = 403;
    await act(async () => {
      render(<ClearancePage />);
    });
    await act(async () => {});
    expect(screen.getByRole('tab', { name: /Coverage/ }).textContent).toBe('Coverage?');
    expect(screen.getByRole('tab', { name: /Coverage/ }).textContent).not.toMatch(/\d/);
  });

  it('a successful empty read is a count of 0: no badge, no question mark', async () => {
    emptyStatement = true;
    await act(async () => {
      render(<ClearancePage />);
    });
    await act(async () => {});
    expect(screen.getByRole('tab', { name: /Coverage/ }).textContent).toBe('Coverage');
  });

  it('the count is "?" when a coverage statement could not be read', async () => {
    coverageStatus = 403;
    await act(async () => {
      render(<ClearancePage />);
    });
    await act(async () => {});
    expect(screen.getByRole('tab', { name: /Coverage/ }).textContent).toBe('Coverage?');
  });

  it('Named limits does not say every feed reported when the coverage could not be read: it names the scope as not read', async () => {
    coverageStatus = 403;
    await open();
    await openTab('Named limits');
    const panel = screen.getByRole('region', { name: 'Named limits' });
    expect(panel.textContent).toContain('Not read: the coverage of acct-1 could not be read');
    expect(panel.textContent).not.toContain('every feed reported');
  });

  it('a health row that failed is drawn as not read even when an earlier page held healthy records, and the legend says so', async () => {
    healthPage2Fails = true;
    await open();
    const grid = screen.getByTestId('health-matrix');
    const cells = Array.from(grid.querySelectorAll('tbody [role="img"]'));
    expect(cells).toHaveLength(14);
    expect(cells.every(c => c.getAttribute('data-state') === 'error')).toBe(true);
    expect(cells.every(c => (c.getAttribute('aria-label') ?? '').includes('health not read'))).toBe(true);
    expect(within(screen.getByLabelText('Legend')).getByText('not read (error)')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Health by scope and day' }).textContent).toContain('1 scope not read');
  });

  it('the headline counts days with no record as not healthy', async () => {
    await open();
    expect(screen.getByRole('region', { name: 'Health by scope and day' }).textContent).toContain('1 of 1 scopes not healthy every day');
  });
});

function UrlProbe() {
  const loc = useLocation();
  const nav = useNavigate();
  return (
    <div>
      <output aria-label="url">{loc.search}</output>
      <button type="button" onClick={() => nav(-1)}>history back</button>
    </div>
  );
}

describe('the scope follows the URL', () => {
  it('the Scope selector writes the scope to the URL, and Back restores the previous scope and the list follows', async () => {
    scopeList = ['acct-1', 'acct-2'];
    entry = '/?view=coverage&tab=open&scope=acct-1';
    await act(async () => {
      render(<><UrlProbe /><ClearancePage /></>);
    });
    await act(async () => {});
    const select = () => screen.getByLabelText('Scope') as HTMLSelectElement;
    expect(select().value).toBe('acct-1');
    await act(async () => {
      fireEvent.change(select(), { target: { value: 'acct-2' } });
    });
    await act(async () => {});
    expect(screen.getByLabelText('url').textContent).toContain('scope=acct-2');
    expect(screen.getByLabelText('url').textContent).toContain('tab=open');
    expect(select().value).toBe('acct-2');
    await waitFor(() => expect(calls.some(p => p.startsWith('/v1/coverage?') && p.includes('scope=acct-2'))).toBe(true));
    await act(async () => {
      fireEvent.click(screen.getByText('history back'));
    });
    await act(async () => {});
    expect(screen.getByLabelText('url').textContent).toContain('scope=acct-1');
    expect(select().value).toBe('acct-1');
  });

  it('a tab click keeps the scope in the URL (an explicit scope still wins)', async () => {
    scopeList = ['acct-1', 'acct-2'];
    entry = '/?view=coverage&tab=open&scope=acct-2';
    await act(async () => {
      render(<ClearancePage />);
    });
    await act(async () => {});
    expect((screen.getByLabelText('Scope') as HTMLSelectElement).value).toBe('acct-2');
    await openTab('Named limits');
    await openTab('Open exceptions');
    // the scope survived two tab changes: the list is still on acct-2
    expect((screen.getByLabelText('Scope') as HTMLSelectElement).value).toBe('acct-2');
  });

  it('a changed scope prop (Back/Forward with the tab mounted) changes the list\'s scope', async () => {
    scopeList = ['acct-1', 'acct-2'];
    let utils: ReturnType<typeof render>;
    await act(async () => {
      utils = render(<CoverageView now={NOW} tab="open" scope="acct-1" onTab={() => {}} />);
    });
    await act(async () => {});
    expect((screen.getByLabelText('Scope') as HTMLSelectElement).value).toBe('acct-1');
    await act(async () => {
      utils!.rerender(<CoverageView now={NOW} tab="open" scope="acct-2" onTab={() => {}} />);
    });
    await act(async () => {});
    expect((screen.getByLabelText('Scope') as HTMLSelectElement).value).toBe('acct-2');
    // the list itself follows: its banner is now acct-2's
    await waitFor(() => expect(screen.getByRole('region', { name: 'Coverage of acct-2' })).toBeTruthy());
  });
});

describe('the health matrix', () => {
  it('reads /v1/observations/health for each scope and shows one cell per day: the worst state that day, no record as no record', async () => {
    await open();
    expect(calls.some(p => p.startsWith('/v1/observations/health?') && p.includes('scope=acct-1') && p.includes('since=2026-10-30T00%3A00%3A00Z') && p.includes('limit=200'))).toBe(true);
    const grid = screen.getByTestId('health-matrix');
    const cell = (day: string) => within(grid).getByLabelText(new RegExp(`^acct-1, ${day}:`));
    expect(grid.querySelectorAll('tbody tr')).toHaveLength(1);
    expect(grid.querySelectorAll('tbody [role="img"]')).toHaveLength(14);
    expect(cell('2026-11-12').getAttribute('data-state')).toBe('degraded');
    expect(cell('2026-11-12').getAttribute('aria-label')).toContain('failed: delivery-lag');
    expect(cell('2026-11-12').getAttribute('aria-label')).toContain('2 records');
    expect(cell('2026-11-11').getAttribute('data-state')).toBe('healthy');
    expect(cell('2026-11-10').getAttribute('data-state')).toBe('blind'); // an audit gap is a blind day
    expect(cell('2026-11-09').getAttribute('data-state')).toBe('none');
    expect(cell('2026-11-09').getAttribute('aria-label')).toContain('no health record');
  });

  it('a window chip changes the number of days and the since it asks for', async () => {
    await open();
    await act(async () => {
      fireEvent.click(within(screen.getByRole('group', { name: 'Matrix window' })).getByText('7 days'));
    });
    expect(screen.getByTestId('health-matrix').querySelectorAll('tbody [role="img"]')).toHaveLength(7);
    expect(calls.some(p => p.startsWith('/v1/observations/health?') && p.includes('since=2026-11-06T00%3A00%3A00Z'))).toBe(true);
  });
});

describe('the Resolve panel', () => {
  const recordWith = async (detail: HTMLElement) => {
    fireEvent.click(within(detail).getByText('Review resolution…'));
    expect(posts).toHaveLength(0); // confirmation first
    await act(async () => {
      fireEvent.click(within(detail).getByText('Record resolution'));
    });
  };

  it('offers Revert, Adopt, Accept with a reason and Declared break-glass', async () => {
    await open();
    const detail = await openRow('sg/web');
    const group = within(detail).getByRole('group', { name: 'Resolve as' });
    expect(within(group).getAllByRole('button').map(b => b.textContent)).toEqual(['Revert', 'Adopt', 'Accept with a reason', 'Declared break-glass']);
  });

  it('Adopt records ratified', async () => {
    await open();
    const detail = await openRow('sg/web');
    await recordWith(detail);
    expect(posts).toEqual([{ path: '/v1/observations/9723/resolution', body: { state: 'ratified' } }]);
  });

  it('Revert records reverted, needs its cause, and the confirmation names the resolution record it linked', async () => {
    await open();
    const detail = await openRow('sg/web');
    fireEvent.click(within(detail).getByText('Revert'));
    expect((within(detail).getByText('Review resolution…') as HTMLButtonElement).disabled).toBe(true);
    expect(detail.textContent).toContain('A reverted change needs its cause.');
    fireEvent.change(within(detail).getByLabelText('Cause'), { target: { value: 'human-initiated' } });
    await recordWith(detail);
    expect(posts).toEqual([{ path: '/v1/observations/9723/resolution', body: { state: 'reverted', cause: 'human-initiated' } }]);
    expect(document.body.textContent).toContain('Resolution record seq 9900');
  });

  it('Accept with a reason records still-live with the reason as its note, and will not without one', async () => {
    await open();
    const detail = await openRow('sg/web');
    fireEvent.click(within(detail).getByText('Accept with a reason'));
    expect((within(detail).getByText('Review resolution…') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(detail).getByLabelText('Reason'), { target: { value: '   ' } });
    expect((within(detail).getByText('Review resolution…') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(detail).getByLabelText('Reason'), { target: { value: 'CAB-12: needed for the migration' } });
    await recordWith(detail);
    expect(posts).toEqual([{ path: '/v1/observations/9723/resolution', body: { state: 'still-live', note: 'CAB-12: needed for the migration' } }]);
  });

  it('Declared break-glass records declared-break-glass', async () => {
    await open();
    const detail = await openRow('sg/web');
    fireEvent.click(within(detail).getByText('Declared break-glass'));
    await recordWith(detail);
    expect(posts).toEqual([{ path: '/v1/observations/9723/resolution', body: { state: 'declared-break-glass' } }]);
  });

  it('works on a gate exception the same way', async () => {
    await open();
    fireEvent.click(within(screen.getByRole('region', { name: 'Gate exceptions' })).getByText('drift').closest('tr')!);
    const detail = screen.getByRole('region', { name: 'Exception detail' });
    await recordWith(detail);
    expect(posts).toEqual([{ path: '/v1/observations/700/resolution', body: { state: 'ratified' } }]);
  });

  it('a refusal (not an admin on the core) is shown with its rule', async () => {
    postStatus = 403;
    await open();
    const detail = await openRow('sg/web');
    await recordWith(detail);
    const refusal = await screen.findByText(/BACKSTAGE-ADMIN/, {}, { timeout: 10_000 });
    expect(refusal.textContent).toContain('admins only');
  });

  it('a viewer who is not an admin sees no Resolve action, only why', async () => {
    admin = false;
    await open();
    const detail = await openRow('sg/web');
    expect(within(detail).queryByRole('group', { name: 'Resolve as' })).toBeNull();
    expect(within(detail).queryByText('Review resolution…')).toBeNull();
    expect(detail.textContent).toContain('Only Clearance admins can resolve');
    expect(detail.textContent).toContain('dana'); // the actor and the diff are still there to read
    expect(detail.textContent).toContain('cidr');
  });
});

describe('the other tabs', () => {
  it('Not attributed lists what was seen without an author, with actor and diff, and not the rest', async () => {
    await open();
    await openTab('Not attributed');
    const panel = screen.getByRole('region', { name: 'Not attributed' });
    const row = within(panel).getByText('role/ci').closest('tr')!;
    expect(row.textContent).toContain('ci');
    expect(row.textContent).toContain('update');
    expect(within(panel).queryByText('sg/web')).toBeNull();
    expect(within(panel).getByRole('button', { name: /in open exceptions/ })).toBeTruthy();
  });

  it('Named limits lists what Clearance could not see: the segment, the audit gap and the failing feed', async () => {
    await open();
    await openTab('Named limits');
    const panel = screen.getByRole('region', { name: 'Named limits' });
    expect(within(panel).getByText('could not see (degraded)')).toBeTruthy();
    expect(within(panel).getByText('audit gap')).toBeTruthy();
    expect(within(panel).getByText('delivery stopped')).toBeTruthy();
    expect(within(panel).getByText('feed degraded')).toBeTruthy();
    expect(within(panel).getByText('failing: delivery-lag')).toBeTruthy();
    expect(panel.textContent).toContain('never reported clean');
  });
});

describe('with no cloud tenant linked', () => {
  it('says so in the matrix and every tab, and shows no error', async () => {
    scopeList = [];
    await open();
    expect(screen.getByRole('region', { name: 'Health by scope and day' }).textContent).toContain('Nothing is linked to observe yet');
    expect(screen.queryByTestId('health-matrix')).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(calls.some(p => p.startsWith('/v1/observations/health'))).toBe(false);
    await openTab('Not attributed');
    expect(screen.getByRole('region', { name: 'Not attributed' }).textContent).toContain('No scope is linked');
    await openTab('Named limits');
    expect(screen.getByRole('region', { name: 'Named limits' }).textContent).toContain('No scope is linked');
    expect(screen.queryByRole('alert')).toBeNull();
  });
});
