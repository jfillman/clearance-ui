import { render, screen } from '@testing-library/react';
import { dateTime } from './format';
import { ProductMark } from './ProductMark';

it('dateTime places a moment on the day and minute, in UTC', () => {
  expect(dateTime('2026-10-31T01:13:42.123456+00:00')).toBe('2026-10-31 01:13Z');
  expect(dateTime('2026-10-30T23:59:59-02:00')).toBe('2026-10-31 01:59Z');
  expect(dateTime(undefined)).toBe('');
  expect(dateTime('not a date')).toBe('not a date');
});

it('draws each product its own glyph on the shared dial, with the amber heading bug', () => {
  const { container } = render(
    <>
      <ProductMark product="autopilot" />
      <ProductMark product="clearance" size={48} />
    </>,
  );
  const autopilot = screen.getByRole('img', { name: 'autopilot mark' });
  const clearance = screen.getByRole('img', { name: 'clearance mark' });
  expect(autopilot.getAttribute('width')).toBe('24');
  expect(clearance.getAttribute('width')).toBe('48');
  // The brand files' geometry: brackets and a nose; a check over the hold-short line and its dashed pair.
  expect(autopilot.querySelector('path[d^="M33,34"]')).toBeTruthy();
  expect(autopilot.querySelector('polygon[points^="48,33"]')).toBeTruthy();
  expect(clearance.querySelector('path[d^="M35,37"]')).toBeTruthy();
  expect(clearance.querySelector('line[stroke-dasharray]')).toBeTruthy();
  // Every dial has the ring, eight ticks and the bug.
  for (const mark of container.querySelectorAll('svg')) {
    expect(mark.querySelectorAll('circle')).toHaveLength(1);
    expect(mark.querySelectorAll('g > line')).toHaveLength(8);
    expect(mark.querySelector('polygon[points="44,2 52,2 48,9"]')).toBeTruthy();
  }
});
