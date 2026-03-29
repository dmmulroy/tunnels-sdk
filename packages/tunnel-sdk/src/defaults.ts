import type { IApiClient } from "./api/interfaces.js"
import { cloudflared } from "./bin/cloudflared.js"
import { TunnelProcess } from "./process.js"
import type { TunnelDeps } from "./tunnel.js"

/**
 * Create a TunnelDeps with production defaults:
 * - Uses the bundled cloudflared binary resolver
 * - Uses TunnelProcess.start as the process factory
 *
 * Pass this to `new Tunnel(data, deps)` or override individual fields.
 */
export function createDefaultTunnelDeps(api: IApiClient, binaryPath?: string): TunnelDeps {
  return {
    api,
    binaryPath,
    binaryResolver: cloudflared,
    processFactory: { start: TunnelProcess.start },
  }
}
