/**
 * Vitest globalSetup — runs once before all CLI e2e tests.
 *
 * - Warns (doesn't fail) when credentials are missing
 * - Validates token permissions with a lightweight API call
 * - Verifies the test zone exists and is accessible
 */

export async function setup() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = process.env.CLOUDFLARE_API_TOKEN
  const testZone = process.env.CFT_TEST_ZONE

  console.log("\n📋 CLI E2E Test Environment Check\n")

  if (!accountId || !apiToken) {
    console.warn(
      "⚠️  CLOUDFLARE_ACCOUNT_ID and/or CLOUDFLARE_API_TOKEN not set.\n" +
      "   Tier 2/3/4 tests will be skipped.\n" +
      "   Tier 1 (CLI chrome) tests will still run.\n",
    )
    return
  }

  // Verify the token works
  try {
    const res = await fetch(
      "https://api.cloudflare.com/client/v4/user/tokens/verify",
      { headers: { Authorization: `Bearer ${apiToken}` } },
    )
    const body = await res.json() as { success: boolean; errors?: Array<{ message: string }> }
    if (body.success) {
      console.log("✓ API token verified")
    } else {
      // Try account-scoped token endpoint
      const accountRes = await fetch(
        `https://api.cloudflare.com/client/v4/accounts/${accountId}/tokens/verify`,
        { headers: { Authorization: `Bearer ${apiToken}` } },
      )
      const accountBody = await accountRes.json() as { success: boolean }
      if (accountBody.success) {
        console.log("✓ API token verified (account-scoped)")
      } else {
        console.error(
          "❌ API token verification failed:",
          body.errors?.map((e) => e.message).join(", "),
        )
        process.exit(1)
      }
    }
  } catch (err) {
    console.error("❌ Could not reach Cloudflare API:", err)
    process.exit(1)
  }

  // Verify the zone exists (if provided)
  if (testZone) {
    try {
      const res = await fetch(
        `https://api.cloudflare.com/client/v4/zones?name=${testZone}`,
        { headers: { Authorization: `Bearer ${apiToken}` } },
      )
      const body = await res.json() as {
        success: boolean
        result: Array<{ id: string; name: string; status: string }>
      }
      if (!body.success || body.result.length === 0) {
        console.error(
          `❌ Zone "${testZone}" not found or not accessible with this token.`,
        )
        process.exit(1)
      }
      console.log(`✓ Test zone "${testZone}" verified (${body.result[0].status})`)
    } catch (err) {
      console.error(`❌ Could not verify zone "${testZone}":`, err)
      process.exit(1)
    }
  } else {
    console.warn("⚠️  CFT_TEST_ZONE not set. DNS tests will be skipped.\n")
  }

  // Verify tunnel permissions
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/cfd_tunnel?per_page=1`,
      { headers: { Authorization: `Bearer ${apiToken}` } },
    )
    const body = await res.json() as { success: boolean }
    if (!body.success) {
      console.error(
        "❌ Token lacks tunnel permissions. Ensure it has:\n" +
        "   - Account > Cloudflare Tunnel > Edit\n" +
        "   - Account > Cloudflare One Networks > Edit\n" +
        "   - Zone > DNS > Edit (for the test zone)\n",
      )
      process.exit(1)
    }
    console.log("✓ Tunnel permissions verified")
  } catch (err) {
    console.error("❌ Could not verify tunnel permissions:", err)
    process.exit(1)
  }

  console.log("")
}
