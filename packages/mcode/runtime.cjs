const { existsSync } = require("node:fs");
const { dirname, join } = require("node:path");

function resolveBunExecutable() {
  const packageRoot = dirname(require.resolve("bun/package.json"));
  const names = process.platform === "win32" ? ["bun.exe", "bun"] : ["bun", "bun.exe"];

  for (const name of names) {
    const candidate = join(packageRoot, "bin", name);
    if (existsSync(candidate)) {
      return candidate;
    }
  }

  throw new Error(`The bundled Bun executable is missing from ${packageRoot}`);
}

function resolveMCodeEntrypoint() {
  return join(__dirname, "src", "dev-entry.ts");
}

function getMCodeCommand() {
  return [resolveBunExecutable(), "run", resolveMCodeEntrypoint()];
}

module.exports = {
  getMCodeCommand,
  resolveBunExecutable,
  resolveMCodeEntrypoint,
};
