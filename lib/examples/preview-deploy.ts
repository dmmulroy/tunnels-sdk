/**
 * Ephemeral Preview Deploys — CI/CD integration.
 *
 * Creates a tunnel per PR, posts the preview URL to GitHub,
 * and auto-cleans up when the process exits. The `using` keyword
 * ensures cleanup even if the script crashes.
 */

import { TunnelClient } from "tunnel-sdk"
import { Octokit } from "@octokit/rest"

const client = new TunnelClient({
  accountId: process.env.CF_ACCOUNT_ID!,
  apiToken: process.env.CF_API_TOKEN!,
})

const octokit = new Octokit({ auth: process.env.GITHUB_TOKEN })
const prNumber = process.env.PR_NUMBER!
const hostname = `pr-${prNumber}.preview.example.com`

// Create an ephemeral tunnel for this PR
await using tunnel = await client.tunnels.createEphemeral(`preview-pr-${prNumber}`, {
  ingress: [{ hostname, service: "http://localhost:3000" }],
  dns: { auto: true, cleanup: true },
  ttl: "24h", // auto-delete after 24h of inactivity
})

// Run the tunnel
await using connection = await tunnel.run()
await connection.waitUntilHealthy()

// Post URL to GitHub PR
await octokit.issues.createComment({
  owner: process.env.REPO_OWNER!,
  repo: process.env.REPO_NAME!,
  issue_number: parseInt(prNumber),
  body: `🚀 **Preview deployed!**\n\nhttps://${hostname}\n\n_Auto-expires after 24h of inactivity._`,
})

console.log(`Preview live at https://${hostname}`)

// Keep alive until process is killed
// `using` cleans up: stops tunnel, removes DNS records
await connection.waitUntilExit()
