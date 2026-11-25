#!/usr/bin/env node
/**
 * Publish packages/core to npm when its version isn't on npm yet (the merged "chore: version packages" pull
 * request, or any later push while that version is still missing); otherwise do nothing. CI runs this
 * (via `pnpm release`) on every push to main. In CI npm authenticates with trusted publishing (OIDC),
 * so no token is stored anywhere and the package gets provenance. The trusted publisher for
 * release.yml may publish, so merging that pull request is the release: nothing is left to approve on
 * npm.
 *
 * npm publishes verbosely so the log shows its OIDC exchange: when that fails, npm falls back to the
 * placeholder token from setup-node and the registry answers only with a 404.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const dir = new URL('../packages/core/', import.meta.url);
const { name, version } = JSON.parse(readFileSync(new URL('package.json', dir), 'utf8'));

let live = '';
try {
  live = execFileSync('npm', ['view', `${name}@${version}`, 'version'], { encoding: 'utf8' }).trim();
} catch {
  // Not on the registry, or it couldn't be reached.
}

if (live === version) {
  console.log(`${name}@${version} is already on npm.`);
} else {
  execFileSync('npm', ['publish', '.', '--access', 'public', '--loglevel', 'verbose'], { cwd: dir, stdio: 'inherit' });
  console.log(`Published ${name}@${version}.`);
}
