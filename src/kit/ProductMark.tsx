import { useClearanceTokens } from './tokens';

// The Hangar instrument dial (ring, eight ticks, amber heading bug at 12 o'clock) with the product's glyph in the
// centre, as hangar/brand/marks/<product>-inline.svg draws it; change both together. Inline rendering: the page's own
// surface is the background. Tower's HangarMark draws the same dial for every Hangar product; this copy exists so the
// Autopilot and Clearance plugins carry their marks without importing Tower (hangar/brand/README.md).
//
//   autopilot  nose held between brackets (heading hold)   amber: an agent acting on its own needs supervision
//   clearance  check mark over a hold-short line            good green: the product whose whole job is to say a
//              (cleared past the hold)                      change is cleared
export type Product = 'autopilot' | 'clearance';

const TICK_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315];

export function ProductMark({ product, size = 24 }: { product: Product; size?: number }) {
  const t = useClearanceTokens();
  const accent = product === 'autopilot' ? t.amber : t.good;
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" role="img" aria-label={`${product} mark`} style={{ flexShrink: 0 }}>
      <circle cx="48" cy="48" r="40" fill="none" stroke={t.line} strokeWidth={2} />
      <g stroke={t.textFaint} strokeWidth={2}>
        {TICK_ANGLES.map(angle => (
          <line key={angle} x1="48" y1="8" x2="48" y2="15" transform={`rotate(${angle} 48 48)`} />
        ))}
      </g>
      <polygon points="44,2 52,2 48,9" fill={t.amber} />
      {product === 'autopilot' && (
        <>
          <path d="M33,34 H28 V62 H33 M63,34 H68 V62 H63" fill="none" stroke={accent} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          <polygon points="48,33 57.5,59 48,53.5 38.5,59" fill={accent} stroke={accent} strokeWidth={1.5} strokeLinejoin="round" />
        </>
      )}
      {product === 'clearance' && (
        <>
          <path d="M35,37 L44.5,46.5 L61.5,29.5" fill="none" stroke={accent} strokeWidth={4.5} strokeLinecap="round" strokeLinejoin="round" />
          <line x1="29" y1="57" x2="67" y2="57" stroke={accent} strokeWidth={3.2} strokeLinecap="round" />
          <line x1="29" y1="65" x2="67" y2="65" stroke={accent} strokeWidth={3.2} strokeDasharray="5.5 4.3" />
        </>
      )}
    </svg>
  );
}
