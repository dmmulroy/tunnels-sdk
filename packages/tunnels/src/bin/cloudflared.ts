import { arch, platform } from "node:os";
import { existsSync, createWriteStream } from "node:fs";
import { chmod, mkdir, rm } from "node:fs/promises";
import { spawn, execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const PINNED_VERSION = "2025.2.0";
const RELEASE_BASE = "https://github.com/cloudflare/cloudflared/releases/download";

interface InstallOptions {
  version?: string;
}

function normalizeVersion(version: string): string {
  return version.replace(/^v/, "");
}

function getBinaryName(): string {
  return platform() === "win32" ? "cloudflared.exe" : "cloudflared";
}

function getAssetName(): string {
  const currentPlatform = platform();
  const currentArch = arch();

  if (currentPlatform === "darwin") {
    if (currentArch !== "arm64" && currentArch !== "x64") {
      throw new Error(`Unsupported architecture: ${currentPlatform}-${currentArch}`);
    }
    return `cloudflared-darwin-${currentArch === "arm64" ? "arm64" : "amd64"}.tgz`;
  }

  if (currentPlatform === "linux") {
    if (currentArch !== "arm64" && currentArch !== "x64") {
      throw new Error(`Unsupported architecture: ${currentPlatform}-${currentArch}`);
    }
    return `cloudflared-linux-${currentArch === "arm64" ? "arm64" : "amd64"}`;
  }

  if (currentPlatform === "win32") {
    if (currentArch !== "x64") {
      throw new Error(`Unsupported architecture: ${currentPlatform}-${currentArch}`);
    }
    return "cloudflared-windows-amd64.exe";
  }

  throw new Error(`Unsupported platform: ${currentPlatform}`);
}

function getDownloadUrl(version: string): string {
  return `${RELEASE_BASE}/${version}/${getAssetName()}`;
}

function getCacheDir(): string {
  const currentDir = typeof __dirname !== "undefined"
    ? __dirname
    : dirname(fileURLToPath(import.meta.url));

  let dir = currentDir;
  for (let i = 0; i < 10; i++) {
    const nodeModulesDir = join(dir, "node_modules");
    if (existsSync(nodeModulesDir)) {
      return join(nodeModulesDir, ".cache", "tunnels", "bin");
    }

    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return join(currentDir, "..", "..", ".cache", "bin");
}

async function extractTgz(response: Response, destDir: string): Promise<void> {
  const tarProcess = spawn("tar", ["xzf", "-", "-C", destDir], {
    stdio: ["pipe", "ignore", "pipe"],
  });

  const body = response.body;
  if (!body) {
    throw new Error("Empty response body");
  }

  await pipeline(Readable.fromWeb(body), tarProcess.stdin);

  await new Promise<void>((resolve, reject) => {
    tarProcess.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`tar extraction failed with code ${code}`));
    });
    tarProcess.on("error", reject);
  });
}

let currentVersion = PINNED_VERSION;
const cacheDir = getCacheDir();

/**
 * Resolver and installer for the cached cloudflared binary used by the SDK.
 */
export const cloudflared = {
  /**
   * Filesystem path where the cloudflared binary is cached.
   */
  get path(): string {
    return join(cacheDir, getBinaryName());
  },

  /**
   * Currently selected cloudflared version.
   */
  get version(): string {
    return currentVersion;
  },

  /**
   * Checks whether the cached cloudflared binary exists and runs.
   *
   * @returns A Promise resolving to true when cloudflared is installed.
   */
  async isInstalled(): Promise<boolean> {
    if (!existsSync(this.path)) return false;

    try {
      const { stdout } = await execFileAsync(this.path, ["--version"]);
      return stdout.includes("cloudflared");
    } catch {
      return false;
    }
  },

  /**
   * Downloads and installs cloudflared into the local cache.
   *
   * @param options Optional install options, including the version to install.
   * @returns A Promise that resolves when installation completes.
   */
  async install(options?: InstallOptions): Promise<void> {
    const version = normalizeVersion(options?.version ?? currentVersion);
    const url = getDownloadUrl(version);

    await mkdir(cacheDir, { recursive: true });

    const response = await fetch(url, { redirect: "follow" });
    if (!response.ok) {
      throw new Error(`Failed to download cloudflared ${version}: ${response.status} ${response.statusText}`);
    }

    const currentPlatform = platform();

    if (currentPlatform === "darwin") {
      await extractTgz(response, cacheDir);
    } else {
      const body = response.body;
      if (!body) {
        throw new Error("Empty response body");
      }

      const output = createWriteStream(this.path);
      await pipeline(Readable.fromWeb(body), output);
    }

    if (currentPlatform !== "win32") {
      await chmod(this.path, 0o755);
    }

    currentVersion = version;
  },

  /**
   * Updates cloudflared to the latest GitHub release.
   *
   * @returns A Promise that resolves when the update completes.
   */
  async update(): Promise<void> {
    const response = await fetch(
      "https://api.github.com/repos/cloudflare/cloudflared/releases/latest",
      { headers: { Accept: "application/vnd.github.v3+json" } },
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch latest version: ${response.status}`);
    }

    const data = (await response.json()) as { tag_name: string; };
    await this.install({ version: normalizeVersion(data.tag_name) });
  },

  /**
   * Removes the cached cloudflared binary directory.
   *
   * @returns A Promise that resolves after cached files are removed.
   */
  async remove(): Promise<void> {
    if (existsSync(cacheDir)) {
      await rm(cacheDir, { recursive: true, force: true });
    }
  },
}
