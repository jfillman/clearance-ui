import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ClearanceTransportProvider, createFakeTransport } from '../../kit';
import { PolicyView } from './PolicyView';

const longName = 'airframe.deployment.restart.with.a.very.long.suffix.name';
const transport = createFakeTransport(call => {
  if (call.path.startsWith('/v1/policy')) {
    return {
      rules: [],
      tools: [{ name: longName, tier: '2', summary: 'Restarts a deployment.', required_args: ['application', 'environment', 'repository_full_name'], target: 'github://o/r/apps/x/overlays/prod', propose_only: false, writes_files: false, github_cost: 1 }],
      packs: [],
    };
  }
  if (call.path.startsWith('/v1/evidence/counts')) return { items: [] };
  if (call.path.startsWith('/v1/agents')) return { items: [] };
  return undefined;
});

it('the Tool rules table is laid out on fixed columns and wraps long values, so it fits its panel', async () => {
  render(<ClearanceTransportProvider transport={transport}><PolicyView now={Date.parse('2026-11-14T00:00:00Z')} /></ClearanceTransportProvider>);
  fireEvent.click(screen.getByRole('button', { name: /Tool rules/ }));
  const table = await waitFor(() => screen.getByTestId('tool-rules-table'));
  // jsdom does not compute layout, so read the generated rules: a fixed layout (column widths, not content, size the table).
  const css = Array.from(document.querySelectorAll('style')).map(st => st.textContent ?? '').join('\n');
  const fixed = table.className.split(/\s+/).find(k => k.includes('fixed'))!;
  expect(css).toMatch(new RegExp(`\\.${fixed}\\s*\\{[^}]*table-layout: fixed`));
  // The long name is in a chip that is allowed to wrap,.
  const chip = screen.getByText(longName);
  expect(chip.className).toMatch(/wrapChip/);
  // The tab's panels stack (the table takes the full tab width, the dry-run form sits below), they do not sit side by side.
  const row = table.closest('[class*="row"]')!;
  expect(css).toMatch(new RegExp(`\\.${Array.from(row.classList).find(k => k.includes('row'))}\\s*\\{[^}]*flex-direction: column`));
  expect(screen.getByRole('region', { name: 'Would this be allowed?' }).parentElement).toBe(row);
  const cols = Array.from(table.querySelectorAll('col'));
  expect(cols.length).toBe(5);
  // "What does it do" (3rd) takes the flexible remainder (no width of its own); every other column has a fixed share, so
  // it is the widest column and its long text does not wrap into a tall row.
  expect(cols[2].style.width).toBe('');
  cols.filter((_, i) => i !== 2).forEach(col => expect(col.style.width).not.toBe(''));
  const shares = cols.filter((_, i) => i !== 2 && isPercent(cols[i])).map(col => parseFloat(col.style.width));
  expect(shares.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(60);
});

function isPercent(col: HTMLElement) {
  return col.style.width.endsWith('%');
}
