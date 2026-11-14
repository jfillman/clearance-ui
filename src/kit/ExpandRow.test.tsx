import { fireEvent, render, screen } from '@testing-library/react';
import { ExpandRow, useOneOpen } from './ExpandRow';

const scroll = jest.fn();
beforeEach(() => {
  scroll.mockClear();
  Element.prototype.scrollIntoView = scroll;
});

function Table({ initial }: { initial?: string }) {
  const { open, toggle } = useOneOpen<string>(initial);
  return (
    <table>
      <tbody>
        {['a', 'b', 'c'].map(k => (
          <ExpandRow key={k} id={`r-${k}`} open={open === k} onToggle={() => toggle(k)} colSpan={2} label={`Details ${k}`} details={<input aria-label={`field ${k}`} />}>
            <td>row {k}</td>
            <td><button type="button">act {k}</button></td>
          </ExpandRow>
        ))}
      </tbody>
    </table>
  );
}
const row = (k: string) => screen.getByText(`row ${k}`).closest('tr')!;

it('opens the details directly under the clicked row and scrolls them into view, nearest', () => {
  render(<Table />);
  expect(screen.queryByTestId('expanded-details')).toBeNull();
  fireEvent.click(row('b'));
  const details = screen.getByRole('region', { name: 'Details b' });
  expect(row('b').nextElementSibling!.contains(details)).toBe(true);
  expect(row('b').getAttribute('aria-expanded')).toBe('true');
  expect(row('b').getAttribute('aria-controls')).toBe('r-b-details');
  expect(scroll).toHaveBeenCalledTimes(1);
  expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ block: 'nearest' }));
  expect(scroll.mock.instances[0]).toBe(screen.getByTestId('expanded-details'));
});

it('keeps one row open at a time and closes on a second click', () => {
  render(<Table />);
  fireEvent.click(row('a'));
  fireEvent.click(row('b'));
  expect(screen.getAllByTestId('expanded-details')).toHaveLength(1);
  expect(screen.getByLabelText('field b')).toBeTruthy();
  expect(row('a').getAttribute('aria-expanded')).toBe('false');
  fireEvent.click(row('b'));
  expect(screen.queryByTestId('expanded-details')).toBeNull();
});

it('Enter and Space on the row toggle it; Escape on the row or inside the details closes it', () => {
  render(<Table />);
  fireEvent.keyDown(row('a'), { key: 'Enter' });
  expect(screen.getByLabelText('field a')).toBeTruthy();
  fireEvent.keyDown(row('a'), { key: ' ' });
  expect(screen.queryByLabelText('field a')).toBeNull();
  fireEvent.keyDown(row('a'), { key: ' ' });
  fireEvent.keyDown(row('a'), { key: 'Escape' });
  expect(screen.queryByLabelText('field a')).toBeNull();
  fireEvent.keyDown(row('c'), { key: 'Enter' });
  fireEvent.keyDown(screen.getByLabelText('field c'), { key: 'Escape' });
  expect(screen.queryByLabelText('field c')).toBeNull();
});

it('a key pressed in a control inside the row belongs to the control, not the row', () => {
  render(<Table />);
  fireEvent.keyDown(screen.getByText('act a'), { key: 'Enter' });
  expect(screen.queryByTestId('expanded-details')).toBeNull();
});

it('a deep link opens its row on first render and scrolls to it', () => {
  render(<Table initial="c" />);
  expect(screen.getByLabelText('field c')).toBeTruthy();
  expect(scroll).toHaveBeenCalledTimes(1);
});

it('the details cell cancels the table kit\'s td:first-child / td:last-child padding (a colSpan cell is both), so the panel is as wide as the row', () => {
  render(<Table initial="a" />);
  const cell = screen.getByRole('region', { name: 'Details a' });
  // jsdom does not cascade pseudo-classes, so read the generated rules: the drawer class must reset both edges.
  const css = Array.from(document.querySelectorAll('style')).map(st => st.textContent ?? '').join('\n');
  const drawer = cell.className.split(/\s+/).find(k => k.includes('drawer'))!;
  expect(css).toMatch(new RegExp(`\\.${drawer}:first-child[^{]*\\{[^}]*padding: 0`));
  expect(css).toMatch(new RegExp(`\\.${drawer}:last-child[^{]*\\{[^}]*padding: 0`));
});
