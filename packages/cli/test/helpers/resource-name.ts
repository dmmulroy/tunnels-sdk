import { randomBytes } from "node:crypto"

/**
 * Generates a unique, recognizable resource name for test isolation.
 *
 * The `tunnels-test-` prefix lets cleanup scripts find orphaned resources without affecting real
 * tunnels.
 *
 * @param type Resource type segment to include in the generated name.
 * @returns Unique test resource name.
 */
export function resourceName(type: string = "tunnel"): string {
  const rand = randomBytes(4).toString("hex")
  return `tunnels-test-${type}-${rand}`
}
