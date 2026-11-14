import type { ReactElement } from 'react';
import { act, fireEvent, render as rtlRender, type RenderOptions, screen, within } from '@testing-library/react';
import { ClearanceTransportProvider, createFetchTransport } from '../../kit';
import { MemoryRouter } from 'react-router-dom';
import { ClearancePage } from '../ClearancePage';
import { MapTab } from './index';
import { fixture } from './testFixture';
import type { MapResponse } from './types';

let current: MapResponse = fixture();
const calls: string[] = [];
const mockApis: Record<string, unknown> = {
  'core.discovery': { getBaseUrl: async () => 'http://be/api/clearance' },
  'core.fetch': {
    fetch: async (url: string) => {
      const path = url.replace('http://be/api/clearance', '');
      calls.push(path);
      if (path.startsWith('/v1/map')) {
        const q = new URLSearchParams(path.split('?')[1]);
        const target = q.get('target');
        const body: MapResponse = target
          ? {
              ...current,
              target: {
                changes: [{ id: 'ch-1', repo: 'org/gate-api', pr: 212, tier: 2, state: 'holding', owner: 'group:default/team-a', age_seconds: 1140, updated_at: '2026-11-13T11:41:00Z' }],
                exceptions: [{ seq: 48102, ts: '2026-11-13T11:30:00Z', tool: 'deploy.exception', decision: 'allow', result: 'ConfigMap applied with kubectl', coverage: 'out-of-band-detected' } as never],
                evidence: [{ seq: 48244, ts: '2026-11-13T11:54:00Z', tool: 'deploy.outcome', decision: 'allow', result: '2.9.0 applied', coverage: 'authorized-and-verified' } as never],
              },
            }
          : current;
        return { ok: true, status: 200, json: async () => body };
      }
      if (path.startsWith('/v1/coverage')) return { ok: true, status: 200, json: async () => ({ scopes: [] }) };
      return { ok: false, status: 404, json: async () => ({ error: `no ${path}` }) };
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
  calls.length = 0;
  current = fixture();
  window.localStorage.clear();
});

const renderTab = async (props: Partial<Parameters<typeof MapTab>[0]> = {}) => {
  const opened: Array<string | undefined> = [];
  const nav: Array<Record<string, string>> = [];
  await act(async () => {
    render(<MapTab onOpenTarget={id => opened.push(id)} onNavigate={p => nav.push(p)} {...props} />);
  });
  await act(async () => {});
  return { opened, nav };
};

it('reads the Map for the window and draws gate types, groups and observers as focusable nodes', async () => {
  await renderTab();
  const call = calls.find(p => p.startsWith('/v1/map'))!;
  const q = new URLSearchParams(call.split('?')[1]);
  expect(Date.parse(q.get('to')!) - Date.parse(q.get('from')!)).toBe(60 * 60_000); // the default window is 1 h
  expect(screen.getByRole('group', { name: /Coverage topology: 3 gate types, 3 targets in 2 groups, 2 observers/ })).toBeTruthy();
  const argo = screen.getByRole('button', { name: /Gate type g-argo: 2 instances guarding 2 targets/ });
  expect(argo.getAttribute('tabindex')).toBe('0');
  expect(screen.getByRole('button', { name: /Group hangar-prod: 2 targets, 99% verified/ }).getAttribute('aria-expanded')).toBe('false');
  expect(screen.getByRole('button', { name: /Observer observe-aws .* status down/ })).toBeTruthy();
});

it('focusing a node opens its popover; Escape closes a pinned one', async () => {
  await renderTab();
  const argo = screen.getByRole('button', { name: /Gate type g-argo/ });
  await act(async () => {
    fireEvent.focus(argo);
  });
  const pop = screen.getByRole('dialog', { name: 'g-argo details' });
  expect(within(pop).getByText(/0 enforce · 2 flag · 0 silent/)).toBeTruthy();
  await act(async () => {
    fireEvent.blur(argo);
    fireEvent.keyDown(argo, { key: 'Enter' });
  });
  expect(screen.getByRole('dialog', { name: 'g-argo details' })).toBeTruthy(); // pinned
  await act(async () => {
    fireEvent.keyDown(argo, { key: 'Escape' });
  });
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('labels every box: column heads, the gate type in words with its kind and instance count, the group with its kind and tier, the observer with its health', async () => {
  await renderTab();
  for (const head of ['Gate types', 'Clearance core', 'Protected targets', 'Observers']) expect(screen.getAllByText(head).length).toBeGreaterThan(0);
  const gate = screen.getByTestId('gate-glidepath');
  expect(within(gate).getByText('Glidepath clearance-gate')).toBeTruthy();
  expect(within(gate).getByText('PR check · 2 instances')).toBeTruthy();
  expect(within(screen.getByTestId('gate-g-tf')).getByText('Terraform plan · 1 instance')).toBeTruthy();
  const group = screen.getByTestId('group-hangar-prod');
  expect(within(group).getByText(/2 k8s-namespace · flight · prod/)).toBeTruthy();
  const obs = screen.getByTestId('observer-observe-aws');
  expect(within(obs).getByText('observer')).toBeTruthy();
  expect(within(obs).getByText('1 blind')).toBeTruthy();
  // the legend explains the bars and lines
  expect(within(screen.getByRole('group', { name: 'Legend' })).getByText(/observer watching/)).toBeTruthy();
});

describe('the hover popover does not flicker', () => {
  const wait = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

  it('shows once for a node, stays while the pointer crosses onto it, and hides once after the pointer leaves both', async () => {
    await renderTab();
    const log: string[] = [];
    const mo = new MutationObserver(records => {
      for (const r of records) {
        r.addedNodes.forEach(n => (n as Element).querySelector?.('[data-testid=map-popover]') || (n as Element).getAttribute?.('data-testid') === 'map-popover' ? log.push('show') : undefined);
        r.removedNodes.forEach(n => (n as Element).querySelector?.('[data-testid=map-popover]') || (n as Element).getAttribute?.('data-testid') === 'map-popover' ? log.push('hide') : undefined);
      }
    });
    mo.observe(document.body, { childList: true, subtree: true });
    const argo = screen.getByRole('button', { name: /Gate type g-argo/ });
    await act(async () => {
      fireEvent.mouseEnter(argo);
    });
    const pop = screen.getByRole('dialog', { name: 'g-argo details' });
    expect(argo.contains(pop)).toBe(false); // never a child of the node it describes
    // pointer leaves the node and is on the popover before the hide delay is up: the popover must stay
    await act(async () => {
      fireEvent.mouseLeave(argo);
    });
    await wait(40);
    await act(async () => {
      fireEvent.mouseEnter(pop);
    });
    await wait(400);
    expect(screen.getByRole('dialog', { name: 'g-argo details' })).toBe(pop);
    // leaving the popover hides it, once
    await act(async () => {
      fireEvent.mouseLeave(pop);
    });
    expect(screen.queryByRole('dialog')).not.toBeNull(); // not before the delay
    await wait(400);
    expect(screen.queryByRole('dialog')).toBeNull();
    mo.disconnect();
    expect(log).toEqual(['show', 'hide']);
  });

  it('a pointer jittering over the node edge (enter, leave, enter) keeps one popover, not a show/hide loop', async () => {
    await renderTab();
    const argo = screen.getByRole('button', { name: /Gate type g-argo/ });
    const seen: boolean[] = [];
    for (let i = 0; i < 6; i++) {
      await act(async () => {
        fireEvent.mouseEnter(argo);
      });
      seen.push(!!screen.queryByRole('dialog'));
      await act(async () => {
        fireEvent.mouseLeave(argo);
      });
      seen.push(!!screen.queryByRole('dialog')); // still up: the hide is delayed
    }
    expect(seen.every(Boolean)).toBe(true);
    await wait(400);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('moving from one node to the next swaps the popover, no gap, and a group popover has its action inside it', async () => {
    await renderTab();
    const argo = screen.getByRole('button', { name: /Gate type g-argo/ });
    const group = screen.getByRole('button', { name: /Group hangar-prod/ });
    await act(async () => {
      fireEvent.mouseEnter(argo);
      fireEvent.mouseLeave(argo);
      fireEvent.mouseEnter(group);
    });
    expect(screen.getAllByRole('dialog')).toHaveLength(1);
    const pop = screen.getByRole('dialog', { name: 'hangar-prod details' });
    expect(within(pop).getByText('Show targets')).toBeTruthy();
  });
});

it('Enter on a group opens it and re-reads the Map with expand=; Enter on its target drills down', async () => {
  const { opened } = await renderTab();
  const group = screen.getByRole('button', { name: /Group hangar-prod/ });
  await act(async () => {
    fireEvent.keyDown(group, { key: 'Enter' });
  });
  await act(async () => {});
  expect(calls.some(p => p.startsWith('/v1/map') && p.includes('expand=hangar-prod'))).toBe(true);
  expect(screen.getByRole('button', { name: /Group hangar-prod.*Expanded/ }).getAttribute('aria-expanded')).toBe('true');
  const row = screen.getByRole('link', { name: /Open gate-api in hangar-prod: 97% verified, 1 holding/ });
  await act(async () => {
    fireEvent.keyDown(row, { key: 'Enter' });
  });
  expect(opened).toEqual(['gate-api-prod']);
});

it('lists what needs attention, worst first, with a way in for each', async () => {
  const { opened } = await renderTab();
  const panel = screen.getByRole('region', { name: 'Needs attention' });
  const items = within(panel).getAllByRole('listitem');
  expect(items).toHaveLength(3);
  expect(items[0].textContent).toContain('blind-observer');
  expect(items[2].textContent).toContain('gate-silent');
  await act(async () => {
    fireEvent.click(within(panel).getByRole('button', { name: 'Open acct' }));
  });
  expect(opened).toEqual(['acct-prod']);
});

it('switches between Topology and Lanes, remembers the choice, and says what the lanes cannot yet count', async () => {
  const first = await renderTab();
  expect(first.opened).toEqual([]);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Lanes' }));
  });
  expect(screen.getByRole('button', { name: 'Lanes' }).getAttribute('aria-pressed')).toBe('true');
  expect(screen.getByText('Where changes are, by gate type')).toBeTruthy();
  expect(screen.queryByRole('group', { name: /Coverage topology/ })).toBeNull();
  const lanes = screen.getAllByRole('table')[0];
  expect(within(lanes).getAllByRole('columnheader').map(h => h.textContent?.replace(/\s*(deploy\.|tier|clear|observer|matches).*$/, ''))).toEqual(expect.arrayContaining(['Requested', 'Verified']));
  // partial is rendered, honestly, where it affects
  expect(screen.getByText(/† partial: lanes.observed,lanes.verified/)).toBeTruthy();
  expect(screen.getByText(/counted from the target scope, not joined to each change/)).toBeTruthy();
  expect(window.localStorage.getItem('clearance.map.view')).toBe('lanes');
});

it('opens on the view the person last used', async () => {
  window.localStorage.setItem('clearance.map.view', 'lanes');
  await renderTab();
  expect(screen.getByText('Where changes are, by gate type')).toBeTruthy();
  // a gate row scopes the lanes to that gate type: one row per target it guards
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'g-argo' }));
  });
  expect(screen.getByText('Lanes of g-argo')).toBeTruthy();
  expect(screen.getByText('gate-api')).toBeTruthy();
  expect(screen.getByText('flight-api')).toBeTruthy();
  expect(screen.queryByText('acct-prod')).toBeNull();
});

