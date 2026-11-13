import { fireEvent, render, screen, within } from '@testing-library/react';
import { useState } from 'react';
import { BASELINE_POLICY, tierCountsOf, tierDefs, TierBadge, TierFilter, TierKey, TierMix } from './tiers';

const change = (over: Record<string, unknown> = {}) =>
  ({
    tier: 3,
    reasons: [{ subject: 'ExternalSecret app/db', rule: 'kind:ExternalSecret', tier: 3 }, { subject: 'Rollout app/web', rule: 'field:replicas', tier: 2 }],
    requirement: { owner: 1, outside: 1, ownerGroup: 'group:default/team-gate', outsideGroups: ['group:default/admins'] },
    state: 'holding', cleared_by: null, proposer_kind: 'person', ...over,
  }) as any;

it('keeps the tier words in one place: the baseline, and the policy in force replaces its numbers', () => {
  const base = tierDefs();
  expect(base.map(d => d.tier)).toEqual([0, 1, 2, 3]);
  expect(base[1].covers).toContain('under 400 changed lines');
  expect(base[2].clears.short).toBe('one owner');
  expect(base[3].clears.short).toBe('two people, one outside the owner group');
  const tight = tierDefs({ ...BASELINE_POLICY, maxLinesTier1: 150, approvers: { '2': { owner: 2, outside: 0 }, '3': { owner: 1, outside: 2 } } });
  expect(tight[1].brief).toContain('under 150 lines');
  expect(tight[2].clears.short).toBe('two owners');
  expect(tight[3].clears.long).toBe('three people: one from the owner group, two from outside it, none of them the proposer');
});

it('the badge hover says why the change has its tier (only the reasons at that tier) and who must clear it', async () => {
  render(<TierBadge tier={3} change={change()}>T3</TierBadge>);
  fireEvent.mouseOver(screen.getByText('T3'));
  const tip = await screen.findByText(/Tier 3: Secrets, RBAC and data/, undefined, { timeout: 2000 });
  const text = tip.parentElement!.textContent!;
  expect(text).toContain('Why: kind:ExternalSecret (ExternalSecret app/db).');
  expect(text).not.toContain('field:replicas');
  expect(text).toContain('Cleared by: one from group:default/team-gate and one from group:default/admins, none of them the proposer.');
  expect(text).toContain('Tier is a floor');
});

it('an out-of-band change shows the dash and says it was seen with no grant', async () => {
  render(<TierBadge tier={null} />);
  fireEvent.mouseOver(screen.getByText('–'));
  expect(await screen.findByText(/Seen in the environment with no grant/, undefined, { timeout: 2000 })).toBeTruthy();
});

it('the filter popover is the legend and a checkbox filter; the pill is amber (pressed) only while a tier is chosen', () => {
  const seen: number[][] = [];
  function Host() {
    const [v, setV] = useState<number[]>([]);
    return <TierFilter value={v} onChange={t => { seen.push(t); setV(t); }} counts={{ 0: 7, 1: 12, 2: 5, 3: 2 }} />;
  }
  render(<Host />);
  const pill = screen.getByRole('button', { name: /all/ });
  expect(pill.getAttribute('aria-pressed')).toBe('false');
  expect(pill.getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(pill);
  const dlg = screen.getByRole('dialog', { name: 'Change tiers' });
  expect(dlg.textContent).toContain('Runtime shape');
  expect(dlg.textContent).toContain('one owner');
  expect(dlg.textContent).toContain('5 in 24 h');
  fireEvent.click(within(dlg).getByRole('checkbox', { name: 'Tier 3: Secrets, RBAC and data' }));
  fireEvent.click(within(dlg).getByRole('checkbox', { name: 'Tier 2: Runtime shape' }));
  expect(seen).toEqual([[3], [2, 3]]);
  expect(screen.getByRole('button', { name: /2, 3/ }).getAttribute('aria-pressed')).toBe('true');
  fireEvent.click(within(dlg).getByRole('button', { name: 'Clear tier filter' }));
  expect(seen[2]).toEqual([]);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('the popover closes on a click outside it and says whether it shows the policy in force or the baseline', () => {
  render(<><p>elsewhere</p><TierFilter value={[]} onChange={() => {}} source="baseline" /></>);
  fireEvent.click(screen.getByRole('button', { name: /all/ }));
  expect(screen.getByRole('dialog').textContent).toContain("gate's baseline");
  fireEvent.mouseDown(screen.getByText('elsewhere'));
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('the key shows one cell per tier plus not tiered, and collapses to badges', () => {
  render(<TierKey counts={{ 2: 5 }} />);
  const key = screen.getByRole('group', { name: 'Tier key' });
  expect(key.textContent).toContain('Policy, at once'.toLowerCase());
  expect(key.textContent).toContain('5 in 24 h');
  expect(key.textContent).toContain('Not tiered');
  fireEvent.click(within(key).getByRole('button', { name: /Hide key/ }));
  expect(key.textContent).not.toContain('replicas');
  expect(within(key).getByRole('button', { name: /Show key/ }).getAttribute('aria-expanded')).toBe('false');
});

it('the mix bar sizes segments by share and names the counts for a screen reader', () => {
  const counts = tierCountsOf([{ key: '0', count: 6 }, { key: '2', count: 2 }, { key: '3', count: 2 }, { key: null, count: 9 }, { key: '9', count: 4 }]);
  expect(counts).toEqual({ 0: 6, 2: 2, 3: 2 });
  render(<TierMix counts={counts} />);
  const bar = screen.getByRole('img', { name: 'Changes by tier: tier 0 6, tier 1 0, tier 2 2, tier 3 2' });
  const widths = Array.from(bar.children).map(c => (c as HTMLElement).style.width);
  expect(widths).toEqual(['60%', '20%', '20%']);
});
