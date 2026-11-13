# clearance-ui

Clearance UI repo.

The web UI for [Clearance](https://github.com/jfillman/clearance), in two parts built from one source tree:

1. **`@jfillman/clearance-ui`**, a package (`src/`). The design kit (tokens, chips, tables, filters; Tower's look), the
   `ClearanceTransport` seam and the host-agnostic views: Clearances, Evidence, Exceptions, Attestations, Map, Policy.
   No `@backstage/*` import anywhere: a host supplies a transport through `<ClearanceTransportProvider>`, so every call
   to clearance-api and the core goes through one interface. Backstage's Clearance plugin is one host; the shell below
   is the other. `createFakeTransport` serves tests.
2. **The standalone shell** (`app/`): Vite and React, a client-side router, a top nav with the six pages, an app picker
   where Backstage has the catalog, Tower's tokens in light and dark (follows `prefers-color-scheme`), and a transport
   on same-origin `fetch` to [`clearance web`](https://github.com/jfillman/clearance/blob/main/docs/web.md)
   (`/api/read/*`, `/api/write/*`). Its build is what `clearance web` embeds.

## The shell and `clearance web`

The shell holds no token. `clearance web` signs the person in at the people IdP and keeps the session; the page reads
`GET /auth/session` for who is signed in and the CSRF token, and then:

- sends `X-CSRF-Token` on every non-GET;
- on a **401** goes to `/auth/login?return=<this page>`;
- on a **401 with `X-Clearance-Reauth`** (the core refused a write because the sign-in is too old) goes where the header
  says, a fresh login that returns to the page; the write is not replayed, the person repeats it.

It is strict-CSP compatible (`script-src 'self'`): no inline script, one hashed entry under `assets/`. See
[docs/web-ui-bundle.md](docs/web-ui-bundle.md) for building it and getting it into Clearance's release.

```
yarn install --immutable
yarn app:dev        # vite on :5173, proxying /api and /auth to a local `clearance web` on :8080
yarn app:build      # app/dist: the directory clearance web embeds
make bundle         # out/clearance-ui-web-<version>.tar.gz (+ .sha256), the release artifact
```

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
yarn tsc            # type-check src/ and app/src/
yarn lint
CI=true yarn test   # jest + testing-library, on the fake transport; CI=true stops the watch mode
yarn build          # dist/ (the package)
yarn check-dist     # fails when the committed dist/ is not what a fresh build produces
```

`src/boundary.test.ts` keeps `@backstage/*` and Tower out of `src/` and `app/src/`; `src/kit/styleRatchet.test.ts` fails
on a hex colour outside the tokens, an off-scale font size, a bare `<button>`, and the other drift the kit exists to
prevent. See [RELEASING.md](RELEASING.md) for a release.
