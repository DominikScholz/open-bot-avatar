import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const gallery = fileURLToPath(new URL('../../gallery', import.meta.url));
const designPrompt = fileURLToPath(new URL('../../skills/generate-avatar/references/system-prompt.md', import.meta.url));
/** Where the site serves the design prompt, next to index.html (src/studio/brief.ts links to it). */
const PROMPT_FILE = 'prompt.md';

/** Where the site serves the contributors it was built with, next to index.html (src/contributors.ts reads it). */
const CONTRIBUTORS_FILE = 'contributors.json';

/**
 * GitHub's list of contributors as it is now, for the page to fall back on when GitHub refuses a
 * visitor's own request (60 an hour, shared by everyone behind one address). GITHUB_TOKEN or
 * GH_TOKEN raises the build's own limit. Without an answer the file lists no one, and the page
 * says so: a build never fails for it.
 */
let contributors: Promise<string> | undefined;
function contributorsNow(): Promise<string> {
  contributors ??= (async () => {
    const repository = process.env.GITHUB_REPOSITORY || 'DominikScholz/open-bot-avatar';
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    try {
      const response = await fetch(`https://api.github.com/repos/${repository}/contributors?per_page=100`, {
        headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'open-bot-avatar-site', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
      const list = (await response.json()) as Record<string, unknown>[];
      // The fields the page reads, as GitHub names them.
      return JSON.stringify(list.map(({ login, type, avatar_url, html_url }) => ({ login, type, avatar_url, html_url })));
    } catch (error) {
      console.warn(`Contributors: built without a list (${error instanceof Error ? error.message : error}).`);
      return '[]';
    }
  })();
  return contributors;
}

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
    {
      // The contributors at a fixed URL, as GitHub listed them when the site was built or the dev server first asked.
      name: 'contributors',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.split('?')[0] !== `${server.config.base}${CONTRIBUTORS_FILE}`) return next();
          contributorsNow().then((source) => {
            res.setHeader('Content-Type', 'application/json; charset=utf-8');
            res.end(source);
          });
        });
      },
      async generateBundle() {
        this.emitFile({ type: 'asset', fileName: CONTRIBUTORS_FILE, source: await contributorsNow() });
      },
    },
  ],
  resolve: { conditions: ['open-bot-avatar/source'] },
});
