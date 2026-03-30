import { describe, expect, it } from "@effect/vitest"
import { CliError, toExitCode } from "./errors.js"

describe("CliError", () => {
  it("maps UserError to exit code 1", () => {
    const error = CliError.UserError({ message: "bad args" })
    expect(toExitCode(error)).toBe(1)
  })

  it("maps AuthError to exit code 2", () => {
    const error = CliError.AuthError({ message: "token expired" })
    expect(toExitCode(error)).toBe(2)
  })

  it("maps NetworkError to exit code 3", () => {
    const error = CliError.NetworkError({ message: "connection refused" })
    expect(toExitCode(error)).toBe(3)
  })

  it("maps TunnelRuntimeError to exit code 4", () => {
    const error = CliError.TunnelRuntimeError({ message: "process crashed" })
    expect(toExitCode(error)).toBe(4)
  })
})
