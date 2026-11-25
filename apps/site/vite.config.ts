import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const gallery = fileURLToPath(new URL('../../gallery', import.meta.url));
const designPrompt = fileURLToPath(new URL('../../skills/generate-avatar/references/system-prompt.md', import.meta.url));
/** Where the site serves the design prompt, next to index.html (src/studio/brief.ts links to it). */
const PROMPT_FILE = 'prompt.md';

/** The module the site imports its contributors from (src/contributorData.ts). */
const CONTRIBUTORS = 'virtual:contributors';

/**
 * GitHub's list of contributors as it is now, built into the site: every push to main builds the
 * site again, and that is when the list can change. A visitor's browser asks GitHub nothing, so
 * its limit of 60 requests an hour per address does not matter. GITHUB_TOKEN or GH_TOKEN raises
 * the build's own limit. Without an answer the list is empty and the page links to GitHub: a
 * build never fails for it.
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
      // In GitHub Actions the line shows as a warning on the run, where an empty page would otherwise go unnoticed.
      console.warn(`${process.env.GITHUB_ACTIONS ? '::warning::' : ''}Contributors: built without a list (${error instanceof Error ? error.message : error}).`);
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
      name: 'contributors',
      resolveId: (id) => (id === CONTRIBUTORS ? `\0${CONTRIBUTORS}` : null),
      async load(id) {
        return id === `\0${CONTRIBUTORS}` ? `export default ${await contributorsNow()};` : null;
      },
    },
  ],
  resolve: { conditions: ['open-bot-avatar/source'] },
});
