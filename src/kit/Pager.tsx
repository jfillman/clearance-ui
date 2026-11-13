import { makeStyles } from '@material-ui/core/styles';
import type { Theme } from '@material-ui/core/styles';
import { Button, Count, FilterSelect } from './kit';
import { fontMono, fontScale, tokensForTheme } from './tokens';

/** Rows per page, the house set (Evidence and Tower use the same four). */
export const PAGE_SIZES = [10, 25, 50, 100] as const;
export const DEFAULT_PAGE_SIZE = 50;

const useStyles = makeStyles<Theme>(theme => {
  const t = tokensForTheme(theme);
  return {
  bar: { display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', padding: '8px 18px', fontFamily: fontMono, fontSize: fontScale.sm, borderTop: `1px solid ${t.lineSoft}` },
  info: { marginRight: 'auto' },
  };
});

/** The rows a page shows, with the page clamped into range (a filter can leave fewer pages than the one asked for). */
export function pageSlice<T>(items: T[], page: number, pageSize: number): { rows: T[]; page: number; pages: number } {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const cur = Math.min(Math.max(0, page), pages - 1);
  return { rows: items.slice(cur * pageSize, (cur + 1) * pageSize), page: cur, pages };
}

/** Previous / Next with "x-y of n" and the rows-per-page choice. `page` is zero-based. */
export function Pager({ total, page, pageSize, onPage, onPageSize, label = 'Pages' }: { total: number; page: number; pageSize: number; onPage: (page: number) => void; onPageSize: (size: number) => void; label?: string }) {
  const c = useStyles();
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const cur = Math.min(Math.max(0, page), pages - 1);
  const from = total === 0 ? 0 : cur * pageSize + 1;
  const to = Math.min(total, (cur + 1) * pageSize);
  return (
    <nav className={c.bar} aria-label={label}>
      <span className={c.info} aria-live="polite"><Count>{from}-{to} of {total} · page {cur + 1} of {pages}</Count></span>
      <FilterSelect label="Rows per page" value={String(pageSize)} options={PAGE_SIZES.map(n => ({ value: String(n), label: `${n} rows` }))} onChange={v => onPageSize(Number(v))} />
      <Button small disabled={cur <= 0} onClick={() => onPage(cur - 1)}>Previous</Button>
      <Button small disabled={cur >= pages - 1} onClick={() => onPage(cur + 1)}>Next</Button>
    </nav>
  );
}
