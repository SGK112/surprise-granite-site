/*
 * /api/bridge/* — endpoints for the @voicenow/bridge CLI to pair a local
 * Claude Code and serve the room-designer's brain. In-memory, single-tenant
 * ('owner') for testing. pair-init is gated by BRIDGE_ADMIN_KEY if that env is
 * set, so randoms can't pair a bridge that would serve everyone's design-chat.
 */
const express = require('express');
const router = express.Router();
const store = require('../services/bridgeStore');

const json = express.json({ limit: '8mb' });
const OWNER = process.env.BRIDGE_OWNER_ID || 'owner';

function adminOk(req) {
  const need = process.env.BRIDGE_ADMIN_KEY;
  if (!need) return true; // unset = open (dev/testing)
  return req.headers['x-bridge-admin-key'] === need;
}
function bridgeAuth(req, res, next) {
  const r = store.authenticateBridge(req.headers['authorization']);
  if (!r.ok) return res.status(401).json({ error: 'bridge auth: ' + r.reason });
  req.bridge = { bridgeId: r.bridgeId, userId: r.userId };
  next();
}

// user/UI → server: issue a one-shot pairing code to paste into the CLI.
router.post('/pair-init', json, (req, res) => {
  if (!adminOk(req)) return res.status(401).json({ error: 'admin key required' });
  const { code, expiresInSec } = store.issuePairingCode(OWNER);
  const serverUrl = process.env.BRIDGE_SERVER_URL ||
    `${req.protocol}://${req.get('host')}`;
  res.json({ code, expiresInSec, serverUrl });
});

// bridge → server: exchange the code for a long-lived token.
router.post('/pair', json, (req, res) => {
  const { code, hostname, protocolVersion } = req.body || {};
  if (!code) return res.status(400).json({ error: 'code required' });
  if (String(protocolVersion || '0').split('.')[0] !== store.PROTOCOL_VERSION.split('.')[0]) {
    return res.status(426).json({ error: `protocol mismatch — server ${store.PROTOCOL_VERSION}` });
  }
  const userId = store.consumePairingCode(code);
  if (!userId) return res.status(410).json({ error: 'code expired or unknown' });
  res.json(store.createBridgeSession({ userId, hostname }));
});

// bridge → server: long-poll for work.
router.get('/poll', bridgeAuth, async (req, res) => {
  const ac = new AbortController();
  req.on('aborted', () => ac.abort());
  req.on('close', () => ac.abort());
  try {
    const work = await store.waitForWork(req.bridge.userId, ac.signal);
    if (!res.headersSent) res.json(work);
  } catch (e) { if (!res.headersSent) res.status(500).json({ error: e.message }); }
});

// bridge → server: one response chunk per call.
router.post('/respond', json, bridgeAuth, (req, res) => {
  const chunk = req.body;
  if (!chunk || !chunk.requestId || !chunk.kind) return res.status(400).json({ error: 'invalid chunk' });
  if (!store.pushBridgeResponse(chunk)) return res.status(410).json({ error: 'no open request stream' });
  res.json({ accepted: true });
});

router.post('/heartbeat', json, bridgeAuth, (req, res) => res.json({ ok: true }));

// UI → server: is a bridge connected?
router.get('/status', (req, res) => res.json(store.getBridgeStatus(OWNER)));

router.post('/disconnect', json, (req, res) => {
  if (!adminOk(req)) return res.status(401).json({ error: 'admin key required' });
  const { bridgeId } = req.body || {};
  if (!bridgeId) return res.status(400).json({ error: 'bridgeId required' });
  res.json({ revoked: store.revokeBridge(OWNER, bridgeId) });
});

module.exports = router;
