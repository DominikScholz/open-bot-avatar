// Regenerate the built-in stills with pnpm --filter site thumbnails. CHROME_BIN may point to Chromium.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';

const site = fileURLToPath(new URL('..', import.meta.url));
const result = await build({
  root: site, configFile: false, resolve: { conditions: ['open-bot-avatar/source'] },
  build: { write: false, lib: { entry: join(site, 'scripts/render-plush-atlas.ts'), formats: ['iife'], name: 'thumbnails' } },
});
const dir = mkdtempSync(join(tmpdir(), 'avatar-thumbnails-'));
try {
  const page = join(dir, 'render.html');
  writeFileSync(join(dir, 'render.js'), result[0].output[0].code);
  writeFileSync(page, '<!doctype html><body><script src="./render.js"></script></body>');
  const html = execFileSync(process.env.CHROME_BIN || 'chromium', [
    '--headless', '--enable-unsafe-swiftshader', '--use-gl=angle', '--use-angle=swiftshader',
    '--force-device-scale-factor=1', '--user-data-dir=' + dir, '--dump-dom', pathToFileURL(page).href,
  ], { encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
  const { keys, image } = JSON.parse(html.match(/<body>(\{.*\})<\/body>/s)?.[1] ?? 'null') ?? {};
  if (!image || !keys?.length) throw new Error('Chromium did not produce a plush atlas.');
  writeFileSync(join(site, 'src/studio/plush-thumbnails.webp'), Buffer.from(image, 'base64'));
  writeFileSync(join(site, 'src/studio/plush-thumbnails.json'), JSON.stringify(keys, null, 2) + '\n');
} finally {
  rmSync(dir, { recursive: true, force: true });
}
