import { createRoot } from 'react-dom/client';
import { Shell } from './Shell';
import { createShellTransport } from './transport';

const shell = createShellTransport();

// POST /auth/logout needs the CSRF token like every non-GET; the server ends the session and the page reloads signed out.
async function signOut() {
  const s = await shell.session();
  await fetch('/auth/logout', { method: 'POST', credentials: 'same-origin', headers: s ? { 'X-CSRF-Token': s.csrf } : {} }).catch(() => undefined);
  window.location.assign('/');
}

createRoot(document.getElementById('root')!).render(<Shell transport={shell.transport} session={shell.session} signOut={signOut} />);
