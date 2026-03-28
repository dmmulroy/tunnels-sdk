/** Base error for all tunnel-sdk errors */
export class TunnelSdkError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options)
    this.name = "TunnelSdkError"
  }
}

/** Cloudflare API returned an error response */
export class TunnelApiError extends TunnelSdkError {
  readonly status: number
  readonly errors: Array<{ code: number; message: string }>

  constructor(status: number, errors: Array<{ code: number; message: string }>) {
    const msg = errors.map((e) => `[${e.code}] ${e.message}`).join("; ")
    super(`Cloudflare API error (${status}): ${msg}`)
    this.name = "TunnelApiError"
    this.status = status
    this.errors = errors
  }
}

/** Authentication failed — bad token or missing credentials */
export class TunnelAuthError extends TunnelSdkError {
  constructor(message = "Authentication failed. Check your API token and account ID.") {
    super(message)
    this.name = "TunnelAuthError"
  }
}

/** Tunnel not found by name or ID */
export class TunnelNotFoundError extends TunnelSdkError {
  readonly tunnelRef: string

  constructor(tunnelRef: string) {
    super(`Tunnel not found: "${tunnelRef}"`)
    this.name = "TunnelNotFoundError"
    this.tunnelRef = tunnelRef
  }
}
