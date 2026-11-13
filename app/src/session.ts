// GET /auth/session: who is signed in, the CSRF token for non-GET calls and when the sign-in ends. Never the ID token.

export interface WebSession {
  user: string;
  csrf: string;
  expires: string;
  auth_time: string;
  /** True when `clearance web` has the Autopilot gateway configured (/api/gateway/*). */
  gateway: boolean;
}

/** Where a signed-out person goes: the server's login, which returns them to `ret` (a path on this origin). */
export function loginUrl(ret: string): string {
  return `/auth/login?return=${encodeURIComponent(ret)}`;
}

export interface Navigator {
  /** Leave the app for a server URL (a full-page navigation: sign-in is the server's, not the router's). */
  assign(url: string): void;
}

/** The page the person is on, as the server's `return` wants it: path and query, never a host. */
export function currentReturn(loc: Pick<Location, 'pathname' | 'search'> = window.location): string {
  return `${loc.pathname}${loc.search}`;
}

export class SessionError extends Error {
  constructor(readonly status: number) {
    super(`/auth/session failed with ${status}`);
  }
}
