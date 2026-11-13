#!/usr/bin/env node
// Packs the shell's build (app/dist, from `yarn app:build`) as a release artifact: out/clearance-ui-web-<version>.tar.gz
// with index.html at its root, and a .sha256 next to it. Clearance's release unpacks it into internal/web/static/
// before `go build` (clearance docs/web.md, "Building the bundle in"; docs/web-ui-bundle.md here).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const dist = join(root, 'app', 'dist');
if (!existsSync(join(dist, 'index.html'))) {
  console.error('app/dist/index.html is missing: run `yarn app:build` first.');
  process.exit(1);
}
// The contract with `clearance web` (strict CSP: script-src 'self'): index.html is the entry, no inline script or event
// handler, and every file under assets/ carries a content hash in its name.
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const inline = [...html.matchAll(/<script\b([^>]*)>/gi)].filter(m => !/\bsrc=/.test(m[1])).length;
if (inline || /\son[a-z]+\s*=/i.test(html) || /javascript:/i.test(html)) {
  console.error('app/dist/index.html has an inline script or handler: the server\'s CSP would refuse it.');
  process.exit(1);
}
const unhashed = readdirSync(join(dist, 'assets')).filter(f => !/-[A-Za-z0-9_-]{8,}\.[a-z0-9]+$/.test(f));
if (unhashed.length) {
  console.error('files under assets/ without a content hash: ' + unhashed.join(', '));
  process.exit(1);
}
const { version } = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const out = join(root, 'out');
mkdirSync(out, { recursive: true });
const name = `clearance-ui-web-${version}.tar.gz`;
execFileSync('tar', ['-czf', join(out, name), '-C', dist, '.'], { stdio: 'inherit' });
const sum = createHash('sha256').update(readFileSync(join(out, name))).digest('hex');
writeFileSync(join(out, `${name}.sha256`), `${sum}  ${name}\n`);
console.log(`${join('out', name)}\nsha256 ${sum}`);
