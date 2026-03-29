import { mkdtemp, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, it, assert } from "@effect/vitest"
import { Effect, Exit } from "effect"
import { parseConfig, parseConfigFromYaml, parseConfigFromFile } from "./config.js"
import { ConfigValidationError } from "./errors.js"

/** Helper to run a config parse and expect success */
const parseOk = (input: unknown) =>
  parseConfig(input).pipe(Effect.runPromise)

/** Helper to run a config parse and expect failure */
const parseFail = (input: unknown) =>
  parseConfig(input).pipe(
    Effect.exit,
    Effect.map((exit) => {
      assert.isTrue(Exit.isFailure(exit))
      if (Exit.isFailure(exit)) {
        const reason = (exit.cause as any).reasons[0]
        assert.strictEqual(reason._tag, "Fail")
        assert.instanceOf(reason.error, ConfigValidationError)
        return reason.error as ConfigValidationError
      }
      throw new Error("Expected failure")
    }),
    Effect.runPromise,
  )

describe("Effect TunnelConfig", () => {
  describe("parseConfig", () => {
    it.effect("accepts a valid config with catch-all", () =>
      Effect.gen(function* () {
        const config = yield* parseConfig({
          ingress: [
            { hostname: "app.example.com", service: "http://localhost:3000" },
            { service: "http_status:404" },
          ],
        })
        assert.strictEqual(config.ingress.length, 2)
        assert.strictEqual(config.ingress[0].hostname, "app.example.com")
        assert.strictEqual(config.ingress[1].service, "http_status:404")
      }),
    )

    it.effect("auto-appends catch-all when autoFallback is true (default)", () =>
      Effect.gen(function* () {
        const config = yield* parseConfig({
          ingress: [
            { hostname: "app.example.com", service: "http://localhost:3000" },
          ],
        })
        assert.strictEqual(config.ingress.length, 2)
        assert.strictEqual(config.ingress[1].service, "http_status:404")
        assert.strictEqual(config.ingress[1].hostname, undefined)
      }),
    )

    it("rejects missing catch-all when autoFallback is false", async () => {
      const error = await parseFail({
        autoFallback: false,
        ingress: [
          { hostname: "app.example.com", service: "http://localhost:3000" },
        ],
      })
      assert.isTrue(error.message.includes("catch-all"))
    })

    it("rejects empty ingress", async () => {
      await parseFail({ ingress: [] })
    })

    it("rejects duplicate hostnames", async () => {
      const error = await parseFail({
        ingress: [
          { hostname: "app.example.com", service: "http://localhost:3000" },
          { hostname: "app.example.com", service: "http://localhost:3001" },
          { service: "http_status:404" },
        ],
      })
      assert.isTrue(error.message.includes("Duplicate hostname"))
      assert.isTrue(error.message.includes("app.example.com"))
    })

    it("rejects invalid service URLs", async () => {
      await parseFail({
        ingress: [
          { hostname: "app.example.com", service: "ftp://localhost:3000" },
          { service: "http_status:404" },
        ],
      })
    })

    it("accepts all valid service schemes", async () => {
      const schemes = [
        "http://localhost:3000",
        "https://localhost:3000",
        "tcp://localhost:22",
        "ssh://localhost:22",
        "rdp://localhost:3389",
        "http_status:404",
        "unix:/tmp/socket",
      ]

      for (const service of schemes) {
        const config = await parseOk({ ingress: [{ service }] })
        assert.isTrue(config.ingress.length >= 1)
      }
    })

    it("rejects invalid hostnames", async () => {
      await parseFail({
        ingress: [
          { hostname: "not a hostname!", service: "http://localhost:3000" },
          { service: "http_status:404" },
        ],
      })
    })

    it.effect("accepts wildcard hostnames", () =>
      Effect.gen(function* () {
        const config = yield* parseConfig({
          ingress: [
            { hostname: "*.example.com", service: "http://localhost:3000" },
            { service: "http_status:404" },
          ],
        })
        assert.strictEqual(config.ingress[0].hostname, "*.example.com")
      }),
    )

    it("rejects unknown keys in originRequest (strict mode)", async () => {
      await parseFail({
        ingress: [
          {
            hostname: "app.example.com",
            service: "http://localhost:3000",
            originRequest: { connetTimeout: "30s" }, // typo!
          },
          { service: "http_status:404" },
        ],
      })
    })

    it("validates duration strings in originRequest", async () => {
      const valid = await parseOk({
        ingress: [
          {
            hostname: "app.example.com",
            service: "http://localhost:3000",
            originRequest: { connectTimeout: "30s" },
          },
          { service: "http_status:404" },
        ],
      })
      assert.strictEqual(valid.ingress[0].originRequest?.connectTimeout, "30s")

      await parseFail({
        ingress: [
          {
            hostname: "app.example.com",
            service: "http://localhost:3000",
            originRequest: { connectTimeout: "thirty seconds" },
          },
          { service: "http_status:404" },
        ],
      })
    })

    it.effect("accepts routes with valid CIDR", () =>
      Effect.gen(function* () {
        const config = yield* parseConfig({
          ingress: [{ service: "http_status:404" }],
          routes: [
            { network: "10.0.0.0/8" },
            { network: "172.16.0.0/16", vnet: "production", comment: "Prod VPC" },
          ],
        })
        assert.strictEqual(config.routes!.length, 2)
      }),
    )

    it("rejects invalid CIDR in routes", async () => {
      await parseFail({
        ingress: [{ service: "http_status:404" }],
        routes: [{ network: "not-a-cidr" }],
      })
    })

    it.effect("accepts full config with all options", () =>
      Effect.gen(function* () {
        const config = yield* parseConfig({
          tunnel: "my-app",
          ingress: [
            {
              hostname: "app.example.com",
              service: "http://localhost:3000",
              originRequest: {
                connectTimeout: "30s",
                noTLSVerify: true,
                keepAliveConnections: 10,
              },
            },
            { service: "http_status:404" },
          ],
          dns: { auto: true, cleanup: true },
          routes: [{ network: "10.0.0.0/8", vnet: "prod" }],
          warpRouting: { enabled: true },
        })
        assert.strictEqual(config.tunnel, "my-app")
        assert.strictEqual(config.dns?.auto, true)
        assert.strictEqual(config.warpRouting?.enabled, true)
      }),
    )
  })

  describe("parseConfigFromYaml", () => {
    it.effect("parses yaml strings", () =>
      Effect.gen(function* () {
        const config = yield* parseConfigFromYaml(`
ingress:
  - hostname: app.example.com
    service: http://localhost:3000
`)
        assert.strictEqual(config.ingress.length, 2)
        assert.strictEqual(config.ingress[0].hostname, "app.example.com")
        assert.strictEqual(config.ingress[1].service, "http_status:404")
      }),
    )
  })

  describe("parseConfigFromFile", () => {
    it.effect("loads yaml files", () =>
      Effect.gen(function* () {
        const dir = yield* Effect.promise(() =>
          mkdtemp(join(tmpdir(), "tunnel-sdk-")),
        )
        const path = join(dir, "config.yaml")
        yield* Effect.promise(() =>
          writeFile(path, "ingress:\n  - service: http_status:404\n"),
        )

        const config = yield* parseConfigFromFile(path)
        assert.strictEqual(config.ingress.length, 1)
        assert.strictEqual(config.ingress[0].service, "http_status:404")
      }),
    )
  })
})
