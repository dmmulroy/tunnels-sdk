import { expose } from "tunnels"

// Anonymous quick tunnel — no auth required.
// `using` ensures cleanup when the scope exits.
await using tunnel = await expose(3000)
console.log(`🚀 ${tunnel.url}`)
