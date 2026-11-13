#!/usr/bin/env node
// Fails when the committed dist/ is not what a fresh build produces: run after `yarn build`. A tag whose dist/ is stale
// would ship old code to every consumer (nothing builds at install, see RELEASING.md).
import { execFileSync } from 'node:child_process';

const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const changed = git('status', '--porcelain', '--', 'dist');
if (changed) {
  console.error('dist/ differs from a fresh build. Run `yarn build` and commit dist/:\n' + changed);
  process.exit(1);
}
console.log('dist/ matches a fresh build.');
