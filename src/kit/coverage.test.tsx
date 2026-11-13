import { render, screen } from '@testing-library/react';
import { CoverageBanner, readDeniedText, summarizeCoverage } from './coverage';
import { ReadError } from './read';
import type { CoverageStatement } from './types';

const base = (sources: any[], segments: any[] = []): CoverageStatement =>
  ({
    scope: 's', from: '', to: '', state: 'healthy', clean: true, truncated: false, text: '',
    cleared_and_verified: { count: 0, by_coverage: {}, items: [], truncated: false },
    seen_not_cleared: { count: 0, by_coverage: {}, items: [], truncated: false },
    could_not_see: { seconds: 0, segments, audit_gaps: [] },
    health: { sources },
    source_integrity: { observations: 0, verified: 0, unverified: 0, verified_by_record: 0, verified_later: 0 },
  }) as CoverageStatement;
const src = (over: Record<string, unknown>) => ({ source: 'k8s', state: 'healthy', now: '', stale: false, failed_checks: [], last_seq: 1, last_ts: '2026-11-12T11:00:00Z', blind_seconds: 0, degraded_seconds: 0, ...over });

it('classifies healthy, degraded and blind (stale or no feed is blind) with the failing checks and since', () => {
  expect(summarizeCoverage(base([src({})])).state).toBe('healthy');
  const d = summarizeCoverage(base([src({ state: 'degraded', failed_checks: ['watch-lag'] })], [{ source: 'k8s', state: 'degraded', reason: 'reported', from: '2026-11-12T09:00:00Z', to: '2026-11-12T12:00:00Z', seconds: 1, seq: 1 }]));
  expect([d.state, d.failing, d.since]).toEqual(['degraded', ['k8s: watch-lag'], '2026-11-12T09:00:00Z']);
  const stale = summarizeCoverage(base([src({ stale: true })]));
  expect([stale.state, stale.since]).toEqual(['blind', '2026-11-12T11:00:00Z']);
  expect(summarizeCoverage(base([])).state).toBe('blind');
});

it('renders the banner states and the person-reads 403 note', () => {
  const { rerender } = render(<CoverageBanner scope="s" statement={base([src({ state: 'blind', failed_checks: ['no-events'] })])} now={Date.parse('2026-11-12T12:00:00Z')} />);
  expect(screen.getByRole('region', { name: 'Coverage of s' }).getAttribute('data-state')).toBe('blind');
  expect(screen.getByText('k8s: no-events')).toBeTruthy();
  rerender(<CoverageBanner scope="s" error={new ReadError('x', 403)} />);
  expect(screen.getByRole('region', { name: 'Coverage of s' }).textContent).toContain('Needs the Clearance release with person reads');
  expect(readDeniedText(new ReadError('x', 503))).toContain('503');
});

it('reads a feed by its state NOW, not the worst of the window (a blind hour ago, healthy now, is healthy)', () => {
  expect(summarizeCoverage(base([src({ state: 'blind', now: 'healthy', blind_seconds: 1031 })])).state).toBe('healthy');
  expect(summarizeCoverage(base([src({ state: 'blind', now: 'degraded', failed_checks: ['watch-lag'] })])).state).toBe('degraded');
  // an older core without `now`: the window's state stands in
  expect(summarizeCoverage(base([src({ state: 'blind', now: undefined })])).state).toBe('blind');
});
