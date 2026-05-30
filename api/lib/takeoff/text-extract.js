/*
 * text-extract.js — pull structured takeoff data straight from a plan's
 * embedded PDF text layer. EXACT and free (no vision model), so it runs
 * FIRST; vision is only a fallback for genuinely graphical content.
 *
 * A lot of what a takeoff needs is printed selectable text on the sheets:
 * the room/area schedule (room # + name + SF), and often door/equipment
 * schedules. We parse those deterministically instead of asking a vision
 * model to re-read a downscaled picture of text it can barely see.
 *
 * Verified against the First Watch IFP set (room areas: Dining 1437,
 * Kitchen 1320, Patio 544, etc.).
 */
'use strict';

// Matches "102  DINING  1437 SF" / "104A MEN'S TOILET ROOM 27 SF".
//   group1 = room number (2-3 digits + optional letter)
//   group2 = room name (letters/punct/spaces)
//   group3 = square footage
const ROOM_AREA_RE = /\b(\d{2,3}[A-Z]?)\s+([A-Z][A-Z'/.&\-]+(?:\s+[A-Z'/.&\-]+){0,4})\s+([\d,]{1,6})\s*(?:SF|S\.F\.|SQ\.?\s?FT)\b/g;

// Names that mean this isn't a real room row (totals, notes, etc.).
const NOT_A_ROOM = /\b(EXISTING|BUILDING|TOTAL|LEASABLE|GROSS|SHELL|TENANT|TYP|NOTE|SHEET|TABLE|SEE|REFER)\b/;

function toInt(s) { return parseInt(String(s).replace(/[^\d]/g, ''), 10); }

/**
 * Parse a room/area schedule out of raw page text.
 * @returns {Array<{number:string, name:string, sqft:number}>}
 */
function parseRoomAreas(text) {
  if (!text || typeof text !== 'string') return [];
  const out = [];
  const seen = new Set();
  let m;
  ROOM_AREA_RE.lastIndex = 0;
  while ((m = ROOM_AREA_RE.exec(text)) !== null) {
    const number = m[1].trim();
    const name = m[2].replace(/\s+/g, ' ').trim();
    const sqft = toInt(m[3]);
    if (number === '000') continue;                 // placeholder/total row
    if (name.length < 3 || NOT_A_ROOM.test(name)) continue;
    if (!(sqft > 0 && sqft < 1_000_000)) continue;  // sane area
    const key = number + '|' + name;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ number, name, sqft });
  }
  return out;
}

// Material/finish spec schedule — codes like SS-1 (solid-surface/stone counter),
// PL-1 (plastic laminate), WD-1 (wood/millwork), T-3 (tile). The SPEC is text;
// the QUANTITY is not (must be measured / read off elevations). We extract the
// spec so the estimate prices the right material + flags by-vendor scope.
function categorizeSpec(t) {
  t = (t || '').toLowerCase();
  if (/\b(quartz|corian|granite|marble|quartzite|solid surface)\b/.test(t)) return 'countertop';
  if (/\b(laminate|plam)\b/.test(t)) return 'countertop';
  if (/\b(porcelain|quarry|ceramic|mosaic|tile)\b/.test(t)) return 'tile';
  if (/\b(lvt|lvp|vinyl|hardwood|wood floor|carpet|resilient)\b/.test(t)) return 'flooring';
  if (/\b(banquette|booth|millwork|casework|veneer|\bash\b|\bmdf\b|\boak\b|poplar)\b/.test(t)) return 'millwork';
  return 'other';
}

const SPEC_MATERIAL_WORD = /\b(quartz|corian|granite|marble|laminate|plam|porcelain|quarry|tile|lvt|lvp|vinyl|wood|ash|mdf|oak|countertop|table top|bar top|banquette|booth|desk)\b/i;

// BEST-EFFORT only. Material/finish SPEC schedules are dense multi-column
// tables. When a plan's table extracts to clean per-row text this finds the
// specs (e.g. SS-1 Bar Countertop = Corian Quartz); on busy sheets the browser
// text engine SCRAMBLES the table (cells from different rows/columns interleave)
// and this returns little — those plans need vision on the spec sheet. Quantity
// (LF/SF) is never here; it's measured. Keep newlines, collapse columns, search
// per-line for "<code> <material text>".
const SPEC_GLOBAL_RE = /\b((?:SS|PL|CT|QT|WD|FLR?|WB)-?\d+[a-z]?)\s+([^\n]{3,70}?)(?=\s+(?:SS|PL|CT|QT|WD|FLR?|WB|T|PT|ACT|P)-?\d|\n|$)/gi;

function parseMaterialSpecs(text) {
  if (!text || typeof text !== 'string') return [];
  const flat = text.replace(/[ \t]+/g, ' '); // collapse columns to single spaces, keep rows
  const out = [];
  const seen = new Set();
  let m;
  SPEC_GLOBAL_RE.lastIndex = 0;
  while ((m = SPEC_GLOBAL_RE.exec(flat)) !== null) {
    const spec = m[2].replace(/\s+/g, ' ').trim();
    if (!SPEC_MATERIAL_WORD.test(spec)) continue;
    const category = categorizeSpec(spec);
    if (category === 'other') continue;
    const code = m[1].toUpperCase().replace(/\s/g, '');
    const byVendor = /millwork vendor|by others|by vendor/i.test(spec);
    const key = code + '|' + spec.slice(0, 24).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ code, category, spec, byVendor });
  }
  return out;
}

/**
 * Whole-document text takeoff. Pass the concatenated text of all pages (or
 * one page). Returns rooms + finished-floor total + material specs read from
 * the schedules. `source:'text-layer'` so the UI shows it's real text, not a
 * vision guess. Quantities for counters/cabinets are NOT here — they aren't
 * printed; they come from the measure tool or vision on elevations.
 */
function extractTakeoffFromText(text) {
  const rooms = parseRoomAreas(text);
  const materials = parseMaterialSpecs(text);
  const EXTERIOR = /\b(PATIO|EXTERIOR|SITE|PARKING|ROOF|YARD|DECK)\b/;
  const finishedSqft = rooms
    .filter(r => !EXTERIOR.test(r.name))
    .reduce((s, r) => s + r.sqft, 0);
  return {
    source: 'text-layer',
    rooms,
    roomCount: rooms.length,
    finishedSqft,
    totalSqft: rooms.reduce((s, r) => s + r.sqft, 0),
    materials,
    countertopSpecs: materials.filter(x => x.category === 'countertop'),
  };
}

module.exports = { parseRoomAreas, parseMaterialSpecs, extractTakeoffFromText };
