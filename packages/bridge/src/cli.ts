#!/usr/bin/env -S npx --yes tsx

// @surprise-granite/bridge CLI entry. Registered as `bin` so users run
//
// Shebang note: we point to `tsx` (TypeScript loader for Node) so the
// raw .ts files in src/ can be executed without a build step during
// monorepo dev + initial install. When we cut a real npm release we'll
// compile to dist/ and the published shebang will go back to plain
// `#!/usr/bin/env node`. `env -S` is needed on macOS so env passes the
// multi-arg command intact.
// `npx @surprise-granite/bridge <subcommand>` (or `sg-bridge` if installed
// globally) without a node-modules dance.
//
// Subcommands:
//   connect <code>       pair with a Surprise Granite workspace, then start the bridge
//   status               print connection state from local config
//   logout               forget the saved pairing token
//   --help, -h           print usage
//   --version, -v        print bridge + protocol versions
//
// Persistent auth lives at ~/.sg-bridge/bridge.json (0600 perms). See
// auth.ts. The CLI does NOT manage Claude Code's OAuth — that's owned
// by Claude Code itself; the bridge just spawns `claude --print …` and
// inherits whatever auth Claude Code is using.

import os from 'node:os'
import { PROTOCOL_VERSION, BRIDGE_ROUTES, type PairingExchangeRequest, type PairingExchangeResponse } from './protocol'
import { loadAuth, saveAuth, clearAuth } from './auth'
import { startBridge } from './runtime'

const BRIDGE_VERSION = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require('../package.json').version as string
  } catch {
    return '0.0.0-dev'
  }
})()

const DEFAULT_SERVER_URL = process.env.SG_BRIDGE_SERVER_URL || 'https://surprise-granite-email-api.onrender.com'

const HELP = `sg-bridge — your Surprise Granite bridge. Cooks every order on
runs blueprint reads on your Claude Code (your subscription).

Usage:
  sg-bridge connect            Resume using saved session (after restarts).
  sg-bridge connect <code>    Hire the chef. Get the code from
                                   /integrations → "Connect Local Bridge".
  sg-bridge status            Peek at the pass.
  sg-bridge logout            Hang up the apron.
  sg-bridge --help            This menu.
  sg-bridge --version         Bridge + protocol versions.

Environment:
  SG_BRIDGE_SERVER_URL   Override the server URL (defaults to https://surprise-granite-email-api.onrender.com).
                       Set to http://localhost:3000 to pair with a local dev workspace.

Keep this terminal open — that's the kitchen. Send orders from your
Surprise Granite workspace and the chef cooks them on your subscription.
`

function log(msg: string): void {
  const ts = new Date().toISOString().replace('T', ' ').slice(0, 19)
  process.stdout.write(`[${ts}] ${msg}\n`)
}

async function cmdConnect(code: string): Promise<number> {
  // No code supplied — try to resume using stored token (survives dev-server restarts).
  if (!code) {
    const existing = loadAuth()
    if (!existing) {
      process.stderr.write('error: no pairing code and no stored session.\n  usage: sg-bridge connect <code>\n  Get a code from /integrations → "Connect Local Bridge".\n')
      return 2
    }
    log(`resuming session bridgeId=${existing.bridgeId} — no new code needed`)
    await startBridge({ ctx: { serverUrl: existing.serverUrl, pairingToken: existing.pairingToken }, log })
    return 0
  }
  // Exchange the code for a long-lived pairingToken via /api/bridge/pair.
  log(`pairing with ${DEFAULT_SERVER_URL}…`)
  const body: PairingExchangeRequest = {
    code,
    hostname: os.hostname() || 'unknown',
    bridgeVersion: BRIDGE_VERSION,
    protocolVersion: PROTOCOL_VERSION,
  }
  let res: Response
  try {
    res = await fetch(DEFAULT_SERVER_URL.replace(/\/$/, '') + BRIDGE_ROUTES.pairExchange, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (e) {
    process.stderr.write(`error: cannot reach ${DEFAULT_SERVER_URL}: ${(e as Error).message}\n`)
    return 1
  }
  if (!res.ok) {
    let detail = ''
    try { detail = ((await res.json()) as { error?: string })?.error || '' } catch {}
    process.stderr.write(`error: pairing failed (HTTP ${res.status}): ${detail || 'no details'}\n`)
    return 1
  }
  const out = (await res.json()) as PairingExchangeResponse
  saveAuth({
    serverUrl: DEFAULT_SERVER_URL,
    bridgeId: out.bridgeId,
    pairingToken: out.pairingToken,
    pairedAt: new Date().toISOString(),
  })
  log(`paired ✓  bridgeId=${out.bridgeId}`)
  log(`chef hired — keep this terminal open, the kitchen needs the line`)
  // Start the long-poll loop. Never returns.
  await startBridge({
    ctx: { serverUrl: DEFAULT_SERVER_URL, pairingToken: out.pairingToken },
    log,
  })
  return 0
}

async function cmdStatus(): Promise<number> {
  const auth = loadAuth()
  if (!auth) {
    process.stdout.write('not paired. Run: sg-bridge connect <code>\n')
    return 0
  }
  process.stdout.write(
    `paired with ${auth.serverUrl}\n` +
      `  bridgeId:   ${auth.bridgeId}\n` +
      `  paired at:  ${auth.pairedAt}\n` +
      `\nrun \`sg-bridge connect\` to resume (no code needed).\n`
  )
  return 0
}

function cmdLogout(): number {
  const removed = clearAuth()
  process.stdout.write(removed ? 'pairing token removed\n' : 'no pairing token to remove\n')
  return 0
}

async function main(argv: string[]): Promise<number> {
  const [, , sub, ...rest] = argv
  if (!sub || sub === '--help' || sub === '-h' || sub === 'help') {
    process.stdout.write(HELP)
    return 0
  }
  if (sub === '--version' || sub === '-v' || sub === 'version') {
    process.stdout.write(`@surprise-granite/bridge ${BRIDGE_VERSION} (protocol ${PROTOCOL_VERSION})\n`)
    return 0
  }
  if (sub === 'connect') return cmdConnect(rest[0] || '')
  if (sub === 'status')  return cmdStatus()
  if (sub === 'logout')  return cmdLogout()
  process.stderr.write(`error: unknown subcommand "${sub}"\n\n${HELP}`)
  return 2
}

main(process.argv).then(
  (code) => process.exit(code),
  (err) => {
    process.stderr.write(`bridge fatal: ${err?.stack || err}\n`)
    process.exit(1)
  }
)
