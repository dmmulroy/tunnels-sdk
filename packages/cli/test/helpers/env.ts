/**
 * Environment helpers for CLI e2e tests.
 *
 * Reuses the same env var names as the SDK tests:
 *   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CFT_TEST_ZONE
 */

export interface TestEnv {
  readonly accountId: string
  readonly apiToken: string
  readonly testZone: string
}

/** Read env vars or return null if any are missing */
export function getTestEnv(): TestEnv | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = process.env.CLOUDFLARE_API_TOKEN
  const testZone = process.env.CFT_TEST_ZONE

  if (!accountId || !apiToken || !testZone) return null
  return { accountId, apiToken, testZone }
}

/** Returns true if auth env vars are present */
export function hasAuth(): boolean {
  return getTestEnv() !== null
}

/**
 * Strip all auth env vars from the environment.
 * Useful for testing missing-auth error paths.
 */
export const NO_AUTH_ENV = {
  CLOUDFLARE_ACCOUNT_ID: undefined,
  CLOUDFLARE_API_TOKEN: undefined,
  CFT_TEST_ZONE: undefined,
} as const
