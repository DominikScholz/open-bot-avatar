import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { build } from 'vite';

/** Build real public imports, including the case where a material was imported but never used. */
describe('opt-in material bundles', () => {
  it.each([
    { name: 'flat', imports: '', material: '', fluffy: false, glass: false, matte: false },
    { name: 'fluffy', imports: 'import { fluffy } from "open-bot-avatar/materials/fluffy";', material: 'material: fluffy,', fluffy: true, glass: false, matte: false },
    { name: 'glass', imports: 'import { glass } from "open-bot-avatar/materials/glass";', material: 'material: glass,', fluffy: false, glass: true, matte: false },
    // Matte is drawn by fluffy's renderer, so it ships that renderer too.
    { name: 'matte', imports: 'import { matte } from "open-bot-avatar/materials/matte";', material: 'material: matte,', fluffy: true, glass: false, matte: true },
    { name: 'unused imports', imports: 'import { fluffy } from "open-bot-avatar/materials/fluffy"; import { glass } from "open-bot-avatar/materials/glass"; import { matte } from "open-bot-avatar/materials/matte";', material: '', fluffy: false, glass: false, matte: false },
    { name: 'both', imports: 'import { fluffy } from "open-bot-avatar/materials/fluffy"; import { glass } from "open-bot-avatar/materials/glass";', material: 'material: location.hash ? fluffy : glass,', fluffy: true, glass: true, matte: false },
  ])('$name ships only the requested renderers', async ({ name, imports, material, fluffy, glass, matte }) => {
    const result = await build({
      configFile: false,
      root: fileURLToPath(new URL('..', import.meta.url)),
      logLevel: 'silent',
      resolve: { conditions: process.env.AVATAR_BUNDLE_DIST ? [] : ['open-bot-avatar/source'] },
      plugins: [{
        name: 'consumer-fixture',
        resolveId: (id) => id.endsWith('virtual:consumer') ? '\0consumer' : null,
        load: (id) => id === '\0consumer' ? `
          import { mountAvatar } from 'open-bot-avatar/dom';
          import { getExample } from 'open-bot-avatar';
          ${imports}
          export const avatar = mountAvatar(document.body, {
            definition: getExample('mug'), ${material}
          });
        ` : null,
      }],
      build: { write: false, minify: true, lib: { entry: 'virtual:consumer', formats: ['es'] } },
    });
    const outputs = (Array.isArray(result) ? result : [result]).flatMap((r) => 'output' in r ? r.output : []);
    const chunks = outputs.filter((o) => o.type === 'chunk');
    const code = chunks.map((o) => o.code).join('\n');
    expect(code.length).toBeGreaterThan(1000);
    expect(code.includes('fluffy is unavailable')).toBe(fluffy);
    expect(code.includes('glass is unavailable')).toBe(glass);
    const modules = chunks.flatMap((c) => Object.entries(c.modules).filter(([, info]) => info.renderedLength > 0).map(([id]) => id));
    expect(modules.some((id) => /\/dom\/fluffy\/mesh\.(ts|js)$/.test(id))).toBe(fluffy);
    expect(modules.some((id) => /\/dom\/glass\/renderer\.(ts|js)$/.test(id))).toBe(glass);
    expect(modules.some((id) => /\/dom\/materials\/matte\.(ts|js)$/.test(id))).toBe(matte);
    if (!fluffy && !glass) expect(code).not.toContain('#version 300 es');
    console.info(`${name}: ${Buffer.byteLength(code)} bytes minified, ${gzipSync(code).length} bytes gzip`);
  }, 20_000);
});
