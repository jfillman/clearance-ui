import { useState, type KeyboardEvent, type ReactNode } from 'react';
import { Button, Chip, fontBody, StatusChip, TextLink, useClearanceTokens, type ClearanceTokens } from '../../kit';
import { ROW_CAP, WIDTH, type EdgeView, type GateView, type GroupView, type ObserverView, type RowView, type Topology } from './model';
import { CoverageMix, mixWords, statusColor, statusTone, statusWord } from './parts';
import { useMapStyles } from './styles';

// The topology diagram (boards C6 and C9): gate types on the left, protected targets grouped by cluster or account in the
// middle, the observers that watch them on the right. Hand-rolled SVG with orthogonal edges: width is decision volume,
// colour the worst state behind it (green all verified, amber holding or flag, red out-of-band or blind), dashed lines
// an observer watching. Every node is focusable: focus or hover opens its popover, Enter acts (a group opens, a target
// drills down). The dashes that move on a line say changes are flowing; they stand still for prefers-reduced-motion.

type Sel = { kind: 'gate' | 'group' | 'observer' | 'target'; id: string };

const keys = (act: () => void) => (e: KeyboardEvent) => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    act();
  }
};

function MixBar({ t, mix, x, y, w }: { t: ClearanceTokens; mix: { enforce: number; flag: number; silent: number }; x: number; y: number; w: number }) {
  const total = mix.enforce + mix.flag + mix.silent;
  if (total === 0) return <rect x={x} y={y} width={w} height={6} rx={3} fill={t.lineSoft} />;
  const seg = [
    { n: mix.enforce, fill: t.good },
    { n: mix.flag, fill: t.amber },
    { n: mix.silent, fill: t.textFaint },
  ];
  let at = x;
  return (
    <g>
      <rect x={x} y={y} width={w} height={6} rx={3} fill={t.lineSoft} />
      {seg.filter(s => s.n > 0).map((s, i) => {
        const sw = (w * s.n) / total;
        const r = <rect key={i} x={at} y={y} width={sw} height={6} fill={s.fill} />;
        at += sw;
        return r;
      })}
    </g>
  );
}

const fmt = (n: number) => n.toLocaleString();

function GateNode({ v, t, on, onSel }: { v: GateView; t: ClearanceTokens; on: (s?: Sel) => void; onSel: (s: Sel) => void }) {
  const c = useMapStyles();
  const n = v.node;
  const label = `Gate type ${n.type}: ${n.instances} instances guarding ${n.targets} targets, ${mixWords(n.mix)}, ${fmt(n.decisions)} decisions, ${n.refused} refused, ${n.holding} holding, status ${statusWord(n.status)}`;
  const sel = { kind: 'gate', id: n.id } as const;
  return (
    <g className={`${c.node} ${v.dim ? c.nodeDim : ''}`} role="button" tabIndex={0} aria-label={label} onMouseEnter={() => on(sel)} onMouseLeave={() => on(undefined)} onFocus={() => on(sel)} onBlur={() => on(undefined)} onClick={() => onSel(sel)} onKeyDown={keys(() => onSel(sel))} data-testid={`gate-${n.type}`}>
      <rect className="frame" x={v.x} y={v.y} width={v.w} height={v.h} rx={6} />
      <circle cx={v.x + v.w - 14} cy={v.y + 16} r={5} fill={statusColor(t, n.status)} />
      <text className={c.nodeTitle} x={v.x + 12} y={v.y + 22}>{n.type}</text>
      <text className={c.nodeStrong} x={v.x + v.w - 28} y={v.y + 22} textAnchor="end">{fmt(n.decisions)} dec</text>
      <text className={c.nodeText} x={v.x + 12} y={v.y + 41}>{n.instances} instances · {n.targets} targets</text>
      <MixBar t={t} mix={n.mix} x={v.x + 12} y={v.y + 50} w={110} />
      <text className={c.nodeText} x={v.x + 130} y={v.y + 57}>{n.mix.enforce}/{n.mix.flag}/{n.mix.silent}</text>
      <text className={n.holding > 0 ? c.nodeAmber : c.nodeText} x={v.x + 12} y={v.y + 77}>{n.holding > 0 ? `${n.holding} holding · ` : ''}{n.refused} refused</text>
    </g>
  );
}

