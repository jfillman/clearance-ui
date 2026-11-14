import { useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button, fontBody, StatusChip, TextLink, useClearanceTokens, type ClearanceTokens } from '../../kit';
import { placePopover, type Box } from './layout';
import { ROW_CAP, type EdgeView, type GateView, type GroupView, type ObserverView, type RowView, type Topology } from './model';
import { CoverageMix, coverageColors, mixWords, statusColor, statusTone, statusWord } from './parts';
import { POP_W, useMapStyles } from './styles';
import { useHoverIntent } from './useHoverIntent';
import { COVERAGE_ORDER } from './model';

// The topology diagram (boards C6 and C9), left to right: gate types (what guards, by type, with instance count and mode
// mix), the Clearance core they decide through, the protected targets grouped by cluster or account (each with its
// coverage mix and, opened, its targets), and the observers that watch them. Hand-rolled SVG; every line is orthogonal
// with rounded elbows and runs in its own lane in the gutter between two columns, so none passes through a box or lies on
// another. Line width is decision volume, colour the worst state behind it (green all verified, amber holding or flag, red
// out-of-band or blind), a dashed line an observer watching. Every node is focusable: hover or focus opens its popover
// (beside the node, never over it), Enter acts (a group opens, a target drills down). The dashes that move on a line say
// decisions are flowing; they stand still for prefers-reduced-motion.

type Sel = { kind: 'gate' | 'group' | 'observer' | 'target'; id: string };
interface Hovered {
  sel: Sel;
  anchor: Box;
}

const keys = (act: (el: Element) => void) => (e: KeyboardEvent<Element>) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    act(e.currentTarget);
  }
};

const fmt = (n: number) => n.toLocaleString();
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

const modeWords = (m: { enforce: number; flag: number; silent: number }) => [m.enforce > 0 && `${m.enforce} enforce`, m.flag > 0 && `${m.flag} flag`, m.silent > 0 && `${m.silent} silent`].filter(Boolean).join(' · ');

interface Handlers {
  on: (s: Sel, el: Element) => void;
  off: () => void;
}

function MixBar({ t, mix, x, y, w }: { t: ClearanceTokens; mix: { enforce: number; flag: number; silent: number }; x: number; y: number; w: number }) {
  const total = mix.enforce + mix.flag + mix.silent;
  const seg = [
    { n: mix.enforce, fill: t.good },
    { n: mix.flag, fill: t.amber },
    { n: mix.silent, fill: t.textFaint },
  ];
  let at = x;
  return (
    <g>
      <rect x={x} y={y} width={w} height={6} rx={3} fill={t.lineSoft} />
      {total > 0 &&
        seg.filter(s => s.n > 0).map((s, i) => {
          const sw = (w * s.n) / total;
          const r = <rect key={i} x={at} y={y} width={sw} height={6} fill={s.fill} />;
          at += sw;
          return r;
        })}
    </g>
  );
}

/** The group's coverage states as one bar, in the order of the legend. */
function CoverageBar({ t, coverage, x, y, w }: { t: ClearanceTokens; coverage: Record<string, number>; x: number; y: number; w: number }) {
  const colors = coverageColors(t);
  const order = [...COVERAGE_ORDER, ...Object.keys(coverage).filter(k => !(COVERAGE_ORDER as readonly string[]).includes(k))];
  const total = order.reduce((n, k) => n + (coverage[k] ?? 0), 0);
  let at = x;
  return (
    <g>
      <rect x={x} y={y} width={w} height={7} rx={3} fill={t.lineSoft} />
      {total > 0 &&
        order.filter(k => coverage[k]).map(k => {
          const sw = (w * coverage[k]) / total;
          const r = <rect key={k} x={at} y={y} width={sw} height={7} fill={colors[k] ?? t.line} />;
          at += sw;
          return r;
        })}
    </g>
  );
}

function hoverProps(sel: Sel, h: Handlers) {
  return {
    onMouseEnter: (e: React.MouseEvent<Element>) => h.on(sel, e.currentTarget),
    onMouseLeave: () => h.off(),
    onFocus: (e: React.FocusEvent<Element>) => h.on(sel, e.currentTarget),
    onBlur: () => h.off(),
  };
}

