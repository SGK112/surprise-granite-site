#!/usr/bin/env node
/**
 * Backfill color_family for catalog slabs so the browse filter and swipe cards
 * can filter by colour across the full 2,100-product catalog.
 *
 * color_family is the canonical column the browse grid (js/countertop-filters.js
 * mapCatalogRow) reads and that build-slabs-json.js now publishes. It covered
 * ~24%; this fills the rest by deriving from the product name, then its
 * description.
 *
 * Source priority (first hit wins, never overwrites a real value):
 *   1. existing color_family              — curated / vendor, kept as-is
 *   2. an existing "Primary Color_X" tag  — from the earlier tag pass
 *   3. a colour word / known series in the NAME
 *   4. the first colour word in the DESCRIPTION (products lead with their own
 *      colour: "Portofino Classico is a white quartz…")
 *
 * Conservative: an explicit colour word or known series only. Ambiguous names
 * with no description stay blank — a wrong facet (a black slab under "White") is
 * worse than a missing one.
 *
 * Dry-run by default. --write persists color_family to catalog_products.
 * Idempotent: rows that already have color_family are skipped. Chip rows
 * (`<slug>-sample`) are excluded.
 *
 * Usage: NODE_PATH=api/node_modules node scripts/backfill-slab-colors.js [--write]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
const { createClient } = require('@supabase/supabase-js');

const supa = createClient('https://ypeypgwsycxcagncgdur.supabase.co', process.env.SUPABASE_SERVICE_KEY);

// Colour <- ordered keyword rules. Specific series before generic words.
const COLOR_RULES = [
  ['White', /calacatt|carrar|carrer|statuario|bianco|blanc|\bwhite\b|\balba\b|glacier|\bsnow\b|alpin|\bpure\b|arctic|\bfrost\b|\bcloud|\bmist\b/i],
  ['Black', /absolute black|\bblack\b|\bnero\b|\bnoir\b|midnight|obsidian|\bjet\b|\bcosmic\b|\braven\b|\bcarbon\b/i],
  ['Gray',  /\bgr[ae]y\b|grigio|concret|cement|\bsilver\b|\bash\b|\bsmoke|pietra|\bsteel\b|\bfog\b|\bstorm\b|charcoal|graphite|\bslate\b|\bpewter\b/i],
  ['Beige', /\bbeige\b|\bcream\b|\btaupe\b|\bsand\b|biscotti|almond|\blatte\b|\bwheat\b|desert|\btan\b|\bivory\b|\bbone\b|\blinen\b/i],
  ['Brown', /\bbrown\b|coffee|espresso|\bmocha\b|walnut|chocolat|\bbronze\b|\bcopper\b|emperador|\bcocoa\b|\bhazel/i],
  ['Gold',  /\bgold\b|giallo|\bamber\b|\bhoney\b|\bbrass\b/i],
  ['Yellow',/\byellow\b|\bsole\b|\bcitrine\b/i],
  ['Blue',  /\bblue\b|\bazul\b|\bazure\b|\bocean\b|cobalt|sapphire|\bnavy\b|\bteal\b/i],
  ['Green', /\bgreen\b|\bverde\b|emerald|\bjade\b|\bsage\b|forest|\bolive\b|malachite/i],
  ['Red',   /\bred\b|\brosso\b|\brojo\b|burgundy|\bruby\b|\bwine\b|\bcoral\b/i],
];

const tagVal = (tags, pfx) => {
  const t = (tags || []).find((x) => typeof x === 'string' && x.startsWith(pfx));
  return t ? t.slice(pfx.length).replace(/\s*\(derived\)$/i, '') : '';
};

function deriveColor(text) {
  const n = String(text || '');
  for (const [color, rx] of COLOR_RULES) if (rx.test(n)) return color;
  return '';
}

(async () => {
  const write = process.argv.includes('--write');
  let rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products')
      .select('id, slug, name, color_family, description, tags')
      .eq('category', 'slab').eq('active', true).order('id').range(from, from + 999);
    if (error) throw error;
    rows = rows.concat(data);
    if (data.length < 1000) break;
  }
  rows = rows.filter((r) => !/-sample$/.test(r.slug));

  const stats = { total: rows.length, had: 0, fromTag: 0, fromName: 0, fromDesc: 0, unknown: 0 };
  const dist = {};
  const toWrite = [];
  const unknownSamples = [];

  for (const r of rows) {
    if (r.color_family) { stats.had++; dist[r.color_family] = (dist[r.color_family] || 0) + 1; continue; }

    let color = tagVal(r.tags, 'Primary Color_');
    if (color) stats.fromTag++;
    if (!color) { color = deriveColor(r.name); if (color) stats.fromName++; }
    // Products lead with their own colour; the first 140 chars avoid trailing
    // "pairs with white cabinets" noise.
    if (!color) { color = deriveColor(String(r.description || '').slice(0, 140)); if (color) stats.fromDesc++; }

    if (color) {
      dist[color] = (dist[color] || 0) + 1;
      toWrite.push({ id: r.id, color_family: color });
    } else {
      stats.unknown++;
      if (unknownSamples.length < 12) unknownSamples.push(r.name);
    }
  }

  const pct = (n) => `${Math.round((100 * n) / stats.total)}%`;
  const covered = stats.had + stats.fromTag + stats.fromName + stats.fromDesc;
  console.log('=== slab color_family backfill (products only) ===');
  console.log(`products:              ${stats.total}`);
  console.log(`already set:           ${stats.had} (${pct(stats.had)})`);
  console.log(`from existing tag:     ${stats.fromTag}`);
  console.log(`derived from name:     ${stats.fromName}`);
  console.log(`derived from desc:     ${stats.fromDesc}`);
  console.log(`still unknown:         ${stats.unknown} (${pct(stats.unknown)})`);
  console.log(`--> coverage after:    ${pct(covered)} (was ${pct(stats.had)})`);
  console.log('\ncolour distribution:');
  Object.entries(dist).sort((a, b) => b[1] - a[1]).forEach(([k, c]) => console.log('   ' + String(c).padStart(4), k));
  console.log('\nstill-unknown samples:');
  unknownSamples.forEach((s) => console.log('   ' + s));

  if (!write) { console.log(`\nDRY RUN — ${toWrite.length} rows would get color_family. Add --write.`); process.exit(0); }

  let i = 0, ok = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (i < toWrite.length) {
      const row = toWrite[i++];
      const { error } = await supa.from('catalog_products')
        .update({ color_family: row.color_family, updated_at: new Date().toISOString() }).eq('id', row.id);
      if (!error) ok++;
    }
  }));
  console.log(`\nwrote color_family to ${ok}/${toWrite.length} rows`);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
