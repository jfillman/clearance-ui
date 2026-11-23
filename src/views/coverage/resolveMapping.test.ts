import { RESOLUTION_CAUSES } from '../../kit';
import { buildHealthMatrix, dayOf, lastDays, windowStart } from './healthModel';
import { choiceById, choiceForState, RESOLVE_CHOICES, resolutionFor } from './resolveMapping';

describe('the Resolve mapping (owner decision, board A-10 a)', () => {
  it('is one table: Revert -> reverted, Adopt -> ratified, Accept -> still-live, break-glass kept as the fourth', () => {
    expect(RESOLVE_CHOICES.map(c => [c.id, c.state, c.needs])).toEqual([
      ['revert', 'reverted', 'cause'],
      ['adopt', 'ratified', null],
      ['accept', 'still-live', 'reason'],
      ['break-glass', 'declared-break-glass', null],
    ]);
    expect(choiceForState('ratified')?.label).toBe('Adopt');
    expect(choiceForState('nope')).toBeUndefined();
  });

  it('Revert needs a known cause, Accept needs its reason text (blank is not text), the others need nothing', () => {
    expect(resolutionFor('revert', {})).toEqual({ ok: false, missing: expect.stringContaining('cause') });
    expect(resolutionFor('revert', { cause: '' })).toMatchObject({ ok: false });
    expect(resolutionFor('revert', { cause: RESOLUTION_CAUSES[0] })).toEqual({ ok: true, body: { state: 'reverted', cause: RESOLUTION_CAUSES[0] } });
    expect(resolutionFor('accept', { text: '  ' })).toMatchObject({ ok: false });
    expect(resolutionFor('accept', { text: ' because ' })).toEqual({ ok: true, body: { state: 'still-live', note: 'because' } });
    expect(resolutionFor('adopt', {})).toEqual({ ok: true, body: { state: 'ratified' } });
    expect(resolutionFor('break-glass', { text: 'pager' })).toEqual({ ok: true, body: { state: 'declared-break-glass', note: 'pager' } });
    // a cause typed for another choice is not sent
    expect(resolutionFor('adopt', { cause: RESOLUTION_CAUSES[0] })).toEqual({ ok: true, body: { state: 'ratified' } });
    expect(choiceById('adopt').state).toBe('ratified');
  });
});

describe('the health model', () => {
  const NOW = Date.parse('2026-11-12T12:00:00Z');
  it('takes UTC days, oldest first, ending today', () => {
    expect(lastDays(NOW, 3)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12']);
    expect(dayOf(NOW)).toBe('2026-11-12');
    expect(windowStart(NOW, 3)).toBe('2026-11-10T00:00:00Z');
  });

  it('a day is the worst state that day; a scope with no record is no record, never healthy; a read error is named', () => {
    const rec = (ts: string, state: string, checks: unknown[] = []) => ({ seq: 1, ts, health: { state, checks } }) as any;
    const m = buildHealthMatrix(['a', 'b', 'c'], { a: [rec('2026-11-12T01:00:00Z', 'healthy'), rec('2026-11-12T02:00:00Z', 'blind', [{ name: 'x', ok: false }]), rec('2026-11-12T03:00:00Z', 'degraded'), { seq: 2, ts: 'junk', health: { state: 'blind' } } as any, { seq: 3, ts: '2026-11-12T03:00:00Z' } as any], b: [], c: [] }, NOW, 2, { c: { error: 'boom' } });
    expect(m.days).toEqual(['2026-11-11', '2026-11-12']);
    expect(m.rows[0].cells.map(c => [c.state, c.records])).toEqual([['none', 0], ['blind', 3]]);
    expect(m.rows[0].cells[1].failed).toEqual(['x']);
    expect(m.rows[1].cells.every(c => c.state === 'none')).toBe(true);
    expect(m.rows[2].error).toBe('boom');
  });

  it('days older than the oldest record read are not loaded, not quiet', () => {
    const m = buildHealthMatrix(['a'], { a: [{ seq: 1, ts: '2026-11-11T08:00:00Z', health: { state: 'healthy' } } as any] }, NOW, 3, { a: { coveredFrom: '2026-11-11T08:00:00Z' } });
    expect(m.rows[0].cells.map(c => [c.state, !!c.partial])).toEqual([['none', true], ['healthy', true], ['none', false]]);
  });
});
