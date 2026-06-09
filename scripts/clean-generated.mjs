#!/usr/bin/env node
import { spawnSync } from "node:child_process"
import { existsSync, readdirSync, rmSync } from "node:fs"
import { join, relative } from "node:path"

const root = process.cwd()
const ignoredDirs = new Set([".git", ".pi", "node_modules"])
const generatedDirs = new Set(["dist", "build", "coverage", ".turbo", ".next", "out"])

const toPosix = (path) => path.split("\\").join("/")

const git = spawnSync("git", ["ls-files", "-z"], {
  cwd: root,
  encoding: "utf8",
})

const tracked = git.status === 0
  ? new Set(git.stdout.split("\0").filter(Boolean).map(toPosix))
  : undefined

const removed = []

const removePath = (path) => {
  if (!existsSync(path)) return
  rmSync(path, { force: true, recursive: true })
  removed.push(toPosix(relative(root, path)))
}

const sourceExtensions = [".ts", ".tsx", ".mts", ".cts"]

const removeIfGeneratedSibling = (sourcePath) => {
  if (sourcePath.endsWith(".d.ts")) return

  const extension = sourceExtensions.find((extension) => sourcePath.endsWith(extension))
  if (!extension) return

  const stem = sourcePath.slice(0, -extension.length)
  const candidates = [
    `${stem}.js`,
    `${stem}.js.map`,
    `${stem}.d.ts`,
    `${stem}.d.ts.map`,
  ]

  for (const candidate of candidates) {
    const rel = toPosix(relative(root, candidate))

    // In a git checkout, never remove tracked files. This keeps intentional
    // JS assets / hand-written files safe while still cleaning ignored output.
    if (tracked?.has(rel)) continue

    removePath(candidate)
  }
}

const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (ignoredDirs.has(entry.name)) continue

    const path = join(dir, entry.name)

    if (entry.isDirectory()) {
      if (generatedDirs.has(entry.name)) {
        removePath(path)
        continue
      }

      walk(path)
      continue
    }

    if (entry.isFile() && entry.name.endsWith(".tsbuildinfo")) {
      removePath(path)
      continue
    }

    if (entry.isFile()) {
      removeIfGeneratedSibling(path)
    }
  }
}

walk(root)

if (removed.length > 0) {
  console.log(`Removed ${removed.length} generated artifact${removed.length === 1 ? "" : "s"}.`)
} else {
  console.log("No generated artifacts to remove.")
}
