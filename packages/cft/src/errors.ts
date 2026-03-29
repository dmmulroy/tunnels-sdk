import { Data } from "effect"

export type CftError = Data.TaggedEnum<{
  readonly UserError: { readonly message: string }
  readonly AuthError: { readonly message: string }
  readonly NetworkError: { readonly message: string; readonly cause?: unknown }
  readonly TunnelRuntimeError: { readonly message: string }
}>

export const CftError = Data.taggedEnum<CftError>()

export const toExitCode = (error: CftError): number => {
  switch (error._tag) {
    case "UserError": return 1
    case "AuthError": return 2
    case "NetworkError": return 3
    case "TunnelRuntimeError": return 4
  }
}
