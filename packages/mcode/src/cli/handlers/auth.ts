/**
 * Auth handler stubs for the YeMu-rebranded MCode fork.
 *
 * The original cli/handlers/auth.ts implemented OAuth-based login flows
 * (claude.ai sign-in, token exchange). The rebrand removed all MCode AI
 * account auth; API keys are the only supported credential. These stubs
 * keep the headless print path's import graph intact.
 */

export type OAuthTokens = {
  accessToken: string
  refreshToken?: string
  accountUuid?: string
}

export async function installOAuthTokens(tokens: OAuthTokens): Promise<void> {
  // Auth was removed in the YeMu rebrand; tokens are never exchanged.
  void tokens
}

export async function performLogout(): Promise<void> {
  // No-op: there is no OAuth session to clear.
}
