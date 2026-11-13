import { createTheme, type Theme } from '@material-ui/core/styles';
import { fontBody, tokensForTheme } from '../../src/kit';

// The MUI theme the shell gives the kit: Tower's brand tokens (the kit's tokens.ts, the same values as Tower), light
// and dark. The kit reads the tokens from `palette.type`; the rest of the palette follows them so the few MUI
// components the views use (Tooltip, the inputs) match.

export type Scheme = 'light' | 'dark';

export function themeFor(scheme: Scheme): Theme {
  const t = tokensForTheme({ palette: { type: scheme } });
  return createTheme({
    palette: {
      type: scheme,
      background: { default: t.bg, paper: t.panel },
      text: { primary: t.textHi, secondary: t.textLo },
      primary: { main: t.sky },
      secondary: { main: t.amber },
      error: { main: t.bad },
      success: { main: t.good },
      divider: t.line,
    },
    typography: { fontFamily: fontBody },
  });
}

/** The scheme the browser prefers; the shell follows it live (no toggle: Tower has none either). */
export function preferredScheme(match: (q: string) => { matches: boolean } = q => window.matchMedia(q)): Scheme {
  return match('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
