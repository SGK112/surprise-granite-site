/**
 * Dedup Routes
 *
 * Admin-only endpoints to find and merge duplicate leads / customers
 * that accumulated before client-side and server-side dedup were wired up.
 *
 * Every mutating endpoint supports `?dry_run=true` which returns the
 * merge plan without touching the database. Default is dry-run — you
 * must pass `?dry_run=false` explicitly to apply changes.
 *
 * Dedup key: lowercased-trimmed email (+ user_id for customers, since
 * different admins legitimately own separate customer records for the
 * same email).
 */

const express = require('express');
const router = express.Router();
const logger = require('../utils/logger');
const { adminAccess } = require('../middleware/adminAuth');

/**
 * Normalize an email for comparison. Returns null for falsy input so
 * records without an email are never grouped together.
 */
function normEmail(e) {
  if (!e || typeof e !== 'string') return null;
  const n = e.trim().toLowerCase();
  return n || null;
}

/**
 * Pick the "keeper" record from a group of duplicates. We prefer:
 *   1. The oldest record (earliest created_at) so historical IDs stay stable.
 *   2. Tie-breaker: the one with more populated fields (phone, message, etc.).
 * Returns the keeper plus the list of merge-away records.
 */
function pickKeeper(records, fieldWeight) {
  const sorted = [...records].sort((a, b) => {
    const ta = new Date(a.created_at || 0).getTime();
    const tb = new Date(b.created_at || 0).getTime();
    if (ta !== tb) return ta - tb;
    // Tie-breaker: richer record wins.
    return fieldWeight(b) - fieldWeight(a);
  });
  return { keeper: sorted[0], duplicates: sorted.slice(1) };
}

function leadWeight(l) {
  let score = 0;
  if (l.phone) score += 2;
  if (l.message) score += 1;
  if (l.project_type) score += 1;
  if (l.full_name) score += 1;
  if (l.billing_address) score += 1;
  if (l.service_address) score += 1;
  if (l.zip_code) score += 1;
  if (Array.isArray(l.image_urls) && l.image_urls.length) score += 2;
  if (l.customer_id) score += 2;
  return score;
}

function customerWeight(c) {
  let score = 0;
  if (c.phone) score += 2;
  if (c.name) score += 1;
  if (c.address) score += 1;
  if (c.notes) score += 1;
  if (parseFloat(c.total_spent || 0) > 0) score += 3;
  if (c.lead_id) score += 2;
  return score;
}

/**
 * Merge a duplicate lead INTO the keeper: concat messages with a separator,
 * keep the newest status that isn't 'new', carry forward richer fields,
 * union image arrays.
 */
function mergeLeadInto(keeper, dup) {
  const merged = { ...keeper };

  // Canonicalize the email now — if legacy data had mixed case, future lookups
  // by lowercased email (which is what new writes use) will hit this row.
  if (merged.email) merged.email = merged.email.trim().toLowerCase();

  // Prefer non-empty values from either side — keeper wins on ties.
  const prefer = (k, d) => (k && String(k).trim()) ? k : d;
  merged.phone = prefer(keeper.phone, dup.phone);
  merged.full_name = prefer(keeper.full_name, dup.full_name);
  merged.first_name = prefer(keeper.first_name, dup.first_name);
  merged.last_name = prefer(keeper.last_name, dup.last_name);
  merged.project_type = prefer(keeper.project_type, dup.project_type);
  merged.zip_code = prefer(keeper.zip_code, dup.zip_code);
  merged.timeline = prefer(keeper.timeline, dup.timeline);
  merged.budget = prefer(keeper.budget, dup.budget);
  merged.billing_address = keeper.billing_address || dup.billing_address;
  merged.service_address = keeper.service_address || dup.service_address;

  // Message history — concatenate with a separator so nothing is lost.
  const parts = [];
  if (keeper.message) parts.push(String(keeper.message));
  if (dup.message && dup.message !== keeper.message) {
    const when = dup.created_at ? ` (from ${dup.created_at})` : '';
    parts.push(`\n---${when}\n${dup.message}`);
  }
  if (parts.length) merged.message = parts.join('');

  // Status: prefer the duplicate's status if it's further along in the funnel.
  const rank = { new: 0, contacted: 1, quoted: 2, scheduled: 3, qualified: 4, won: 5, archived: -1 };
  if ((rank[dup.status] || 0) > (rank[keeper.status] || 0)) {
    merged.status = dup.status;
  }

  // Union image arrays.
  const images = new Set();
  (keeper.image_urls || []).forEach(u => u && images.add(u));
  (dup.image_urls || []).forEach(u => u && images.add(u));
  if (images.size) merged.image_urls = Array.from(images);

  // Carry customer_id if keeper doesn't have one.
  if (!merged.customer_id && dup.customer_id) merged.customer_id = dup.customer_id;

  // Note the merge in raw_data so it's auditable.
  const mergedIds = Array.isArray(keeper.raw_data?._merged_lead_ids)
    ? keeper.raw_data._merged_lead_ids.slice()
    : [];
  mergedIds.push(dup.id);
  merged.raw_data = {
    ...(keeper.raw_data || {}),
    _merged_lead_ids: mergedIds,
    _last_merge_at: new Date().toISOString()
  };
  merged.updated_at = new Date().toISOString();
  return merged;
}