it('Needs attention only and the search filter what is drawn, and the registry pills offer the tiers the targets name', async () => {
  await renderTab();
  expect(screen.getByRole('button', { name: /Needs attention only/ }).getAttribute('aria-pressed')).toBe('false');
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: /Needs attention only/ }));
  });
  expect(screen.getByRole('button', { name: /Needs attention only/ }).getAttribute('aria-pressed')).toBe('true');
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Ground' }));
  });
  expect(screen.queryByRole('button', { name: /Gate type glidepath/ })).toBeNull();
  expect(screen.getByRole('button', { name: /Gate type g-tf/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Flight' })).toBeTruthy();
});

it('changing the window re-reads the Map with that range', async () => {
  await renderTab();
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: '24 h' }));
  });
  await act(async () => {});
  const last = calls.filter(p => p.startsWith('/v1/map')).pop()!;
  const q = new URLSearchParams(last.split('?')[1]);
  expect(Date.parse(q.get('to')!) - Date.parse(q.get('from')!)).toBe(24 * 3_600_000);
});

it('an empty registry says targets are published per cluster, and draws nothing', async () => {
  current = fixture({ registry: { sources: [], conflicts: [], targets: 0 }, nodes: { gate_types: [], groups: [], targets: [], observers: [] }, edges: [], attention: [], partial: [] });
  await renderTab();
  const note = screen.getByTestId('map-empty');
  expect(note.textContent).toMatch(/No targets published yet/);
  expect(note.textContent).toMatch(/published per cluster/);
  expect(screen.queryByRole('group', { name: /Coverage topology/ })).toBeNull();
});

