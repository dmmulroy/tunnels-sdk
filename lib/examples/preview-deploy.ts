import { TunnelClient } from "tunnels"
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
})

console.log(`Preview tunnel "${tunnel.name}" created (${tunnel.id})`)

// Post URL to GitHub PR
await octokit.issues.createComment({
  owner: process.env.REPO_OWNER!,
  repo: process.env.REPO_NAME!,
  issue_number: parseInt(prNumber),
  body: `🚀 **Preview deployed!**\n\nhttps://${hostname}`,
})

console.log(`Preview live at https://${hostname}`)

// Cleanup when done
process.on("SIGINT", async () => {
  console.log("Cleaning up preview tunnel...")
  await client.tunnels.delete(tunnel.id, { force: true })
  await client.dispose()
  process.exit(0)
})
