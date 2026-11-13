import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const partsDir = resolve(root, 'source-parts');
const parts = readdirSync(partsDir)
  .filter((name) => name.startsWith('atmos-source.') && name.endsWith('.b64'))
  .sort();

if (parts.length !== 7) {
  throw new Error(`Expected 7 source archive segments, found ${parts.length}`);
}

const encoded = parts.map((name) => readFileSync(resolve(partsDir, name), 'utf8').trim()).join('');
const archive = Buffer.from(encoded, 'base64');
const entries = unzipSync(archive);
let extracted = 0;

for (const [name, bytes] of Object.entries(entries)) {
  const target = resolve(root, name);
  if (target !== root && !target.startsWith(`${root}${sep}`)) {
    throw new Error(`Unsafe path in source archive: ${name}`);
  }
  if (name.endsWith('/')) {
    mkdirSync(target, { recursive: true });
    continue;
  }
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes);
  extracted += 1;
}

console.log(`Restored ${extracted} existing project files from the original source archive`);
