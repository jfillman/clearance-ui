import { useState, useRef, useCallback, useEffect } from 'react';

const HIDE_MS = 160;
function useHoverIntent(ms = HIDE_MS) {
  const [hover, setHover] = useState();
  const timer = useRef();
  const cancel = useCallback(() => {
    if (timer.current !== void 0) {
      clearTimeout(timer.current);
      timer.current = void 0;
    }
  }, []);
  const enter = useCallback(
    (h) => {
      cancel();
      setHover(h);
    },
    [cancel]
  );
  const leave = useCallback(() => {
    cancel();
    timer.current = setTimeout(() => {
      timer.current = void 0;
      setHover(void 0);
    }, ms);
  }, [cancel, ms]);
  const hideNow = useCallback(() => {
    cancel();
    setHover(void 0);
  }, [cancel]);
  useEffect(() => cancel, [cancel]);
  return { hover, enter, leave, hideNow };
}

export { HIDE_MS, useHoverIntent };
//# sourceMappingURL=useHoverIntent.esm.js.map
