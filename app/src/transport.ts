import { createFetchTransport, TransportError, type ClearanceTransport, type FetchLike } from '../../src/kit';
import { currentReturn, loginUrl, SessionError, type Navigator, type WebSession } from './session';

// The shell's ClearanceTransport: same-origin fetch to `clearance web` (clearance docs/web.md). Reads go to
// /api/read/<clearance-api path>, writes to /api/write/<core path>; the browser's session cookie is the credential, so
// the page never holds a token. The three rules of the server's contract:
//   1. every non-GET carries X-CSRF-Token, the session's synchronizer token from GET /auth/session;
//   2. a 401 means no session (or an expired one): go to /auth/login?return=<this page>;
//   3. a 401 carrying X-Clearance-Reauth is the core refusing a write for a stale sign-in: go where the header says
//      (a fresh login that returns here), and do not replay the write; the person repeats it.

export interface ShellDeps {
  fetch?: typeof fetch;
  navigator?: Navigator;
  /** The page to come back to, as path and query. */
  returnTo?: () => string;
}

export interface ShellTransport {
  transport: ClearanceTransport;
  /** The session as the server reports it; null when signed out (the person is sent to sign in). Cached until `refresh`. */
  session(): Promise<WebSession | null>;
  refresh(): void;
}

const isSafe = (method: string | undefined) => !method || method === 'GET' || method === 'HEAD' || method === 'OPTIONS';

export function createShellTransport(deps: ShellDeps = {}): ShellTransport {
  const doFetch = deps.fetch ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  const nav: Navigator = deps.navigator ?? { assign: u => window.location.assign(u) };
  const returnTo = deps.returnTo ?? (() => currentReturn());
  let cached: Promise<WebSession | null> | undefined;

  async function loadSession(): Promise<WebSession | null> {
    const res = await doFetch('/auth/session', { credentials: 'same-origin', headers: { Accept: 'application/json' } });
    if (res.status === 401) {
      nav.assign(loginUrl(returnTo()));
      return null;
    }
    if (!res.ok) throw new SessionError(res.status);
    return (await res.json()) as WebSession;
  }
  const session = () => (cached ??= loadSession().catch(e => {
    cached = undefined;
    throw e;
  }));

  const shellFetch: FetchLike = async (url, init) => {
    const headers: Record<string, string> = { Accept: 'application/json', ...init?.headers };
    if (!isSafe(init?.method)) {
      const s = await session();
      // Already on its way to sign in (loadSession navigated): the write is not sent without a token.
      if (!s) throw new TransportError(url, 401, { error: 'signed out' });
      headers['X-CSRF-Token'] = s.csrf;
    }
    const res = await doFetch(url, { ...init, headers, credentials: 'same-origin' } as RequestInit);
    if (res.status === 401) {
      const reauth = res.headers.get('X-Clearance-Reauth');
      cached = undefined;
      // The server only ever sends a path on its own origin; refuse anything else rather than navigate off-site.
      if (reauth && reauth.startsWith('/auth/')) nav.assign(reauth);
      else nav.assign(loginUrl(returnTo()));
    }
    return res;
  };

  return {
    transport: createFetchTransport({ fetch: shellFetch, url: (path, kind) => `/api/${kind}${path}` }),
    session,
    refresh: () => {
      cached = undefined;
    },
  };
}
