# See RELEASING.md.
.PHONY: package test

# The npm package (committed dist/, consumed by git tag).
package:
	yarn install --immutable
	yarn build

test:
	yarn tsc && yarn lint && CI=true yarn test --ci
