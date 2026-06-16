/**
 * Environment helpers for CLI e2e tests.
 *
 * Reuses the same env var names as the SDK tests:
 *   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CFT_TEST_ZONE
 */

/**
 * Required Cloudflare environment values for CLI tests.
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
 * Checks whether Cloudflare auth environment variables are present.
 *
 * @returns True when all required auth values are configured.
 */
export function hasAuth(): boolean {
  return getTestEnv() !== null
}

/**
 * Environment override that strips all auth variables.
 *
 * Useful for testing missing-auth error paths.
 */
export const NO_AUTH_ENV = {
  CLOUDFLARE_ACCOUNT_ID: undefined,
  CLOUDFLARE_API_TOKEN: undefined,
  CFT_TEST_ZONE: undefined,
} as const
