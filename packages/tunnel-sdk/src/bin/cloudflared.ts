import { existsSync } from "node:fs"
import { mkdir, rm, chmod } from "node:fs/promises"
import { join, dirname } from "node:path"
import { createWriteStream } from "node:fs"
import { pipeline } from "node:stream/promises"
import { Readable } from "node:stream"
import { fileURLToPath } from "node:url"
import { platform, arch } from "node:os"
import { execFile } from "node:child_process"
import { promisify } from "node:util"

const execFileAsync = promisify(execFile)

/** Pinned cloudflared version */
const PINNED_VERSION = "2025.2.0"

/** GitHub release base URL */
const RELEASE_BASE = "https://github.com/cloudflare/cloudflared/releases/download"

interface InstallOptions {
  version?: string
}

function getPlatformKey(): string {
  const p = platform()
  const a = arch()

  const platformMap: Record<string, Record<string, string>> = {
    darwin: { arm64: "darwin-arm64", x64: "darwin-amd64" },
    linux: { arm64: "linux-arm64", x64: "linux-amd64" },
    win32: { x64: "windows-amd64" },
  }

  const archMap = platformMap[p]
  if (!archMap) throw new Error(`Unsupported platform: ${p}`)

  const key = archMap[a]
  if (!key) throw new Error(`Unsupported architecture: ${p}-${a}`)

  return key
}

function getBinaryName(): string {
  return platform() === "win32" ? "cloudflared.exe" : "cloudflared"
}

function getDownloadUrl(version: string): string {
  const key = getPlatformKey()
  const p = platform()

  if (p === "darwin") {
    return `${RELEASE_BASE}/${version}/cloudflared-darwin-${arch() === "arm64" ? "arm64" : "amd64"}.tgz`
  }
  if (p === "win32") {
    return `${RELEASE_BASE}/${version}/cloudflared-windows-amd64.exe`
  }
  // linux
  const archStr = arch() === "arm64" ? "arm64" : "amd64"
  return `${RELEASE_BASE}/${version}/cloudflared-linux-${archStr}`
}

function getCacheDir(): string {
  // Walk up from this file to find node_modules, or use a fallback
  const thisDir = typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url))

  // Try to find the package's node_modules/.cache
  let dir = thisDir
  for (let i = 0; i < 10; i++) {
    const candidate = join(dir, "node_modules", ".cache", "tunnel-sdk", "bin")
    const nmDir = join(dir, "node_modules")
    if (existsSync(nmDir)) {
      return candidate
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  // Fallback: next to the package
  return join(thisDir, "..", "..", ".cache", "bin")
}

class CloudflaredBinary {
  private _version = PINNED_VERSION
  private _cacheDir = getCacheDir()

  /** Path to the cached binary */
  get path(): string {
    return join(this._cacheDir, getBinaryName())
  }

  /** Pinned version */
  get version(): string {
    return this._version
  }

  /** Check if the binary is installed in cache */
  async isInstalled(): Promise<boolean> {
    if (!existsSync(this.path)) return false

    try {
      const { stdout } = await execFileAsync(this.path, ["--version"])
      return stdout.includes("cloudflared")
    } catch {
      return false
    }
  }

  /** Install the binary (or a specific version) */
  async install(options?: InstallOptions): Promise<void> {
    const version = options?.version ?? this._version
    const url = getDownloadUrl(version)

    await mkdir(this._cacheDir, { recursive: true })

    const response = await fetch(url, { redirect: "follow" })
    if (!response.ok) {
      throw new Error(`Failed to download cloudflared ${version}: ${response.status} ${response.statusText}`)
    }

    const p = platform()

    if (p === "darwin") {
      // macOS: .tgz archive
      await this._extractTgz(response, this._cacheDir)
    } else {
      // Linux/Windows: direct binary
      const dest = this.path
      const body = response.body
      if (!body) throw new Error("Empty response body")

      const ws = createWriteStream(dest)
      await pipeline(Readable.fromWeb(body as any), ws)
    }

    // Make executable on unix
    if (p !== "win32") {
      await chmod(this.path, 0o755)
    }

    if (options?.version) {
      this._version = options.version
    }
  }

  /** Update to latest version */
  async update(): Promise<void> {
    const response = await fetch(
      "https://api.github.com/repos/cloudflare/cloudflared/releases/latest",
      { headers: { Accept: "application/vnd.github.v3+json" } },
    )

    if (!response.ok) {
      throw new Error(`Failed to fetch latest version: ${response.status}`)
    }

    const data = (await response.json()) as { tag_name: string }
    const latestVersion = data.tag_name
    await this.install({ version: latestVersion })
  }

  /** Remove the cached binary */
  async remove(): Promise<void> {
    if (existsSync(this._cacheDir)) {
      await rm(this._cacheDir, { recursive: true, force: true })
    }
  }

  private async _extractTgz(response: Response, destDir: string): Promise<void> {
    // Use tar command for extraction (available on macOS/Linux)
    const { Writable } = await import("node:stream")
    const { spawn } = await import("node:child_process")

    const tarProcess = spawn("tar", ["xzf", "-", "-C", destDir], {
      stdio: ["pipe", "ignore", "pipe"],
    })

    const body = response.body
    if (!body) throw new Error("Empty response body")

    await pipeline(Readable.fromWeb(body as any), tarProcess.stdin)

    await new Promise<void>((resolve, reject) => {
      tarProcess.on("close", (code) => {
        if (code === 0) resolve()
        else reject(new Error(`tar extraction failed with code ${code}`))
      })
      tarProcess.on("error", reject)
    })
  }
}

/** Singleton cloudflared binary manager */
export const cloudflared = new CloudflaredBinary()
