import { Data } from "effect"

export type CliError = Data.TaggedEnum<{
  readonly UserError: { readonly message: string }
  readonly AuthError: { readonly message: string }
  readonly NetworkError: { readonly message: string; readonly cause?: unknown }
  readonly TunnelRuntimeError: { readonly message: string }
}>

export const CliError = Data.taggedEnum<CliError>()

export const toExitCode = (error: CliError): number => {
  switch (error._tag) {
    case "UserError": return 1
    case "AuthError": return 2
    case "NetworkError": return 3
    case "TunnelRuntimeError": return 4
  }
}
