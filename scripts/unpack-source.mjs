import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { unzipSync } from 'fflate';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// Skip the archive only when the complete editable project is checked in.
const requiredFiles = [
  'src/App.tsx',
  'src/main.tsx',
  'src/styles.css',
  'tsconfig.json',
  'tsconfig.app.json',
  'tsconfig.node.json',
  'vite.config.ts',
  'scripts/browser-performance.mjs',
  'public/favicon.svg',
];

if (requiredFiles.every((path) => existsSync(resolve(root, path)))) {
  console.log('Using complete checked-in application source files');
  process.exit(0);
}

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

console.log(`Restored ${extracted} original project files from the source archive`);
