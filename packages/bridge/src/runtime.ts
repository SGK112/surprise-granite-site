// Bridge runtime — the main loop after `connect` succeeds.
//
// Two concurrent activities:
//   1. Long-poll for work: hit /api/bridge/poll, on receiving a request
//      dispatch it to the claude runner, stream events back via
//      /api/bridge/respond. On empty, re-poll immediately.
//   2. Heartbeat: every HEARTBEAT_INTERVAL_MS while we're not in the
//      middle of an active long-poll, POST /api/bridge/heartbeat to
//      keep BridgeStatus.lastSeenAt fresh on the server.
//
// Concurrency: we process ONE request at a time per bridge (sequential
// poll → run → respond → poll). A Claude run can take 30-120s; running
// two in parallel would race the local Claude Code session. If a user
// needs parallel runs they can run multiple bridges.

import { HttpContext, postHeartbeat, postResponse, pollOnce, HttpError } from './http'
import { HEARTBEAT_INTERVAL_MS, type PollResponse, type BridgeResponse, type BridgeRequest } from './protocol'
import { runClaudeOnce } from './claude-runner'

interface RunOpts {
  ctx: HttpContext
  log: (msg: string) => void
}

export async function startBridge(opts: RunOpts): Promise<never> {
  const { ctx, log } = opts
  log('kitchen open — waiting for orders 🥘')

  // Heartbeat in a separate tick so it doesn't compete with polls.
  // Errors are non-fatal — server's authenticate* already touches
  // lastSeenAt on every poll, so missed heartbeats are cosmetic.
  let lastHeartbeatAt = Date.now()
  const heartbeatTick = setInterval(() => {
    if (Date.now() - lastHeartbeatAt < HEARTBEAT_INTERVAL_MS) return
    postHeartbeat(ctx).catch(() => {}).finally(() => {
      lastHeartbeatAt = Date.now()
    })
  }, 5_000)

  // Main long-poll loop. Never returns.
  for (;;) {
    let work: PollResponse
    try {
      work = await pollOnce<PollResponse>(ctx)
      lastHeartbeatAt = Date.now() // poll counts as activity
    } catch (e) {
      if (e instanceof HttpError && e.status === 401) {
        clearInterval(heartbeatTick)
        log(`apron revoked (${e.message}). The kitchen disconnected this chef from the floor. Re-pair to get back on the line.`)
        process.exit(2)
      }
      // Transient network blip — back off briefly and retry.
      log(`waiter call dropped: ${(e as Error).message} — reaching back in 3s`)
      await sleep(3_000)
      continue
    }

    if ('empty' in work && work.empty) {
      // Server timed out the long-poll with no work. Re-poll
      // immediately — this is the steady-state idle path.
      continue
    }

    // We have an agent.run request. Send to claude.
    const req: BridgeRequest = work as BridgeRequest
    log(`👨‍🍳 new order ${req.requestId.slice(0, 10)}…  table=${req.payload.projectId || 'walk-in'}`)
    const t0 = Date.now()
    // Per-request AbortController — flips the moment the server-side
    // response stream is gone (we get a 410 on POST /respond). The
    // signal is passed into runClaudeOnce so it SIGTERMs the spawned
    // claude child, stopping subscription token burn the moment the
    // user clicks Stop in the workspace UI.
    const runAbort = new AbortController()
    try {
      await runClaudeOnce({
        request: req.payload,
        requestId: req.requestId,
        signal: runAbort.signal,
        onEvent: (chunk: BridgeResponse) =>
          postResponse(ctx, chunk).then(() => {}).catch((e) => {
            // 410 = server has no open request anymore (timeout / user
            // navigated away). Abort the running claude child so we
            // stop burning subscription tokens, then reject with
            // BridgeCancelled so the runtime loop logs it and moves on.
            if (e instanceof HttpError && e.status === 410) {
              try { runAbort.abort() } catch {}
              return Promise.reject(new BridgeCancelled())
            }
            log(`respond failed: ${(e as Error).message}`)
            return Promise.reject(e)
          }),
      })
      log(`🍽️  served ${req.requestId.slice(0, 10)}…  ${((Date.now() - t0) / 1000).toFixed(1)}s`)
    } catch (e) {
      if (e instanceof BridgeCancelled) {
        log(`🗑️  order tossed ${req.requestId.slice(0, 10)}…  diner walked out`)
        continue
      }
      const msg = (e as Error).message || String(e)
      log(`🔥 burnt ${req.requestId.slice(0, 10)}…  ${msg}`)
      // Try to surface the error in the chat — but tolerate the case
      // where the server already gave up.
      await postResponse(ctx, {
        requestId: req.requestId,
        kind: 'error',
        data: { message: `Bridge error: ${msg}` },
      }).catch(() => {})
    }
  }
}

class BridgeCancelled extends Error {
  constructor() { super('cancelled') }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
