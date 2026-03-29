export interface IApiClient {
  get<T>(path: string, params?: Record<string, string>): Promise<T>
  post<T>(path: string, body?: unknown): Promise<T>
  put<T>(path: string, body?: unknown): Promise<T>
  delete<T>(path: string, params?: Record<string, string>): Promise<T>
  paginate<T>(path: string, params?: Record<string, string>): AsyncGenerator<T>
  accountPath(path: string): string
  zonePath(zoneId: string, path: string): string
}
