import { forwardRef, useMemo, useState, type ButtonHTMLAttributes, type ReactElement, type ReactNode } from 'react';
import MuiTooltip from '@material-ui/core/Tooltip';
import { preventFocusScroll } from './format';
import { useClearanceTokens } from './tokens';
import { useBlocks, useControls, useData, useFeedback, useSection, useStatus, useUi } from './kitStyles';

// The Clearance and Autopilot plugins' kit: the same pieces and rules as Tower's src/ui (docs/design-system.md there),
// rebuilt against ClearanceTokens because these plugins install without Tower and can never import it. Names match
// Tower's so a view reads the same in both. The rules, short:
//
//   tokens, never hex · the type scale (11/12/13/15/18/22/32) only · amber is attention, sky is motion
//   four kinds of control: Action = Button (a box, one amber primary, only when it is the next step);
//     Filter = labelled pills, the one that is on is AMBER (FilterChips / FilterChip in a FilterGroup /
//     FilterSelect / FilterInput / SearchField, in a FilterBar); Link = sky mono TextLink; Status = rounded StatusChip.
//   a square Chip is a label (what it is); a rounded StatusChip is a state (what it is in)
//   detail is the kit Tooltip, never a native title= (a truncated value's full text excepted)
//   loading is a TabSkeleton/PanelSkeleton, a failed load a TabError

const cx = (...c: Array<string | false | undefined>) => c.filter(Boolean).join(' ');

function useKit() {
  const t = useClearanceTokens();
  return { t, ui: useUi() };
}
function useControlsKit() {
  return useControls();
}

// ---- reasons and detail

/** Detail that blocks nothing (what a chip means, why a value is what it is): opens 300 ms after hover, at once on focus. */
export function Tooltip({ title, children }: { title: ReactNode; children: ReactElement }) {
  // Most chips and facts have no title: return before any hook runs.
  if (!title) return children;
  return <TooltipOn title={title}>{children}</TooltipOn>;
}

function TooltipOn({ title, children }: { title: NonNullable<ReactNode>; children: ReactElement }) {
  const f = useFeedback();
  // A DOM element takes the tooltip directly; a component child (Chip, Button) is wrapped, since MUI needs a ref. A
  // disabled control fires no events, so its wrapper is itself focusable and a keyboard user can still reach the reason.
  const disabled = Boolean((children.props as { disabled?: boolean }).disabled);
  const target =
    typeof children.type === 'string' && !disabled ? (
      children
    ) : (
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex
      <span style={{ display: 'inline-flex' }} tabIndex={disabled ? 0 : undefined}>
        {children}
      </span>
    );
  return (
    <MuiTooltip title={title} enterDelay={300} enterNextDelay={150} classes={{ tooltip: f.tip }} placement="bottom">
      {target}
    </MuiTooltip>
  );
}

/** Why a primary action is unavailable, as a visible line under the action bar (never only a tooltip). */
export function ActionReason({ id, children }: { id?: string; children: ReactNode }) {
  const f = useFeedback();
  return (
    <div id={id} className={f.reason}>
      <span className={f.reasonIcon} aria-hidden>
        ⊘
      </span>
      <div>{children}</div>
    </div>
  );
}

// ---- page chrome and surfaces

export function PageHeader({ title, subtitle, eyebrow, actions }: { title: string; subtitle?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode }) {
  const { ui } = useKit();
  return (
    <div className={ui.pageHead}>
      <div>
        {eyebrow && <div className={ui.eyebrow}>{eyebrow}</div>}
        <h1 className={ui.pageTitle} style={eyebrow ? { marginTop: 4 } : undefined}>
          {title}
        </h1>
        {subtitle && <p className={ui.pageSub}>{subtitle}</p>}
      </div>
      {actions && <div className={ui.pageActions}>{actions}</div>}
    </div>
  );
}

