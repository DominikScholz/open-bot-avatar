#!/usr/bin/env node
/**
 * Publish packages/core to npm when a push changes its version (the merged "Version packages" pull
 * request); otherwise do nothing. CI runs this (via `pnpm release`) on every push to main. In CI npm
 * authenticates with trusted publishing (OIDC), so no token is stored anywhere and the package gets
 * provenance. The trusted publisher for release.yml may publish, so merging that pull request is the
 * release: nothing is left to approve on npm.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const dir = new URL('../packages/core/', import.meta.url);
const { name, version } = JSON.parse(readFileSync(new URL('package.json', dir), 'utf8'));

/** The package's version in an earlier commit, or null if that commit isn't available. */
function versionAt(ref) {
  try {
    return JSON.parse(execFileSync('git', ['show', `${ref}:packages/core/package.json`], { encoding: 'utf8' })).version;
  } catch {
    return null;
  }
}

let live = '';
try {
  live = execFileSync('npm', ['view', `${name}@${version}`, 'version'], { encoding: 'utf8' }).trim();
} catch {
  // Not on the registry, or it couldn't be reached.
}

if (live === version) {
  console.log(`${name}@${version} is already on npm.`);
} else if (versionAt('HEAD~1') === version) {
  // Only the push that changes the version publishes it; re-run that push's Release job to retry.
  console.log(`${name}@${version} didn't change in this push, so it isn't published from here.`);
} else {
  execFileSync('npm', ['publish', '.', '--access', 'public'], { cwd: dir, stdio: 'inherit' });
  console.log(`Published ${name}@${version}.`);
}
