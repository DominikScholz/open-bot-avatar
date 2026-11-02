/**
 * Every avatar in the repo's gallery/ folder must pass strict validation (the
 * same check as `validate.sh --strict`), be named after its id, and not reuse
 * the id of a built-in example.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { examples } from '../src/examples.ts';

const dir = 'gallery';
const files = existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.json') && f !== 'colors.json') : [];

describe.runIf(files.length > 0)('gallery', () => {
  it.each(files)('%s passes strict validation', (file) => {
    const raw = JSON.parse(readFileSync(`${dir}/${file}`, 'utf8'));
    expect(`${raw.id}.json`).toBe(file);
    expect(examples.map((e) => e.id)).not.toContain(raw.id);
    let output = '';
    try {
      output = execFileSync(process.execPath, ['packages/core/scripts/avatar-validate.ts', '--strict', `${dir}/${file}`], { encoding: 'utf8', stdio: 'pipe' });
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string };
      throw new Error(`${file} failed strict validation:\n${e.stdout ?? ''}${e.stderr ?? ''}`);
    }
    // Exit 0 means it passed; stdout is the normalized definition.
    expect(JSON.parse(output).id).toBe(raw.id);
  });
});
