/**
 * Twilio inbound SMS webhook.
 *
 * Configure in Twilio Console → Phone Numbers → (number) → A MESSAGE COMES IN
 *   POST https://surprise-granite-email-api.onrender.com/api/sms/inbound
 *
 * Two responsibilities:
 *   1. TCPA compliance — when the customer sends STOP/UNSUBSCRIBE/etc, mark
 *      their number opted out (smsService.markOptedOut) BEFORE replying.
 *      Twilio also auto-honors these keywords at the carrier level, but our
 *      registry is the application-level source of truth so we never queue a
 *      send into Twilio that would bounce.
 *   2. Append every inbound message to `sms_inbound` for the per-customer
 *      comms timeline (Thryv-style inbox, to be built).
 *
 * Returns TwiML. STOP/UNSUBSCRIBE get a confirmation reply. START/YES get a
 * resubscribe confirmation. Everything else is logged silently — humans handle
 * via the unified inbox view (TODO).
 */

const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const smsService = require('../services/smsService');

let _supabase = null;
function supa() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
  if (url && key) _supabase = createClient(url, key);
  return _supabase;
}

const COMPANY_NAME = 'Surprise Granite';

function twimlResponse(text) {
  // Compact TwiML — Twilio's parser is whitespace-sensitive in places.
  if (!text) return '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';
  const safe = String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`;
}

// Twilio posts application/x-www-form-urlencoded. Ensure the router has the
// parser available — the consuming server already mounts express.urlencoded
// globally, but we be defensive in case this router gets mounted elsewhere.
router.use(express.urlencoded({ extended: false }));

router.post('/inbound', async (req, res) => {
  // Twilio fields: From, To, Body, MessageSid, NumMedia, ...
  const from = (req.body.From || '').trim();
  const to   = (req.body.To   || '').trim();
  const body = (req.body.Body || '').trim();
  const sid  = (req.body.MessageSid || '').trim();

  const { type: optType, keyword } = smsService.classifyKeyword(body);

  // Log inbound BEFORE acting on opt-out so the audit trail survives any
  // downstream failure.
  const sb = supa();
  if (sb) {
    try {
      await sb.from('sms_inbound').insert({
        twilio_sid: sid || null,
        from_phone: from,
        to_phone: to,
        body,
        matched_optout_keyword: optType === 'optout' ? keyword : null,
        raw: req.body
      });
    } catch (err) {
      // 42P01 = relation does not exist (migration not run yet). Don't fail
      // the webhook on logging — Twilio retries are aggressive.
      if (err.code !== '42P01') {
        console.error('[SMS-inbound] log failed:', err.message);
      }
    }
  }

  if (optType === 'optout' && from) {
    await smsService.markOptedOut(from, keyword, 'inbound_webhook');
    res.type('text/xml').send(twimlResponse(
      `You're unsubscribed from ${COMPANY_NAME}. No more messages will be sent. Reply START to resubscribe.`
    ));
    return;
  }

  if (optType === 'optin' && from) {
    await smsService.markOptedIn(from);
    res.type('text/xml').send(twimlResponse(
      `You're resubscribed to ${COMPANY_NAME} messages. Reply STOP at any time to unsubscribe.`
    ));
    return;
  }

  // Non-keyword inbound — acknowledge silently. Human follow-up happens via
  // the per-customer comms timeline (not yet built). Returning empty Response
  // tells Twilio "do not auto-reply".
  res.type('text/xml').send(twimlResponse(null));
});

module.exports = router;
