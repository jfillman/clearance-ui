import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Callout,
  Chip,
  Count,
  EmptyNote,
  FilterBar,
  FilterChip,
  FilterChips,
  FilterGroup,
  Hint,
  PanelSkeleton,
  readDeniedText,
  relativeTime,
  SearchField,
  Section,
  StatusChip,
  TabError,
  TextLink,
  useClearanceRead,
  usePoll,
  type StatusTone,
} from '../../kit';
import { MapLanes, type LaneRow } from './MapLanes';
import { MapMatrix } from './MapMatrix';
import { MapLegend, MapTopology } from './MapTopology';
import {
  buildTopology,
  groupsOf,
  NO_FILTERS,
  otherPartials,
  registryEmpty,
  registryTiers,
  soleTarget,
  visibleAttention,
  WINDOWS,
  type MapFilters,
  type WindowId,
} from './model';
import { useClock } from './parts';
import { useMapStyles } from './styles';
import type { AttentionItem, MapResponse, TargetNode } from './types';

// The coverage Map (boards C9 primary, C6 topology, C8/C11 lanes): what should be protected, who guards and watches it, and
// whether the evidence agrees, in one call (GET /v1/map) however many gates and targets there are. Topology and Lanes are two
// views of the same map; the one a person last used is the one the Map opens on.

const SEVERITY_TONE: Record<AttentionItem['severity'], StatusTone> = { down: 'bad', attention: 'warn', info: 'neutral' };

export type MapViewId = 'topology' | 'lanes';
const VIEW_KEY = 'clearance.map.view';

export function readView(): MapViewId {
  try {
    return window.localStorage.getItem(VIEW_KEY) === 'lanes' ? 'lanes' : 'topology';
  } catch {
    return 'topology';
  }
}
function writeView(v: MapViewId) {
  try {
    window.localStorage.setItem(VIEW_KEY, v);
  } catch {
    // no storage (a private window): the view is simply not remembered
  }
}

export const windowRange = (id: WindowId, now: number) => ({ from: new Date(now - WINDOWS.find(w => w.id === id)!.ms).toISOString(), to: new Date(now).toISOString() });

/** One read of the Map; `target` adds the one-target detail. Re-reads every 30 s while the page is visible. */
export function useMap(win: WindowId, opts: { expand?: string[]; target?: string; group?: string } = {}) {
  const api = useClearanceRead();
  const expand = (opts.expand ?? []).join(',');
  return usePoll<MapResponse>(
    `map:${win}:${expand}:${opts.target ?? ''}:${opts.group ?? ''}`,
    () => api.get<MapResponse>('/v1/map', { ...windowRange(win, Date.now()), expand: expand || undefined, target: opts.target, group: opts.group }),
    30_000,
  );
}

export function WindowChips({ value, onChange }: { value: WindowId; onChange: (w: WindowId) => void }) {
  return <FilterChips label="Window" options={WINDOWS.map(w => ({ id: w.id, label: w.label }))} value={value} onChange={onChange} />;
}

/** Declared targets arrive per source: until a source publishes, the Map has nothing to draw, and says why. */
export function EmptyRegistry({ map }: { map?: MapResponse }) {
  const sources = map?.registry.sources ?? [];
  return (
    <Callout tone="neutral" label="No targets published yet" title="The Map draws what is declared, so it is empty until a cluster or account publishes its targets" data-testid="map-empty">
      Targets are published per cluster: each source (a cluster&apos;s gitops render, an account&apos;s bootstrap) sends the whole set of protected environments it declares, with the gates that guard each and the observers that watch it (<code>{'PUT /v1/targets/{source}'}</code> on the Clearance core). Nothing is inferred from records, so a cluster that has not published shows nothing here, not a false &quot;all clear&quot;.
      {sources.length > 0 && <> Sources that have published: {sources.map(s => `${s.source} (${s.targets})`).join(', ')}.</>}
    </Callout>
  );
}

