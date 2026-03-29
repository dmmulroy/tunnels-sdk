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
export const LiveLayer = (config: CloudflareApiConfig) =>
  Layer.mergeAll(
    TunnelOperations.layer,
    IngressManager.layer,
    DnsManager.layer,
    RouteManager.layer,
    VNetManager.layer,
    TunnelProcessService.layer,
  ).pipe(
    Layer.provide(CloudflareApi.layer(config)),
    Layer.provide(FetchHttpClient.layer),
    Layer.provideMerge(CloudflaredBinary.layer),
  )
