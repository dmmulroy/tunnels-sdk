import { Effect, Layer, Option, Schedule, Schema, ServiceMap, Stream } from "effect"
import { flow } from "effect/Function"
import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  FetchHttpClient,
} from "effect/unstable/http"
import { TunnelApiError, TunnelAuthError } from "../errors.js"
import { CloudflareAuth, type CloudflareAuthService } from "./CloudflareAuth.js"

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * Configuration for authenticated Cloudflare API calls.
 */
export class CloudflareApiConfig extends Schema.Class<CloudflareApiConfig>("CloudflareApiConfig")({
  accountId: Schema.NonEmptyString,
  baseUrl: Schema.String.pipe(
    Schema.withConstructorDefault(() => Option.some("https://api.cloudflare.com/client/v4")),
  ),
}) {}

// ---------------------------------------------------------------------------
// CF API envelope
// ---------------------------------------------------------------------------

interface CfApiResponse<T> {
  success: boolean
  errors: Array<{ code: number; message: string }>
  result: T
  result_info?: {
    page: number
    per_page: number
    total_pages: number
    count: number
    total_count: number
  }
}

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

const toSdkError = (status: number, errors: Array<{ code: number; message: string }>) => {
  if (status === 401) {
    return new TunnelAuthError({
      message: "Cloudflare rejected the API token.\nhelp: set CLOUDFLARE_API_TOKEN to a valid, non-expired token.",
    })
  }
  if (status === 403) {
    return new TunnelAuthError({
      message: "Cloudflare API token is not authorized for this request.\nhelp: add the required Account and Zone permissions for tunnels, DNS, or routes.",
    })
  }
  return new TunnelApiError({ status, errors })
}

const authToTunnelAuthError = (error: unknown) =>
  new TunnelAuthError({
    message:
      error && typeof error === "object" && "message" in error
        ? String(error.message)
        : "Cloudflare authentication failed.\nhelp: check CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, and token permissions.",
  })

const recoverError = (error: any): Effect.Effect<never, TunnelApiError | TunnelAuthError> => {
  if (error?._tag === "TunnelApiError" || error?._tag === "TunnelAuthError") {
    return Effect.fail(error)
  }
  if (error?._tag === "ResponseError") {
    return Effect.fail(toSdkError(error.response.status, []))
  }
  return Effect.fail(
    new TunnelApiError({ status: 0, errors: [{ code: 0, message: String(error) }] }),
  )
}

// ---------------------------------------------------------------------------
// Service definition
// ---------------------------------------------------------------------------

type ApiErrors = TunnelApiError | TunnelAuthError

/**
 * Effect service for authenticated Cloudflare API requests.
 */
export class CloudflareApi extends ServiceMap.Service<
  CloudflareApi,
  {
    /**
     * Sends a GET request and decodes the Cloudflare result envelope.
     */
    get<T>(path: string, params?: Record<string, string>): Effect.Effect<T, ApiErrors>
    /**
     * Sends a POST request and decodes the Cloudflare result envelope.
     */
    post<T>(path: string, body?: unknown): Effect.Effect<T, ApiErrors>
    /**
     * Sends a PUT request and decodes the Cloudflare result envelope.
     */
    put<T>(path: string, body?: unknown): Effect.Effect<T, ApiErrors>
    /**
     * Sends a DELETE request and decodes the Cloudflare result envelope.
     */
    del<T>(path: string, params?: Record<string, string>): Effect.Effect<T, ApiErrors>
    /**
     * Streams paginated Cloudflare API results.
     */
    paginate<T>(path: string, params?: Record<string, string>): Stream.Stream<T, ApiErrors>
    /**
     * Builds an account-scoped Cloudflare API path.
     */
    accountPath(path: string): string
    /**
     * Builds a zone-scoped Cloudflare API path.
     */
    zonePath(zoneId: string, path: string): string
  }