function AttentionPanel({ items, targets, onOpenTarget, onShow }: { items: AttentionItem[]; targets: TargetNode[]; onOpenTarget: (id: string) => void; onShow: (groups: string[]) => void }) {
  const c = useMapStyles();
  return (
    <Section framed title="Needs attention" count={items.length} aria-label="Needs attention">
      {items.length === 0 ? (
        <EmptyNote inset>Nothing needs attention in this window: every declared gate is accounted for and every observer is healthy.</EmptyNote>
      ) : (
        <ul className={c.attnList}>
          {items.map((a, i) => {
            const one = soleTarget(a, targets);
            const groups = groupsOf(a, targets);
            let action: ReactNode = null;
            if (one) action = <TextLink onClick={() => onOpenTarget(one.id)} aria-label={`Open ${one.name}`}>Open →</TextLink>;
            else if (groups.length > 0) action = <TextLink onClick={() => onShow(groups)} aria-label={`Show ${a.title} in the map`}>Show</TextLink>;
            return (
              <li key={`${a.kind}-${i}`} className={c.attnItem}>
                <StatusChip tone={SEVERITY_TONE[a.severity]} title={a.severity === 'info' ? 'For information: nothing is failing' : a.severity}>{a.kind}</StatusChip>
                <div>
                  <p className={c.attnTitle}>{a.title}</p>
                  <p className={c.attnDetail}>{a.detail}</p>
                </div>
                {action}
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

/** Lanes of the whole map: one row per gate type, or, scoped to a gate type, one row per target it guards. */
export function lanesRows(map: MapResponse, scopeGate: string | undefined, onScope: (type: string | undefined) => void, targets: TargetNode[]): LaneRow[] {
  if (!scopeGate) {
    return map.nodes.gate_types.map(g => ({ key: g.id, label: g.type, sub: `${g.instances} instances · ${g.targets} targets`, lanes: g.lanes, holding: g.holding, refused: g.refused, onSelect: () => onScope(g.type) }));
  }
  return targets.flatMap(t =>
    t.gates
      .filter(g => g.type === scopeGate)
      .map(g => ({
        key: `${t.id}:${g.instance}`,
        label: t.name,
        sub: `${scopeGate} · ${g.instance} · ${t.group}`,
        mode: g.mode,
        silent: g.silent,
        lanes: g.lanes,
        holding: g.holding,
        refused: g.refused,
        blind: t.observers.some(o => o.state === 'blind'),
      })),
  );
}

export function MapView({ win, onWindow, onOpenTarget }: { win: WindowId; onWindow: (w: WindowId) => void; onOpenTarget: (id: string) => void }) {
  const c = useMapStyles();
  const now = useClock();
  const [view, setViewState] = useState<MapViewId>(readView);
  const [expanded, setExpanded] = useState<string[]>([]);
  const [filters, setFilters] = useState<MapFilters>(NO_FILTERS);
  const [scopeGate, setScopeGate] = useState<string>();
  const setView = (v: MapViewId) => {
    setViewState(v);
    writeView(v);
  };
  const map = useMap(win, { expand: expanded });
  useEffect(() => {
    // a group that is no longer in the registry cannot stay expanded
    const groups = map.data?.nodes.groups.map(g => g.group);
    if (groups && expanded.some(g => !groups.includes(g))) setExpanded(e => e.filter(g => groups.includes(g)));
  }, [map.data, expanded]);

  const data = map.data;
  const topo = useMemo(() => (data ? buildTopology(data, filters, expanded) : undefined), [data, filters, expanded]);
  const tiers = useMemo(() => registryTiers(data?.nodes.targets ?? []), [data]);
  const attention = useMemo(() => (data && topo ? visibleAttention(data.attention, filters, topo.targets) : []), [data, topo, filters]);
  const toggle = (g: string) => setExpanded(e => (e.includes(g) ? e.filter(x => x !== g) : [...e, g]));
  const set = (patch: Partial<MapFilters>) => setFilters(f => ({ ...f, ...patch }));

  if (!data) {
    if (map.error) return <TabError error={map.failure ?? map.error} what="the Map" onRetry={map.refresh} />;
    return <PanelSkeleton rows={6} label="Reading the coverage map" />;
  }
  const instances = data.nodes.gate_types.reduce((n, g) => n + g.instances, 0);
  const empty = registryEmpty(data);
  const iso = map.updatedAt ? new Date(map.updatedAt).toISOString() : undefined;
  const lanes = lanesRows(data, scopeGate, setScopeGate, topo?.targets ?? []);
  const attnCount = data.attention.filter(a => a.severity !== 'info').length;

  let body: ReactNode;
  if (empty) {
    body = <EmptyRegistry map={data} />;
  } else if (view === 'topology' && topo) {
    body = (
      <>
        <div className={c.split}>
          <Section
            framed
            title="Clearance coverage map"
            meta={<Chip title="Gate instances are drawn as one node per type, targets as one node per cluster or account">grouped: {instances} gate instances → {data.nodes.gate_types.length} types · {topo.targets.length} targets → {topo.groups.length} groups</Chip>}
          >
            {topo.gates.length === 0 && topo.groups.length === 0 ? (
              <EmptyNote inset>Nothing matches these filters.</EmptyNote>
            ) : (
              <>
                <MapTopology topo={topo} onToggleGroup={toggle} onOpenTarget={onOpenTarget} />
                <MapLegend />
              </>
            )}
            {topo.matrix && (
              <Hint inset>
                This registry has {data.nodes.targets.length} targets, too many to draw as rows: the matrix below shows every one, and a group still opens its detail.
              </Hint>
            )}
          </Section>
          <AttentionPanel
            items={attention}
            targets={topo.targets}
            onOpenTarget={onOpenTarget}
            onShow={groups => {
              setExpanded(e => [...new Set([...e, ...groups])]);
              set({ attentionOnly: false });
            }}
          />
        </div>
        {topo.matrix && (
          <Section framed title="Gates × targets" count={topo.targets.length}>
            <MapMatrix map={data} targets={topo.targets} onOpenTarget={onOpenTarget} />
          </Section>
        )}
        {otherPartials(data.partial).length > 0 && (
          <Callout tone="neutral" label="partial">
            {otherPartials(data.partial).map(n => <div key={n.field}>{n.field}: {n.reason}</div>)}
          </Callout>
        )}
      </>
    );
  } else {
    body = (
      <Section
        framed
        title={scopeGate ? `Lanes of ${scopeGate}` : 'Where changes are, by gate type'}
        meta={<Chip>{scopeGate ? 'one gate type' : 'aggregate across every instance'}</Chip>}
        actions={scopeGate ? <TextLink onClick={() => setScopeGate(undefined)}>All gate types ✕</TextLink> : undefined}
      >
        <MapLanes rows={lanes} partial={data.partial} empty={<EmptyNote inset>No gate has a lane in this window.</EmptyNote>} />
        <Hint inset>
          {scopeGate ? 'One row per target this gate type guards.' : 'Click a gate type to scope the lanes to it, or open a target from the topology for the changes moving through it now.'}
        </Hint>
      </Section>
    );
  }

  return (
    <>
      <FilterBar
        end={<Count>{map.error ? 'refresh failed · ' : ''}live · updated {iso ? `${relativeTime(iso, Math.max(now, map.updatedAt ?? 0))} ago` : '…'}</Count>}
      >
        <WindowChips value={win} onChange={onWindow} />
        <FilterChips label="View" options={[{ id: 'topology', label: 'Topology' }, { id: 'lanes', label: 'Lanes' }]} value={view} onChange={setView} />
        <FilterGroup label="Show">
          <FilterChip on={filters.attentionOnly} count={attnCount} onClick={() => set({ attentionOnly: !filters.attentionOnly })} title="Dim everything that is healthy and guarded">
            Needs attention only
          </FilterChip>
        </FilterGroup>
        {tiers.length > 0 && <FilterChips label="Registry" options={[{ id: 'all', label: 'All' }, ...tiers.map(r => ({ id: r, label: r.charAt(0).toUpperCase() + r.slice(1) }))]} value={filters.registry} onChange={r => set({ registry: r })} />}
        <SearchField label="Search targets" placeholder="target, app, group, gate" value={filters.query} onChange={q => set({ query: q })} />
      </FilterBar>

      {map.error && <Callout tone="warn" title="Couldn't refresh the Map">{readDeniedText(map.failure ?? map.error)} Showing the last read.</Callout>}
      {data.truncated && <Callout tone="warn" title="This Map was cut short">Clearance returned a truncated map for this window. Narrow it (a shorter window, or one group) before trusting a count.</Callout>}
      {data.registry.conflicts.length > 0 && (
        <Callout tone="warn" title="Two sources declare the same target">{data.registry.conflicts.join('; ')}. The first source&apos;s declaration is the one shown.</Callout>
      )}

      {body}
      {!empty && (
        <Hint>
          {data.registry.targets} declared targets from {data.registry.sources.length} {data.registry.sources.length === 1 ? 'source' : 'sources'} · {instances} gate instances · window {data.from.slice(0, 16).replace('T', ' ')} to {data.to.slice(11, 16)} UTC.
        </Hint>
      )}
    </>
  );
}
