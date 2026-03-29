import { vi, type Mock } from "vitest"
import type { IApiClient } from "./api/interfaces.js"

export type MockApiClient = {
  [K in keyof IApiClient]: Mock
}

export function createMockApi(): MockApiClient {
  return {
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
    paginate: vi.fn(),
    accountPath: vi.fn((path: string) => `/accounts/acct${path}`),
    zonePath: vi.fn((zoneId: string, path: string) => `/zones/${zoneId}${path}`),
  }
}