export const Panel = forwardRef<HTMLDivElement, { accent?: boolean; className?: string; children?: ReactNode } & React.HTMLAttributes<HTMLDivElement>>((
  { accent, className, children, ...rest },
  ref,
) => {
  const { ui } = useKit();
  return (
    <div ref={ref} className={cx(ui.panel, accent && ui.panelAccent, className)} {...rest}>
      {children}
    </div>
  );
});
Panel.displayName = 'Panel';

export function SectionLabel({ children }: { children: ReactNode }) {
  const { ui } = useKit();
  return <h2 className={ui.sectionLabel}>{children}</h2>;
}

export function ColumnLabel({ children }: { children?: ReactNode }) {
  const { ui } = useKit();
  return <span className={ui.columnLabel}>{children}</span>;
}

// ---- actions

export type ButtonVariant = 'default' | 'primary' | 'danger';

/** An action: it changes something. One amber `primary` per view, and only when it is the next step. */
export function Button({ variant = 'default', small, className, type = 'button', title, ...rest }: { variant?: ButtonVariant; small?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const { ui } = useKit();
  const button = (
    <button
      type={type}
      onMouseDown={preventFocusScroll}
      className={cx(ui.button, variant === 'primary' && ui.buttonPrimary, variant === 'danger' && ui.buttonDanger, small && ui.buttonSmall, className)}
      {...rest}
    />
  );
  return title ? <Tooltip title={title}>{button}</Tooltip> : button;
}

/** A checkbox for picking rows: amber when on (a filter-like choice, not an action). Give it an aria-label. */
export function Checkbox({ className, ...rest }: Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const { ui } = useKit();
  return <input type="checkbox" className={cx(ui.checkbox, className)} {...rest} />;
}

/** A small square icon button (a ✕ that removes a row). Give it an aria-label. */
export function IconButton({ className, type = 'button', ...rest }: ButtonHTMLAttributes<HTMLButtonElement>) {
  const { ui } = useKit();
  return <button type={type} onMouseDown={preventFocusScroll} className={cx(ui.iconButton, className)} {...rest} />;
}

// ---- chips

/** A label chip's tone: `amber` is attention (a tier that needs a person), `sky` motion or identity, `ok`/`bad` verdicts. */
export type Tone = 'neutral' | 'sky' | 'amber' | 'ok' | 'bad';

/** A label (what it is): a tier, a kind, a tool, an app, a pack. Square. A state is a StatusChip. */
export function Chip({ tone = 'neutral', title, className, children }: { tone?: Tone; title?: string; className?: string; children: ReactNode }) {
  const { ui } = useKit();
  const toneClass = { neutral: undefined, sky: ui.chipSky, amber: ui.chipAmber, ok: ui.chipOk, bad: ui.chipBad }[tone];
  return (
    <Tooltip title={title}>
      <span className={cx(ui.chip, toneClass, className)}>{children}</span>
    </Tooltip>
  );
}

/** ok: done or healthy · warn: waiting on a person or out of step · bad: failed or denied · info: in motion (blue) · neutral: none. */
export type StatusTone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';

/** A state (what it is in): allow, deny, live, tripped, holding. Rounded with a soft tint. */
export function StatusChip({ tone, dot, title, className, children }: { tone: StatusTone; dot?: boolean; title?: string; className?: string; children: ReactNode }) {
  const s = useStatus();
  return (
    <Tooltip title={title}>
      <span className={cx(s.status, s[tone], className)}>
        {dot && <i className={s.statusDot} aria-hidden />}
        {children}
      </span>
    </Tooltip>
  );
}

// ---- filters

export interface FilterOption<T extends string> {
  id: T;
  label: string;
  count?: number;
  title?: string;
}

type PillProps = { on: boolean; count?: number; title?: string; onClick: () => void; children: ReactNode; /** The pill opens a popover: `expanded` says whether it is open. */ expanded?: boolean };

// The pill, given the kit classes: a row of pills shares its group's one hook call.
function Pill({ ui, on, count, title, onClick, children, expanded }: PillProps & { ui: ReturnType<typeof useControls> }) {
  return (
    <Tooltip title={title}>
      <button type="button" aria-pressed={on} aria-haspopup={expanded === undefined ? undefined : 'dialog'} aria-expanded={expanded} onMouseDown={preventFocusScroll} className={cx(ui.filterChip, on && ui.filterChipOn)} onClick={onClick}>
        {children}
        {count !== undefined && ' '}
        {count !== undefined && <span className={cx(ui.filterCount, on && ui.filterCountOn)}>{count}</span>}
      </button>
    </Tooltip>
  );
}

/** One filter: a labelled row of pills, exactly one on (amber). Changes what the view shows, nothing else. */
export function FilterChips<T extends string>({
  label,
  hideLabel,
  options,
  value,
  onChange,
}: {
  label: string;
  hideLabel?: boolean;
  options: Array<FilterOption<T>>;
  value: T;
  onChange: (id: T) => void;
}) {
  const ui = useControlsKit();
  return (
    <div className={ui.filterGroup} role="group" aria-label={label}>
      {!hideLabel && <span className={ui.filterLabel}>{label}</span>}
      {options.map(o => (
        <Pill key={o.id} ui={ui} on={o.id === value} count={o.count} title={o.title} onClick={() => onChange(o.id)}>
          {o.label}
        </Pill>
      ))}
    </div>
  );
}

/** A single filter pill, for a filter where several can be on at once (wrap them in a `FilterGroup`). */
export function FilterChip(props: PillProps) {
  const ui = useControlsKit();
  return <Pill ui={ui} {...props} />;
}

/** A labelled group of `FilterChip`s (multi-select, or a single on/off such as "Unresolved only"). */
export function FilterGroup({ label, hideLabel, children }: { label: string; hideLabel?: boolean; children: ReactNode }) {
  const ui = useControlsKit();
  return (
    <div className={ui.filterGroup} role="group" aria-label={label}>
      {!hideLabel && <span className={ui.filterLabel}>{label}</span>}
      {children}
    </div>
  );
}

/** A filter with too many values for pills (an agent, a scope, a window, page size): a labelled select styled like a pill. */
export function FilterSelect<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange: (value: T) => void;
  disabled?: boolean;
}) {
  const ui = useControlsKit();
  return (
    <label className={ui.filterGroup}>
      <span className={ui.filterLabel}>{label}</span>
      <select className={ui.select} value={value} disabled={disabled} onChange={e => onChange(e.target.value as T)}>
        {options.map(o => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

/** A filter that is typed (a tool name, a rule id), labelled like the others. */
export function FilterInput({ label, placeholder, value, onChange, width }: { label: string; placeholder?: string; value: string; onChange: (value: string) => void; width?: number }) {
  const ui = useControlsKit();
  return (
    <label className={ui.filterGroup}>
      <span className={ui.filterLabel}>{label}</span>
      <input className={ui.filterInput} style={width ? { width } : undefined} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
    </label>
  );
}

/** Search: a field in the filter row. */
export function SearchField({ label, placeholder, value, onChange }: { label: string; placeholder?: string; value: string; onChange: (value: string) => void }) {
  const ui = useControlsKit();
  return (
    <div className={ui.search}>
      <svg className={ui.searchIcon} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
        <path d="M15.5 14h-.79l-.28-.27A6.47 6.47 0 0 0 16 9.5 6.5 6.5 0 1 0 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z" />
      </svg>
      <input type="search" aria-label={label} className={ui.searchInput} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} />
    </div>
  );
}

/** The row of filters above a list: filters and search first, `end` (a count, a hint) at the right. Page actions stay in the PageHeader. */
export function FilterBar({ children, end }: { children?: ReactNode; end?: ReactNode }) {
  const ui = useControlsKit();
  return (
    <div className={ui.filterBar}>
      {children}
      {end && <div className={ui.filterBarEnd}>{end}</div>}
    </div>
  );
}

// ---- links

/** The class of a link, for a router `<Link className=…>` (this package has no router): sky mono text, no box. */
export function useTextLinkClass(): string {
  return useControlsKit().textLink;
}

/** Text that goes somewhere (→ another tab, ↗ another site) or shows/hides a detail (`expanded`). Never a box. */
export function TextLink({
  href,
  onClick,
  title,
  expanded,
  disabled,
  'aria-label': ariaLabel,
  'aria-controls': ariaControls,
  children,
}: {
  href?: string;
  onClick?: () => void;
  title?: string;
  expanded?: boolean;
  disabled?: boolean;
  'aria-label'?: string;
  'aria-controls'?: string;
  children: ReactNode;
}) {
  const ui = useControlsKit();
  if (href) {
    return (
      <Tooltip title={title}>
        <a className={ui.textLink} href={href} target="_blank" rel="noopener noreferrer">
          {children}
        </a>
      </Tooltip>
    );
  }
  return (
    <Tooltip title={title}>
      <button type="button" className={ui.textLink} aria-expanded={expanded} aria-label={ariaLabel} aria-controls={ariaControls} disabled={disabled} onMouseDown={preventFocusScroll} onClick={onClick}>
        {expanded !== undefined && <span aria-hidden>{expanded ? '▾' : '▸'}</span>}
        {children}
      </button>
    </Tooltip>
  );
}

// ---- sub-tabs

export function Subtabs<T extends string>({ label, tabs, value, onChange }: { label: string; tabs: Array<{ id: T; label: string }>; value: T; onChange: (id: T) => void }) {
  const { ui } = useKit();
  return (
    <div className={ui.subtabs} role="tablist" aria-label={label}>
      {tabs.map(tab => (
        <button key={tab.id} type="button" role="tab" aria-selected={tab.id === value} onMouseDown={preventFocusScroll} className={cx(ui.subtab, tab.id === value && ui.subtabOn)} onClick={() => onChange(tab.id)}>
          {tab.label}
        </button>
      ))}
    </div>
  );
}

// ---- fields

/** A labelled input, select or textarea: the label, then the control with the kit's input class. */
export function Field({ label, children }: { label: ReactNode; children: (props: { className: string }) => ReactNode }) {
  const { ui } = useKit();
  return (
    <label className={ui.field}>
      <span className={ui.fieldLabel}>{label}</span>
      {children({ className: ui.input })}
    </label>
  );
}

/** The input class alone, for a control that sits in a row (a reason box beside its buttons). */
export function useInputClass(): { input: string; textarea: string; problem: string } {
  const { ui } = useKit();
  return { input: ui.input, textarea: cx(ui.input, ui.textarea), problem: ui.problem };
}

// ---- sections and notes

function useSectionKit() {
  return useSection();
}

/** A block inside a tab: a 15px title (`level={2}` 13px, inside a card), `meta` after it, `count` and `actions` at the right. `framed` draws a panel. */
export function Section({
  title,
  meta,
  count,
  actions,
  framed,
  level = 1,
  className,
  children,
  ...rest
}: {
  title: ReactNode;
  meta?: ReactNode;
  count?: ReactNode;
  actions?: ReactNode;
  framed?: boolean;
  level?: 1 | 2;
  className?: string;
  children?: ReactNode;
} & Omit<React.HTMLAttributes<HTMLElement>, 'title'>) {
  const s = useSectionKit();
  const Heading = level === 2 ? 'h3' : 'h2';
  return (
    <section className={cx(s.section, framed && s.framed, className)} {...rest}>
      <div className={cx(s.head, framed && s.headFramed)}>
        <div className={s.headStart}>
          <Heading className={cx(s.title, level === 2 && s.title2)}>{title}</Heading>
          {meta}
        </div>
        {(count !== undefined || actions) && (
          <div className={s.headEnd}>
            {count !== undefined && <span className={s.count}>{count}</span>}
            {actions}
          </div>
        )}
      </div>
      {children}
    </section>
  );
}

export function SectionTitle({ level = 1, children }: { level?: 1 | 2; children: ReactNode }) {
  const s = useSectionKit();
  const Heading = level === 2 ? 'h3' : 'h2';
  return <Heading className={cx(s.title, level === 2 && s.title2)}>{children}</Heading>;
}

/** "Nothing here". `inset` adds the panel padding, for a note straight inside a framed Section. */
export function EmptyNote({ inset, className, ...rest }: { inset?: boolean } & React.HTMLAttributes<HTMLParagraphElement>) {
  const s = useSectionKit();
  return <p className={cx(s.empty, inset && s.inset, className)} {...rest} />;
}

/** A line that explains. Not italic: it is not an empty state. */
export function Hint({ inset, className, ...rest }: { inset?: boolean } & React.HTMLAttributes<HTMLParagraphElement>) {
  const s = useSectionKit();
  return <p className={cx(s.hint, inset && s.inset, className)} {...rest} />;
}

/** A count or range next to a title or at the end of a filter bar. */
export function Count({ children }: { children: ReactNode }) {
  const s = useSectionKit();
  return <span className={s.count}>{children}</span>;
}

// ---- facts and tables

function useDataKit() {
  return useData();
}

/** A label over its value, or `inline`: label left, value right on one ruled row. Put stacked facts in a FactGrid. */
export function Fact({ label, inline, title, children }: { label: ReactNode; inline?: boolean; title?: string; children: ReactNode }) {
  const d = useDataKit();
  return (
    <div className={cx(d.fact, inline && d.factInline)}>
      <span className={d.factLabel}>{label}</span>
      <Tooltip title={title}>
        <span className={cx(d.factValue, inline && d.factValueInline)}>{children}</span>
      </Tooltip>
    </div>
  );
}

/** Facts in one wrapping row, each as wide as its value; `min` gives equal columns instead. */
export function FactGrid({ min, row, className, children }: { min?: number; row?: boolean; className?: string; children: ReactNode }) {
  const d = useDataKit();
  const columns = min !== undefined && !row;
  return (
    <div className={cx(d.factGrid, !columns && d.factRow, className)} style={columns ? { gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` } : undefined}>
      {children}
    </div>
  );
}

/** The kit's table classes: `table`, `th`, `td`, `meta` (a mono secondary line in a cell), `rowLink`, `rowSelected`, `dense`. */
export function useTableKit() {
  const d = useDataKit();
  return { table: d.table, th: d.th, td: d.td, meta: d.cellMeta, rowLink: d.rowLink, rowSelected: d.rowSelected, dense: d.dense };
}

// ---- cards, tiles, callouts, stats

function useBlocksKit() {
  return useBlocks();
}

/** A Panel with the kit padding and an optional head: `title` and `meta` at the left, `actions` at the right. */
export const Card = forwardRef<
  HTMLDivElement,
  { title?: ReactNode; meta?: ReactNode; actions?: ReactNode; level?: 1 | 2; accent?: boolean; className?: string; children?: ReactNode } & Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>
>(({ title, meta, actions, level = 2, accent, className, children, ...rest }, ref) => {
  const b = useBlocksKit();
  return (
    <Panel ref={ref} accent={accent} className={cx(b.card, className)} {...rest}>
      {(title !== undefined || actions) && (
        <div className={b.cardHead}>
          <div className={b.cardHeadStart}>
            {title !== undefined && <SectionTitle level={level}>{title}</SectionTitle>}
            {meta}
          </div>
          {actions && <div className={b.cardHeadEnd}>{actions}</div>}
        </div>
      )}
      {children}
    </Panel>
  );
});
Card.displayName = 'Card';

/** An item inside a card (a fact box, a question): panelAlt, radius 4. */
export function Tile({ className, children, ...rest }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  const b = useBlocksKit();
  return (
    <div className={cx(b.tile, className)} {...rest}>
      {children}
    </div>
  );
}

export type CalloutTone = 'info' | 'warn' | 'bad' | 'ok' | 'neutral';

/** A banner in a status tone: `info` (in motion), `warn` (needs someone, or may be stale), `bad` (failed), `ok`, `neutral`. */
export function Callout({
  tone,
  label,
  title,
  actions,
  className,
  children,
  ...rest
}: {
  tone: CalloutTone;
  label?: ReactNode;
  title?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children?: ReactNode;
} & Omit<React.HTMLAttributes<HTMLDivElement>, 'title'>) {
  const b = useBlocksKit();
  return (
    <div className={cx(b.callout, b[tone], className)} role={tone === 'bad' ? 'alert' : 'status'} {...rest}>
      <div className={b.calloutBody}>
        {label !== undefined && <span className={b.calloutLabel}>{label}</span>}
        {title !== undefined && <p className={b.calloutTitle}>{title}</p>}
        {children !== undefined && <div className={b.calloutText}>{children}</div>}
      </div>
      {actions && <div className={b.calloutActions}>{actions}</div>}
    </div>
  );
}

/** A headline number: label, a 22px value, an optional caption. `tone` colours the value (`info` is motion). */
export function Stat({ label, value, caption, tone, title }: { label: ReactNode; value: ReactNode; caption?: ReactNode; tone?: 'ok' | 'info' | 'warn' | 'bad'; title?: string }) {
  const b = useBlocksKit();
  const toneClass = tone && { ok: b.statValueOk, info: b.statValueInfo, warn: b.statValueWarn, bad: b.statValueBad }[tone];
  return (
    <div className={b.stat} title={title}>
      <span className={b.statLabel}>{label}</span>
      <span className={cx(b.statValue, toneClass)}>{value}</span>
      {caption !== undefined && <span className={b.statCaption}>{caption}</span>}
    </div>
  );
}

/** A row of Stats, each in a Card. */
export function StatRow({ children }: { children: ReactNode }) {
  const b = useBlocksKit();
  return <div className={b.statRow}>{children}</div>;
}

// ---- loading and errors

function useLoad() {
  return useFeedback();
}

export function Skeleton({ width = '100%', height = 12 }: { width?: number | string; height?: number }) {
  const f = useLoad();
  return <span className={f.bone} style={{ width, height }} aria-hidden />;
}

/** One panel loading inside a tab: a few rows (and the label as a caption). */
export function PanelSkeleton({ rows = 4, label, announce = true }: { rows?: number; label?: string; announce?: boolean }) {
  const f = useLoad();
  return (
    <div className={f.skelPanel} role={announce ? 'status' : undefined} aria-label={announce ? label ?? 'Loading' : undefined}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={f.skelRow}>
          <Skeleton />
          <Skeleton width={`${85 - i * 9}%`} />
          <Skeleton />
        </div>
      ))}
      {label && <span className={f.skelCaption}>{label}</span>}
    </div>
  );
}

/** A whole tab loading: a header, three tiles and a panel of rows. */
export function TabSkeleton({ label }: { label?: string }) {
  const f = useLoad();
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }} role="status" aria-label={label ?? 'Loading'}>
      <Skeleton width={200} height={18} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        {[0, 1, 2].map(i => (
          <div key={i} className={f.skelPanel}>
            <Skeleton width="45%" height={10} />
            <Skeleton width="70%" height={16} />
          </div>
        ))}
      </div>
      <PanelSkeleton rows={5} label={label} announce={false} />
    </div>
  );
}

const firstLine = (error: unknown): string => (error instanceof Error ? error.message : String(error)).split('\n')[0];

/** A tab or panel that could not load: what failed, the first line of the error, Retry where there is one, the rest behind Details. */
export function TabError({ error, what = 'this tab', onRetry }: { error: unknown; what?: string; onRetry?: () => void }) {
  const f = useLoad();
  const [open, setOpen] = useState(false);
  const full = error instanceof Error ? error.message : String(error);
  return (
    <Callout tone="bad" title={`Couldn't load ${what}`} actions={onRetry ? <Button small onClick={onRetry}>Retry</Button> : undefined}>
      {firstLine(error)}
      {full !== firstLine(error) && (
        <div>
          <TextLink expanded={open} onClick={() => setOpen(v => !v)}>
            Details
          </TextLink>
          {open && <div className={f.detail}>{full}</div>}
        </div>
      )}
    </Callout>
  );
}

// ---- YAML and code

const KEY_RE = /^(\s*(?:- )?)("?[A-Za-z0-9_.\-/]+"?)(:)(\s.*)?$/;
const LIST_DASH_RE = /^(\s*)(- )(.*)$/;

function scalarColor(text: string, t: ReturnType<typeof useClearanceTokens>): string {
  const v = text.trim().replace(/,$/, '');
  if (v === '' || v === '{}' || v === '[]' || v === '|' || v === '>' || v === 'null' || v === '~' || v.startsWith('#')) return t.textFaint;
  if (v === 'true' || v === 'false' || /^-?\d+(\.\d+)?$/.test(v)) return t.amberInk;
  return t.textHi;
}

function CodeLine({ text }: { text: string }) {
  const t = useClearanceTokens();
  if (/^\s*#/.test(text)) return <span style={{ color: t.textFaint, fontStyle: 'italic' }}>{text}</span>;
  const key = text.match(KEY_RE);
  if (key) {
    const [, prefix, name, colon, rest] = key;
    return (
      <>
        {prefix}
        <span style={{ color: t.sky }}>{name}</span>
        {colon}
        {rest && <span style={{ color: scalarColor(rest, t) }}>{rest}</span>}
      </>
    );
  }
  const dash = text.match(LIST_DASH_RE);
  if (dash) {
    const [, prefix, mark, rest] = dash;
    return (
      <>
        {prefix}
        <span style={{ color: t.textFaint }}>{mark}</span>
        <span style={{ color: scalarColor(rest, t) }}>{rest}</span>
      </>
    );
  }
  return <span style={{ color: scalarColor(text, t) }}>{text}</span>;
}

/** Copies `text`; `copied` is true for a moment so the button can say so. */
export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      })
      .catch(() => {
        // Clipboard access can be denied: the button simply does not confirm.
      });
  };
  return (
    <Button small onClick={copy} aria-label="Copy to clipboard">
      {copied ? 'Copied' : 'Copy'}
    </Button>
  );
}

/** A file or a record as it is: mono on the base background in a soft-line box, keys sky, numbers and booleans amber, Copy at the top right. Never a bare `<pre>`. */
export function YamlBlock({
  text,
  title,
  actions,
  copy = true,
  lineNumbers = false,
  maxHeight = 460,
  'aria-label': ariaLabel,
}: {
  text: string;
  title?: ReactNode;
  actions?: ReactNode;
  copy?: boolean;
  lineNumbers?: boolean;
  maxHeight?: number | string;
  'aria-label'?: string;
}) {
  const f = useLoad();
  const lines = useMemo(() => text.replace(/\n$/, '').split('\n'), [text]);
  const head = title !== undefined || actions !== undefined || copy;
  return (
    <div className={f.codeWrap}>
      {head && (
        <div className={f.codeHead}>
          {title !== undefined && <span className={f.codeTitle}>{title}</span>}
          <span className={f.spacer} />
          {actions}
          {copy && <CopyButton text={text} />}
        </div>
      )}
      <div className={f.codeBox} style={{ maxHeight }} aria-label={ariaLabel} role={ariaLabel ? 'region' : undefined}>
        {lines.map((line, i) => (
          <div key={i} className={f.codeLine}>
            {lineNumbers && <span className={f.lineNo}>{i + 1}</span>}
            <span className={cx(f.lineText, !lineNumbers && f.lineTextNoGutter)}>
              <CodeLine text={line} />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