function GateNode({ v, t, h, onSel }: { v: GateView; t: ClearanceTokens; h: Handlers; onSel: (s: Sel, el: Element) => void }) {
  const c = useMapStyles();
  const n = v.node;
  const label = `Gate type ${n.type}: ${n.instances} instances guarding ${n.targets} targets, ${mixWords(n.mix)}, ${fmt(n.decisions)} decisions, ${n.refused} refused, ${n.holding} holding, status ${statusWord(n.status)}`;
  const sel = { kind: 'gate', id: n.id } as const;
  const modes = modeWords(n.mix);
  return (
    <g className={`${c.node} ${v.dim ? c.nodeDim : ''}`} role="button" tabIndex={0} aria-label={label} {...hoverProps(sel, h)} onClick={e => onSel(sel, e.currentTarget)} onKeyDown={keys(el => onSel(sel, el))} data-testid={`gate-${n.type}`}>
      <rect className="frame" x={v.x} y={v.y} width={v.w} height={v.h} rx={6} />
      <circle cx={v.x + v.w - 14} cy={v.y + 15} r={5} fill={statusColor(t, n.status)} />
      <text className={c.nodeKind} x={v.x + 12} y={v.y + 19}>{clip(`${v.kind} · ${plural(n.instances, 'instance')}`, 29)}</text>
      <text className={c.nodeName} x={v.x + 12} y={v.y + 40}>{clip(v.name, 30)}</text>
      <MixBar t={t} mix={n.mix} x={v.x + 12} y={v.y + 50} w={v.w - 24} />
      <text className={c.nodeText} x={v.x + 12} y={v.y + 71}>{fmt(n.decisions)} dec · {n.refused} refused</text>
      <text className={c.nodeText} x={v.x + 12} y={v.y + 89}>{modes || 'no instances'}</text>
      {n.holding > 0 && <text className={c.nodeAmber} x={v.x + v.w - 12} y={v.y + 89} textAnchor="end">{n.holding} holding</text>}
    </g>
  );
}

function RowNode({ r, t, group, h, onOpen }: { r: RowView; t: ClearanceTokens; group: GroupView; h: Handlers; onOpen: (id: string) => void }) {
  const c = useMapStyles();
  const n = r.target;
  const pct = n.verified_pct === null ? 'no coverage' : `${Math.round(n.verified_pct)}% verified`;
  const short = n.verified_pct === null ? 'none' : `${Math.round(n.verified_pct)}%`;
  const sel = { kind: 'target', id: n.id } as const;
  const meta = [n.kind, n.env, n.registry].filter(Boolean).join(' · ');
  return (
    <g className={`${c.row} ${r.dim ? c.nodeDim : ''}`} role="link" tabIndex={0} aria-label={`Open ${n.name} in ${group.node.group}: ${pct}, ${n.holding} holding, status ${statusWord(n.status)}`} style={{ cursor: 'pointer', outline: 'none' }} {...hoverProps(sel, h)} onClick={() => onOpen(n.id)} onKeyDown={keys(() => onOpen(n.id))} data-testid={`target-${n.id}`}>
      <rect className="rowFrame" x={r.x} y={r.y} width={r.w} height={r.h} rx={4} />
      <circle cx={r.x + 12} cy={r.y + 15} r={4} fill={statusColor(t, n.status)} />
      <text className={c.nodeStrong} x={r.x + 24} y={r.y + 19}>{clip(n.name, 22)}</text>
      <text className={n.holding > 0 ? c.nodeAmber : c.nodeText} x={r.x + r.w - 10} y={r.y + 19} textAnchor="end">{n.holding > 0 ? `${n.holding} hold · ` : ''}{short}</text>
      <text className={c.nodeKind} x={r.x + 24} y={r.y + 35}>{clip(meta, 38)}</text>
    </g>
  );
}

