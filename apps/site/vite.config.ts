import { defineConfig } from 'vite';

// Served from https://<user>.github.io/alphabet-avatar/ on GitHub Pages; override with BASE=/ for other hosts.
export default defineConfig({
  base: process.env.BASE ?? '/alphabet-avatar/',
  resolve: { conditions: ['open-bot-avatar/source'] },
});
