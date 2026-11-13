import { fireEvent, render, screen } from '@testing-library/react';
import { Pager, pageSlice } from './Pager';

it('slices a page and clamps one that no longer exists', () => {
  const items = Array.from({ length: 23 }, (_, i) => i);
  expect(pageSlice(items, 0, 10).rows).toHaveLength(10);
  expect(pageSlice(items, 2, 10)).toMatchObject({ rows: [20, 21, 22], page: 2, pages: 3 });
  expect(pageSlice(items, 9, 10).page).toBe(2);
  expect(pageSlice([], 0, 10)).toMatchObject({ rows: [], page: 0, pages: 1 });
});

it('pages with Previous/Next and offers the house page sizes', () => {
  const onPage = jest.fn();
  const onPageSize = jest.fn();
  render(<Pager total={23} page={1} pageSize={10} onPage={onPage} onPageSize={onPageSize} />);
  expect(screen.getByRole('navigation', { name: 'Pages' }).textContent).toContain('11-20 of 23 · page 2 of 3');
  fireEvent.click(screen.getByText('Next'));
  fireEvent.click(screen.getByText('Previous'));
  expect(onPage.mock.calls).toEqual([[2], [0]]);
  fireEvent.change(screen.getByLabelText('Rows per page'), { target: { value: '25' } });
  expect(onPageSize).toHaveBeenCalledWith(25);
});