function GroupNodeView({ v, t, h, onToggle, onOpen }: { v: GroupView; t: ClearanceTokens; h: Handlers; onToggle: (g: string) => void; onOpen: (id: string) => void }) {
  const c = useMapStyles();
  const n = v.node;
  const pct = n.verified_pct === null ? 'no coverage' : `${Math.round(n.verified_pct)}% verified`;
  const sel = { kind: 'group', id: n.id } as const;
  const label = `Group ${n.group}: ${v.targets.length} targets, ${pct}, ${n.no_gate} with no gate, ${n.holding} holding, status ${statusWord(n.status)}. ${v.expanded ? 'Expanded' : 'Collapsed'}`;
  const kinds = Object.entries(n.kinds).map(([k, x]) => `${x} ${k}`).join(' · ') || plural(v.targets.length, 'target');
  const sub = [kinds, ...v.registries, ...v.envs].join(' · ');
  return (
    <g className={v.dim ? c.nodeDim : undefined} data-testid={`group-${n.group}`}>
      <g className={c.node} role="button" tabIndex={0} aria-expanded={v.expanded} aria-label={label} {...hoverProps(sel, h)} onClick={() => onToggle(n.group)} onKeyDown={keys(() => onToggle(n.group))}>
        <rect className="frame" x={v.x} y={v.y} width={v.w} height={v.head} rx={6} />
        <circle cx={v.x + v.w - 14} cy={v.y + 16} r={5} fill={statusColor(t, n.status)} />
        <text className={c.nodeTitle} x={v.x + 12} y={v.y + 21}>{v.expanded ? '▾' : '▸'} {clip(n.group, 24)}</text>
        <text className={c.nodeKind} x={v.x + 12} y={v.y + 38}>{clip(sub, 37)}{v.matches > 0 ? ` · ${v.matches} match` : ''}</text>
        <CoverageBar t={t} coverage={n.coverage} x={v.x + 12} y={v.y + 47} w={v.w - 24} />
        <text className={c.nodeStrong} x={v.x + 12} y={v.y + 71}>{pct}</text>
        <text className={n.holding > 0 ? c.nodeAmber : c.nodeText} x={v.x + v.w - 12} y={v.y + 71} textAnchor="end">{[n.holding > 0 && `${n.holding} holding`, n.no_gate > 0 && `${n.no_gate} no gate`].filter(Boolean).join(' · ')}</text>
        <text className={c.nodeKind} x={v.x + 12} y={v.y + 87}>{clip(`gates: ${modeWords(n.mix) || 'none'}`, 38)}</text>
      </g>
      {v.expanded && <rect x={v.x} y={v.y + v.head} width={v.w} height={v.h - v.head} rx={6} fill={t.panel} stroke={t.line} />}
      {v.expanded && v.rows.map(r => <RowNode key={r.target.id} r={r} t={t} group={v} h={h} onOpen={onOpen} />)}
      {v.expanded && v.hiddenRows > 0 && (
        <text className={c.nodeText} x={v.x + 14} y={v.y + v.h - 14}>+ {v.hiddenRows} more (the {ROW_CAP} worst shown): search to find one</text>
      )}
    </g>
  );
}

function ObserverNodeView({ v, t, h, onSel }: { v: ObserverView; t: ClearanceTokens; h: Handlers; onSel: (s: Sel, el: Element) => void }) {
  const c = useMapStyles();
  const n = v.node;
  const states = Object.entries(n.states).map(([k, x]) => `${x} ${k}`).join(' · ');
  const sel = { kind: 'observer', id: n.id } as const;
  return (
    <g className={`${c.node} ${v.dim ? c.nodeDim : ''}`} role="button" tabIndex={0} aria-label={`Observer ${n.provider} ${n.source}: watching ${n.targets} targets, ${states || 'no health yet'}, status ${statusWord(n.status)}`} {...hoverProps(sel, h)} onClick={e => onSel(sel, e.currentTarget)} onKeyDown={keys(el => onSel(sel, el))} data-testid={`observer-${n.provider}`}>
      <rect className="frame" x={v.x} y={v.y} width={v.w} height={v.h} rx={6} />
      <circle cx={v.x + v.w - 14} cy={v.y + 15} r={5} fill={statusColor(t, n.status)} />
      <text className={c.nodeKind} x={v.x + 12} y={v.y + 19}>observer</text>
      <text className={c.nodeTitle} x={v.x + 12} y={v.y + 40}>{clip(n.provider, 17)}</text>
      <text className={c.nodeText} x={v.x + 12} y={v.y + 58}>{n.source !== n.provider ? `${clip(n.source, 12)} · ` : ''}watching {n.targets}</text>
      <text className={c.nodeText} style={n.status === 'ok' ? undefined : { fill: statusColor(t, n.status) }} x={v.x + 12} y={v.y + 75}>{clip(states || 'no health yet', 22)}</text>
    </g>
  );
}

const arrowId = (s: string) => `mapArrow-${s}`;

