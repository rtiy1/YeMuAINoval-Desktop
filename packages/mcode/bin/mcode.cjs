#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const { getMCodeCommand } = require("../runtime.cjs");

const [command, ...baseArgs] = getMCodeCommand();
const result = spawnSync(command, [...baseArgs, ...process.argv.slice(2)], {
  cwd: process.cwd(),
  env: process.env,
  stdio: "inherit",
});

if (result.error) {
  console.error(`Failed to start MCode: ${result.error.message}`);
  process.exitCode = 1;
} else {
  process.exitCode = result.status ?? 1;
}