function mergeCustomerInto(keeper, dup) {
  const merged = { ...keeper };
  // Canonicalize email so the merged record is findable with a lowercase lookup.
  if (merged.email) merged.email = merged.email.trim().toLowerCase();

  const prefer = (k, d) => (k && String(k).trim()) ? k : d;
  merged.name = prefer(keeper.name, dup.name);
  merged.phone = prefer(keeper.phone, dup.phone);
  merged.address = prefer(keeper.address, dup.address);
  merged.city = prefer(keeper.city, dup.city);
  merged.state = prefer(keeper.state, dup.state);
  merged.zip = prefer(keeper.zip, dup.zip);

  // Notes — concatenate (likely manual admin notes, don't want to lose them).
  const notes = [];
  if (keeper.notes) notes.push(String(keeper.notes));
  if (dup.notes && dup.notes !== keeper.notes) {
    const when = dup.created_at ? ` (from ${dup.created_at})` : '';
    notes.push(`\n---${when}\n${dup.notes}`);
  }
  if (notes.length) merged.notes = notes.join('');

  // Totals are additive.
  merged.total_spent = (parseFloat(keeper.total_spent || 0) + parseFloat(dup.total_spent || 0)) || 0;
  merged.total_jobs = (parseInt(keeper.total_jobs || 0) + parseInt(dup.total_jobs || 0)) || 0;

  if (!merged.lead_id && dup.lead_id) merged.lead_id = dup.lead_id;

  merged.updated_at = new Date().toISOString();
  return merged;
}

/**
 * GET/POST /api/admin/dedup/leads
 *
 * Finds leads that share a normalized email and merges them.
 * Dry-run by default. Pass ?dry_run=false to apply.
 */
