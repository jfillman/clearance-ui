// A node-side scan of the source tree: the frontend import restrictions are for browser code, not this test.
// eslint-disable-next-line no-restricted-imports
import { readdirSync, readFileSync, statSync } from 'fs';
// eslint-disable-next-line no-restricted-imports
import { join } from 'path';

// A relative age ("3 min ago") hides the moment it counts from, so each one hovers to the local and UTC time (whenTitle).
// This fails when a view renders relativeTime(...) or ageWords(...) with no whenTitle(...) on the same line or the two
// lines above it (a title on the element that wraps it).
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap(f => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });

it('every relative age in the views and kit has a whenTitle hover', () => {
  const missing: string[] = [];
  let seen = 0;
  for (const file of files(join(__dirname, '..'))) {
    if (file.endsWith(join('kit', 'format.ts'))) continue;
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (!/\b(relativeTime|ageWords)\(/.test(line) || /^\s*(export )?function |^import /.test(line)) return;
      seen++;
      if (!lines.slice(Math.max(0, i - 2), i + 1).some(l => l.includes('whenTitle('))) missing.push(`${file.replace(join(__dirname, '..'), 'src')}:${i + 1}`);
    });
  }
  expect(seen).toBeGreaterThan(8);
  expect(missing).toEqual([]);
});