function EdgePath({ e, t }: { e: EdgeView; t: ClearanceTokens }) {
  const c = useMapStyles();
  const watch = e.edge.kind === 'watches';
  const quiet = watch && e.edge.status === 'ok';
  const color = quiet ? t.textFaint : statusColor(t, e.edge.status);
  const state = quiet ? 'quiet' : statusWord(e.edge.status);
  const label = `${watch ? 'Watches' : 'Guards'}: ${e.edge.from} to ${e.edge.to}, ${e.edge.targets} targets, ${fmt(e.edge.volume)} decisions, ${e.edge.refused} refused, ${e.edge.holding} holding, ${statusWord(e.edge.status)}`;
  return (
    <g opacity={e.dim ? 0.18 : 1} role="img" aria-label={label}>
      <title>{label}</title>
      <path className={c.edge} d={e.d} stroke={color} strokeWidth={e.width} strokeDasharray={watch ? '5 4' : undefined} opacity={watch ? 0.85 : 0.6} markerEnd={`url(#${arrowId(state)})`} />
      {!watch && e.edge.volume > 0 && !e.dim && <path className={c.flow} d={e.d} />}
    </g>
  );
}

function ColumnHeads({ topo }: { topo: Topology }) {
  const c = useMapStyles();
  const t = useClearanceTokens();
  return (
    <g aria-hidden="true">
      {topo.columns.map(col => {
        const mid = col.key === 'core';
        const x = mid ? col.x + col.w / 2 : col.x;
        return (
          <g key={col.key}>
            <text className={c.colHead} x={x} y={14} textAnchor={mid ? 'middle' : 'start'}>{col.label}</text>
            <text className={c.nodeKind} x={x} y={29} textAnchor={mid ? 'middle' : 'start'}>{col.sub}</text>
          </g>
        );
      })}
      {topo.columns.filter(col => col.key !== 'core').map(col => <line key={col.key} x1={col.x} x2={col.x + col.w} y1={35} y2={35} stroke={t.lineSoft} />)}
    </g>
  );
}

