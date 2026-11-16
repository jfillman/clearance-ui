import { dateTime, dateTimeShort, clock, utcDateTime } from './format';
import { Tooltip } from './kit';

/**
 * A moment as the viewer's local time, with the UTC value on hover. The one way a view shows a time as text (W-11):
 * `format` picks the date and time (default), a compact month-day-minute for a table cell, or the time of day.
 */
export function Time({ iso, format = 'full' }: { iso: string | null | undefined; format?: 'full' | 'short' | 'clock' }) {
  if (!iso) return null;
  const text = { full: dateTime, short: dateTimeShort, clock }[format](iso);
  if (text === iso) return <>{text}</>; // not a date: nothing to place in UTC
  return (
    <Tooltip title={utcDateTime(iso, true)}>
      <span>{text}</span>
    </Tooltip>
  );
}
