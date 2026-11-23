// Runs a script from this folder in headless Chromium and returns the JSON it leaves as the page's
// text. Fluffy needs WebGL, which Node has none of. CHROME_BIN may point to Chromium.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const site = fileURLToPath(new URL('..', import.meta.url));

/**
 * `input` reaches the script as `window.input`. `pixelRatio` is the device pixel ratio it draws
 * at. The software rasterizer, so the same input gives the same pixels on every machine.
 */
export async function runInChrome(script, input = null, pixelRatio = 1) {
  const result = await build({
    root: site, configFile: false, logLevel: 'warn', resolve: { conditions: ['open-bot-avatar/source'] },
    build: { write: false, lib: { entry: join(site, 'scripts', script), formats: ['iife'], name: 'script' } },
  });
  const dir = mkdtempSync(join(tmpdir(), 'avatar-chrome-'));
  try {
    const page = join(dir, 'page.html');
    writeFileSync(join(dir, 'input.js'), `window.input = ${JSON.stringify(input)};`);
    writeFileSync(join(dir, 'script.js'), result[0].output[0].code);
    writeFileSync(page, '<!doctype html><body><script src="./input.js"></script><script src="./script.js"></script></body>');
    const html = execFileSync(process.env.CHROME_BIN || 'chromium', [
      '--headless', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
      '--force-device-scale-factor=' + pixelRatio, '--user-data-dir=' + dir, '--dump-dom', pathToFileURL(page).href,
    ], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
    const output = html.match(/<body>(\{.*\})<\/body>/s)?.[1];
    if (!output) throw new Error(`Chromium did not finish ${script}.`);
    return JSON.parse(output);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