function RowNode({ r, t, group, on, onOpen }: { r: RowView; t: ClearanceTokens; group: GroupView; on: (s?: Sel) => void; onOpen: (id: string) => void }) {
  const c = useMapStyles();
  const n = r.target;
  const pct = n.verified_pct === null ? 'no coverage' : `${Math.round(n.verified_pct)}% verified`;
  const short = n.verified_pct === null ? 'none' : `${Math.round(n.verified_pct)}%`;
  const sel = { kind: 'target', id: n.id } as const;
  return (
    <g className={`${c.row} ${r.dim ? c.nodeDim : ''}`} role="link" tabIndex={0} aria-label={`Open ${n.name} in ${group.node.group}: ${pct}, ${n.holding} holding, status ${statusWord(n.status)}`} style={{ cursor: 'pointer', outline: 'none' }} onMouseEnter={() => on(sel)} onMouseLeave={() => on(undefined)} onFocus={() => on(sel)} onBlur={() => on(undefined)} onClick={() => onOpen(n.id)} onKeyDown={keys(() => onOpen(n.id))} data-testid={`target-${n.id}`}>
      <rect className="rowFrame" x={r.x} y={r.y} width={r.w} height={r.h} rx={4} />
      <circle cx={r.x + 12} cy={r.cy} r={4} fill={statusColor(t, n.status)} />
      <text className={c.nodeStrong} x={r.x + 24} y={r.cy + 4}>{n.name.length > 19 ? `${n.name.slice(0, 18)}…` : n.name}</text>
      <text className={n.holding > 0 ? c.nodeAmber : c.nodeText} x={r.x + r.w - 10} y={r.cy + 4} textAnchor="end">{n.holding > 0 ? `${n.holding} hold · ` : ''}{short}</text>
    </g>
  );
}

function GroupNodeView({ v, t, on, onToggle, onOpen }: { v: GroupView; t: ClearanceTokens; on: (s?: Sel) => void; onToggle: (g: string) => void; onOpen: (id: string) => void }) {
  const c = useMapStyles();
  const n = v.node;
  const pct = n.verified_pct === null ? 'no coverage' : `${Math.round(n.verified_pct)}% verified`;
  const sel = { kind: 'group', id: n.id } as const;
  const label = `Group ${n.group}: ${v.targets.length} targets, ${pct}, ${n.no_gate} with no gate, ${n.holding} holding, status ${statusWord(n.status)}. ${v.expanded ? 'Expanded' : 'Collapsed'}`;
  return (
    <g className={v.dim ? c.nodeDim : undefined} data-testid={`group-${n.group}`}>
      <g className={c.node} role="button" tabIndex={0} aria-expanded={v.expanded} aria-label={label} onMouseEnter={() => on(sel)} onMouseLeave={() => on(undefined)} onFocus={() => on(sel)} onBlur={() => on(undefined)} onClick={() => onToggle(n.group)} onKeyDown={keys(() => onToggle(n.group))}>
        <rect className="frame" x={v.x} y={v.y} width={v.w} height={v.h} rx={6} />
        <circle cx={v.x + v.w - 14} cy={v.y + 16} r={5} fill={statusColor(t, n.status)} />
        <text className={c.nodeTitle} x={v.x + 12} y={v.y + 22}>{v.expanded ? '▾' : '▸'} {n.group}</text>
        <text className={c.nodeText} x={v.x + 12} y={v.y + 40}>{v.targets.length} {Object.keys(n.kinds).length === 1 ? Object.keys(n.kinds)[0] : 'targets'}{v.matches > 0 ? ` · ${v.matches} match` : ''}{n.no_gate > 0 ? ` · ${n.no_gate} no gate` : ''}</text>
        <MixBar t={t} mix={n.mix} x={v.x + 12} y={v.y + 48} w={110} />
        <text className={n.holding > 0 ? c.nodeAmber : c.nodeText} x={v.x + v.w - 12} y={v.y + 40} textAnchor="end">{n.holding > 0 ? `${n.holding} holding` : ''}</text>
        <text className={c.nodeStrong} x={v.x + v.w - 12} y={v.y + 56} textAnchor="end">{pct}</text>
      </g>
      {v.expanded && v.rows.map(r => <RowNode key={r.target.id} r={r} t={t} group={v} on={on} onOpen={onOpen} />)}
      {v.expanded && v.hiddenRows > 0 && (
        <text className={c.nodeText} x={v.x + 14} y={v.y + v.h - 14}>+ {v.hiddenRows} more (showing the {ROW_CAP} worst): search to find one</text>
      )}
    </g>
  );
}

