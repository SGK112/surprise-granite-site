#!/usr/bin/env node
/**
 * Build the edge visualizer's stone texture pack.
 *
 * The visualizer paints the slab texture into a 512x512 canvas and hands that canvas to
 * WebGL. Vendor image hosts send no Access-Control-Allow-Origin, so a remote <img> taints
 * the canvas and texImage2D() throws a SecurityError. The textures therefore have to be
 * same-origin: this pulls a curated spread from the live catalog, centre-crops each to a
 * square, downscales to 512px JPEG, and writes them next to the tool with a manifest.
 *
 *   node scripts/build-edge-viz-stones.js [--limit 160]
 */
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const API = 'https://surprise-granite-email-api.onrender.com/api/catalog';
const OUT_DIR = path.join(__dirname, '..', 'tools', 'countertop-edge-visualizer', 'stones');
const MANIFEST = path.join(__dirname, '..', 'tools', 'countertop-edge-visualizer', 'stones.json');
const LIMIT = Number((process.argv.find(a => a.startsWith('--limit')) || '').split('=')[1] ||
  process.argv[process.argv.indexOf('--limit') + 1] || 160);

const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/**
 * primary_image_url is the merchandising hero, which for most vendors is a styled kitchen —
 * useless as a texture and grotesque wrapped onto the 3D slab. Score the gallery for an
 * image that is actually a photograph of the stone.
 */
const GOOD = [
  [/\/images\/bundle\/\d+\/slab\./i, 100],   // materialmatrix full-slab photo
  [/close-?up/i, 95],
  [/\/detalle\/|-thumb\.jpg/i, 90],          // Cosentino detail crop
  [/tablahd|fullslab|full-slab/i, 85],
  [/_slab_|-slab\.|swatch/i, 80],            // Daltile scene7, misc swatches
  [/\/slab-images\//i, 78],                  // Cactus Stone
  [/_full_/i, 70],                           // Caesarstone
];
const BAD = /ns-featured|\/inspiration\/|\bamb\d|ambiente|kitchen|bathroom|vanity|shower|fireplace|room|lifestyle|install|moment|scene/i;

function pickTexture(product) {
  const urls = product.image_urls?.length ? product.image_urls
    : (product.primary_image_url ? [product.primary_image_url] : []);
  let best = null;
  for (const u of urls) {
    if (BAD.test(u)) continue;
    const score = GOOD.reduce((s, [re, v]) => (re.test(u) && v > s ? v : s), 0);
    if (score && (!best || score > best.score)) best = { url: u, score };
  }
  return best?.url || null;   // no stone photo -> skip rather than ship a kitchen as a texture
}

async function fetchAll() {
  const out = [];
  for (let offset = 0; ; offset += 250) {
    const r = await fetch(`${API}?category=slab&limit=250&offset=${offset}`);
    if (!r.ok) throw new Error(`catalog ${r.status}`);
    const j = await r.json();
    out.push(...(j.products || []));
    if (out.length >= (j.total || 0) || !j.products?.length) break;
  }
  return out;
}

/** Round-robin across colour families so the picker opens on a spread, not 40 whites. */
function curate(products, limit) {
  const seen = new Set();
  const buckets = new Map();
  for (const p of products) {
    if (!p.name) continue;
    const tex = pickTexture(p);
    if (!tex) continue;
    const key = slug(p.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    p._tex = tex;
    const fam = p.color_family || 'Other';
    if (!buckets.has(fam)) buckets.set(fam, []);
    buckets.get(fam).push(p);
  }
  const lists = [...buckets.values()];
  const picked = [];
  for (let i = 0; picked.length < limit; i++) {
    let advanced = false;
    for (const l of lists) {
      if (i < l.length) { picked.push(l[i]); advanced = true; }
      if (picked.length >= limit) break;
    }
    if (!advanced) break;
  }
  return picked;
}

/** Centre-crop to a square then resize to 512px JPEG. sips ships with macOS; no deps. */
function toTexture(srcFile, destFile) {
  const dims = execFileSync('sips', ['-g', 'pixelWidth', '-g', 'pixelHeight', srcFile], { encoding: 'utf8' });
  const w = Number(dims.match(/pixelWidth:\s*(\d+)/)?.[1]);
  const h = Number(dims.match(/pixelHeight:\s*(\d+)/)?.[1]);
  if (!w || !h) throw new Error('no dimensions');
  const side = Math.min(w, h);
  execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '72',
    '-c', String(side), String(side), '-z', '512', '512',
    srcFile, '--out', destFile], { stdio: 'ignore' });
}

(async () => {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const all = await fetchAll();
  console.log(`catalog: ${all.length} slabs`);
  const picked = curate(all, LIMIT);
  console.log(`curated: ${picked.length} across ${new Set(picked.map(p => p.color_family || 'Other')).size} colour families`);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'edgeviz-'));
  const manifest = [];
  let failed = 0;

  for (const p of picked) {
    const k = slug(p.name);
    const dest = path.join(OUT_DIR, `${k}.jpg`);
    try {
      if (!fs.existsSync(dest)) {
        const raw = path.join(tmp, k);
        const url = p._tex;
        if (url.startsWith('/')) {
          // Some catalog rows point at images already migrated into this repo.
          const local = path.join(__dirname, '..', decodeURIComponent(url).replace(/^\//, ''));
          if (!fs.existsSync(local)) throw new Error('local image missing');
          fs.copyFileSync(local, raw);
        } else {
          const r = await fetch(url);
          if (!r.ok) throw new Error(`img ${r.status}`);
          fs.writeFileSync(raw, Buffer.from(await r.arrayBuffer()));
        }
        toTexture(raw, dest);
        fs.unlinkSync(raw);
      }
      manifest.push({
        k,
        name: p.name,
        brand: p.brand || null,
        family: p.color_family || 'Other',
        slug: p.slug || null,
        img: `stones/${k}.jpg`,
      });
    } catch (e) {
      failed++;
      console.warn(`  skip ${p.name}: ${e.message}`);
    }
  }
  fs.rmSync(tmp, { recursive: true, force: true });

  manifest.sort((a, b) => a.name.localeCompare(b.name));
  fs.writeFileSync(MANIFEST, JSON.stringify({
    generated: new Date().toISOString(),
    catalog_total: all.length,
    stones: manifest,
  }, null, 1));
  console.log(`wrote ${manifest.length} textures (${failed} failed) -> ${MANIFEST}`);
})();
