import { describe, it, expect } from "vitest"
import { TunnelConfig } from "./schema.js"

describe("TunnelConfig", () => {
  describe("parse", () => {
    it("accepts a valid config with catch-all", () => {
      const config = TunnelConfig.parse({
        ingress: [
          { hostname: "app.example.com", service: "http://localhost:3000" },
          { service: "http_status:404" },
        ],
      })

      expect(config.ingress).toHaveLength(2)
      expect(config.ingress[0].hostname).toBe("app.example.com")
      expect(config.ingress[1].service).toBe("http_status:404")
    })

    it("auto-appends catch-all when autoFallback is true (default)", () => {
      const config = TunnelConfig.parse({
        ingress: [
          { hostname: "app.example.com", service: "http://localhost:3000" },
        ],
      })

      expect(config.ingress).toHaveLength(2)
      expect(config.ingress[1].service).toBe("http_status:404")
      expect(config.ingress[1].hostname).toBeUndefined()
    })

    it("rejects missing catch-all when autoFallback is false", () => {
      const result = TunnelConfig.safeParse({
        autoFallback: false,
        ingress: [
          { hostname: "app.example.com", service: "http://localhost:3000" },
        ],
      })

      expect(result.success).toBe(false)
    })

    it("rejects empty ingress", () => {
      const result = TunnelConfig.safeParse({
        ingress: [],
      })

      expect(result.success).toBe(false)
    })

    it("rejects duplicate hostnames", () => {
      const result = TunnelConfig.safeParse({
        ingress: [
          { hostname: "app.example.com", service: "http://localhost:3000" },
          { hostname: "app.example.com", service: "http://localhost:3001" },
          { service: "http_status:404" },
        ],
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        const msg = result.error.issues[0].message
        expect(msg).toContain("Duplicate hostname")
        expect(msg).toContain("app.example.com")
      }
    })

    it("rejects invalid service URLs", () => {
      const result = TunnelConfig.safeParse({
        ingress: [
          { hostname: "app.example.com", service: "ftp://localhost:3000" },
          { service: "http_status:404" },
        ],
      })

      expect(result.success).toBe(false)
    })

    it("accepts all valid service schemes", () => {
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
        const result = TunnelConfig.safeParse({
          ingress: [{ service }],
        })
        expect(result.success).toBe(true)
      }
    })

    it("rejects invalid hostnames", () => {
      const result = TunnelConfig.safeParse({
        ingress: [
          { hostname: "not a hostname!", service: "http://localhost:3000" },
          { service: "http_status:404" },
        ],
      })

      expect(result.success).toBe(false)
    })

    it("accepts wildcard hostnames", () => {
      const config = TunnelConfig.parse({
        ingress: [
          { hostname: "*.example.com", service: "http://localhost:3000" },
          { service: "http_status:404" },
        ],
      })

      expect(config.ingress[0].hostname).toBe("*.example.com")
    })

    it("rejects unknown keys in originRequest (strict mode)", () => {
      const result = TunnelConfig.safeParse({
        ingress: [
          {
            hostname: "app.example.com",
            service: "http://localhost:3000",
            originRequest: {
              connetTimeout: "30s", // typo!
            },
          },
          { service: "http_status:404" },
        ],
      })

      expect(result.success).toBe(false)
    })

    it("validates duration strings in originRequest", () => {
      const valid = TunnelConfig.safeParse({
        ingress: [
          {
            hostname: "app.example.com",
            service: "http://localhost:3000",
            originRequest: { connectTimeout: "30s" },
          },
          { service: "http_status:404" },
        ],
      })
      expect(valid.success).toBe(true)

      const invalid = TunnelConfig.safeParse({
        ingress: [
          {
            hostname: "app.example.com",
            service: "http://localhost:3000",
            originRequest: { connectTimeout: "thirty seconds" },
          },
          { service: "http_status:404" },
        ],
      })
      expect(invalid.success).toBe(false)
    })

    it("accepts routes with valid CIDR", () => {
      const config = TunnelConfig.parse({
        ingress: [{ service: "http_status:404" }],
        routes: [
          { network: "10.0.0.0/8" },
          { network: "172.16.0.0/16", vnet: "production", comment: "Prod VPC" },
        ],
      })

      expect(config.routes).toHaveLength(2)
    })

    it("rejects invalid CIDR in routes", () => {
      const result = TunnelConfig.safeParse({
        ingress: [{ service: "http_status:404" }],
        routes: [{ network: "not-a-cidr" }],
      })

      expect(result.success).toBe(false)
    })

    it("accepts full config with all options", () => {
      const config = TunnelConfig.parse({
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

      expect(config.tunnel).toBe("my-app")
      expect(config.dns?.auto).toBe(true)
      expect(config.warpRouting?.enabled).toBe(true)
    })
  })

  describe("safeParse", () => {
    it("returns success: true for valid config", () => {
      const result = TunnelConfig.safeParse({
        ingress: [{ service: "http_status:404" }],
      })

      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.ingress).toHaveLength(1)
      }
    })

    it("returns success: false with error details for invalid config", () => {
      const result = TunnelConfig.safeParse({
        ingress: [],
      })

      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.error.issues.length).toBeGreaterThan(0)
      }
    })
  })
})