function Popover({ sel, topo, anchor, width, h, onOpen, onToggle }: { sel: Sel; topo: Topology; anchor: Box; width: number; h: Handlers & { stay: () => void }; onOpen: (id: string) => void; onToggle: (g: string) => void }) {
  const c = useMapStyles();
  let name = '';
  let aria = '';
  let status = 'ok';
  let body: ReactNode = null;
  let foot: ReactNode = null;
  if (sel.kind === 'gate') {
    const v = topo.gates.find(g => g.node.id === sel.id);
    if (!v) return null;
    const n = v.node;
    name = v.name;
    aria = n.type;
    status = n.status;
    body = (
      <>
        <dl className={c.popFacts}>
          <dt>type</dt><dd>{n.type} · {v.kind}</dd>
          <dt>instances</dt><dd>{n.instances}</dd>
          <dt>modes</dt><dd>{mixWords(n.mix)}</dd>
          <dt>guards</dt><dd>{n.targets} targets</dd>
          <dt>decisions</dt><dd>{fmt(n.decisions)}</dd>
          <dt>refused</dt><dd>{fmt(n.refused)}</dd>
          <dt>exceptions</dt><dd>{n.exceptions}</dd>
          <dt>holding</dt><dd>{n.holding}</dd>
        </dl>
        <CoverageMix coverage={n.coverage} label={`${n.type} coverage`} />
      </>
    );
  } else if (sel.kind === 'group') {
    const v = topo.groups.find(g => g.node.id === sel.id);
    if (!v) return null;
    const n = v.node;
    name = n.group;
    aria = name;
    status = n.status;
    body = (
      <>
        <dl className={c.popFacts}>
          <dt>targets</dt><dd>{v.targets.length}</dd>
          <dt>verified</dt><dd>{n.verified_pct === null ? 'no coverage' : `${n.verified_pct}%`}</dd>
          <dt>no gate</dt><dd>{n.no_gate}</dd>
          <dt>holding</dt><dd>{n.holding}</dd>
          <dt>gates</dt><dd>{mixWords(n.mix)}</dd>
          <dt>observers</dt><dd>{Object.entries(n.observers).map(([k, x]) => `${x} ${k}`).join(', ') || 'none'}</dd>
        </dl>
        <CoverageMix coverage={n.coverage} label={`${n.group} coverage`} />
      </>
    );
    foot = <TextLink onClick={() => onToggle(n.group)} expanded={v.expanded}>{v.expanded ? 'Collapse' : 'Show targets'}</TextLink>;
  } else if (sel.kind === 'observer') {
    const v = topo.observers.find(o => o.node.id === sel.id);
    if (!v) return null;
    const n = v.node;
    name = `${n.provider}${n.source !== n.provider ? ` · ${n.source}` : ''}`;
    aria = name;
    status = n.status;
    body = (
      <dl className={c.popFacts}>
        <dt>watching</dt><dd>{n.targets} targets</dd>
        {Object.entries(n.states).map(([k, x]) => (<span key={k} style={{ display: 'contents' }}><dt>{k}</dt><dd>{x}</dd></span>))}
      </dl>
    );
  } else {
    const hit = topo.groups.flatMap(g => g.rows.map(r => ({ r, g }))).find(x => x.r.target.id === sel.id);
    if (!hit) return null;
    const n = hit.r.target;
    name = n.name;
    aria = name;
    status = n.status;
    body = (
      <dl className={c.popFacts}>
        <dt>kind</dt><dd>{n.kind}{n.env ? ` · ${n.env}` : ''}</dd>
        {n.registry && <><dt>registry</dt><dd>{n.registry}</dd></>}
        <dt>verified</dt><dd>{n.verified_pct === null ? 'no coverage' : `${n.verified_pct}%`}</dd>
        <dt>holding</dt><dd>{n.holding}</dd>
        <dt>gates</dt><dd>{n.gates.length === 0 ? 'none declared' : n.gates.map(g => `${g.type} (${g.silent ? 'silent' : g.mode})`).join(', ')}</dd>
        <dt>observers</dt><dd>{n.observers.map(o => `${o.provider} ${o.state}`).join(', ') || 'none'}</dd>
      </dl>
    );
    foot = <TextLink onClick={() => onOpen(n.id)}>Open detail →</TextLink>;
  }
  const at = placePopover(anchor, width, POP_W);
  return (
    <div
      className={c.popover}
      style={{ left: at.left, top: Math.max(0, at.top) }}
      role="dialog"
      aria-label={`${aria} details`}
      data-testid="map-popover"
      data-side={at.side}
      onMouseEnter={h.stay}
      onMouseLeave={h.off}
    >
      <div className={c.popHead}>
        <h3 className={c.popName}>{name}</h3>
        <StatusChip tone={statusTone(status)} dot>{statusWord(status)}</StatusChip>
      </div>
      {body}
      {foot}
    </div>
  );
}

