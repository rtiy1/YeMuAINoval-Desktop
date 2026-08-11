// COMPAT(paseoEnvAlias): legacy YEMU_* environment variables are aliased onto
// their YEMU_* equivalents so existing shells, dev scripts and CI jobs keep
// working. Added in v0.4, remove after 2026-11-30.
const LEGACY_ENV_PREFIX = "PASEO_";
const NEW_ENV_PREFIX = "YEMU_";

export function applyPaseoEnvCompat(env: NodeJS.ProcessEnv): void {
  for (const key of Object.keys(env)) {
    if (!key.startsWith(LEGACY_ENV_PREFIX)) {
      continue;
    }
    const newKey = `${NEW_ENV_PREFIX}${key.slice(LEGACY_ENV_PREFIX.length)}`;
    if (env[newKey] === undefined) {
      env[newKey] = env[key];
    }
  }
}
