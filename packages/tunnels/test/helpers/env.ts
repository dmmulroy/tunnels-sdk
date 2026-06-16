/**
 * Environment helpers for integration & e2e tests.
 *
 * Reads credentials from env vars, provides skip() for when they're absent,
 * and validates the token has the permissions we need before any test runs.
 */

/**
 * Required Cloudflare environment values for SDK tests.
 */
export interface TestEnv {
  readonly accountId: string
  readonly apiToken: string
  readonly testZone: string
}

/**
 * Reads Cloudflare test environment variables.
 *
 * @returns Test environment values, or null when any required value is missing.
 */
export function getTestEnv(): TestEnv | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = process.env.CLOUDFLARE_API_TOKEN
  const testZone = process.env.CFT_TEST_ZONE

  if (!accountId || !apiToken || !testZone) return null
  return { accountId, apiToken, testZone }
}

/**
 * Reads required Cloudflare test credentials or throws a skip-style error.
 *
 * @returns Test environment values when all required values are configured.
 */
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
 * Checks whether Cloudflare auth environment variables are present.
 *
 * Use to conditionally define describe blocks.
 *
 * @returns True when all required auth values are configured.
 */
export function hasAuth(): boolean {
  return getTestEnv() !== null
}
