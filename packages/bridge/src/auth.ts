// Local config — pairing token, bridgeId, serverUrl. Stored at
// ~/.sg-bridge/bridge.json with 0600 perms (owner-only read/write) on
// POSIX so other local users can't read the token. Same model as
// ~/.gitconfig + ~/.npmrc style configs.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export interface BridgeAuth {
  serverUrl: string
  bridgeId: string
  pairingToken: string
  pairedAt: string
}

function configDir(): string {
  return path.join(os.homedir(), '.sg-bridge')
}

function configPath(): string {
  return path.join(configDir(), 'bridge.json')
}

export function loadAuth(): BridgeAuth | null {
  try {
    const raw = fs.readFileSync(configPath(), 'utf8')
    const parsed = JSON.parse(raw) as Partial<BridgeAuth>
    if (!parsed.serverUrl || !parsed.bridgeId || !parsed.pairingToken) return null
    return {
      serverUrl: parsed.serverUrl,
      bridgeId: parsed.bridgeId,
      pairingToken: parsed.pairingToken,
      pairedAt: parsed.pairedAt || new Date().toISOString(),
    }
  } catch {
    return null
  }
}

export function saveAuth(a: BridgeAuth): void {
  const dir = configDir()
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  const tmp = configPath() + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(a, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, configPath())
  try {
    // Belt + suspenders on POSIX — Windows ignores mode but the user
    // gets owner-only by default anyway.
    fs.chmodSync(configPath(), 0o600)
  } catch {}
}

export function clearAuth(): boolean {
  try {
    fs.unlinkSync(configPath())
    return true
  } catch {
    return false
  }
}

// Per-project workspace dirs. Each Webstew projectId gets its own dir
// under ~/.sg-bridge/workspaces/<projectId>/ so Claude Code's CLAUDE.md +
// auto-memory namespace cleanly to that project — same as cd-ing into
// different repos in regular Claude Code usage.
export function workspaceDirFor(projectId: string): string {
  const safe = projectId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 64) || 'unscoped'
  const dir = path.join(configDir(), 'workspaces', safe)
  fs.mkdirSync(dir, { recursive: true })
  // Opportunistically sweep workspaces older than 30 days. Cheap O(n)
  // scan on entry; the workspace dir is tiny so this never blocks.
  sweepStaleWorkspaces()
  return dir
}

function sweepStaleWorkspaces(): void {
  const root = path.join(configDir(), 'workspaces')
  if (!fs.existsSync(root)) return
  const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000
  const cutoff = Date.now() - THIRTY_DAYS
  try {
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const full = path.join(root, entry.name)
      try {
        const { mtimeMs } = fs.statSync(full)
        if (mtimeMs < cutoff) fs.rmSync(full, { recursive: true, force: true })
      } catch { /* non-fatal — skip this dir */ }
    }
  } catch { /* non-fatal */ }
}

/**
 * Ensure ~/.sg-bridge/mcp.json points at the @webstew/agent-tools MCP
 * server so claude loads webstew_* tools (CMS, integrations, etc.).
 * Returns the absolute config path that should be passed to claude as
 * `--mcp-config <path>`.
 *
 * Behavior:
 *   • If the config already exists, leave it alone (user may have
 *     customized it).
 *   • Otherwise, write a default config. In monorepo dev, point at the
 *     local agent-tools tsx so we don't need a build/publish step.
 *     In a production install (no local monorepo), point at npx so it
 *     resolves the published package.
 */
export function ensureMcpConfig(): string {
  const dir = configDir()
  fs.mkdirSync(dir, { recursive: true })
  const cfgPath = path.join(dir, 'mcp.json')
  if (fs.existsSync(cfgPath)) return cfgPath

  // Detect monorepo dev. __dirname of this module sits at
  // packages/bridge/src/ during dev; sibling packages/agent-tools/src/index.ts
  // tells us we're in the monorepo and can run tsx directly.
  const dirname = __dirname
  const siblingBin = path.resolve(dirname, '..', '..', 'agent-tools', 'dist', 'index.js')
  const isMonorepo = fs.existsSync(siblingBin)

  const config = isMonorepo
    ? {
        mcpServers: {
          webstew: {
            command: 'node',
            args: [siblingBin],
          },
        },
      }
    : {
        mcpServers: {
          webstew: {
            command: 'npx',
            args: ['@webstew/agent-tools'],
          },
        },
      }

  fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2))
  return cfgPath
}
