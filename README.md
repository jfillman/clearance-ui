# clearance-ui

Clearance UI repo.

The web UI for [Clearance](https://github.com/jfillman/clearance), as a package: `@jfillman/clearance-ui` (`src/`).

The design kit (tokens, chips, tables, filters; Tower's look), the `ClearanceTransport` seam and the host-agnostic views:
Clearances, Evidence, Exceptions, Attestations, Map, Policy. No `@backstage/*` import anywhere: a host supplies a
transport through `<ClearanceTransportProvider>`, so every call to clearance-api and the core goes through one
interface. Backstage's Clearance plugin is one host; a standalone shell served by `clearance web` is the other.
`createFakeTransport` serves tests.

## Using the package

Consumed as a git-tag dependency, like Tower: the tagged commit holds the built `dist/`, nothing builds at install.

```json
"@jfillman/clearance-ui": "jfillman/clearance-ui#v0.1.0"
```

Peer dependencies: `react`, `react-dom`, `react-router-dom` and `@material-ui/core` (v4), at the versions the host
uses. The host wraps the views in `ClearanceTransportProvider` and a Material UI v4 `ThemeProvider` (the kit reads its
light or dark tokens from `palette.type`). Kit changes are made here, not in the hosts.

## Development

```
yarn install --immutable
yarn tsc            # type-check src/
yarn lint
CI=true yarn test   # jest + testing-library, on the fake transport; CI=true stops the watch mode
yarn build          # dist/ (the package)
yarn check-dist     # fails when the committed dist/ is not what a fresh build produces
```

`src/boundary.test.ts` keeps `@backstage/*` and Tower out of `src/`; `src/kit/styleRatchet.test.ts` fails
on a hex colour outside the tokens, an off-scale font size, a bare `<button>`, and the other drift the kit exists to
prevent. See [RELEASING.md](RELEASING.md) for a release.
