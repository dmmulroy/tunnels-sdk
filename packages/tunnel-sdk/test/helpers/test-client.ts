/**
 * Shared test client factory.
 *
 * Creates a TunnelClient backed by real Cloudflare credentials,
 * tracks all resources created during the test, and cleans them
 * up in afterAll — even if the test throws.
 */

import { Effect, Redacted } from "effect"
import {
  CloudflareApiConfig,
  LiveLayer,
  TunnelOperations,
  DnsManager,
  IngressManager,
  RouteManager,
  VNetManager,
} from "../../src/effect/index.js"
import { TunnelClient } from "../../src/wrapper.js"
import { resourceName } from "./resource-name.js"
import type { TestEnv } from "./env.js"

export interface TestContext {
  /** Pre-wired TunnelClient with real credentials */
  readonly client: TunnelClient

  /** Generate a unique resource name (auto-prefixed for cleanup) */
  readonly name: (type?: string) => string

  /** Register a resource for cleanup (called automatically by helpers) */
  readonly trackTunnel: (id: string) => void
  readonly trackDns: (tunnelId: string, hostname: string) => void
  readonly trackVnet: (name: string) => void

  /** Run cleanup — call this in afterAll */
  readonly cleanup: () => Promise<void>
}

/**
 * Create a test context with a real TunnelClient and automatic cleanup.
 *
 * Usage:
 *   let ctx: TestContext
 *   beforeAll(() => { ctx = createTestContext(env) })
 *   afterAll(() => ctx.cleanup())
 */
export function createTestContext(env: TestEnv): TestContext {
  const client = new TunnelClient({
    accountId: env.accountId,
    apiToken: env.apiToken,
  })

  const tunnelIds: string[] = []
  const dnsRecords: Array<{ tunnelId: string; hostname: string }> = []
  const vnetNames: string[] = []

  const cleanup = async () => {
    // Clean up in reverse order: DNS → tunnels → vnets
    for (const { tunnelId, hostname } of dnsRecords) {
      try {
        await client.dns.remove(tunnelId, hostname)
      } catch {
        // best-effort
      }
    }

    for (const id of tunnelIds) {
      try {
        await client.tunnels.delete(id, { force: true })
      } catch {
        // best-effort
      }
    }

    for (const name of vnetNames) {
      try {
        await client.vnets.delete(name)
      } catch {
        // best-effort
      }
    }

    await client.dispose()
  }

  return {
    client,
    name: resourceName,
    trackTunnel: (id) => tunnelIds.push(id),
    trackDns: (tunnelId, hostname) => dnsRecords.push({ tunnelId, hostname }),
    trackVnet: (name) => vnetNames.push(name),
    cleanup,
  }
}
