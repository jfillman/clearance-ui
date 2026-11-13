import { useState } from 'react';

/**
 * The clock a view computes its time windows from: the `now` a test passes, else the moment the view mounted.
 * A default of `Date.now()` in a component's parameters is a new value on every render, and anything derived from
 * it (a `since` filter, a poll key) changes every render: the fetch restarts, sets state, renders, and so on
 * forever (the Evidence page's 2026-10-31 loop: "Loading…" that never ends, a row that never opens).
 */
export function useMountedNow(now?: number): number {
  const [mounted] = useState(() => now ?? Date.now());
  return now ?? mounted;
}