function ObserverNodeView({ v, t, on, onSel }: { v: ObserverView; t: ClearanceTokens; on: (s?: Sel) => void; onSel: (s: Sel) => void }) {
  const c = useMapStyles();
  const n = v.node;
  const states = Object.entries(n.states).map(([k, x]) => `${x} ${k}`).join(', ');
  const sel = { kind: 'observer', id: n.id } as const;
  return (
    <g className={`${c.node} ${v.dim ? c.nodeDim : ''}`} role="button" tabIndex={0} aria-label={`Observer ${n.provider} ${n.source}: watching ${n.targets} targets, ${states || 'no health yet'}, status ${statusWord(n.status)}`} onMouseEnter={() => on(sel)} onMouseLeave={() => on(undefined)} onFocus={() => on(sel)} onBlur={() => on(undefined)} onClick={() => onSel(sel)} onKeyDown={keys(() => onSel(sel))} data-testid={`observer-${n.provider}`}>
      <rect className="frame" x={v.x} y={v.y} width={v.w} height={v.h} rx={6} />
      <circle cx={v.x + v.w - 12} cy={v.y + 14} r={4} fill={statusColor(t, n.status)} />
      <text className={c.nodeStrong} x={v.x + 10} y={v.y + 20}>{n.provider}</text>
      <text className={c.nodeText} x={v.x + 10} y={v.y + 36}>{n.source !== n.provider ? `${n.source} · ` : ''}{n.targets} targets</text>
    </g>
  );
}

function EdgePath({ e, t }: { e: EdgeView; t: ClearanceTokens }) {
  const c = useMapStyles();
  const watch = e.edge.kind === 'watches';
  const quiet = watch && e.edge.status === 'ok';
  const color = quiet ? t.textFaint : statusColor(t, e.edge.status);
  const label = `${e.edge.kind === 'guards' ? 'Guards' : 'Watches'}: ${e.edge.from} to ${e.edge.to}, ${e.edge.targets} targets, ${fmt(e.edge.volume)} decisions, ${e.edge.refused} refused, ${e.edge.holding} holding, ${statusWord(e.edge.status)}`;
  return (
    <g opacity={e.dim ? 0.18 : 1} role="img" aria-label={label}>
      <path className={c.edge} d={e.d} stroke={color} strokeWidth={e.width} strokeDasharray={watch ? '5 4' : undefined} opacity={watch ? 0.8 : 0.55} />
      {!watch && e.edge.volume > 0 && !e.dim && <path className={c.flow} d={e.d} />}
    </g>
  );
}