>()("tunnels/CloudflareApi") {
  /**
   * Builds a Cloudflare API layer that requires an HTTP client.
   *
   * @param config Cloudflare account and authentication configuration.
   * @returns A layer that provides `CloudflareApi`.
   */
  static layer(config: CloudflareApiConfig) {
    return Layer.effect(
      CloudflareApi,
      Effect.gen(function* () {
        const auth = yield* CloudflareAuth
        const client = (yield* HttpClient.HttpClient).pipe(
          HttpClient.mapRequest(
            flow(
              HttpClientRequest.prependUrl(config.baseUrl),
              HttpClientRequest.acceptJson,
            ),
          ),
          HttpClient.retryTransient({
            schedule: Schedule.exponential(250),
            times: 3,
          }),
        )

        const unauthorized = { _tag: "Unauthorized" } as const

        const executeWithAuth = (
          makeRequest: () => HttpClientRequest.HttpClientRequest,
        ): Effect.Effect<HttpClientResponse.HttpClientResponse, ApiErrors> => {
          const executeOnce: Effect.Effect<
            HttpClientResponse.HttpClientResponse,
            ApiErrors | typeof unauthorized
          > = Effect.gen(function* () {
            const token = yield* auth
              .getAccessToken({ minTTLMillis: 60_000 })
              .pipe(Effect.mapError(authToTunnelAuthError))
            const request = makeRequest().pipe(
              HttpClientRequest.setHeader("Authorization", `Bearer ${token}`),
            )
            const response = yield* client.execute(request).pipe(
              Effect.catch((error: any): Effect.Effect<never, ApiErrors | typeof unauthorized> => {
                if (error?._tag === "ResponseError" && error.response.status === 401) {
                  return Effect.fail(unauthorized)
                }
                return recoverError(error)
              }),
            )
            if (response.status === 401) {
              return yield* Effect.fail(unauthorized)
            }
            return response
          })

          return executeOnce.pipe(
            Effect.catch((error): Effect.Effect<HttpClientResponse.HttpClientResponse, ApiErrors> => {
              if (error === unauthorized) {
                return auth.refresh().pipe(
                  Effect.mapError(authToTunnelAuthError),
                  Effect.flatMap(() => executeOnce),
                  Effect.catch(
                    (retryError): Effect.Effect<HttpClientResponse.HttpClientResponse, ApiErrors> =>
                      retryError === unauthorized
                        ? Effect.fail(new TunnelAuthError({}))
                        : Effect.fail(retryError as ApiErrors),
                  ),
                )
              }
              return Effect.fail(error as ApiErrors)
            }),
          )
        }

        /** Parse CF API response envelope, extract .result or fail */
        const extractResult = <T>(
          response: HttpClientResponse.HttpClientResponse,
        ): Effect.Effect<T, ApiErrors> =>
          response.json.pipe(
            Effect.flatMap((data) => {
              const body = data as unknown as CfApiResponse<T>
              if (!body.success) {
                return Effect.fail(toSdkError(response.status, body.errors))
              }
              return Effect.succeed(body.result)
            }),
            Effect.catch(recoverError),
          )

        const get = Effect.fn("CloudflareApi.get")(function* <T>(
          path: string,
          params?: Record<string, string>,
        ): Effect.fn.Return<T, ApiErrors> {
          const response = yield* executeWithAuth(() =>
            HttpClientRequest.get(path, params ? { urlParams: params } : undefined),
          )
          return yield* extractResult<T>(response)
        })

        const post = Effect.fn("CloudflareApi.post")(function* <T>(
          path: string,
          body?: unknown,
        ): Effect.fn.Return<T, ApiErrors> {
          const response = yield* executeWithAuth(() =>
            body !== undefined
              ? HttpClientRequest.post(path).pipe(HttpClientRequest.bodyJsonUnsafe(body))
              : HttpClientRequest.post(path),
          )
          return yield* extractResult<T>(response)
        })

        const put = Effect.fn("CloudflareApi.put")(function* <T>(
          path: string,
          body?: unknown,
        ): Effect.fn.Return<T, ApiErrors> {
          const response = yield* executeWithAuth(() =>
            body !== undefined
              ? HttpClientRequest.put(path).pipe(HttpClientRequest.bodyJsonUnsafe(body))
              : HttpClientRequest.put(path),
          )
          return yield* extractResult<T>(response)
        })

        const del = Effect.fn("CloudflareApi.del")(function* <T>(
          path: string,
          params?: Record<string, string>,
        ): Effect.fn.Return<T, ApiErrors> {
          const response = yield* executeWithAuth(() =>
            HttpClientRequest.delete(path, params ? { urlParams: params } : undefined),
          )
          return yield* extractResult<T>(response)
        })

        const paginate = <T>(
          path: string,
          params?: Record<string, string>,
        ): Stream.Stream<T, ApiErrors> =>
          Stream.paginate(1, (page: number) =>
            executeWithAuth(() =>
              HttpClientRequest.get(path, {
                urlParams: { ...params, page: String(page), per_page: "50" },
              }),
            ).pipe(
                Effect.flatMap((response) => response.json),
                Effect.flatMap((data) => {
                  const body = data as unknown as CfApiResponse<T[]>
                  if (!body.success) {
                    return Effect.fail(toSdkError(0, body.errors))
                  }
                  const nextPage =
                    body.result_info && page < body.result_info.total_pages
                      ? Option.some(page + 1)
                      : Option.none()
                  return Effect.succeed(
                    [body.result, nextPage] as const,
                  )
                }),
                Effect.catch(recoverError),
              ),
          )

        const accountPath = (path: string): string =>
          `/accounts/${config.accountId}${path}`

        const zonePath = (zoneId: string, path: string): string =>
          `/zones/${zoneId}${path}`

        return CloudflareApi.of({
          get,
          post,
          put,
          del,
          paginate,
          accountPath,
          zonePath,
        })
      }),
    )
  }

  /**
   * Builds a self-contained Cloudflare API layer using the fetch HTTP client.
   *
   * @param config Cloudflare account and authentication configuration.
   * @returns A layer that provides `CloudflareApi` and its HTTP client.
   */
  static layerLive(config: CloudflareApiConfig, auth: CloudflareAuthService) {
    return CloudflareApi.layer(config).pipe(
      Layer.provide(FetchHttpClient.layer),
      Layer.provide(Layer.succeed(CloudflareAuth, auth)),
    )
  }
}
