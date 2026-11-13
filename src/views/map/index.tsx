import { useState } from 'react';
import { MapView } from './MapView';
import { TargetDetailView, type Navigate } from './TargetDetailView';
import type { WindowId } from './model';

export type { Navigate } from './TargetDetailView';

/** The Map tab: the Map, or one environment's detail when `target` is set. The window is shared, so drilling down keeps it. */
export function MapTab({ target, onOpenTarget, onNavigate }: { target?: string; onOpenTarget: (id: string | undefined) => void; onNavigate: Navigate }) {
  const [win, setWin] = useState<WindowId>('1h');
  return target ? (
    <TargetDetailView id={target} win={win} onWindow={setWin} onBack={() => onOpenTarget(undefined)} onNavigate={onNavigate} />
  ) : (
    <MapView win={win} onWindow={setWin} onOpenTarget={id => onOpenTarget(id)} />
  );
}
