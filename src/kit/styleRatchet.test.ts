// A node-side scan of the source tree: the frontend import restrictions are for browser code, not this test.
// eslint-disable-next-line no-restricted-imports
import { readdirSync, readFileSync, statSync } from 'fs';
// eslint-disable-next-line no-restricted-imports
import { join, relative } from 'path';

// The Clearance and Autopilot plugins look like Tower because they use one kit (kit.tsx, kitStyles.ts here), written
// to Tower's docs/design-system.md. This is the cheap version of Tower's `yarn ratchet` (scripts/style-ratchet.mjs): it
// scans the kit's and the views' source and fails on the drift Tower's overhaul removed, so it cannot creep back. Every
// count is zero; a view that needs a look the kit lacks adds it to the kit, not to the view.

const ROOT = join(__dirname, '..');
const PACKAGES = ['kit', 'views'];
const KIT = new Set(['kit.tsx', 'kitStyles.ts', 'tokens.ts']);

function files(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

const sources = PACKAGES.flatMap(pkg => files(join(ROOT, pkg))).map(path => ({ path: relative(ROOT, path), kit: KIT.has(path.split('/').pop()!), text: readFileSync(path, 'utf8') }));

/** Lines (path:line) of every non-kit source that match `re`. */
function hits(re: RegExp, { includeKit = false }: { includeKit?: boolean } = {}): string[] {
  return sources
    .filter(s => includeKit || !s.kit)
    .flatMap(s => s.text.split('\n').map((line, i) => (re.test(line) && !/^\s*\/\//.test(line) ? `${s.path}:${i + 1}` : '')))
    .filter(Boolean);
}

it('has no Tower import: Clearance installs without Hangar', () => {
  expect(hits(/from '@jfillman\/tower/, { includeKit: true })).toEqual([]);
});

it('has no hex colour outside tokens.ts: colours come from useClearanceTokens', () => {
  expect(hits(/#[0-9A-Fa-f]{6}\b|#[0-9A-Fa-f]{3}\b(?![\w-])/)).toEqual([]);
});

it('sets no off-scale font size outside the kit: the type scale lives in tokens.ts and kitStyles', () => {
  // fontScale.x is the scale; a number or a string is not.
  expect(hits(/fontSize:\s*(\d|['"])/)).toEqual([]);
});

it('never colours text with the amber stroke token (amberText, amberInk and onAmber are the text tokens)', () => {
  expect(hits(/color:[^,}]*\bt\.amber\b(?!\w)/)).toEqual([]);
});

it('draws no control with a bare element: Button, TextLink, FilterChips, the YamlBlock and the kit table replace them', () => {
  expect(hits(/<(button|pre)\b/)).toEqual([]);
});

it('uses no native title= on an element (the kit Tooltip takes it); a truncated value may be the exception, none is today', () => {
  expect(hits(/<(td|th|tr|span|div|button|a|p|section|label)\b[^>]*\btitle=/)).toEqual([]);
});

it('redoes no kit piece in a local style sheet: panels, tables, filters, buttons, chips, notes, facts and stats are the kit', () => {
  const banned = new Set(['panel', 'ph', 'st', 'count', 'table', 'th', 'td', 'filter', 'chipBtn', 'btn', 'primary', 'chip', 'tab', 'tabs', 'stat', 'stats', 'label', 'value', 'kv', 'link', 'note', 'hint', 'mono', 'rec', 'select', 'search', 'callout', 'tool', 'fact', 'facts', 'pre']);
  const found = sources
    .filter(s => !s.kit && /= makeStyles</.test(s.text))
    .flatMap(s => {
      const block = s.text.slice(s.text.indexOf('= makeStyles<'));
      const ends = [block.indexOf('\n}));'), block.indexOf('\n  };\n});')].filter(i => i >= 0);
      const end = ends.length ? Math.min(...ends) : block.length;
      return [...block.slice(0, end).matchAll(/^ {2,4}([A-Za-z0-9_]+):/gm)].filter(m => banned.has(m[1])).map(m => `${s.path}: ${m[1]}`);
    });
  expect(found).toEqual([]);
});
