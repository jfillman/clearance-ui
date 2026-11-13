import type { ReactElement } from 'react';
import { act, fireEvent, render as rtlRender, type RenderOptions, screen, within } from '@testing-library/react';
import { ClearanceTransportProvider, createFetchTransport } from '../kit';
import { EvidenceView, queryOf, searchParams } from './evidence/EvidenceView';
import { PolicyView } from './policy/PolicyView';

const NOW = Date.parse('2026-10-31T01:00:00Z');
const record = (over: Record<string, unknown>) => ({
  seq: 1, ts: '2026-10-31T00:50:01Z', task_id: 't-1', session: 's-1', parent: null, principal: 'user:jfillman', agent: 'coding-agent', tool: 'metrics.query', tier: 0,
  decision: 'allow', rule: null, target: 'none', args_sha256: 'x', result: 'ok', schema: 'clearance.evidence/v0-draft', boundary: 'runtime', coverage: 'authorized-and-verified',
  verified: ['principal', 'tool'], claimed: [], prev_hash: '0'.repeat(64), hash: 'abcdef0123456789'.repeat(4), assurance: 'recorded-not-checkpointed', ...over,
});
const policy = {
  packs: ['core', 'hangar'],
  rules: [
    { id: 'R001', name: 'not-session-owner', expression: '!ctx.owns_session', message: 'this session belongs to a different principal', hint: 'Open your own session.', order: 10, pack: 'core' },
    { id: 'R015', name: 'path-not-allowed', expression: 'ctx.path_violations > 0', message: 'a path is denied', hint: 'Stay inside the allowed paths.', order: 150, pack: 'core' },
    { id: 'R021', name: 'cicd-scope', expression: 'ctx.cicd_scope_problems > 0', message: 'cicd.yaml field', hint: 'A person changes it.', order: 210, pack: 'hangar' },
  ],
  tools: [
    { name: 'metrics.query', tier: 'T0', summary: 'Run a read-only PromQL query', required_args: ['promql'], target: 'none', propose_only: false, writes_files: false, github_cost: 0 },
    { name: 'repo.pr.open_upper', tier: 'T2', summary: 'Open a PR against an upper environment', required_args: ['repo', 'branch', 'title', 'files'], target: 'upper', propose_only: true, writes_files: true, github_cost: 4 },
  ],
};
const calls: string[] = [];
const answers = (path: string): unknown => {
  if (path.startsWith('/v1/evidence/counts') && path.includes('by=coverage')) return { by: 'coverage', items: [{ key: 'authorized-and-verified', count: 3 }, { key: 'observed-not-attributed', count: 1 }], total: 4 };
  if (path.startsWith('/v1/evidence/counts')) return path.includes('by=rule') ? { by: 'rule', items: [{ key: 'R015', count: 21 }], total: 21 } : { by: 'decision', items: [{ key: 'allow', count: 3 }, { key: 'deny', count: 1 }], total: 4 };
  if (path.startsWith('/v1/evidence')) {
    if (path.includes('decision=deny')) return { items: [record({ seq: 9, decision: 'deny', rule: 'R015', tool: 'repo.file.get', result: '.tekton/** is a baseline deny path' })], next: null };
    if (path.includes('after=')) return { items: [record({ seq: 1 })], next: null };
    return { items: [record({ seq: 9, decision: 'deny', rule: 'R015', tool: 'repo.file.get', result: '.tekton/** is a baseline deny path' }), record({ seq: 8 })], next: 8 };
  }
  if (path.startsWith('/v1/agents')) return { items: [{ name: 'coding-agent' }, { name: 'orchestrator' }] };
  if (path.startsWith('/v1/policy/explain')) {
    const deny = path.includes('tool=repo.pr.open_upper');
    return deny
      ? { agent: 'coding-agent', tool: 'repo.pr.open_upper', known_tool: true, dry_run: true, decision: { allow: false, rule: 'R015', name: 'path-not-allowed', message: 'a path is denied', hint: 'Stay inside the allowed paths.', tier: 2 }, path: [{ id: 'R001', name: 'not-session-owner', order: 10, matched: false, error: false }, { id: 'R015', name: 'path-not-allowed', order: 150, matched: true, error: false }], all_rules: [] }
      : { agent: 'coding-agent', tool: 'metrics.query', known_tool: true, dry_run: true, decision: { allow: true, rule: null, name: null, message: 'allowed', hint: '', tier: 0 }, path: [{ id: 'R001', name: 'not-session-owner', order: 10, matched: false, error: false }, { id: 'R015', name: 'path-not-allowed', order: 150, matched: false, error: false }], all_rules: [] };
  }
  if (path.startsWith('/v1/policy')) return policy;
  return undefined;
};
const mockApis: Record<string, unknown> = {
  'core.discovery': { getBaseUrl: async () => 'http://be/api/clearance' },
  'core.fetch': {
    fetch: async (url: string) => {
      const path = url.replace('http://be/api/clearance', '');
      calls.push(path);
      const body = answers(path);
      return body ? { ok: true, status: 200, json: async () => body } : { ok: false, status: 404, json: async () => ({ error: `no ${path}` }) };
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
});

it('maps the filters to the API', () => {
  expect(searchParams('t-123')).toEqual({ task: 't-123' });
  expect(searchParams('s-9')).toEqual({ session: 's-9' });
  expect(searchParams('jfillman')).toEqual({ principal: 'user:jfillman' });
  expect(searchParams('autopilot-runs/triage-agent')).toEqual({ principal: 'autopilot-runs/triage-agent' });
  const q = queryOf({ decision: 'deny', coverage: '', agent: 'x', tool: '', rule: 'R015', app: '', since: '24h', search: '' }, NOW);
  expect(q).toMatchObject({ decision: 'deny', agent: 'x', rule: 'R015', since: '2026-10-30T01:00:00.000Z' });
  expect(queryOf({ decision: '', coverage: '', agent: '', tool: '', rule: '', app: '', since: 'all', search: '' }, NOW).since).toBeUndefined();
});

it('lists records, opens one field by field, filters, and loads more', async () => {
  await act(async () => {
    render(<EvidenceView now={NOW} />);
  });
  expect(screen.getByText(/4 records match · 1 denied/)).toBeTruthy();
  expect(screen.getByText(/head seq 9/)).toBeTruthy();
  const rows = within(screen.getByRole('region', { name: 'Records' })).getAllByRole('row');
  expect(rows).toHaveLength(3);
  await act(async () => {
    fireEvent.click(rows[1]);
  });
  const detail = screen.getByRole('region', { name: 'Record detail' });
  expect(within(detail).getByText('Record 9')).toBeTruthy();
  expect(within(detail).getAllByText('.tekton/** is a baseline deny path').length).toBeGreaterThan(0);
  expect(within(detail).getAllByText('verified').length).toBeGreaterThan(0);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'Load more' }));
  });
  expect(within(screen.getByRole('region', { name: 'Records' })).getAllByRole('row')).toHaveLength(4);
  expect(calls.some(p => p.includes('after=8'))).toBe(true);
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'deny' }));
  });
  expect(calls.some(p => p.startsWith('/v1/evidence?') && p.includes('decision=deny'))).toBe(true);
  expect(within(screen.getByRole('region', { name: 'Records' })).getAllByRole('row')).toHaveLength(2);
});

