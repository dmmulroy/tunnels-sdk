import { TunnelApiError, TunnelAuthError, TunnelSdkError } from "../errors.js"

interface CfApiResponse<T> {
  success: boolean
  errors: Array<{ code: number; message: string }>
  messages: Array<{ code: number; message: string }>
  result: T
  result_info?: {
    page: number
    per_page: number
    total_pages: number
    count: number
    total_count: number
    cursor?: string
  }
}

export interface ApiClientOptions {
  accountId: string
  apiToken: string
  baseUrl?: string
}

export class ApiClient {
  private readonly accountId: string
  private readonly apiToken: string
  private readonly baseUrl: string

  constructor(options: ApiClientOptions) {
    const accountId = options.accountId.trim()
    const apiToken = options.apiToken.trim()

    if (!accountId) {
      throw new TunnelSdkError("accountId is required")
    }
    if (!apiToken) {
      throw new TunnelSdkError("apiToken is required")
    }

    this.accountId = accountId
    this.apiToken = apiToken
    this.baseUrl = options.baseUrl ?? "https://api.cloudflare.com/client/v4"
  }

  async get<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = this.buildUrl(path, params)
    return this.request<T>("GET", url)
  }

  async post<T>(path: string, body?: unknown): Promise<T> {
    const url = this.buildUrl(path)
    return this.request<T>("POST", url, body)
  }

  async put<T>(path: string, body?: unknown): Promise<T> {
    const url = this.buildUrl(path)
    return this.request<T>("PUT", url, body)
  }

  async delete<T>(path: string, params?: Record<string, string>): Promise<T> {
    const url = this.buildUrl(path, params)
    return this.request<T>("DELETE", url)
  }

  async *paginate<T>(path: string, params?: Record<string, string>): AsyncGenerator<T> {
    let page = 1
    while (true) {
      const url = this.buildUrl(path, { ...params, page: String(page), per_page: "50" })
      const response = await this.rawRequest("GET", url)
      const data = (await response.json()) as CfApiResponse<T[]>

      if (!data.success) {
        this.throwApiError(response.status, data.errors)
      }

      for (const item of data.result) {
        yield item
      }

      if (!data.result_info || page >= data.result_info.total_pages) break
      page++
    }
  }

  accountPath(path: string): string {
    return `/accounts/${this.accountId}${path}`
  }

  zonePath(zoneId: string, path: string): string {
    return `/zones/${zoneId}${path}`
  }

  private buildUrl(path: string, params?: Record<string, string>): string {
    const url = new URL(`${this.baseUrl}${path}`)
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        url.searchParams.set(key, value)
      }
    }
    return url.toString()
  }

  private async rawRequest(method: string, url: string, body?: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiToken}`,
    }

    if (body !== undefined) {
      headers["Content-Type"] = "application/json"
    }

    return fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })
  }

  private async request<T>(method: string, url: string, body?: unknown): Promise<T> {
    const response = await this.rawRequest(method, url, body)
    const data = (await response.json()) as CfApiResponse<T>

    if (!data.success) {
      this.throwApiError(response.status, data.errors)
    }

    return data.result
  }

  private throwApiError(status: number, errors: Array<{ code: number; message: string }>): never {
    if (status === 401 || status === 403) {
      throw new TunnelAuthError()
    }
    throw new TunnelApiError(status, errors)
  }
}
