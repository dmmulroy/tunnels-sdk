export interface BinaryResolver {
  readonly path: string
  isInstalled(): Promise<boolean>
  install(): Promise<void>
}

export { cloudflared } from "./cloudflared.js"
