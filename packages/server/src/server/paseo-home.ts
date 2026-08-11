import os from "node:os";
import path from "node:path";
import { existsSync } from "node:fs";
import { ensurePrivateDirectory } from "./private-files.js";

function expandHomeDir(input: string): string {
  if (input.startsWith("~/")) {
    return path.join(os.homedir(), input.slice(2));
  }
  if (input === "~") {
    return os.homedir();
  }
  return input;
}

export function resolvePaseoHome(env: NodeJS.ProcessEnv = process.env): string {
  // COMPAT(paseoHomeDefault): default moved to ~/.yemu in v0.4; legacy ~/.paseo
  // dirs are picked up only when the YEMU_HOME variable is not set. Remove the
  // legacy branch after 2026-11-30.
  const legacyDir = path.join(os.homedir(), ".paseo");
  const raw = env.YEMU_HOME ?? env.PASEO_HOME ?? (existsSync(legacyDir) ? legacyDir : "~/.yemu");
  const resolved = path.resolve(expandHomeDir(raw));
  ensurePrivateDirectory(resolved);
  return resolved;
}
