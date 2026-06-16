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
            message: "Failed to load cloudflared binary module",
            cause,
          }),
      })

      const ensureInstalled = Effect.fn("CloudflaredBinary.ensureInstalled")(
        function* (): Effect.fn.Return<string, BinaryInstallError> {
          const installed = yield* Effect.tryPromise({
            try: () => resolver.isInstalled(),
            catch: (cause) =>
              new BinaryInstallError({
                message: "Failed to check binary status",
                cause,
              }),
          })
          if (!installed) {
            yield* Effect.tryPromise({
              try: () => resolver.install(),
              catch: (cause) =>
                new BinaryInstallError({
                  message: "Failed to install cloudflared",
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
              message: "Install failed",
              cause,
            }),
        })
      })

      const isInstalled = Effect.fn("CloudflaredBinary.isInstalled")(
        function* (): Effect.fn.Return<boolean, never> {
          return yield* Effect.tryPromise({
            try: () => resolver.isInstalled(),
            catch: (cause) =>
              new BinaryInstallError({ message: "Failed to check", cause }),
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
