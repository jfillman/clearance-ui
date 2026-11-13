import { useTheme } from '@material-ui/core/styles';

// Clearance's own tokens, the same values as Tower's brand tokens (tower src/brand/tokens.ts) so the two plugins
// look like one product, but copied here because this package must install where there is no Tower: the Clearance
// plugin can never import it (Autopilot and Clearance in Backstage: UI design, 2026-10-30). Amber is what waits on
// a person, sky what is moving, good and bad the verdicts. The amber has four tokens, one per job (Tower
// docs/design-system.md): `amberFill` behind text (text on it is `onAmber`), `amber` for strokes and dots, `amberText`
// for amber words on a panel, and `amberSoft`/`amberLine`/`amberInk` for the warn tint. Never `color: t.amber` on text.

export interface ClearanceTokens {
  bg: string;
  panel: string;
  panelAlt: string;
  line: string;
  lineSoft: string;
  textHi: string;
  textLo: string;
  textFaint: string;
  /** Strokes, dots, bars, underlines: anything amber that is not a fill behind text and not text. */
  amber: string;
  /** Fill behind text (the primary button). Text on it is `onAmber`; its edge is `amber`. */
  amberFill: string;
  amberFillHover: string;
  amberFillPress: string;
  /** Amber words on a panel (an eyebrow, a slow time). `amber` itself fails AA as text in light. */
  amberText: string;
  amberInk: string;
  /** Text on a solid amber fill. */
  onAmber: string;
  amberSoft: string;
  amberLine: string;
  sky: string;
  skySoft: string;
  skyLine: string;
  good: string;
  goodSoft: string;
  bad: string;
  badSoft: string;
}

const light: ClearanceTokens = {
  bg: '#F1F3F5',
  panel: '#FFFFFF',
  panelAlt: '#E8ECEF',
  line: '#D5DBE0',
  lineSoft: '#E3E7EA',
  textHi: '#171B1F',
  textLo: '#5B6570',
  textFaint: '#88919A',
  amber: '#B9791F',
  amberFill: '#E2A03A',
  amberFillHover: '#EAAB48',
  amberFillPress: '#D4922C',
  amberText: '#7A5115',
  amberInk: '#7A5115',
  onAmber: '#1A1204',
  amberSoft: '#F4E6C9',
  amberLine: '#E0BE84',
  sky: '#2E7BA6',
  skySoft: '#DCEDF6',
  skyLine: '#B7D7E6',
  good: '#2E8B57',
  goodSoft: '#DCF0E4',
  bad: '#B23B2E',
  badSoft: '#F6DEDA',
};

const dark: ClearanceTokens = {
  bg: '#0B0D10',
  panel: '#12161B',
  panelAlt: '#1A1F26',
  line: '#262C33',
  lineSoft: '#1D232A',
  textHi: '#E9ECEF',
  textLo: '#96A2AC',
  textFaint: '#66717B',
  amber: '#E8A33D',
  amberFill: '#E8A33D',
  amberFillHover: '#F0B04A',
  amberFillPress: '#D9922C',
  amberText: '#E8A33D',
  amberInk: '#F4C67D',
  onAmber: '#1A1204',
  amberSoft: '#3A2C15',
  amberLine: '#5C4520',
  sky: '#6FB2D9',
  skySoft: '#152530',
  skyLine: '#2C4756',
  good: '#5FAE84',
  goodSoft: '#16281F',
  bad: '#D9776A',
  badSoft: '#301A17',
};

/** The tokens of a MUI theme: makeStyles callbacks use this, so a sheet is built once per theme (a sheet whose values are
 *  functions of props is rebuilt for every component instance, which made a form of 30 Fields run a test out of time). */
export function tokensForTheme(theme: { palette: { type: string } }): ClearanceTokens {
  return theme.palette.type === 'dark' ? dark : light;
}

export function useClearanceTokens(): ClearanceTokens {
  return tokensForTheme(useTheme());
}

export const fontDisplay = '"IBM Plex Sans Condensed", "IBM Plex Sans", sans-serif';
export const fontBody = '"IBM Plex Sans", -apple-system, "Segoe UI", sans-serif';
export const fontMono = '"IBM Plex Mono", "SFMono-Regular", Consolas, monospace';
/** Tower's type scale: nothing under 11px. */
export const fontScale = { xs: 11, sm: 12, md: 13, lg: 15, xl: 18, x2: 22, x3: 32 } as const;
