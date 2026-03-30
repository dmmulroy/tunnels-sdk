import { Command, Flag } from "effect/unstable/cli"
import { auth } from "./commands/auth.js"
import { config } from "./commands/config.js"
import { dev } from "./commands/dev.js"
import { dns } from "./commands/dns.js"
import { expose } from "./commands/expose.js"
import { ingress } from "./commands/ingress.js"
import { route } from "./commands/route.js"
import { status } from "./commands/status.js"
import { create, list, info, del, run_, stop, logs, token } from "./commands/tunnel.js"
import { vnet } from "./commands/vnet.js"

export const tunnels = Command.make("tunnels").pipe(
  Command.withDescription("A modern CLI for Cloudflare Tunnels"),
  Command.withSharedFlags({
    json: Flag.boolean("json").pipe(
      Flag.withDescription("Structured JSON output")
    ),
    quiet: Flag.boolean("quiet").pipe(
      Flag.withAlias("q"),
      Flag.withDescription("Suppress non-essential output")
    ),
    verbose: Flag.boolean("verbose").pipe(
      Flag.withDescription("Show debug-level output")
    ),
    accountId: Flag.string("account-id").pipe(
      Flag.withDescription("Override Cloudflare account"),
      Flag.optional
    ),
    configPath: Flag.string("config").pipe(
      Flag.withDescription("Path to config file"),
      Flag.withDefault("./tunnels.yaml")
    ),
    format: Flag.choice("format", ["table", "json", "csv"]).pipe(
      Flag.withDescription("Output format"),
      Flag.withDefault("table")
    ),
    noColor: Flag.boolean("no-color").pipe(
      Flag.withDescription("Disable colored output")
    ),
    noInteractive: Flag.boolean("no-interactive").pipe(
      Flag.withDescription("Disable all prompts")
    ),
  }),
  Command.withSubcommands([
    expose, create, list, info, del, run_, stop, logs, token,
    ingress, route, dns, vnet, config, auth, status, dev
  ])
)
