import { Layer } from "effect"
import { FetchHttpClient } from "effect/unstable/http"
import { CloudflareApi, type CloudflareApiConfig } from "../services/CloudflareApi.js"
import { TunnelOperations } from "../services/TunnelOperations.js"
import { IngressManager } from "../services/IngressManager.js"
import { DnsManager } from "../services/DnsManager.js"
import { RouteManager } from "../services/RouteManager.js"
import { VNetManager } from "../services/VNetManager.js"
import { TunnelProcessService } from "../services/TunnelProcess.js"
import { CloudflaredBinary } from "../services/CloudflaredBinary.js"

/**
 * Production layer — all services wired with explicit config.
 * Requires a `CloudflareApiConfig` with accountId + apiToken.
 */
export const LiveLayer = (config: CloudflareApiConfig) => {
  // CloudflareApi (with FetchHttpClient) is the root dependency
  const apiLayer = CloudflareApi.layer(config).pipe(
    Layer.provide(FetchHttpClient.layer),
  )

  // Managers all depend on CloudflareApi
  const managersLayer = Layer.mergeAll(
    IngressManager.layer,
    DnsManager.layer,
    RouteManager.layer,
    VNetManager.layer,
  ).pipe(Layer.provide(apiLayer))

  // TunnelOperations depends on CloudflareApi + managers
  const opsLayer = TunnelOperations.layer.pipe(
    Layer.provide(managersLayer),
    Layer.provide(apiLayer),
  )

  // TunnelProcessService depends on CloudflaredBinary
  const processLayer = TunnelProcessService.layer.pipe(
    Layer.provide(CloudflaredBinary.layer),
  )

  // Merge everything and also export the API + managers for direct access
  return Layer.mergeAll(
    opsLayer,
    managersLayer,
    processLayer,
    CloudflaredBinary.layer,
    apiLayer,
  )
}