function Popover({ sel, topo, onOpen, onToggle }: { sel: Sel; topo: Topology; onOpen: (id: string) => void; onToggle: (g: string) => void }) {
  const c = useMapStyles();
  let name = '';
  let at: { x: number; y: number } = { x: 0, y: 0 };
  let status = 'ok';
  let body: ReactNode = null;
  let foot: ReactNode = null;
  if (sel.kind === 'gate') {
    const v = topo.gates.find(g => g.node.id === sel.id);
    if (!v) return null;
    const n = v.node;
    name = n.type;
    status = n.status;
    at = { x: v.x + 20, y: v.y + v.h };
    body = (
      <>
        <dl className={c.popFacts}>
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
    status = n.status;
    at = { x: v.x + 20, y: v.y + Math.min(v.h, 60) };
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
    status = n.status;
    at = { x: v.x - 140, y: v.y + v.h };
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
    status = n.status;
    at = { x: hit.r.x + 40, y: hit.r.y + hit.r.h };
    body = (
      <>
        <dl className={c.popFacts}>
          <dt>kind</dt><dd>{n.kind}{n.env ? ` · ${n.env}` : ''}</dd>
          <dt>verified</dt><dd>{n.verified_pct === null ? 'no coverage' : `${n.verified_pct}%`}</dd>
          <dt>holding</dt><dd>{n.holding}</dd>
          <dt>gates</dt><dd>{n.gates.length === 0 ? 'none declared' : n.gates.map(g => `${g.type} (${g.silent ? 'silent' : g.mode})`).join(', ')}</dd>
          <dt>observers</dt><dd>{n.observers.map(o => `${o.provider} ${o.state}`).join(', ') || 'none'}</dd>
        </dl>
      </>
    );
    foot = <TextLink onClick={() => onOpen(n.id)}>Open detail →</TextLink>;
  }
  const left = Math.min(Math.max((at.x / WIDTH) * 100, 0), 66);
  return (
    <div className={c.popover} style={{ left: `${left}%`, top: `${Math.min((at.y / topo.height) * 100, 35)}%` }} role="dialog" aria-label={`${name} details`} data-testid="map-popover">
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
  const [hover, setHover] = useState<Sel>();
  const [pinned, setPinned] = useState<Sel>();
  const sel = hover ?? pinned;
  const pin = (s: Sel) => setPinned(p => (p && p.kind === s.kind && p.id === s.id ? undefined : s));
  const total = topo.groups.reduce((n, g) => n + g.targets.length, 0);
  return (
    // eslint-disable-next-line jsx-a11y/no-static-element-interactions
    <div className={c.stage} onKeyDown={e => e.key === 'Escape' && setPinned(undefined)}>
      <div className={c.scroll}>
        <svg className={c.svg} viewBox={`0 0 ${topo.width} ${topo.height}`} role="group" aria-label={`Coverage topology: ${topo.gates.length} gate types, ${total} targets in ${topo.groups.length} groups, ${topo.observers.length} observers`} fontFamily={fontBody}>
          {topo.edges.map(e => <EdgePath key={e.id} e={e} t={t} />)}
          {topo.gates.map(v => <GateNode key={v.node.id} v={v} t={t} on={setHover} onSel={pin} />)}
          {topo.groups.map(v => <GroupNodeView key={v.node.id} v={v} t={t} on={setHover} onToggle={g => { onToggleGroup(g); }} onOpen={onOpenTarget} />)}
          {topo.observers.map(v => <ObserverNodeView key={v.node.id} v={v} t={t} on={setHover} onSel={pin} />)}
        </svg>
      </div>
      {sel && <Popover sel={sel} topo={topo} onOpen={onOpenTarget} onToggle={onToggleGroup} />}
      {pinned && !hover && (
        <div style={{ position: 'absolute', top: 6, right: 12 }}>
          <Button small onClick={() => setPinned(undefined)}>Close details</Button>
        </div>
      )}
    </div>
  );
}

/** What the lines and dots mean. */
export function MapLegend() {
  const c = useMapStyles();
  return (
    <div className={c.legend} role="group" aria-label="Legend">
      <span className={c.legendItem}><i className={`${c.swatch} ${c.swatchOk}`} /> all verified</span>
      <span className={c.legendItem}><i className={`${c.swatch} ${c.swatchAttn}`} /> holding or flag</span>
      <span className={c.legendItem}><i className={`${c.swatch} ${c.swatchDown}`} /> out-of-band or blind</span>
      <span className={c.legendItem}><i className={`${c.swatch} ${c.swatchWatch}`} /> observer watching</span>
      <span>line width: decisions in the window</span>
      <Chip tone="sky" title="Dashes move along a line where decisions are flowing; they stand still if your system asks for reduced motion">flow</Chip>
    </div>
  );
}
