import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { build } from 'vite';

/** Build real public imports, including the case where a material was imported but never used. */
describe('opt-in material bundles', () => {
  it.each([
    { name: 'flat', imports: '', material: '', fluffy: false, glass: false, metal: false },
    { name: 'fluffy', imports: 'import { fluffy } from "open-bot-avatar/materials/fluffy";', material: 'material: fluffy,', fluffy: true, glass: false, metal: false },
    { name: 'glass', imports: 'import { glass } from "open-bot-avatar/materials/glass";', material: 'material: glass,', fluffy: false, glass: true, metal: false },
    { name: 'metal', imports: 'import { metal } from "open-bot-avatar/materials/metal";', material: 'material: metal,', fluffy: false, glass: false, metal: true },
    { name: 'unused imports', imports: 'import { fluffy } from "open-bot-avatar/materials/fluffy"; import { glass } from "open-bot-avatar/materials/glass"; import { metal } from "open-bot-avatar/materials/metal";', material: '', fluffy: false, glass: false, metal: false },
    { name: 'all', imports: 'import { fluffy } from "open-bot-avatar/materials/fluffy"; import { glass } from "open-bot-avatar/materials/glass"; import { metal } from "open-bot-avatar/materials/metal";', material: 'material: location.hash === "#g" ? glass : location.hash === "#m" ? metal : fluffy,', fluffy: true, glass: true, metal: true },
  ])('$name ships only the requested renderers', async ({ name, imports, material, fluffy, glass, metal }) => {
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
    expect(code.includes('metal is unavailable')).toBe(metal);
    const modules = chunks.flatMap((c) => Object.entries(c.modules).filter(([, info]) => info.renderedLength > 0).map(([id]) => id));
    expect(modules.some((id) => /\/dom\/fluffy\/mesh\.(ts|js)$/.test(id))).toBe(fluffy);
    expect(modules.some((id) => /\/dom\/glass\/renderer\.(ts|js)$/.test(id))).toBe(glass);
    expect(modules.some((id) => /\/dom\/metal\/renderer\.(ts|js)$/.test(id))).toBe(metal);
    if (!fluffy && !glass && !metal) expect(code).not.toContain('#version 300 es');
    console.info(`${name}: ${Buffer.byteLength(code)} bytes minified, ${gzipSync(code).length} bytes gzip`);
  }, 20_000);
});
