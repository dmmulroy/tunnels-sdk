import { Data } from "effect"

/**
 * Typed error variants used by CLI command handlers.
 */
export type CliError = Data.TaggedEnum<{
  readonly UserError: { readonly message: string }
  readonly AuthError: { readonly message: string }
  readonly NetworkError: { readonly message: string; readonly cause?: unknown }
  readonly TunnelRuntimeError: { readonly message: string }
}>

/**
 * Constructor helpers for CLI error variants.
 */
export const CliError = Data.taggedEnum<CliError>()

/**
 * Maps a CLI error to a process exit code.
 *
 * @param error CLI error to classify.
 * @returns Process exit code for the error.
 */
export const toExitCode = (error: CliError): number => {
  switch (error._tag) {
    case "UserError": return 1
    case "AuthError": return 2
    case "NetworkError": return 3
    case "TunnelRuntimeError": return 4
  }
}
