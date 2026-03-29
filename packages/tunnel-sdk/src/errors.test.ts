import { describe, expect, it } from "vitest"
import { TunnelApiError, TunnelAuthError, TunnelNotFoundError, TunnelSdkError } from "./errors.js"

describe("TunnelSdkError", () => {
  it("sets name and message", () => {
    const error = new TunnelSdkError("something went wrong")
    expect(error.name).toBe("TunnelSdkError")
    expect(error.message).toBe("something went wrong")
    expect(error).toBeInstanceOf(Error)
  })

  it("supports cause via ErrorOptions", () => {
    const cause = new Error("root cause")
    const error = new TunnelSdkError("wrapper", { cause })
    expect(error.cause).toBe(cause)
  })
})

describe("TunnelApiError", () => {
  it("formats multiple error codes into message", () => {
    const error = new TunnelApiError(400, [
      { code: 1001, message: "Invalid param" },
      { code: 1002, message: "Missing field" },
    ])
    expect(error.name).toBe("TunnelApiError")
    expect(error.status).toBe(400)
    expect(error.errors).toHaveLength(2)
    expect(error.message).toContain("[1001] Invalid param")
    expect(error.message).toContain("[1002] Missing field")
    expect(error.message).toContain("400")
    expect(error).toBeInstanceOf(TunnelSdkError)
  })
})

describe("TunnelAuthError", () => {
  it("uses default message", () => {
    const error = new TunnelAuthError()
    expect(error.name).toBe("TunnelAuthError")
    expect(error.message).toContain("Authentication failed")
    expect(error).toBeInstanceOf(TunnelSdkError)
  })

  it("accepts custom message", () => {
    const error = new TunnelAuthError("Token expired")
    expect(error.message).toBe("Token expired")
  })
})

describe("TunnelNotFoundError", () => {
  it("includes the tunnel reference in the message", () => {
    const error = new TunnelNotFoundError("my-tunnel")
    expect(error.name).toBe("TunnelNotFoundError")
    expect(error.tunnelRef).toBe("my-tunnel")
    expect(error.message).toContain("my-tunnel")
    expect(error).toBeInstanceOf(TunnelSdkError)
  })
})
