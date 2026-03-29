import { ApiClient } from "./api/client.js"
import type { IApiClient } from "./api/interfaces.js"
import type { BinaryResolver } from "./tunnel.js"
import type { ProcessFactory } from "./tunnel.js"
import { TunnelOperations } from "./tunnel-operations.js"
import { VNetManager } from "./managers/vnets/index.js"

export interface TunnelClientOptions {
  accountId: string
  apiToken: string
  binaryPath?: string
  baseUrl?: string
  fetch?: typeof globalThis.fetch
}

export interface TunnelClientDeps {
  api?: IApiClient
  processFactory?: ProcessFactory
  binaryResolver?: BinaryResolver
}

export class TunnelClient {
  private readonly api: IApiClient

  readonly tunnels: TunnelOperations
  readonly vnets: VNetManager

  constructor(options: TunnelClientOptions, deps?: TunnelClientDeps) {
    this.api = deps?.api ?? new ApiClient({
      accountId: options.accountId,
      apiToken: options.apiToken,
      baseUrl: options.baseUrl,
      fetch: options.fetch,
    })

    this.tunnels = new TunnelOperations(
      this.api,
      options.binaryPath,
      deps?.processFactory,
      deps?.binaryResolver,
    )
    this.vnets = new VNetManager(this.api)
  }
}
