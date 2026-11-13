import { jsx } from 'react/jsx-runtime';
import { useState } from 'react';
import { MapView } from './MapView.esm.js';
import { TargetDetailView } from './TargetDetailView.esm.js';

function MapTab({ target, onOpenTarget, onNavigate }) {
  const [win, setWin] = useState("1h");
  return target ? /* @__PURE__ */ jsx(TargetDetailView, { id: target, win, onWindow: setWin, onBack: () => onOpenTarget(void 0), onNavigate }) : /* @__PURE__ */ jsx(MapView, { win, onWindow: setWin, onOpenTarget: (id) => onOpenTarget(id) });
}

export { MapTab };
//# sourceMappingURL=index.esm.js.map
