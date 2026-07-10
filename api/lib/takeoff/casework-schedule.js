/**
 * Casework schedule parser — deterministic, no AI.
 *
 * Commercial architectural sets print casework as a table on the enlarged-plan
 * sheets, one row per cabinet type:
 *
 *   OPERATIONS BUILDING   LABORATORY   16   F2   30" BASE CABINET - 2 DOOR, 2 DRAWER
 *   <building>            <room>     <count> <mark> <description>
 *
 * Those rows live in the PDF text layer. Sending a rasterized JPEG of a 4-foot
 * E-size sheet to a vision model to read a 20-row table is how you get 12 LF of
 * countertop out of a 122 LF building. Read the text instead: the counts and
 * widths are exact, and there is nothing to hallucinate.
 *
 * Input is the layoutText produced by buildLayoutText() on the client — items
 * bucketed into rows by Y and ordered by X, columns separated by 2+ spaces.
 * Drawing text frequently lands in the same Y bucket as a table row, so the row
 * pattern must be able to start mid-line rather than anchoring at ^.
 */

// Column gap is 2+ spaces. Anchor on the strongest signal in the row — a small
// integer count followed by a type mark (F2, F10A, CB-5, DW-1) — and take the
// column before it as the room. A row may be preceded by stray drawing text
// ("2' - 6"  2' - 6"  OPERATIONS BUILDING  LABORATORY  4  F1  36" BASE ..."),
// hence (?:^|\s\s) rather than ^.
//
// The room group must not span a column gap, or it swallows the building-name
// column to its left ("OPERATIONS BUILDING  LABORATORY"). Single spaces only.
const ROOM = `[A-Z][A-Z0-9./'&\\-]*(?: [A-Z0-9./'&\\-]+)*`;
const ROW = new RegExp(
  `(?:^|\\s\\s)\\s*(${ROOM})\\s\\s+(\\d{1,3})\\s\\s+([A-Z]{1,4}-?\\d{0,2}[A-Z]?)\\s\\s+([^\\n]+?)(?=\\s\\s|$)`,
  'gm'
);

// Anything whose description matches these is furniture/appliance, not casework.
// It still gets returned (sink and fume-hood counts drive plumbing scope) but it
// contributes no linear feet.
const EQUIPMENT = /\b(CHAIR|DESK|TABLE|TV|WHITE\s*BOARD|PRINTER|REFRIGERATOR(?!\s+CABINET)|MICROWAVE|DISH\s*WASHER|WASHER|DRYER|ICE\s*MACHINE|COFFEE\s*MACHINE|AIR\s*FRYER|FUME\s*HOOD|MONITOR\s*ARM|TRASH|STORAGE\s*RACK|SHELF|NESTING)\b/;

/** Leading width in inches: `30" BASE CABINET` → 30. `7' X 14" SINGLE SHELF` → null. */
function leadingWidthInches(desc) {
  const m = /^\s*(\d{1,3})\s*"/.exec(desc);
  return m ? parseInt(m[1], 10) : null;
}

function classify(desc) {
  if (/\bBASE\s+SINK\s+CABINET\b/.test(desc)) return 'base';
  if (/\bBASE\s+CABINET\b/.test(desc)) return 'base';
  if (/\bUPPER\b[\w\s]*\bCABINET\b/.test(desc)) return 'upper';
  if (/\bTALL\s+CABINET\b/.test(desc)) return 'tall';
  // "36\" X 20\" X 30\" CABINET" — a freestanding box, carries no countertop.
  if (/\bCABINET\b/.test(desc)) return 'freestanding';
  return 'equipment';
}

/**
 * @param {string} layoutText  Row-preserving text (buildLayoutText output).
 * @param {object} [opts]
 * @param {number} [opts.counterDepthIn=25]  Countertop depth. A-G-008 draws base
 *        cabinets 2'-1" deep; the vision analyzer's CONFIG.defaultDepth is 25.5.
 * @returns {{rooms: Array, totals: object, rows: Array}}
 */
function parseCaseworkSchedules(layoutText, opts = {}) {
  const counterDepthIn = opts.counterDepthIn ?? 25;
  const rows = [];
  let m;
  ROW.lastIndex = 0;
  while ((m = ROW.exec(layoutText)) !== null) {
    const room = m[1].trim();
    const count = parseInt(m[2], 10);
    const mark = m[3].trim();
    const description = m[4].trim();

    // The building-name column sits immediately left of the room; when the regex
    // starts mid-line it can capture it instead. Drop obvious non-rooms.
    if (!description || !count || count > 500) continue;

    const widthIn = leadingWidthInches(description);
    const isEquipment = EQUIPMENT.test(description) && !/\bCABINET\b/.test(description);
    const category = isEquipment ? 'equipment' : classify(description);

    rows.push({
      room, count, mark, description, widthIn, category,
      isSink: /\bSINK\s+CABINET\b/.test(description),
      // Only cabinets with a stated width contribute measurable run.
      linearFt: (category === 'base' || category === 'upper' || category === 'tall') && widthIn
        ? (widthIn * count) / 12
        : 0,
    });
  }

  const byRoom = new Map();
  for (const r of rows) {
    if (!byRoom.has(r.room)) byRoom.set(r.room, { room: r.room, items: [], baseLF: 0, upperLF: 0, tallLF: 0 });
    const g = byRoom.get(r.room);
    g.items.push(r);
    if (r.category === 'base') g.baseLF += r.linearFt;
    else if (r.category === 'upper') g.upperLF += r.linearFt;
    else if (r.category === 'tall') g.tallLF += r.linearFt;
  }

  const rooms = [...byRoom.values()].map(g => ({
    ...g,
    baseLF: round2(g.baseLF),
    upperLF: round2(g.upperLF),
    tallLF: round2(g.tallLF),
    // Countertop sits on the base run. Sink bases carry counter too (the sink is
    // cut out of it), so they are NOT deducted.
    countertopLF: round2(g.baseLF),
    countertopSF: round2(g.baseLF * (counterDepthIn / 12)),
  }));

  const sum = (k) => round2(rooms.reduce((n, r) => n + r[k], 0));
  const countBy = (pred) => rows.filter(pred).reduce((n, r) => n + r.count, 0);

  return {
    rooms,
    rows,
    totals: {
      baseLF: sum('baseLF'),
      upperLF: sum('upperLF'),
      tallLF: sum('tallLF'),
      cabinetLF: round2(sum('baseLF') + sum('upperLF') + sum('tallLF')),
      countertopLF: sum('countertopLF'),
      countertopSF: sum('countertopSF'),
      counterDepthIn,
      sinkCabinets: countBy(r => r.isSink),
      cabinetCount: countBy(r => r.category !== 'equipment'),
      fumeHoods: countBy(r => /FUME\s*HOOD/.test(r.description)),
      dishwashers: countBy(r => /DISH\s*WASHER/.test(r.description)),
    },
  };
}

function round2(n) { return Math.round(n * 100) / 100; }

module.exports = { parseCaseworkSchedules };
