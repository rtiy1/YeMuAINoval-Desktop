#!/usr/bin/env node
// YeMu bridge launcher: runs the TypeScript brain under Node.
// Dev: tsx (hot reload not needed, plain run). Prod: compiled dist.
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { existsSync, resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const here = dirname(fileURLToPath(import.meta.url));
const bridgeRoot = join(here, '..');
const args = process.argv.slice(2);

const distEntry = resolve(bridgeRoot, 'dist/brain/entry.js');
if (existsSync(distEntry)) {
  const result = spawnSync(process.execPath, [distEntry, ...args], {
    stdio: 'inherit',
    env: process.env,
  });
  process.exit(result.status ?? 1);
}

const tsxPath = require.resolve('tsx', { paths: [bridgeRoot] });
const srcEntry = resolve(bridgeRoot, 'src/brain/entry.ts');
const result = spawnSync(process.execPath, [tsxPath, srcEntry, ...args], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(result.status ?? 1);
