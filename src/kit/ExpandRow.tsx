import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { useTableKit } from './kit';

// One pattern for every table whose rows have details: the details open INLINE, directly under the clicked row, so a
// row near the bottom of a long table never opens its panel off the page. Every Clearance table uses this component so
// the tabs cannot diverge: one row open at a time (useOneOpen), Enter/Space on the row toggles, Escape closes, and the
// opened details scroll into view (block 'nearest') the moment they open, which is also what a deep link does on load.

const useStyles = makeStyles(() => ({
  // The details cell carries its own padding (a Section, or a padded body).
  drawer: { padding: 0 },
}));

/** Which row is open: at most one. `initial` is a deep link (`?change=<id>`). */
export function useOneOpen<K extends string | number>(initial?: K): { open: K | undefined; toggle: (key: K) => void; close: () => void; set: (key: K | undefined) => void } {
  const [open, set] = useState<K | undefined>(initial);
  const toggle = useCallback((key: K) => set(cur => (cur === key ? undefined : key)), []);
  const close = useCallback(() => set(undefined), []);
  return { open, toggle, close, set };
}

export interface ExpandRowProps {
  /** Unique within the page; the details row is `${id}-details`, which the row's aria-controls names. */
  id: string;
  open: boolean;
  onToggle: () => void;
  /** Columns in the table, for the details cell. */
  colSpan: number;
  /** The row's cells (`<td>`s). */
  children: ReactNode;
  /** The details, rendered only while open. */
  details: ReactNode;
  /** Accessible name for the details region, e.g. "Change ch-1 details". */
  label: string;
}

/** A row that expands inline. Renders two `<tr>`s: the row, and while open its details. */
export function ExpandRow({ id, open, onToggle, colSpan, children, details, label }: ExpandRowProps) {
  const tk = useTableKit();
  const c = useStyles();
  const ref = useRef<HTMLTableRowElement>(null);
  const detailsId = `${id}-details`;
  // Scroll the opened details into view; 'nearest' moves the page only as far as needed. jsdom has no scrollIntoView.
  // A wide table scrolls sideways inside its panel: the details are held to the panel's visible width and stay at the
  // left edge, so on a narrow screen they are readable without scrolling the table.
  const [width, setWidth] = useState<number>();
  const measured = width !== undefined;
  useLayoutEffect(() => {
    const holder = open ? ref.current?.closest('table')?.parentElement : undefined;
    if (!holder) return undefined;
    const measure = () => setWidth(holder.clientWidth || undefined);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(measure);
    ro.observe(holder);
    return () => ro.disconnect();
  }, [open]);
  useEffect(() => {
    if (open) ref.current?.scrollIntoView?.({ block: 'nearest', behavior: 'smooth' });
  }, [open, measured]); // again once the measured width has reflowed the details
  const rowKey = (e: KeyboardEvent<HTMLTableRowElement>) => {
    if (e.target !== e.currentTarget) {
      // A key pressed inside a control in the row (a link, a checkbox) belongs to that control; Escape still closes.
      if (e.key === 'Escape' && open) onToggle();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onToggle();
    } else if (e.key === 'Escape' && open) onToggle();
  };
  return (
    <Fragment>
      <tr
        className={`${tk.rowLink} ${open ? tk.rowSelected : ''}`}
        aria-expanded={open}
        aria-controls={open ? detailsId : undefined}
        tabIndex={0}
        onClick={onToggle}
        onKeyDown={rowKey}
      >
        {children}
      </tr>
      {open && (
        <tr
          id={detailsId}
          ref={ref}
          data-testid="expanded-details"
          onKeyDown={e => {
            // Escape inside the details closes them, unless a control inside already used it.
            if (e.key === 'Escape' && !e.defaultPrevented) onToggle();
          }}
        >
          <td className={`${tk.td} ${c.drawer}`} colSpan={colSpan} role="region" aria-label={label}>
            <div style={width ? { position: 'sticky', left: 0, width, boxSizing: 'border-box' } : undefined}>{details}</div>
          </td>
        </tr>
      )}
    </Fragment>
  );
}
