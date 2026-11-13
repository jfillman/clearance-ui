# The two things this repo produces. See RELEASING.md and docs/web-ui-bundle.md.
.PHONY: package bundle test

# The npm package (committed dist/, consumed by git tag).
package:
	yarn install --immutable
	yarn build

# The standalone shell as a tarball Clearance's release embeds: out/clearance-ui-web-<version>.tar.gz (+ .sha256).
bundle:
	yarn install --immutable
	yarn app:build
	yarn app:bundle

test:
	yarn tsc && yarn lint && yarn test --ci
