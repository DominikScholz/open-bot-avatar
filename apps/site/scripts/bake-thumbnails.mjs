// Regenerate the built-in stills with pnpm --filter site thumbnails. CHROME_BIN may point to Chromium.
import { writeFileSync } from 'node:fs';
import { runInChrome } from './chrome.mjs';

const { keys, image } = await runInChrome('render-fluffy-atlas.ts');
if (!image || !keys?.length) throw new Error('Chromium did not produce a fluffy atlas.');
writeFileSync(new URL('../src/studio/fluffy-thumbnails.webp', import.meta.url), Buffer.from(image, 'base64'));
writeFileSync(new URL('../src/studio/fluffy-thumbnails.json', import.meta.url), JSON.stringify(keys, null, 2) + '\n');
