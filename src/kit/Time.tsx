import { dateTime, dateTimeShort, clock, utcDateTime } from './format';
import { Tooltip } from './kit';

// Read by assistive technology and found by search, never seen: the UTC value for a reader who cannot hover.
const visuallyHidden = { position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap' } as const;

/**
 * A moment as the viewer's local time, with the UTC value on hover. The one way a view shows a time as text (W-11):
 * `format` picks the date and time (default), a compact month-day-minute for a table cell, or the time of day.
 *
 * Keyboard and screen readers: the UTC value is in the element's own text (visually hidden), so it is read with the
 * time and needs no tab stop. A time that stands alone as a fact (a detail pane) passes `standalone`, which makes it
 * focusable so the kit Tooltip also opens on keyboard focus; times inside table rows and running sentences are not
 * focusable (a stop per row would bury the table's own controls).
 */
export function Time({ iso, format = 'full', standalone = false }: { iso: string | null | undefined; format?: 'full' | 'short' | 'clock'; standalone?: boolean }) {
  if (!iso) return null;
  const text = { full: dateTime, short: dateTimeShort, clock }[format](iso);
  if (text === iso) return <>{text}</>; // not a date: nothing to place in UTC
  const utc = utcDateTime(iso, true);
  return (
    <Tooltip title={utc}>
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <time dateTime={iso} tabIndex={standalone ? 0 : undefined}>
        {text}
        <span style={visuallyHidden}> (UTC {utc})</span>
      </time>
    </Tooltip>
  );
}
