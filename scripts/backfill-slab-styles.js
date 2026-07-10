#!/usr/bin/env node
/**
 * Backfill the slab "style" facet (veining/pattern) so the browse + swipe style
 * filter fills in. Style rarely shows in a name, so this derives almost entirely
 * from the description, and only when the description uses an explicit qualifier
 * — a generic "veining" with no adjective stays blank rather than guess.
 *
 * Vocabulary matches the existing specs.style values: Dramatic/Moderate/Subtle
 * Veining, No Veining, Grain, Cement/Concrete. Written as a
 * "Countertop Style_X (derived)" tag — the shape js/countertop-filters.js and
 * the swipe normaliser read.
 *
 * Source priority: existing specs.style, then existing "Countertop Style_" tag,
 * then the description. Dry-run by default; --write persists. Idempotent; chip
 * rows excluded.
 *
 * Usage: NODE_PATH=api/node_modules node scripts/backfill-slab-styles.js [--write]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
const { createClient } = require('@supabase/supabase-js');

const supa = createClient('https://ypeypgwsycxcagncgdur.supabase.co', process.env.SUPABASE_SERVICE_KEY);

// Specific qualifiers before generic. Order matters.
const STYLE_RULES = [
  ['Cement/Concrete', /\bcement\b|concrete|industrial look/i],
  ['Grain', /\bgrain\b|speckl|\bfleck|granular|salt.and.pepper|particl|\bmottl/i],
  ['Dramatic Veining', /dramatic|bold vein|bold movement|striking|statement piece|waterfall|heavy vein|high movement|strong vein|thick vein|luxurious vein|prominent vein/i],
  ['Subtle Veining', /subtle|soft vein|delicate|gentle vein|fine vein|light vein|understated|faint|whisper|wispy|soft movement/i],
  ['Moderate Veining', /moderate|medium movement|gentle movement|flowing vein|linear vein|consistent vein|dispersed/i],
  ['No Veining', /solid colou?r|uniform colou?r|consistent colou?r|no vein|without vein|monochromatic|clean and simple/i],
];

const tagVal = (tags, pfx) => {
  const t = (tags || []).find((x) => typeof x === 'string' && x.startsWith(pfx));
  return t ? t.slice(pfx.length).replace(/\s*\(derived\)$/i, '') : '';
};

function deriveStyle(text) {
  const n = String(text || '');
  for (const [style, rx] of STYLE_RULES) if (rx.test(n)) return style;
  return '';
}

(async () => {
  const write = process.argv.includes('--write');
  let rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products')
      .select('id, slug, name, description, specs, tags')
      .eq('category', 'slab').eq('active', true).order('id').range(from, from + 999);
    if (error) throw error;
    rows = rows.concat(data);
    if (data.length < 1000) break;
  }
  rows = rows.filter((r) => !/-sample$/.test(r.slug));

  const stats = { total: rows.length, had: 0, derived: 0, unknown: 0 };
  const dist = {};
  const toWrite = [];

  for (const r of rows) {
    const tagStyle = tagVal(r.tags, 'Countertop Style_');
    if (tagStyle) { stats.had++; dist[tagStyle] = (dist[tagStyle] || 0) + 1; continue; }

    // Migrate an existing specs.style into the tag namespace (the browse API only
    // returns tags, not specs), else derive from description/name.
    const specStyle = r.specs && r.specs.style;
    const style = specStyle || deriveStyle(r.description) || deriveStyle(r.name);
    if (style) {
      if (specStyle) stats.had++; else stats.derived++;
      dist[style] = (dist[style] || 0) + 1;
      const tags = Array.isArray(r.tags) ? r.tags.slice() : [];
      tags.push(`Countertop Style_${style}${specStyle ? '' : ' (derived)'}`);
      toWrite.push({ id: r.id, tags });
    } else {
      stats.unknown++;
    }
  }

  const pct = (n) => `${Math.round((100 * n) / stats.total)}%`;
  console.log('=== slab style backfill (products only) ===');
  console.log(`products:            ${stats.total}`);
  console.log(`already set:         ${stats.had} (${pct(stats.had)})`);
  console.log(`derived:             ${stats.derived}`);
  console.log(`still unknown:       ${stats.unknown} (${pct(stats.unknown)})`);
  console.log(`--> coverage after:  ${pct(stats.had + stats.derived)} (was ${pct(stats.had)})`);
  console.log('\nstyle distribution:');
  Object.entries(dist).sort((a, b) => b[1] - a[1]).forEach(([k, c]) => console.log('   ' + String(c).padStart(4), k));

  if (!write) { console.log(`\nDRY RUN — ${toWrite.length} rows would get a style tag. Add --write.`); process.exit(0); }

  let i = 0, ok = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (i < toWrite.length) {
      const row = toWrite[i++];
      const { error } = await supa.from('catalog_products')
        .update({ tags: row.tags, updated_at: new Date().toISOString() }).eq('id', row.id);
      if (!error) ok++;
    }
  }));
  console.log(`\nwrote style tags to ${ok}/${toWrite.length} rows`);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
