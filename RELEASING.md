# Releasing

`@jfillman/clearance-ui` is distributed as a **git-tag dependency**, the way `@jfillman/tower` is: no npm registry, no
publish token. A consumer (`backstage`) pins a tag directly:

```json
"@jfillman/clearance-ui": "jfillman/clearance-ui#v0.1.0"
```

Because of that, the tagged commit must already contain the **built** `dist/`: nothing runs a build at install time.
CI (`.github/workflows/ci.yml`) installs with `--immutable`, runs lint, `tsc`, the tests and the build, and fails when the committed `dist/` differs from a fresh build, so a stale `dist/` cannot reach `main`.

## Steps

1. Make sure `main` is clean and CI is green.
2. On a branch: bump `version` in `package.json`, `yarn build`, and commit
   `package.json` and `dist/` (`git commit -m "release: vX.Y.Z (what changed)"`). Open the PR, wait for CI, merge.
3. Tag `main`'s merge commit and push the tag:
   ```bash
   git checkout main && git pull
   git tag vX.Y.Z && git push origin vX.Y.Z
   ```
4. In the consuming repo (`backstage`), bump the pin and reinstall:
   ```bash
   # packages/app/package.json (and any plugin's package.json): "@jfillman/clearance-ui": "jfillman/clearance-ui#vX.Y.Z"
   yarn install
   ```
A change to the kit that Backstage and the standalone web UI both render is released once and pinned by both.