router.post('/leads', adminAccess, async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  const dryRun = String(req.query.dry_run ?? 'true').toLowerCase() !== 'false';

  try {
    // Pull leads in manageable pages. Anything older than 2 years is rare
    // enough to leave alone.
    const cutoff = new Date(Date.now() - 2 * 365 * 24 * 60 * 60 * 1000).toISOString();
    const { data: leads, error } = await supabase
      .from('leads')
      .select('*')
      .gte('created_at', cutoff)
      .limit(10000);

    if (error) throw error;

    // Group by normalized email (ignore leads with no email — they can't be deduped).
    const groups = new Map();
    for (const lead of leads || []) {
      const key = normEmail(lead.email);
      if (!key) continue;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(lead);
    }

    const plan = [];
    for (const [email, records] of groups) {
      if (records.length < 2) continue;
      const { keeper, duplicates } = pickKeeper(records, leadWeight);
      plan.push({
        email,
        keeper_id: keeper.id,
        keeper_created_at: keeper.created_at,
        duplicate_ids: duplicates.map(d => d.id),
        duplicate_count: duplicates.length
      });
    }

    if (dryRun) {
      return res.json({
        dry_run: true,
        groups_with_duplicates: plan.length,
        duplicates_to_merge: plan.reduce((n, g) => n + g.duplicate_count, 0),
        plan
      });
    }

    // Apply: for each group, merge + update keeper, repoint child refs, delete duplicates.
    let mergedGroups = 0;
    let mergedRecords = 0;
    const errors = [];

    for (const [email, records] of groups) {
      if (records.length < 2) continue;
      const { keeper, duplicates } = pickKeeper(records, leadWeight);

      try {
        let currentKeeper = keeper;
        for (const dup of duplicates) {
          currentKeeper = mergeLeadInto(currentKeeper, dup);
        }

        // Update keeper with merged data.
        const { id, created_at, ...updates } = currentKeeper;
        const { error: updErr } = await supabase
          .from('leads')
          .update(updates)
          .eq('id', keeper.id);
        if (updErr) throw updErr;

        // Repoint any child records that reference the duplicate leads.
        // estimates.lead_id, invoices.lead_id, portal_tokens.lead_id, appointments.lead_id
        const dupIds = duplicates.map(d => d.id);
        const childTables = ['estimates', 'invoices', 'portal_tokens', 'appointments', 'calendar_events', 'project_leads'];
        for (const t of childTables) {
          try {
            await supabase.from(t).update({ lead_id: keeper.id }).in('lead_id', dupIds);
          } catch (e) {
            // Table may not exist or may not have lead_id column. Non-fatal.
          }
        }

        // Delete the duplicate leads now that nothing points at them.
        const { error: delErr } = await supabase.from('leads').delete().in('id', dupIds);
        if (delErr) throw delErr;

        mergedGroups += 1;
        mergedRecords += duplicates.length;
      } catch (e) {
        errors.push({ email, error: e.message });
        logger.error('[Dedup/leads] Merge failed', { email, error: e.message });
      }
    }

    return res.json({
      dry_run: false,
      groups_merged: mergedGroups,
      records_merged: mergedRecords,
      errors
    });
  } catch (err) {
    logger.error('[Dedup/leads] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/admin/dedup/customers
 *
 * Groups customers by (user_id, normalized email) and merges dupes.
 * Preserves totals (sums them) so revenue numbers stay accurate.
 */
router.post('/customers', adminAccess, async (req, res) => {
  const supabase = req.app.get('supabase');
  if (!supabase) return res.status(500).json({ error: 'Database not configured' });

  const dryRun = String(req.query.dry_run ?? 'true').toLowerCase() !== 'false';

  try {
    const { data: customers, error } = await supabase
      .from('customers')
      .select('*')
      .limit(10000);

    if (error) throw error;

    const groups = new Map();
    for (const c of customers || []) {
      const email = normEmail(c.email);
      if (!email) continue;
      // Scope by user_id so separate admin tenants don't get merged together.
      const key = `${c.user_id || 'null'}|${email}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }

    const plan = [];
    for (const [key, records] of groups) {
      if (records.length < 2) continue;
      const { keeper, duplicates } = pickKeeper(records, customerWeight);
      plan.push({
        key,
        keeper_id: keeper.id,
        duplicate_ids: duplicates.map(d => d.id),
        duplicate_count: duplicates.length
      });
    }

    if (dryRun) {
      return res.json({
        dry_run: true,
        groups_with_duplicates: plan.length,
        duplicates_to_merge: plan.reduce((n, g) => n + g.duplicate_count, 0),
        plan
      });
    }

    let mergedGroups = 0;
    let mergedRecords = 0;
    const errors = [];

    for (const [key, records] of groups) {
      if (records.length < 2) continue;
      const { keeper, duplicates } = pickKeeper(records, customerWeight);

      try {
        let currentKeeper = keeper;
        for (const dup of duplicates) {
          currentKeeper = mergeCustomerInto(currentKeeper, dup);
        }

        const { id, created_at, ...updates } = currentKeeper;
        const { error: updErr } = await supabase
          .from('customers')
          .update(updates)
          .eq('id', keeper.id);
        if (updErr) throw updErr;

        const dupIds = duplicates.map(d => d.id);
        const childTables = ['leads', 'estimates', 'invoices', 'projects', 'orders', 'appointments', 'calendar_events'];
        for (const t of childTables) {
          try {
            await supabase.from(t).update({ customer_id: keeper.id }).in('customer_id', dupIds);
          } catch (e) {
            // Non-fatal — table may not have customer_id.
          }
        }

        const { error: delErr } = await supabase.from('customers').delete().in('id', dupIds);
        if (delErr) throw delErr;

        mergedGroups += 1;
        mergedRecords += duplicates.length;
      } catch (e) {
        errors.push({ key, error: e.message });
        logger.error('[Dedup/customers] Merge failed', { key, error: e.message });
      }
    }

    return res.json({
      dry_run: false,
      groups_merged: mergedGroups,
      records_merged: mergedRecords,
      errors
    });
  } catch (err) {
    logger.error('[Dedup/customers] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

module.exports = router;
