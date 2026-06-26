import { Effect, Layer, ServiceMap } from "effect"
import { BinaryInstallError } from "../errors.js"

/**
 * Effect service for locating and installing the cloudflared binary.
 */
export class CloudflaredBinary extends ServiceMap.Service<
  CloudflaredBinary,
  {
    /**
     * Effect that resolves the cloudflared binary path.
     */
    readonly path: Effect.Effect<string, BinaryInstallError>
    /**
     * Ensures cloudflared is installed and returns its binary path.
     */
    ensureInstalled(): Effect.Effect<string, BinaryInstallError>
    /**
     * Installs cloudflared, optionally at a specific version.
     */
    install(version?: string): Effect.Effect<void, BinaryInstallError>
    /**
     * Checks whether cloudflared is installed.
     */
    isInstalled(): Effect.Effect<boolean>
  }
>()("tunnels/CloudflaredBinary") {
  /**
   * Builds a production layer that wraps the cloudflared binary resolver.
   *
   * Uses dynamic import so the binary module's platform detection runs lazily.
   */
  static readonly layer = Layer.effect(
    CloudflaredBinary,
    Effect.gen(function* () {
      const { cloudflared: resolver } = yield* Effect.tryPromise({
        try: () => import("../../bin/cloudflared.js"),
        catch: (cause) =>
          new BinaryInstallError({
            message: "failed to load the cloudflared binary module\nhelp: reinstall the tunnels package and try again",
            cause,
          }),
      })

      const ensureInstalled = Effect.fn("CloudflaredBinary.ensureInstalled")(
        function* (): Effect.fn.Return<string, BinaryInstallError> {
          const installed = yield* Effect.tryPromise({
            try: () => resolver.isInstalled(),
            catch: (cause) =>
              new BinaryInstallError({
                message: "failed to check cloudflared binary status\nhelp: remove the cached binary and retry installation",
                cause,
              }),
          })
          if (!installed) {
            yield* Effect.tryPromise({
              try: () => resolver.install(),
              catch: (cause) =>
                new BinaryInstallError({
                  message: "failed to install cloudflared\nhelp: allow downloads from github.com/cloudflare/cloudflared or install cloudflared manually",
                  cause,
                }),
            })
          }
          return resolver.path
        },
      )

      const install = Effect.fn("CloudflaredBinary.install")(function* (
        _version?: string,
      ): Effect.fn.Return<void, BinaryInstallError> {
        yield* Effect.tryPromise({
          try: () => resolver.install(),
          catch: (cause) =>
            new BinaryInstallError({
              message: "cloudflared install failed\nhelp: allow downloads from github.com/cloudflare/cloudflared and retry",
              cause,
            }),
        })
      })

      const isInstalled = Effect.fn("CloudflaredBinary.isInstalled")(
        function* (): Effect.fn.Return<boolean, never> {
          return yield* Effect.tryPromise({
            try: () => resolver.isInstalled(),
            catch: (cause) =>
              new BinaryInstallError({
                message: "failed to check cloudflared binary status\nhelp: remove the cached binary and retry installation",
                cause,
              }),
          }).pipe(Effect.catch(() => Effect.succeed(false)))
        },
      )

      return CloudflaredBinary.of({
        path: Effect.succeed(resolver.path),
        ensureInstalled,
        install,
        isInstalled,
      })
    }),
  )
}
