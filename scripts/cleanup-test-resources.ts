#!/usr/bin/env npx tsx
/**
 * Cleanup orphaned test resources from a Cloudflare account.
 *
 * Finds and deletes all tunnels, vnets, and DNS records matching the
 * `tunnels-test-` prefix. Run this when tests crash without cleanup, or
 * periodically in CI to prevent resource accumulation.
 *
 * Usage:
 *   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... npx tsx scripts/cleanup-test-resources.ts
 *
 * Add --dry-run to see what would be deleted without actually deleting.
 */

const accountId = process.env.CLOUDFLARE_ACCOUNT_ID
const apiToken = process.env.CLOUDFLARE_API_TOKEN
const dryRun = process.argv.includes("--dry-run")

if (!accountId || !apiToken) {
  console.error("CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN required")
  process.exit(1)
}

const headers = {
  Authorization: `Bearer ${apiToken}`,
  "Content-Type": "application/json",
}

const base = "https://api.cloudflare.com/client/v4"

async function cfGet<T>(path: string, params: Record<string, string> = {}): Promise<T> {
  const url = new URL(`${base}${path}`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const res = await fetch(url.toString(), { headers })
  const body = await res.json() as { success: boolean; result: T }
  if (!body.success) throw new Error(`GET ${path} failed`)
  return body.result
}

async function cfDelete(path: string): Promise<void> {
  const res = await fetch(`${base}${path}`, { method: "DELETE", headers })
  const body = await res.json() as { success: boolean }
  if (!body.success) throw new Error(`DELETE ${path} failed`)
}

async function main() {
  console.log(dryRun ? "🔍 DRY RUN — nothing will be deleted\n" : "🧹 Cleaning up test resources...\n")

  // 1. Find and delete test tunnels
  const tunnels = await cfGet<Array<{ id: string; name: string }>>(
    `/accounts/${accountId}/cfd_tunnel`,
    { is_deleted: "false", per_page: "100" },
  )
  const testTunnels = tunnels.filter((t) => t.name.startsWith("tunnels-test-"))
  console.log(`Found ${testTunnels.length} test tunnel(s)`)
  for (const t of testTunnels) {
    console.log(`  ${dryRun ? "would delete" : "deleting"}: ${t.name} (${t.id})`)
    if (!dryRun) {
      try {
        await cfDelete(`/accounts/${accountId}/cfd_tunnel/${t.id}?cascade=true`)
      } catch (e) {
        console.warn(`    failed: ${e}`)
      }
    }
  }

  // 2. Find and delete test vnets
  const vnets = await cfGet<Array<{ id: string; name: string }>>(
    `/accounts/${accountId}/teamnet/virtual_networks`,
  )
  const testVnets = vnets.filter((v) => v.name.startsWith("tunnels-test-"))
  console.log(`Found ${testVnets.length} test vnet(s)`)
  for (const v of testVnets) {
    console.log(`  ${dryRun ? "would delete" : "deleting"}: ${v.name} (${v.id})`)
    if (!dryRun) {
      try {
        await cfDelete(`/accounts/${accountId}/teamnet/virtual_networks/${v.id}`)
      } catch (e) {
        console.warn(`    failed: ${e}`)
      }
    }
  }

  console.log("\n✓ Cleanup complete")
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
