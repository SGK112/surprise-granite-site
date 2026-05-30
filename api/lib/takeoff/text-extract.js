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

/**
 * Whole-document text takeoff. Pass the concatenated text of all pages (or
 * one page). Returns rooms + a finished-floor total (excludes patios/exterior).
 * `source:'text-layer'` so the estimate/UI can show it came from real text,
 * not a vision guess.
 */
function extractTakeoffFromText(text) {
  const rooms = parseRoomAreas(text);
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
  };
}

module.exports = { parseRoomAreas, extractTakeoffFromText };