it('a truncated map and a source conflict are said, not hidden', async () => {
  current = fixture({ truncated: true, registry: { sources: [], conflicts: ['gate-api-prod declared by hangar-prod and hangar-dev'], targets: 3 } });
  await renderTab();
  expect(screen.getByText('This Map was cut short')).toBeTruthy();
  expect(screen.getByText('Two sources declare the same target')).toBeTruthy();
});

it('past about 40 targets it shows the gates x targets matrix instead of target rows', async () => {
  const many = Array.from({ length: 45 }, (_, i) => ({ ...fixture().nodes.targets[1], id: `t${i}`, name: `t${i}` }));
  current = fixture();
  current.nodes.targets = many;
  await renderTab();
  const matrix = screen.getByTestId('map-matrix');
  expect(within(matrix).getAllByRole('button')).toHaveLength(45 * 3);
  expect(within(matrix).getAllByRole('button')[0].getAttribute('aria-label')).toMatch(/on t\d+: .*Open detail/);
});

describe('the environment detail', () => {
  it('shows who guards and watches it, the mix, the lanes, the changes and the evidence, with a breadcrumb back', async () => {
    const { opened, nav } = await renderTab({ target: 'gate-api-prod' });
    expect(calls.some(p => p.startsWith('/v1/map') && p.includes('target=gate-api-prod'))).toBe(true);
    const crumbs = screen.getByRole('navigation', { name: 'Breadcrumb' });
    expect(crumbs.textContent).toContain('hangar-prod');
    expect(screen.getByRole('heading', { name: 'gate-api' })).toBeTruthy();
    expect(screen.getByText('97% authorized-and-verified')).toBeTruthy();
    expect(screen.getByText('1 gate in flag mode')).toBeTruthy();
    expect(screen.getByText('1 exception')).toBeTruthy();
    // guarded by, with modes; watched by, with health
    expect(screen.getByRole('heading', { name: 'Guarded by' })).toBeTruthy();
    expect(screen.getAllByText('flag').length).toBeGreaterThan(0);
    expect(screen.getAllByText('enforce').length).toBeGreaterThan(0);
    expect(screen.getByText('observe-k8s')).toBeTruthy();
    expect(screen.getByRole('list', { name: 'Coverage mix by state' })).toBeTruthy();
    // lanes scoped to the target's gates
    expect(screen.getByText('Changes through each gate, this environment')).toBeTruthy();
    // changes moving now, linking to the change
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Open change org/gate-api #212' }));
    });
    expect(nav).toEqual([{ view: 'clearances', change: 'ch-1' }]);
    // exceptions and evidence link to the tabs pre-filtered by this target's scope and app
    expect(screen.getByText('deploy.exception')).toBeTruthy();
    expect(screen.getByText('2.9.0 applied', { exact: false })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Evidence →' }));
      fireEvent.click(screen.getByRole('button', { name: 'Exceptions →' }));
    });
    expect(nav.slice(1)).toEqual([{ view: 'evidence', app: 'gate-api' }, { view: 'exceptions', scope: 'hangar-prod' }]);
    // the breadcrumb goes back to the map
    await act(async () => {
      fireEvent.click(within(crumbs).getByRole('button', { name: 'Map' }));
    });
    expect(opened).toEqual([undefined]);
  });

  it('a blind observer hatches Observed and Verified instead of showing zero', async () => {
    await renderTab({ target: 'acct-prod' });
    expect(screen.getAllByText('coverage-unavailable').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/never seen: no health record/)).toBeTruthy();
    expect(screen.getByText('no coverage yet')).toBeTruthy();
  });

  it('a target that is not declared says so and offers the way back', async () => {
    await renderTab({ target: 'nope' });
    expect(screen.getByText('No declared target is named nope')).toBeTruthy();
  });
});

describe('in the Clearance page', () => {
  const page = async (url: string) => {
    await act(async () => {
      render(
        <MemoryRouter initialEntries={[url]}>
          <ClearancePage />
        </MemoryRouter>,
      );
    });
    await act(async () => {});
  };

  it('has a Map tab beside the others, and ?view=map shows it', async () => {
    await page('/clearance?view=map');
    const tabs = within(screen.getByRole('tablist', { name: 'Clearance sections' })).getAllByRole('tab').map(t => t.textContent);
    expect(tabs).toEqual(['Clearances', 'Evidence', 'Exceptions', 'Attestations', 'Map', 'Policy']);
    expect(screen.getByRole('group', { name: /Coverage topology/ })).toBeTruthy();
  });

  it('?view=map&target= is the environment detail, and its links change the tab', async () => {
    await page('/clearance?view=map&target=gate-api-prod');
    expect(screen.getByRole('heading', { name: 'gate-api' })).toBeTruthy();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Evidence →' }));
    });
    expect(screen.queryByRole('heading', { name: 'gate-api' })).toBeNull();
  });
});
