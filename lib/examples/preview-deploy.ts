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
const tunnel = await client.tunnels.create(`preview-pr-${prNumber}`, {
  ingress: [{ hostname, service: "http://localhost:3000" }],
  dns: { auto: true },
})

// Run the tunnel
await using connection = await tunnel.run()
await connection.waitUntilHealthy()

// Post URL to GitHub PR
await octokit.issues.createComment({
  owner: process.env.REPO_OWNER!,
  repo: process.env.REPO_NAME!,
  issue_number: parseInt(prNumber),
  body: `🚀 **Preview deployed!**\n\nhttps://${hostname}`,
})

console.log(`Preview live at https://${hostname}`)

// Keep alive until process is killed.
// On exit, delete the tunnel and clean up DNS.
try {
  await connection.waitUntilExit()
} finally {
  await tunnel.delete({ force: true, cleanupDns: true })
}