export function MapTopology({ topo, onToggleGroup, onOpenTarget }: { topo: Topology; onToggleGroup: (g: string) => void; onOpenTarget: (id: string) => void }) {
  const c = useMapStyles();
  const t = useClearanceTokens();
  const canvas = useRef<HTMLDivElement>(null);
  const { hover, enter, leave, hideNow } = useHoverIntent<Hovered>();
  const [pinned, setPinned] = useState<Hovered>();
  const shown = hover ?? pinned;
  // Where an element sits inside the diagram's box, in CSS pixels: what the popover is placed against.
  const anchorOf = (el: Element): Box => {
    const base = canvas.current?.getBoundingClientRect();
    const r = el.getBoundingClientRect();
    const ox = base?.left ?? 0;
    const oy = base?.top ?? 0;
    return { left: r.left - ox, right: r.right - ox, top: r.top - oy, bottom: r.bottom - oy };
  };
  const handlers = { on: (sel: Sel, el: Element) => enter({ sel, anchor: anchorOf(el) }), off: leave, stay: () => hover && enter(hover) };
  const pin = (sel: Sel, el: Element) => setPinned(p => (p && p.sel.kind === sel.kind && p.sel.id === sel.id ? undefined : { sel, anchor: anchorOf(el) }));
  const total = topo.groups.reduce((n, g) => n + g.targets.length, 0);
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className={c.stage} onKeyDown={e => {
      if (e.key === 'Escape') {
        setPinned(undefined);
        hideNow();
      }
    }}>
      <div className={c.canvas} ref={canvas}>
        <div className={c.scroll}>
          <svg className={c.svg} style={{ maxWidth: Math.round(topo.width * 1.25) }} viewBox={`0 0 ${topo.width} ${topo.height}`} role="group" aria-label={`Coverage topology: ${topo.gates.length} gate types, ${total} targets in ${topo.groups.length} groups, ${topo.observers.length} observers`} fontFamily={fontBody}>
            <defs>
              {([['ok', t.good], ['attention', t.amber], ['down', t.bad], ['quiet', t.textFaint]] as const).map(([k, fill]) => (
                <marker key={k} id={arrowId(k)} orient="auto" markerUnits="userSpaceOnUse" markerWidth={9} markerHeight={9} refX={8} refY={4.5}>
                  <path d="M0 0 L9 4.5 L0 9 Z" fill={fill} />
                </marker>
              ))}
            </defs>
            <ColumnHeads topo={topo} />
            <rect className={c.core} x={topo.core.x} y={topo.core.y} width={topo.core.w} height={topo.core.h} rx={8} opacity={0.55} aria-hidden="true" />
            {topo.edges.map(e => <EdgePath key={e.id} e={e} t={t} />)}
            {topo.gates.map(v => <GateNode key={v.node.id} v={v} t={t} h={handlers} onSel={pin} />)}
            {topo.groups.map(v => <GroupNodeView key={v.node.id} v={v} t={t} h={handlers} onToggle={onToggleGroup} onOpen={onOpenTarget} />)}
            {topo.observers.map(v => <ObserverNodeView key={v.node.id} v={v} t={t} h={handlers} onSel={pin} />)}
            {topo.edges.filter(e => e.label && !e.dim).map(e => (
              <text key={`l-${e.id}`} className={c.edgeLabel} x={e.label!.x - e.label!.w / 2} y={e.label!.y} textAnchor="start" style={{ fill: statusColor(t, e.edge.status) }} aria-hidden="true">{e.label!.text}</text>
            ))}
          </svg>
        </div>
        {shown && <Popover sel={shown.sel} topo={topo} anchor={shown.anchor} width={canvas.current?.clientWidth ?? 900} h={handlers} onOpen={onOpenTarget} onToggle={onToggleGroup} />}
        {pinned && !hover && (
          <div style={{ position: 'absolute', top: -6, right: 0 }}>
            <Button small onClick={() => setPinned(undefined)}>Close details</Button>
          </div>
        )}
      </div>
    </div>
  );
}

/** What the boxes, bars and lines mean. */
export function MapLegend() {
  const c = useMapStyles();
  const t = useClearanceTokens();
  const colors = coverageColors(t);
  // Built from COVERAGE_ORDER so the legend names every segment CoverageBar can draw.
  const short: Record<(typeof COVERAGE_ORDER)[number], string> = {
    'authorized-and-verified': 'verified',
    'observed-not-attributed': 'not attributed',
    'out-of-band-detected': 'out-of-band',
    'coverage-unavailable': 'observer blind',
    'break-glass': 'break-glass',
    'attempted-refused': 'refused',
    unassessed: 'unassessed',
  };
  const cov: Array<[string, string]> = COVERAGE_ORDER.map(k => [k, short[k]]);
  return (
    <div className={c.legend} role="group" aria-label="Legend">
      <span className={c.legendItem}><i className={`${c.swatch} ${c.swatchOk}`} /> all verified</span>
      <span className={c.legendItem}><i className={`${c.swatch} ${c.swatchAttn}`} /> holding or flag</span>
      <span className={c.legendItem}><i className={`${c.swatch} ${c.swatchDown}`} /> out-of-band or blind</span>
      <span className={c.legendItem}><i className={`${c.swatch} ${c.swatchWatch}`} /> observer watching</span>
      <span>line width: decisions in the window</span>
      <span className={c.legendItem}>
        gate bar:
        <i className={c.legendDot} style={{ backgroundColor: t.good }} /> enforce
        <i className={c.legendDot} style={{ backgroundColor: t.amber }} /> flag
        <i className={c.legendDot} style={{ backgroundColor: t.textFaint }} /> silent
      </span>
      <span className={c.legendItem}>
        group bar:
        {cov.map(([k, label]) => (
          <span key={k} className={c.legendItem}><i className={c.legendDot} style={{ backgroundColor: colors[k] }} /> {label}</span>
        ))}
      </span>
      <span className={c.legendItem}>▸ opens a group · click a target to open it</span>
    </div>
  );
}
