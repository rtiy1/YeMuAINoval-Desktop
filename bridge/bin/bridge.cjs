#!/usr/bin/env node
// YeMu bridge launcher: runs the TypeScript brain under Node.
// Dev: tsx (hot reload not needed, plain run). Prod: compiled dist.
const { spawnSync } = require('node:child_process');
const { existsSync } = require('node:fs');
const { resolve, dirname, join } = require('node:path');

const here = __dirname;
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
