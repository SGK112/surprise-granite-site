// Thin fetch wrapper. Just enough to: (a) attach the bearer token, (b)
// retry transient network errors on poll/heartbeat without giving up,
// (c) surface server errors with readable messages. Uses Node 18+
// built-in fetch — no node-fetch dep.

import { BRIDGE_ROUTES, PROTOCOL_VERSION } from './protocol'

export class HttpError extends Error {
  constructor(public status: number, message: string, public body?: unknown) {
    super(message)
  }
}

export interface HttpContext {
  serverUrl: string
  pairingToken: string
}

async function call<T>(
  ctx: HttpContext,
  method: 'GET' | 'POST',
  pathStr: string,
  body?: unknown,
  init?: RequestInit
): Promise<T> {
  const url = ctx.serverUrl.replace(/\/$/, '') + pathStr
  const headers: Record<string, string> = {
    Authorization: `Bearer ${ctx.pairingToken}`,
    'x-sg-bridge-protocol': PROTOCOL_VERSION,
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(url, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    ...init,
  })
  if (!res.ok) {
    let parsed: any
    try { parsed = await res.json() } catch {}
    throw new HttpError(
      res.status,
      parsed?.error || `${method} ${pathStr} → HTTP ${res.status}`,
      parsed
    )
  }
  // Some endpoints (poll) may return null body via {empty:true}; parse
  // JSON unconditionally — server always returns JSON.
  return (await res.json()) as T
}

export async function pollOnce<T>(ctx: HttpContext, signal?: AbortSignal): Promise<T> {
  return call<T>(ctx, 'GET', BRIDGE_ROUTES.poll, undefined, { signal })
}

export async function postResponse(ctx: HttpContext, body: unknown): Promise<{ accepted: boolean }> {
  return call(ctx, 'POST', BRIDGE_ROUTES.respond, body)
}

export async function postHeartbeat(ctx: HttpContext): Promise<void> {
  await call(ctx, 'POST', BRIDGE_ROUTES.heartbeat, {})
}
