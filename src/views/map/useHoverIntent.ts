import { useCallback, useEffect, useRef, useState } from 'react';

/** How long a node or its popover may be left before the popover goes: long enough to cross the gap between them, short enough to feel immediate. */
export const HIDE_MS = 160;

/**
 * One hover state shared by a node and its popover. Entering either shows (and cancels a pending hide); leaving either
 * schedules the hide, so moving from the node onto the popover, or across the few pixels between them, never hides and
 * re-shows it. This is what stops the flicker a popover causes when it takes the pointer from its own node.
 */
export function useHoverIntent<T>(ms = HIDE_MS) {
  const [hover, setHover] = useState<T>();
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const cancel = useCallback(() => {
    if (timer.current !== undefined) {
      clearTimeout(timer.current);
      timer.current = undefined;
    }
  }, []);
  const enter = useCallback(
    (h: T) => {
      cancel();
      setHover(h);
    },
    [cancel],
  );
  const leave = useCallback(() => {
    cancel();
    timer.current = setTimeout(() => {
      timer.current = undefined;
      setHover(undefined);
    }, ms);
  }, [cancel, ms]);
  const hideNow = useCallback(() => {
    cancel();
    setHover(undefined);
  }, [cancel]);
  useEffect(() => cancel, [cancel]);
  return { hover, enter, leave, hideNow };
}