it('filters by coverage: chips with per-state totals, sent as coverage', async () => {
  expect(queryOf({ decision: '', coverage: 'observed-not-attributed', agent: '', tool: '', rule: '', app: '', since: 'all', search: '' }, NOW).coverage).toBe('observed-not-attributed');
  expect(queryOf({ decision: '', coverage: '', agent: '', tool: '', rule: '', app: '', since: 'all', search: '' }, NOW)).not.toHaveProperty('coverage', expect.anything());
  await act(async () => {
    render(<EvidenceView now={NOW} />);
  });
  expect(screen.getByRole('button', { name: 'observed-not-attributed 1' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'authorized-and-verified 3' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'all coverage' }).getAttribute('aria-pressed')).toBe('true');
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'observed-not-attributed 1' }));
  });
  expect(calls.some(p => p.startsWith('/v1/evidence?') && p.includes('coverage=observed-not-attributed'))).toBe(true);
  // the totals keep every state visible: they are asked without the coverage filter
  expect(calls.some(p => p.startsWith('/v1/evidence/counts') && p.includes('by=coverage') && !p.includes('coverage=observed'))).toBe(true);
  expect(screen.getByRole('button', { name: 'observed-not-attributed 1' }).getAttribute('aria-pressed')).toBe('true');
  await act(async () => {
    fireEvent.click(screen.getByRole('button', { name: 'all coverage' }));
  });
  expect(calls.filter(p => p.startsWith('/v1/evidence?')).pop()).not.toContain('coverage=');
});

