import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const license = readFileSync(fileURLToPath(new URL('../../LICENSE', import.meta.url)), 'utf8').trim();
const banner = `/*! Alphabet Avatar: https://github.com/andersontsan/alphabet-avatar\n${license}\n*/\n`;

// Builds the script other sites load. The version is in the name: a change that would alter avatars
// already embedded elsewhere ships as a new file, so existing embeds stay as they are.
export default defineConfig({
  resolve: { conditions: ['open-bot-avatar/source'] },
  plugins: [
    {
      // Added after minifying, which would strip it: the MIT license must travel with copies of the code.
      name: 'license-banner',
      enforce: 'post',
      generateBundle(_, bundle) {
        for (const file of Object.values(bundle)) if (file.type === 'chunk') file.code = banner + file.code;
      },
    },
  ],
  build: {
    emptyOutDir: false,
    lib: {
      entry: fileURLToPath(new URL('./src/embed.ts', import.meta.url)),
      name: 'AlphabetAvatar',
      formats: ['iife'],
      fileName: () => 'alphabet-avatar-v1.js',
    },
  },
});
