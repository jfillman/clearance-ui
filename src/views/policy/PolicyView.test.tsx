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
  expect(table.querySelectorAll('col').length).toBe(5);
});