it('without a clock prop, loads once, settles, and a row opens (the 2026-10-31 "Loading…" loop)', async () => {
  await act(async () => {
    render(<EvidenceView />);
  });
  await act(async () => {});
  const evidenceCalls = () => calls.filter(p => p.startsWith('/v1/evidence?')).length;
  const countCalls = () => calls.filter(p => p.startsWith('/v1/evidence/counts') && p.includes('by=decision')).length;
  expect(evidenceCalls()).toBe(1);
  expect(countCalls()).toBe(1);
  expect(screen.queryByText('Loading…')).toBeNull();
  const rows = within(screen.getByRole('region', { name: 'Records' })).getAllByRole('row');
  await act(async () => {
    fireEvent.click(rows[1]);
  });
  expect(within(screen.getByRole('region', { name: 'Record detail' })).getByText('Record 9')).toBeTruthy();
  expect(evidenceCalls()).toBe(1);
  // Rows per page: a new page size reloads the list with that limit.
  await act(async () => {
    fireEvent.change(screen.getByLabelText('Rows'), { target: { value: '10' } });
  });
  expect(calls.filter(p => p.startsWith('/v1/evidence?') && p.includes('limit=10'))).toHaveLength(1);
  expect(evidenceCalls()).toBe(2);
});

it('without a clock prop, the Policy page shows the rules and the registry and polls hits once', async () => {
  await act(async () => {
    render(<PolicyView />);
  });
  await act(async () => {});
  expect(within(screen.getByRole('region', { name: 'Deny rules' })).getAllByRole('row').length).toBeGreaterThan(1);
  expect(calls.filter(p => p.startsWith('/v1/policy')).length).toBe(1);
  expect(calls.filter(p => p.startsWith('/v1/evidence/counts')).length).toBe(1);
  fireEvent.click(screen.getByRole('button', { name: /Tool registry/ }));
  expect(within(screen.getByRole('region', { name: 'Tool registry' })).getByText('metrics.query')).toBeTruthy();
});

it('shows the rules in order with hits, the registry, and a dry run with its path', async () => {
  await act(async () => {
    render(<PolicyView now={NOW} />);
  });
  const rules = screen.getByRole('region', { name: 'Deny rules' });
  const rows = within(rules).getAllByRole('row');
  expect(rows.map(r => r.textContent)).toEqual(expect.arrayContaining([expect.stringContaining('R001'), expect.stringContaining('R021')]));
  expect(within(rows[2]).getByText('21')).toBeTruthy();
  expect(within(rules).getByText('hangar')).toBeTruthy();
  await act(async () => {
    fireEvent.click(rows[2]);
  });
  expect(within(rules).getByText('Stay inside the allowed paths.')).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Tool registry/ }));
  expect(within(screen.getByRole('region', { name: 'Tool registry' })).getByText('propose only: a person merges')).toBeTruthy();

  const ex = screen.getByRole('region', { name: 'Would this be allowed?' });
  const run = within(ex).getByRole('button', { name: 'Run dry run' }) as HTMLButtonElement;
  expect(run.disabled).toBe(true);
  fireEvent.change(within(ex).getByLabelText(/Agent/), { target: { value: 'coding-agent' } });
  fireEvent.change(within(ex).getByLabelText(/Tool/), { target: { value: 'repo.pr.open_upper' } });
  fireEvent.change(within(ex).getByLabelText(/Args/), { target: { value: '{"repo":"x/y"}' } });
  expect(run.disabled).toBe(false);
  await act(async () => {
    fireEvent.click(run);
  });
  expect(within(ex).getByText('deny R015')).toBeTruthy();
  expect(within(ex).getByText(/2 rules to the first match \(path-not-allowed\)/)).toBeTruthy();
  expect(calls.some(p => p.startsWith('/v1/policy/explain?') && p.includes('agent=coding-agent') && p.includes('args=%7B%22repo%22%3A%22x%2Fy%22%7D'))).toBe(true);
  fireEvent.change(within(ex).getByLabelText(/Args/), { target: { value: '[1]' } });
  expect(within(ex).getByText('args must be a JSON object')).toBeTruthy();
});
