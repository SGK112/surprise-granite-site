/*
 * bridgeStore.js — minimal in-memory pairing bridge for the SG api, so the
 * room-designer's brain can run on a paired Claude Code (Opus) subscription
 * instead of metered API calls. Wire-compatible with the @voicenow/bridge CLI
 * (same routes + protocol); point that client at this server with
 * VOICENOW_SERVER_URL=<sg-api-url>. In-memory = single-instance, for testing.
 */
const crypto = require('crypto');

const PROTOCOL_VERSION = '1.0.0';
const POLL_TIMEOUT_MS = 25_000;
const BRIDGE_OFFLINE_AFTER_MS = 60_000;
const PAIRING_CODE_TTL_MS = 600_000;

const pairingCodes = new Map();   // code -> { userId, expiresAt }
const bridges = new Map();        // tokenHash -> { bridgeId, userId, hostname, lastSeenAt }
const queues = new Map();         // userId -> { pending: [], resolvers: [] }
const streams = new Map();        // requestId -> { push, close }

const hash = (t) => crypto.createHash('sha256').update(String(t)).digest('hex');
const now = () => Date.now();

function getOrCreateQueue(userId) {
  let q = queues.get(String(userId));
  if (!q) { q = { pending: [], resolvers: [] }; queues.set(String(userId), q); }
  return q;
}

function issuePairingCode(userId) {
  for (const [k, v] of pairingCodes) if (v.expiresAt < now()) pairingCodes.delete(k);
  const code = crypto.randomBytes(4).toString('hex').toUpperCase();
  pairingCodes.set(code, { userId: String(userId), expiresAt: now() + PAIRING_CODE_TTL_MS });
  return { code, expiresInSec: PAIRING_CODE_TTL_MS / 1000 };
}
function consumePairingCode(code) {
  const e = pairingCodes.get(code);
  if (!e || e.expiresAt < now()) return null;
  pairingCodes.delete(code);
  return e.userId;
}

function createBridgeSession({ userId, hostname }) {
  const bridgeId = 'br_' + crypto.randomBytes(6).toString('hex');
  const pairingToken = 'bt_' + crypto.randomBytes(24).toString('hex');
  bridges.set(hash(pairingToken), { bridgeId, userId: String(userId), hostname: hostname || 'bridge', lastSeenAt: now() });
  return { bridgeId, pairingToken };
}
function authenticateBridge(authHeader) {
  const token = (authHeader || '').replace(/^Bearer\s+/i, '').trim();
  if (!token) return { ok: false, reason: 'no token' };
  const s = bridges.get(hash(token));
  if (!s) return { ok: false, reason: 'unknown token' };
  s.lastSeenAt = now();
  return { ok: true, bridgeId: s.bridgeId, userId: s.userId };
}
function revokeBridge(userId, bridgeId) {
  for (const [k, v] of bridges) if (v.userId === String(userId) && v.bridgeId === bridgeId) { bridges.delete(k); return true; }
  return false;
}
function hasLiveBridge(userId) {
  for (const v of bridges.values()) if (v.userId === String(userId) && now() - v.lastSeenAt < BRIDGE_OFFLINE_AFTER_MS) return true;
  return false;
}
function getBridgeStatus(userId) {
  let latest = null;
  for (const v of bridges.values()) if (v.userId === String(userId)) if (!latest || v.lastSeenAt > latest.lastSeenAt) latest = v;
  const q = queues.get(String(userId));
  return {
    connected: !!latest && now() - latest.lastSeenAt < BRIDGE_OFFLINE_AFTER_MS,
    lastSeenAt: latest ? new Date(latest.lastSeenAt).toISOString() : undefined,
    bridgeId: latest && latest.bridgeId, hostname: latest && latest.hostname,
    inFlightRequests: q ? q.pending.length + streams.size : 0
  };
}

// Long-poll: resolve with the next BridgeRequest, or { empty:true } after timeout.
function waitForWork(userId, signal) {
  return new Promise((resolve) => {
    const q = getOrCreateQueue(userId);
    if (q.pending.length > 0) return resolve(q.pending.shift());
    let done = false;
    const cleanup = () => {
      clearTimeout(timer);
      const i = q.resolvers.indexOf(onResolve);
      if (i !== -1) q.resolvers.splice(i, 1);
      if (signal) signal.removeEventListener('abort', onAbort);
    };
    const onResolve = (req) => { if (done) return false; done = true; cleanup(); resolve(req); return true; };
    const onAbort = () => { if (done) return; done = true; cleanup(); resolve({ empty: true }); };
    const timer = setTimeout(onAbort, POLL_TIMEOUT_MS);
    q.resolvers.push(onResolve);
    if (signal) { if (signal.aborted) return onAbort(); signal.addEventListener('abort', onAbort); }
  });
}

function pushBridgeResponse(chunk) {
  const s = streams.get(chunk.requestId);
  if (!s) return false;
  s.push(chunk);
  return true;
}

// Send one agent.run to the user's paired bridge; resolve with the assembled
// 'text' output (and any tool_use calls) when the bridge sends 'done'.
function dispatchToBridge(userId, agentReq, opts = {}) {
  return new Promise((resolve, reject) => {
    const requestId = 'req_' + crypto.randomBytes(10).toString('hex');
    const request = { kind: 'agent.run', requestId, payload: agentReq };
    let text = ''; const toolUses = []; let settled = false;
    const finish = (fn, v) => { if (settled) return; settled = true; clearTimeout(timer); streams.delete(requestId); fn(v); };
    const push = (c) => {
      if (!c) return;
      if (c.kind === 'text' && c.data && typeof c.data.text === 'string') text += c.data.text;
      else if (c.kind === 'tool_use') toolUses.push(c.data);
      else if (c.kind === 'done') finish(resolve, { text, toolUses, summary: c.data && c.data.summary });
      else if (c.kind === 'error') finish(reject, new Error((c.data && c.data.message) || 'bridge error'));
    };
    streams.set(requestId, { push, close: () => finish(reject, new Error('bridge stream closed')) });
    const timer = setTimeout(() => finish(reject, new Error('bridge timed out')), opts.timeoutMs || 120_000);
    const q = getOrCreateQueue(userId);
    let delivered = false;
    while (q.resolvers.length > 0) { const r = q.resolvers.shift(); try { if (r(request) === true) { delivered = true; break; } } catch (_) {} }
    if (!delivered) q.pending.push(request);
  });
}

module.exports = {
  PROTOCOL_VERSION, POLL_TIMEOUT_MS,
  issuePairingCode, consumePairingCode, createBridgeSession, authenticateBridge,
  revokeBridge, hasLiveBridge, getBridgeStatus, waitForWork, pushBridgeResponse, dispatchToBridge
};
