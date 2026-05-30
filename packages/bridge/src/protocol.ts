// Wire protocol shared by the Webstew server and the @surprise-granite/bridge CLI.
// Both sides import these types so any change to the contract is a
// compile-time break. Keep this file deps-free (pure types + tiny consts)
// so the bridge CLI bundle stays under ~50KB.
//
// Lifecycle of one agent turn:
//   1. User submits chat in /workspace → POST /api/builder/agent on Webstew.
//   2. Webstew detects the user has an active bridge (per BridgeStatus) and
//      enqueues a BridgeRequest in the per-user queue instead of calling
//      Anthropic directly. The HTTP handler holds the response open (SSE).
//   3. The local bridge process is long-polling GET /api/bridge/poll; it
//      receives the BridgeRequest within a few hundred ms.
//   4. Bridge spawns Claude Agent SDK (or `claude -p`) using the user's
//      already-authenticated local OAuth — this is the whole point: their
//      Pro/Max subscription, not API-rate billing.
//   5. As the agent streams, bridge POSTs each chunk to
//      /api/bridge/respond as a BridgeResponse. Webstew forwards each
//      chunk straight to the waiting SSE consumer (the workspace chat).
//   6. Bridge sends a `done` (or `error`) BridgeResponse to close.
//
// Versioning: this is v1. Breaking changes bump PROTOCOL_VERSION; the
// server rejects bridges on an older major version with a clear error
// telling the user to `npm i -g @surprise-granite/bridge@latest`.

export const PROTOCOL_VERSION = '1.0.0'

// How long the bridge holds a poll open before returning empty so it can
// re-issue. Tuned for: (a) Render's default 30s edge timeout, (b) fast
// reconnect after server restarts. 25s gives 5s headroom under Render's
// limit. Bridge should re-poll immediately on empty return.
export const POLL_TIMEOUT_MS = 25_000

// How often the bridge sends a tiny heartbeat ping while idle, so the
// server knows the connection is live. Drives BridgeStatus.lastSeen.
export const HEARTBEAT_INTERVAL_MS = 15_000

// Server treats a bridge as offline if no poll/heartbeat in this long.
// Generous so brief network blips don't flap the UI status.
export const BRIDGE_OFFLINE_AFTER_MS = 60_000

// ── Pairing ────────────────────────────────────────────────────────────
// User clicks "Connect Local Bridge" in Webstew settings. Server issues
// a short-lived pairing code the user copy/pastes into `sg-bridge
// connect <code>`. Bridge exchanges the code for a long-lived
// pairingToken bound to (userId, bridgeId). Tokens are revocable from
// the UI ("Disconnect").

export interface PairingCodeResponse {
  /** Short human-friendly code the user pastes into the CLI. */
  code: string
  /** Seconds until the code expires (typically 600). */
  expiresInSec: number
  /** Origin the bridge should connect to (e.g. https://surprise-granite-email-api.onrender.com). */
  serverUrl: string
}

export interface PairingExchangeRequest {
  code: string
  /** Free-form label so users can tell bridges apart in the UI. */
  hostname: string
  bridgeVersion: string
  protocolVersion: string
}

export interface PairingExchangeResponse {
  /** Long-lived auth token. Bridge sends as `Authorization: Bearer …`. */
  pairingToken: string
  /** Server-assigned ID for this bridge — surfaces in UI + logs. */
  bridgeId: string
}

// ── Status ─────────────────────────────────────────────────────────────
// UI polls this to render "Bridge connected ✓ / offline" without needing
// realtime WS infra. Lightweight, cacheable for ~1s.

export interface BridgeStatus {
  connected: boolean
  /** ISO timestamp of the bridge's last poll/heartbeat. */
  lastSeenAt?: string
  bridgeId?: string
  hostname?: string
  bridgeVersion?: string
  /** Number of in-flight agent requests currently queued or running. */
  inFlightRequests: number
}

// ── Request: server → bridge ──────────────────────────────────────────
// What the bridge picks up via long-poll. Today only agent.run; future
// kinds (e.g. file.read for IDE-style file probes from the agent's
// remote tool use) can be added without breaking v1 clients because
// bridges check `kind` and ignore unknowns with a polite error response.

