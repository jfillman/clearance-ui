// A repo-reading guard test, the one place node's fs and path are wanted.
/* eslint-disable no-restricted-imports */
import fs from 'fs';
import path from 'path';
/* eslint-enable no-restricted-imports */

// The package's host boundary (web UI spec WEB-1/WEB-2): the kit and the views import nothing from @backstage/* or
// Tower, and reach their host only through the ClearanceTransport. Backstage-only code (the plugin, the adapter,
// Tower's entity tab) stays in the backstage repo; the standalone shell (app/) is a second host and needs none of it.
const root = path.resolve(__dirname, '..');
function sources(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : sources(p);
    return /\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [p] : [];
  });
}
const importers = (dir: string, re: RegExp) => sources(dir).filter(f => re.test(fs.readFileSync(f, 'utf8'))).map(f => path.relative(root, f));
const BACKSTAGE = /from\s+['"]@backstage\/|require\(\s*['"]@backstage\/|import\(\s*['"]@backstage\//;
const TOWER = /from\s+['"]@jfillman\/(tower|plugin-)/;

it.each(['src', 'app/src'])('%s imports nothing from @backstage/* or Tower', dir => {
  expect(sources(path.join(root, dir)).length).toBeGreaterThan(10 * (dir === 'src' ? 1 : 0));
  expect(importers(path.join(root, dir), BACKSTAGE)).toEqual([]);
  expect(importers(path.join(root, dir), TOWER)).toEqual([]);
});

it('the package depends on no @backstage/* at run time: only react, react-dom, react-router-dom and Material UI as peers', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  expect(Object.keys(pkg.dependencies ?? {})).toEqual([]);
  expect(Object.keys(pkg.peerDependencies).sort()).toEqual(['@material-ui/core', 'react', 'react-dom', 'react-router-dom']);
});
