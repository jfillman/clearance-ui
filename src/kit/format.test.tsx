import { act, fireEvent, render, screen } from '@testing-library/react';
import { clock, dateTime, dateTimeShort, utcDateTime, whenTitle } from './format';
import { Time } from './Time';

// Timestamps are shown in the viewer's zone with the UTC value on hover. Every assertion pins the zone and locale so
// the result does not depend on the machine that runs it.
const TOR = { timeZone: 'America/Toronto', locale: 'en-US' };
const TOKYO = { timeZone: 'Asia/Tokyo', locale: 'en-US' };
const ISO = '2026-11-16T14:13:42Z'; // 09:13:42 in Toronto (EST, UTC-5), 23:13:42 in Tokyo (UTC+9)

describe('local time with UTC beside it', () => {
  it('dateTime and clock show the viewer\'s zone, as Tower does (toLocaleString)', () => {
    expect(dateTime(ISO, TOR)).toBe('11/16/2026, 9:13:42 AM');
    expect(dateTime(ISO, TOKYO)).toBe('11/16/2026, 11:13:42 PM');
    expect(clock(ISO, TOR)).toBe('9:13:42 AM');
    expect(dateTimeShort(ISO, TOR)).toBe('11/16, 09:13 AM');
  });

  it('follows daylight saving: the same clock reading is a different UTC hour in summer', () => {
    expect(dateTime('2026-07-16T13:13:42Z', TOR)).toBe('7/16/2026, 9:13:42 AM');
  });

  it('a date across midnight lands on the viewer\'s day', () => {
    expect(dateTime('2026-11-17T03:30:00Z', TOR)).toBe('11/16/2026, 10:30:00 PM');
  });

  it('utcDateTime is the UTC value, to the minute or the second, whatever the zone', () => {
    expect(utcDateTime('2026-10-31T01:13:42.123456+00:00')).toBe('2026-10-31 01:13Z');
    expect(utcDateTime('2026-10-30T23:59:59-02:00')).toBe('2026-10-31 01:59Z');
    expect(utcDateTime(ISO, true)).toBe('2026-11-16 14:13:42Z');
  });

  it('whenTitle gives both', () => {
    expect(whenTitle(ISO, TOR)).toBe('11/16/2026, 9:13:42 AM (2026-11-16 14:13:42Z)');
  });

  it('empty and unparsable values do not throw', () => {
    for (const f of [dateTime, clock, dateTimeShort, utcDateTime, whenTitle]) {
      expect(f(undefined)).toBe('');
      expect(f(null)).toBe('');
      expect(f('not a date')).toBe('not a date');
    }
  });

  it('with no options the viewer\'s own zone is used', () => {
    expect(dateTime(ISO)).toBe(new Date(ISO).toLocaleString());
    expect(clock(ISO)).toBe(new Date(ISO).toLocaleTimeString());
  });

  it('<Time> shows the local time and the UTC time on hover', async () => {
    render(<Time iso={ISO} />);
    const text = screen.getByText(new Date(ISO).toLocaleString());
    fireEvent.mouseOver(text);
    expect(await screen.findByText('2026-11-16 14:13:42Z')).toBeTruthy();
  });

  it('<Time> carries the UTC value in its own text for assistive technology, with no tab stop', () => {
    render(<table><tbody><tr><td><Time iso={ISO} /></td><td><Time iso={ISO} format="short" /></td></tr></tbody></table>);
    const times = document.querySelectorAll('time');
    expect(times).toHaveLength(2);
    for (const t of times) {
      expect(t.getAttribute('datetime')).toBe(ISO);
      expect(t.textContent).toContain('(UTC 2026-11-16 14:13:42Z)');
      expect(t.hasAttribute('tabindex')).toBe(false);
    }
    expect(document.querySelectorAll('[tabindex]')).toHaveLength(0);
  });

  it('<Time standalone> (a fact in a detail pane) is focusable so the tooltip opens from the keyboard', async () => {
    render(<Time iso={ISO} standalone />);
    const t = document.querySelector('time') as HTMLElement;
    expect(t.getAttribute('tabindex')).toBe('0');
    fireEvent.keyDown(document.body, { key: 'Tab' }); // keyboard modality, as MUI's focus-visible needs
    act(() => t.focus());
    expect(await screen.findByRole('tooltip')).toBeTruthy();
  });

  it('<Time> shows nothing for no time and the raw text for a non-date', () => {
    const { container, rerender } = render(<Time iso={undefined} />);
    expect(container.textContent).toBe('');
    rerender(<Time iso="soon" />);
    expect(container.textContent).toBe('soon');
  });
});
