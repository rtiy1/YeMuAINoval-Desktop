/**
 * MCode Agent SDK type surface (restored local shim).
 *
 * Replaces the upstream @anthropic-ai/claude-agent-sdk package with a
 * self-hosted, rebranded type-only module. The full SDK runtime (which
 * bundles a copy of the upstream CLI) is not used by this tree; only the
 * public types referenced by the source are preserved here.
 */
export declare type PermissionMode =
  | 'default'
  | 'acceptEdits'
  | 'bypassPermissions'
  | 'plan'
  | 'dontAsk'
