import { render, screen } from '@testing-library/react';
import { BudgetBars, DecisionChip, StateChip, TierChip, VerifiedClaimed } from './components';
import { FlightLog, summarize } from './FlightLog';
import { compact, relativeTime, shortPrincipal } from './format';
import type { EvidenceRecord } from './types';

const rec = (over: Partial<EvidenceRecord> = {}): EvidenceRecord => ({
  seq: 263, ts: '2026-10-31T00:30:38Z', task_id: 't-1', session: 's-1', parent: null, principal: 'user:jfillman',
  agent: 'cicd-explainer', tool: 'glidepath.runs.list', tier: 0, decision: 'allow', rule: null, target: 'none',
  args_sha256: 'abc', result: 'ok', app: 'gate-api', schema: 'clearance.evidence/v0-draft', boundary: 'runtime',
  coverage: 'authorized-and-verified', verified: ['principal', 'tool', 'decision', 'app'], claimed: ['trigger'],
  prev_hash: 'a'.repeat(64), hash: 'b'.repeat(64), assurance: 'recorded-not-checkpointed', ...over,
});

it('formats', () => {
  expect(shortPrincipal('user:jfillman')).toBe('jfillman');
  expect(shortPrincipal('autopilot-runs/triage-agent')).toBe('autopilot-runs/triage-agent');
  expect(compact(182000)).toBe('182k');
  expect(compact(2_100_000)).toBe('2.1M');
  expect(relativeTime('2026-10-31T00:00:00Z', Date.parse('2026-10-31T00:08:00Z'))).toBe('8 min');
  expect(relativeTime('2026-10-31T01:00:00Z', Date.parse('2026-10-31T00:00:00Z'))).toBe('in 1 h');
});

it('chips say what the record says', () => {
  render(
    <>
      <TierChip tier={1} />
      <DecisionChip decision="deny" rule="R015" />
      <StateChip state="live" tripped reason="model budget" />
    </>,
  );
  expect(screen.getByText('T1')).toBeTruthy();
  expect(screen.getByText('deny R015')).toBeTruthy();
  expect(screen.getByTitle('model budget').textContent).toBe('tripped');
});

it('an ended session says how it ended', () => {
  const o = { finished_at: '2026-11-01T21:56:41Z', result: null, via: 'runtime' };
  render(
    <>
      <StateChip state="closed" outcome={{ ...o, status: 'done' }} />
      <StateChip state="closed" outcome={{ ...o, status: 'error', reason: 'model proxy 500' }} />
      <StateChip state="closed" outcome={{ ...o, status: 'no-result', run_phase: 'Failed', via: 'run' }} />
      <StateChip state="closed" />
    </>,
  );
  expect(screen.getByTitle('the run answered').textContent).toBe('finished');
  expect(screen.getByTitle('model proxy 500').textContent).toBe('failed');
  expect(screen.getByTitle('the run ended (Failed) without handing back a result').textContent).toBe('no result');
  expect(screen.getByText('closed')).toBeTruthy();
});

it('budget bars meter every budget against its limit', () => {
  render(
    <BudgetBars
      used={{ tool_calls: 23, github_calls: 6, open_prs: 0, model_tokens: 182000, children: 0 }}
      limits={{ tier_ceiling: 'T1', ttl_minutes: 20, tool_calls: 60, github_calls: 40, open_prs: 1, model_tokens: 400000, children: 0, tools: [], models: [], network: 'clearance', compute: 'small' }}
      createdAt="2026-10-31T00:00:00Z"
      expiresAt="2026-10-31T00:20:00Z"
      now={Date.parse('2026-10-31T00:08:00Z')}
    />,
  );
  expect(screen.getByRole('meter', { name: 'Tool calls' }).getAttribute('aria-valuenow')).toBe('23');
  expect(screen.getByText('182k of 400k')).toBeTruthy();
  expect(screen.getByText('8 min of 20 min')).toBeTruthy();
});

it('the flight log is oldest first, with the tier and verdict per record', () => {
  const records = [rec({ seq: 5, tool: 'repo.file.get', decision: 'deny', rule: 'R015', result: '.tekton/** is a baseline deny path', ts: '2026-10-31T00:31:00Z' }), rec({ seq: 4, tool: 'session.open', tier: null, ts: '2026-10-31T00:30:00Z' })];
  render(<FlightLog records={records} />);
  const items = screen.getAllByRole('listitem');
  expect(items).toHaveLength(2);
  expect(items[0].textContent).toContain('Session opened');
  expect(items[1].textContent).toContain('deny R015');
  expect(items[1].textContent).toContain('.tekton/** is a baseline deny path');
  expect(summarize(rec({ tool: 'repo.pr.open', effect: { pr: 32, repo: 'jfillman/gate-api' } }))).toEqual({ title: 'repo.pr.open', detail: 'PR #32 on jfillman/gate-api · gate-api' });
});

it('verified versus claimed marks each field', () => {
  render(<VerifiedClaimed record={rec()} />);
  expect(screen.getAllByText('verified').length).toBeGreaterThanOrEqual(3);
  expect(screen.getByText('claimed')).toBeTruthy();
  expect(screen.getByText('recorded-not-checkpointed')).toBeTruthy();
});
