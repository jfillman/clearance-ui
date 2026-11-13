# The web UI bundle

`yarn app:build` writes the standalone shell to `app/dist/`:

```
index.html              the entry (no inline script; one module script)
assets/index-<hash>.js  content-hashed, so `clearance web` may cache it for a year
```

This is exactly the contract of `clearance web` (clearance `docs/web.md`, "Building the bundle in"): `index.html` is the
entry, files under `assets/` are hashed, everything else is revalidated, an unknown path without an extension serves
`index.html` for the client router, and the CSP is `script-src 'self'` (styles may be inline: the kit's CSS-in-JS
needs it). `yarn app:bundle` checks the first two before it packs.

## The release artifact

```
make bundle      # = yarn install --immutable && yarn app:build && yarn app:bundle
```

produces `out/clearance-ui-web-<version>.tar.gz` (`index.html` at the archive root) and
`out/clearance-ui-web-<version>.tar.gz.sha256`. The tag workflow `.github/workflows/release.yml` builds the same two
files and attaches them to the GitHub release of the tag.

## Getting it into Clearance (the Clearance-side follow-up)

Not done here: Clearance is a separate repo. The copy step is the one `docs/web.md` already describes, fed from the
release artifact instead of a local `<ui>/dist`:

```
rm -rf internal/web/static && mkdir internal/web/static
curl -fsSL -o /tmp/ui.tgz https://github.com/jfillman/clearance-ui/releases/download/vX.Y.Z/clearance-ui-web-X.Y.Z.tar.gz
echo "<sha256>  /tmp/ui.tgz" | sha256sum -c -
tar -xzf /tmp/ui.tgz -C internal/web/static
go build ./cmd/clearance
```

What Clearance needs: a pinned `CLEARANCE_UI_VERSION` (and the expected sha256) in its repo, a `make web-ui` target (or a
step in its release workflow and Dockerfile) running the lines above before `go build`, and a CI check that the pin
resolves. The placeholder `internal/web/static/index.html` stays in the tree so a plain `go build` still works; the
release build replaces it. The tarball is public and carries no ids or secrets.
