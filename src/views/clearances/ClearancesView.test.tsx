import type { ReactElement } from 'react';
import { act, fireEvent, render as rtlRender, type RenderOptions, screen, within } from '@testing-library/react';
import { ClearanceTransportProvider, createFetchTransport } from '../../kit';
import { ClearancesView, stillNeeds } from './ClearancesView';

const NOW = Date.parse('2026-10-31T20:00:00Z');
const change = (over: Record<string, unknown> = {}) => ({
  id: 'ch-1', app: 'gate-api', env: 'prod', cluster: 'hangar-prod', repo: 'jfillman/gitops-gate-api', pr: 7, head: 'a'.repeat(40), base: 'b'.repeat(40),
  target: 'jfillman/gitops-gate-api#7@aaaaaaa', proposer: 'user:dana', proposer_kind: 'person', agent: null, owner: 'group:default/team-gate',
  tree_digest: 'c'.repeat(64), paths: ['hangar-prod/prod/values.yaml'], lines_changed: 3,
  objects: [{ apiVersion: 'v1', kind: 'Secret', namespace: 'app-gate-api-prod', name: 'db', op: 'changed', fields: ['/data/password'], images: [], digest: 'd' }],
  checks: { ci: 'pass', provenance: 'not-agent', render: 'ok' }, policy_version: 'baseline-2026-10-31', repo_policy_digest: null, tier: 3,
  reasons: [{ subject: 'Secret app-gate-api-prod/db', rule: 'kind:Secret', tier: 3 }],
  requirement: { owner: 1, outside: 1, ownerGroup: 'group:default/team-gate', outsideGroups: ['group:default/admins'] },
  state: 'holding', approvals: [{ person: 'user:erin', via: 'hangar-prod/app-backstage-prod/backstage', role: 'owner', at: '2026-10-31T19:00:00Z' }],
  cleared_by: null, deny_reason: null, denied_by: null, superseded_by: null, created_at: '2026-10-31T18:00:00Z', updated_at: '2026-10-31T19:00:00Z',
  expires_at: '2026-11-07T18:00:00Z', decided_at: null, registered_by: 'app-gate-api-cicd/pipeline-runner', ...over,
});
const posts: Array<{ url: string; body?: string }> = [];
const gets: string[] = [];
const mockApis: Record<string, unknown> = {
  'core.discovery': { getBaseUrl: async () => 'http://be/api/clearance' },
  'core.fetch': {
    fetch: async (url: string, init?: { method?: string; body?: string }) => {
      const path = url.replace('http://be/api/clearance', '');
      if (init?.method === 'POST') {
        posts.push({ url: path, body: init.body });
        if (path.endsWith('/deny')) return { ok: false, status: 403, json: async () => ({ error: 'user:sam may not decide this change', rule: 'DG-FORBIDDEN', hint: '' }) };
        return { ok: true, status: 200, json: async () => change({ state: 'cleared', cleared_by: 'people' }) };
      }
      gets.push(path);
      let body: unknown;
      if (path.startsWith('/v1/clearance-policy')) body = { version: 'baseline-2026-10-31', maxLinesTier1: 250, approvers: { '2': { owner: 1, outside: 0 }, '3': { owner: 1, outside: 1 } }, outsideGroups: [], ttlDays: 7, repoPolicy: null };
      else if (path.startsWith('/v1/clearances/counts') && path.includes('by=tier')) body = { items: [{ key: '3', count: 2 }, { key: '1', count: 6 }], total: 8 };
      else if (path.startsWith('/v1/clearances/counts')) body = path.includes('cleared_by') ? { items: [{ key: 'policy', count: 5 }, { key: 'people', count: 2 }], total: 7 } : { items: [{ key: 'holding', count: 1 }, { key: 'denied', count: 1 }], total: 2 };
      else if (path.startsWith('/v1/clearances/ch-1')) body = change();
      else if (path.startsWith('/v1/clearances')) body = { items: [change()], next: null };
      return body ? { ok: true, status: 200, json: async () => body } : { ok: false, status: 404, json: async () => ({ error: 'no' }) };
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

it('says what a holding change still needs', () => {
  expect(stillNeeds({ requirement: change().requirement, approvals: [] } as any)).toContain('1 from');
  expect(stillNeeds({ requirement: change().requirement, approvals: [] } as any)).toContain(' and 1 from');
  expect(stillNeeds(change() as any)).not.toContain(' and ');
});

it('lists changes, opens one, clears it and shows a refusal in Clearance\'s words', async () => {
  await act(async () => {
    render(<ClearancesView now={NOW} />);
  });
  expect(screen.getByText('Holding for people').parentElement!.textContent).toContain('1');
  expect(screen.getByText('Cleared by policy').parentElement!.textContent).toContain('5');
  const row = within(screen.getByRole('region', { name: 'Changes' })).getByText('gate-api').closest('tr')!;
  expect(row.textContent).toContain('T3');
  expect(row.textContent).toContain('holding');
  expect(row.textContent).toContain('ch-1 · jfillman/gitops-gate-api#7@aaaaaaa · dana');
  await act(async () => {
    fireEvent.click(row);
  });
  const detail = screen.getByRole('region', { name: 'Change detail' });
  expect(within(detail).getByTestId('change-id').textContent).toBe('ch-1');
  expect(detail.textContent).toContain('kind:Secret (Secret app-gate-api-prod/db)');
  expect(detail.textContent).toContain('erin (owner, via Tower');
  await act(async () => {
    fireEvent.click(within(detail).getByRole('button', { name: 'Clear as you' }));
  });
  expect(posts[0]).toEqual({ url: '/v1/clearances/ch-1/clear', body: '{}' });
  const deny = within(detail).getByRole('button', { name: 'Deny…' }) as HTMLButtonElement;
  expect(deny.disabled).toBe(true);
  fireEvent.change(within(detail).getByLabelText('Reason to deny'), { target: { value: 'not today' } });
  await act(async () => {
    fireEvent.click(within(detail).getByRole('button', { name: 'Deny…' }));
  });
  expect(posts[1]).toEqual({ url: '/v1/clearances/ch-1/deny', body: JSON.stringify({ reason: 'not today' }) });
  expect(screen.getByRole('alert').textContent).toContain('DG-FORBIDDEN: user:sam may not decide this change');
});

it('the Tier filter asks for one read per chosen tier, shows the key with the policy in force, and the mix bar counts', async () => {
  gets.length = 0;
  await act(async () => {
    render(<ClearancesView now={NOW} />);
  });
  expect(screen.getByRole('group', { name: 'Tier key' }).textContent).toContain('under 250 lines');
  expect(screen.getByRole('img', { name: /tier 1 6, tier 2 0, tier 3 2/ })).toBeTruthy();
  expect(gets.some(g => g.startsWith('/v1/clearances?') && !g.includes('tier='))).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: /all/ }));
  await act(async () => {
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Change tiers' })).getByRole('checkbox', { name: /Tier 3/ }));
  });
  expect(gets.some(g => g.startsWith('/v1/clearances?') && g.includes('tier=3'))).toBe(true);
  await act(async () => {
    fireEvent.click(within(screen.getByRole('dialog')).getByRole('checkbox', { name: /Tier 2/ }));
  });
  expect(gets.some(g => g.startsWith('/v1/clearances?') && g.includes('tier=2'))).toBe(true);
  expect(screen.getByRole('button', { name: /2, 3/ }).getAttribute('aria-pressed')).toBe('true');
});
