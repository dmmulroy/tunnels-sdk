import { Effect, Layer, Option, Redacted, Schedule, Schema, ServiceMap, Stream } from "effect"
import { flow } from "effect/Function"
import {
  HttpClient,
  HttpClientRequest,
  HttpClientResponse,
  FetchHttpClient,
} from "effect/unstable/http"
import { TunnelApiError, TunnelAuthError } from "../errors.js"

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

/**
 * Configuration for authenticated Cloudflare API calls.
 */
export class CloudflareApiConfig extends Schema.Class<CloudflareApiConfig>("CloudflareApiConfig")({
  accountId: Schema.NonEmptyString,
  apiToken: Schema.Redacted(Schema.NonEmptyString),
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
  if (status === 401 || status === 403) {
    return new TunnelAuthError({})
  }
  return new TunnelApiError({ status, errors })
}

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
        const client = (yield* HttpClient.HttpClient).pipe(
          HttpClient.mapRequest(
            flow(
              HttpClientRequest.prependUrl(config.baseUrl),
              HttpClientRequest.setHeader(
                "Authorization",
                `Bearer ${Redacted.value(config.apiToken)}`,
              ),
              HttpClientRequest.acceptJson,
            ),
          ),
          HttpClient.retryTransient({
            schedule: Schedule.exponential(250),
            times: 3,
          }),
        )

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
          const response = yield* client
            .get(path, params ? { urlParams: params } : undefined)
            .pipe(Effect.catch(recoverError))
          return yield* extractResult<T>(response)
        })

        const post = Effect.fn("CloudflareApi.post")(function* <T>(
          path: string,
          body?: unknown,
        ): Effect.fn.Return<T, ApiErrors> {
          const request =
            body !== undefined
              ? HttpClientRequest.post(path).pipe(
                  HttpClientRequest.bodyJsonUnsafe(body),
                  client.execute,
                )
              : client.post(path)
          const response = yield* request.pipe(Effect.catch(recoverError))
          return yield* extractResult<T>(response)
        })

        const put = Effect.fn("CloudflareApi.put")(function* <T>(
          path: string,
          body?: unknown,
        ): Effect.fn.Return<T, ApiErrors> {
          const request =
            body !== undefined
              ? HttpClientRequest.put(path).pipe(
                  HttpClientRequest.bodyJsonUnsafe(body),
                  client.execute,
                )
              : client.put(path)
          const response = yield* request.pipe(Effect.catch(recoverError))
          return yield* extractResult<T>(response)
        })

        const del = Effect.fn("CloudflareApi.del")(function* <T>(
          path: string,
          params?: Record<string, string>,
        ): Effect.fn.Return<T, ApiErrors> {
          const response = yield* client
            .del(path, params ? { urlParams: params } : undefined)
            .pipe(Effect.catch(recoverError))
          return yield* extractResult<T>(response)
        })

        const paginate = <T>(
          path: string,
          params?: Record<string, string>,
        ): Stream.Stream<T, ApiErrors> =>
          Stream.paginate(1, (page: number) =>
            client
              .get(path, {
                urlParams: { ...params, page: String(page), per_page: "50" },
              })
              .pipe(
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
  static layerLive(config: CloudflareApiConfig) {
    return CloudflareApi.layer(config).pipe(Layer.provide(FetchHttpClient.layer))
  }
}
