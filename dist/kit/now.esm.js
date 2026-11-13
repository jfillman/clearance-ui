import { useState } from 'react';

function useMountedNow(now) {
  const [mounted] = useState(() => now ?? Date.now());
  return now ?? mounted;
}

export { useMountedNow };
//# sourceMappingURL=now.esm.js.map
