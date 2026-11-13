import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { CssBaseline } from '@material-ui/core';
import { ThemeProvider } from '@material-ui/core/styles';
import { ClearanceTransportProvider, type ClearanceTransport } from '../../src';
import { Pages } from './Pages';
import { TopNav } from './TopNav';
import type { WebSession } from './session';
import { themeFor } from './theme';
import { useScheme } from './useScheme';

// The shell: theme (light or dark by prefers-color-scheme), the transport provider, the top nav and the pages. It takes
// the transport and the session as inputs, so a smoke test renders it on the fake transport and main.tsx wires the
// real one.

export interface ShellProps {
  transport: ClearanceTransport;
  session: () => Promise<WebSession | null>;
  signOut?: () => void;
  /** The router (default: the browser's). Tests pass a MemoryRouter. */
  router?: (children: ReactNode) => ReactNode;
}

export function Shell({ transport, session, signOut, router }: ShellProps) {
  const scheme = useScheme();
  const theme = useMemo(() => themeFor(scheme), [scheme]);
  const [who, setWho] = useState<WebSession | null>(null);
  useEffect(() => {
    let live = true;
    session().then(s => live && setWho(s)).catch(() => undefined);
    return () => {
      live = false;
    };
  }, [session]);
  const out = useCallback(() => signOut?.(), [signOut]);
  const body = (
    <>
      <TopNav session={who} onSignOut={out} />
      <Pages />
    </>
  );
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <ClearanceTransportProvider transport={transport}>{router ? router(body) : <BrowserRouter>{body}</BrowserRouter>}</ClearanceTransportProvider>
    </ThemeProvider>
  );
}