export type BridgeRequest =
  | {
      kind: 'agent.run'
      requestId: string
      payload: AgentRunRequest
    }

export interface AgentRunRequest {
  prompt: string
  /** Project VFS snapshot — same shape the existing /api/builder/agent
   *  route accepts. Bridge replays edits against this map. */
  files: Record<string, string>
  history?: Array<{ role: 'user' | 'assistant'; content: any }>
  /** 'claude-opus-4-7' | 'claude-sonnet-4-6' | 'claude-haiku-4-5-…' —
   *  bridge maps to the local CLI's --model flag. Empty = bridge picks
   *  its default. */
  model?: string
  target?: 'website' | 'nextjs' | 'react' | 'astro' | 'expo'
  /** Webstew project id — bridge echoes back on file_update events so
   *  the server can persist the same way it does for direct Anthropic. */
  projectId?: string
  /** Cap on tool-use iterations. Server passes the agent route's
   *  configured limit so bridge enforcement matches direct flow. */
  maxIterations?: number
}

// ── Response: bridge → server (streamed chunks) ───────────────────────
// Each POST to /api/bridge/respond carries ONE BridgeResponse. Server
// pipes it straight through to the waiting SSE consumer. Server uses
// `requestId` to match chunks to the open agent request.

export type BridgeResponse =
  | { requestId: string; kind: 'text'; data: { text: string } }
  | { requestId: string; kind: 'tool_use'; data: { id: string; name: string; input: any } }
  | { requestId: string; kind: 'tool_result'; data: { tool_use_id: string; ok: boolean; content: string } }
  | { requestId: string; kind: 'file_update'; data: { path: string; contents: string } }
  | { requestId: string; kind: 'file_delete'; data: { path: string } }
  | { requestId: string; kind: 'done'; data: { summary: string; iterations: number } }
  | { requestId: string; kind: 'error'; data: { message: string } }
  // Out-of-band events emitted by MCP-side tools (workspace control,
  // permission prompts). These ride the same SSE stream as a chat turn
  // but aren't tied to a specific tool_use — the agent route just
  // pipes them through to the workspace UI.
  | { requestId: string; kind: 'workspace.switch_target'; data: { target: string; reason: string } }
  | { requestId: string; kind: 'workspace.open_panel'; data: { panel: string; reason: string } }
  | {
      requestId: string
      kind: 'permission_request'
      data: {
        permissionId: string
        action: string          // discriminator: 'switch_target' | 'open_panel' | 'open_settings' | etc.
        title: string           // e.g. "Switch to Expo (mobile app)?"
        description: string     // chef's reason, plain text
        approveLabel?: string   // defaults to "Approve"
        denyLabel?: string      // defaults to "Deny"
        // Action-specific metadata so the UI can preview what will
        // happen (e.g. show the target name + an icon).
        meta?: Record<string, unknown>
      }
    }

// ── HTTP shapes ───────────────────────────────────────────────────────
// Concrete endpoint paths. Centralized so both sides import the same
// strings; typos become impossible.

export const BRIDGE_ROUTES = {
  pairInit: '/api/bridge/pair-init',     // user → server, requires session
  pairExchange: '/api/bridge/pair',      // bridge → server, body: PairingExchangeRequest
  poll: '/api/bridge/poll',              // bridge → server, long-poll, returns BridgeRequest | null
  respond: '/api/bridge/respond',        // bridge → server, body: BridgeResponse
  heartbeat: '/api/bridge/heartbeat',    // bridge → server, idle keepalive
  status: '/api/bridge/status',          // UI → server, requires session
  disconnect: '/api/bridge/disconnect',  // UI → server, revokes token
} as const

/** Polled when the queue is empty. Distinct from `null` so the bridge
 *  can re-poll immediately without ambiguity around timeouts. */
export interface EmptyPoll {
  empty: true
}

export type PollResponse = BridgeRequest | EmptyPoll
