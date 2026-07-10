#!/usr/bin/env node
/**
 * Backfill primaryColor for catalog slabs so the colour filter works when the
 * storefront reads the full 2,100-product catalog instead of the 619 curated
 * colours. The taxonomy lives in tags ("Primary Color_Gray") but covers ~15%;
 * this derives the rest from the product name.
 *
 * Source of truth order:
 *   1. An existing "Primary Color_X" tag  — hand-curated, never overwritten.
 *   2. A colour word / known series in the NAME — derived, tagged as derived.
 *   3. Unknown — left alone (no guess).
 *
 * Derivation is conservative: a name maps to a colour only via an explicit word
 * or a well-known series (Calacatta -> White). Ambiguous names stay unknown
 * rather than get a wrong colour, because a wrong facet is worse than a missing
 * one — a buyer filtering "White" must not see a black slab.
 *
 * Dry-run by default (prints coverage + samples). --write persists a
 * "Primary Color_X (derived)" tag to catalog_products so build-slabs-json.js and
 * the enrichment pick it up. Chip rows (`<slug>-sample`) are skipped.
 *
 * Usage: NODE_PATH=api/node_modules node scripts/backfill-slab-colors.js [--write]
 */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', 'api', '.env') });
const { createClient } = require('@supabase/supabase-js');

const supa = createClient('https://ypeypgwsycxcagncgdur.supabase.co', process.env.SUPABASE_SERVICE_KEY);

// Colour <- ordered keyword rules. First hit wins, so put specific series before
// generic words (Absolute Black before "black"; Calacatta before anything).
const COLOR_RULES = [
  // NB: "pearl" and "ivory" are intentionally NOT here — "Blue Pearl"/"Black
  // Pearl" are dark, and ivory reads as Beige. Blue/Black/Beige rules below
  // catch those; a bare "Pearl" stays unknown rather than guess White.
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

function deriveColor(name) {
  const n = String(name || '');
  for (const [color, rx] of COLOR_RULES) if (rx.test(n)) return color;
  return '';
}

(async () => {
  const write = process.argv.includes('--write');
  let rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supa.from('catalog_products')
      .select('id, slug, name, tags')
      .eq('category', 'slab').eq('active', true).order('id').range(from, from + 999);
    if (error) throw error;
    rows = rows.concat(data);
    if (data.length < 1000) break;
  }
  rows = rows.filter((r) => !/-sample$/.test(r.slug));

  const stats = { total: rows.length, hadTag: 0, derived: 0, unknown: 0 };
  const dist = {};
  const toWrite = [];
  const samples = { derived: [], unknown: [] };

  for (const r of rows) {
    const existing = tagVal(r.tags, 'Primary Color_');
    if (existing) { stats.hadTag++; dist[existing] = (dist[existing] || 0) + 1; continue; }

    const color = deriveColor(r.name);
    if (color) {
      stats.derived++; dist[color] = (dist[color] || 0) + 1;
      if (samples.derived.length < 12) samples.derived.push(`${r.name} -> ${color}`);
      const tags = Array.isArray(r.tags) ? r.tags.slice() : [];
      tags.push(`Primary Color_${color} (derived)`);
      toWrite.push({ id: r.id, tags });
    } else {
      stats.unknown++;
      if (samples.unknown.length < 12) samples.unknown.push(r.name);
    }
  }

  const pct = (n) => `${Math.round((100 * n) / stats.total)}%`;
  console.log('=== slab colour backfill (products only) ===');
  console.log(`products:            ${stats.total}`);
  console.log(`already tagged:      ${stats.hadTag} (${pct(stats.hadTag)})`);
  console.log(`derived from name:   ${stats.derived} (${pct(stats.derived)})`);
  console.log(`still unknown:       ${stats.unknown} (${pct(stats.unknown)})`);
  console.log(`--> coverage after:  ${pct(stats.hadTag + stats.derived)} (was ${pct(stats.hadTag)})`);
  console.log('\ncolour distribution (tag + derived):');
  Object.entries(dist).sort((a, b) => b[1] - a[1]).forEach(([k, c]) => console.log('   ' + String(c).padStart(4), k));
  console.log('\nsample derivations:');
  samples.derived.forEach((s) => console.log('   ' + s));
  console.log('\nsample still-unknown (need a rule or manual):');
  samples.unknown.forEach((s) => console.log('   ' + s));

  if (!write) { console.log(`\nDRY RUN — ${toWrite.length} rows would get a derived colour tag. Add --write.`); process.exit(0); }

  let i = 0, ok = 0;
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (i < toWrite.length) {
      const row = toWrite[i++];
      const { error } = await supa.from('catalog_products')
        .update({ tags: row.tags, updated_at: new Date().toISOString() }).eq('id', row.id);
      if (!error) ok++;
    }
  }));
  console.log(`\nwrote derived colour tags to ${ok}/${toWrite.length} rows`);
  process.exit(0);
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
