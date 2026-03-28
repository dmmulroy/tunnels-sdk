/**
 * Quick Expose — the simplest possible tunnel.
 *
 * Zero config, zero auth. Just expose a port and get a URL.
 * `using` ensures the tunnel is cleaned up when the scope exits.
 */

import { expose } from "tunnel-sdk"

// Anonymous quick tunnel — no auth required
await using tunnel = await expose(3000)
console.log(`🚀 ${tunnel.url}`)

// That's it. When this script exits, the tunnel closes.
