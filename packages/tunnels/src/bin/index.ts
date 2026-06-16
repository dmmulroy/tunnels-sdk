/**
 * Minimal binary resolver contract used by consumers that manage cloudflared manually.
 */
export interface BinaryResolver {
  readonly path: string
  isInstalled(): Promise<boolean>
  install(): Promise<void>
}

/**
 * Cached cloudflared binary resolver and installer.
 */
export { cloudflared } from "./cloudflared.js"
