import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const gallery = fileURLToPath(new URL('../../gallery', import.meta.url));
const designPrompt = fileURLToPath(new URL('../../skills/generate-avatar/references/system-prompt.md', import.meta.url));
/** Where the site serves the design prompt, next to index.html (src/studio/brief.ts links to it). */
const PROMPT_FILE = 'prompt.md';

// Served from https://<user>.github.io/open-bot-avatar/ on GitHub Pages; override with BASE=/ for other hosts.
export default defineConfig({
  base: process.env.BASE ?? '/open-bot-avatar/',
  plugins: [
    react(),
    {
      // gallery/ sits outside the site's root: watch it, so added or edited avatars show up in dev.
      name: 'watch-gallery',
      configureServer(server) {
        server.watcher.add(gallery);
      },
    },
    {
      // The design prompt at a fixed URL, so prompts sent by deep link can stay short and point to it.
      name: 'design-prompt',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.split('?')[0] !== `${server.config.base}${PROMPT_FILE}`) return next();
          res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
          res.end(readFileSync(designPrompt, 'utf8'));
        });
      },
      generateBundle() {
        this.emitFile({ type: 'asset', fileName: PROMPT_FILE, source: readFileSync(designPrompt, 'utf8') });
      },
    },
  ],
  resolve: { conditions: ['open-bot-avatar/source'] },
});
