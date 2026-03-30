/**
 * Environment helpers for integration & e2e tests.
 *
 * Reads credentials from env vars, provides skip() for when they're absent,
 * and validates the token has the permissions we need before any test runs.
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

/** Use in describe() blocks to skip when credentials are missing */
export function requiresAuth(): TestEnv {
  const env = getTestEnv()
  if (!env) {
    throw new Error(
      "Skipping: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, and CFT_TEST_ZONE must be set",
    )
  }
  return env
}

/**
 * Returns true if auth env vars are present.
 * Use to conditionally define describe blocks:
 *
 *   const describeAuth = hasAuth() ? describe : describe.skip
 */
export function hasAuth(): boolean {
  return getTestEnv() !== null
}
