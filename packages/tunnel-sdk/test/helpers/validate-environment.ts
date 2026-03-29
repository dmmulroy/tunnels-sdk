/**
 * Vitest globalSetup — runs once before all tests.
 *
 * - Warns (doesn't fail) when credentials are missing
 * - Validates token permissions with a lightweight API call
 * - Verifies the test zone exists and is accessible
 */

export async function setup() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
  const apiToken = process.env.CLOUDFLARE_API_TOKEN
  const testZone = process.env.CFT_TEST_ZONE

  if (!accountId || !apiToken) {
    console.warn(
      "\n⚠️  CLOUDFLARE_ACCOUNT_ID and/or CLOUDFLARE_API_TOKEN not set.\n" +
      "   API integration tests will be skipped.\n" +
      "   Process-only tests (binary, quick tunnel) will still run.\n",
    )
    return
  }

  // Verify the token works
  try {
    const res = await fetch("https://api.cloudflare.com/client/v4/user/tokens/verify", {
      headers: { Authorization: `Bearer ${apiToken}` },
    })
    const body = await res.json() as { success: boolean; errors?: Array<{ message: string }> }
    if (!body.success) {
      console.error(
        "\n❌ API token verification failed:",
        body.errors?.map((e) => e.message).join(", "),
        "\n",
      )
      process.exit(1)
    }
    console.log("✓ API token verified")
  } catch (err) {
    console.error("\n❌ Could not reach Cloudflare API:", err, "\n")
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
          `\n❌ Zone "${testZone}" not found or not accessible with this token.\n` +
          `   Set CFT_TEST_ZONE to a zone your token has access to.\n`,
        )
        process.exit(1)
      }
      console.log(`✓ Test zone "${testZone}" verified (${body.result[0].status})`)
    } catch (err) {
      console.error(`\n❌ Could not verify zone "${testZone}":`, err, "\n")
      process.exit(1)
    }
  } else {
    console.warn(
      "\n⚠️  CFT_TEST_ZONE not set. DNS tests will be skipped.\n",
    )
  }

  // Verify tunnel permissions by listing tunnels
  try {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/accounts/${accountId}/cfd_tunnel?per_page=1`,
      { headers: { Authorization: `Bearer ${apiToken}` } },
    )
    const body = await res.json() as { success: boolean }
    if (!body.success) {
      console.error(
        "\n❌ Token lacks tunnel permissions. Ensure it has:\n" +
        "   - Account > Cloudflare Tunnel > Edit\n" +
        "   - Account > Cloudflare One Networks > Edit\n" +
        "   - Zone > DNS > Edit (for the test zone)\n",
      )
      process.exit(1)
    }
    console.log("✓ Tunnel permissions verified")
  } catch (err) {
    console.error("\n❌ Could not verify tunnel permissions:", err, "\n")
    process.exit(1)
  }

  console.log("")
}
