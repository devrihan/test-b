import { STAGES, type StageId } from "../model/dams";
import type { Batch } from "../model/types";

// ── Pure layout geometry (no Pixi, no React) ───────────────────────────────
// Everything visual is derived here so it can be unit-tested without a GPU and
// ported into beaver unchanged. The Pixi layer only DRAWS what these return.

export interface WallDims {
  width: number;
  height: number;
}

/**
 * Display a grade as an ORDINAL: "Class 11" / "11" → "11th". Extracts the first
 * number found; if there's no number, returns the trimmed input unchanged.
 * Ordinal rule: 11/12/13 → "th"; else by last digit (1→st, 2→nd, 3→rd, else th).
 * Only changes DISPLAYED text — underlying keys/data stay as-is.
 */
export function gradeLabel(grade: string): string {
  const m = grade.match(/\d+/);
  if (!m) return grade.trim();
  const n = parseInt(m[0], 10);
  const mod100 = n % 100;
  const mod10 = n % 10;
  const suffix =
    mod100 >= 11 && mod100 <= 13 ? "th" : mod10 === 1 ? "st" : mod10 === 2 ? "nd" : mod10 === 3 ? "rd" : "th";
  return `${n}${suffix}`;
}

const LEFT_PAD = 150; // narrow loading dock (vertical bay labels); parked rafts straddle out onto the water
const RIGHT_PAD = 96; // waterfall zone
const TOP_PAD = 32; // breathing room under the top-center "Filter ▸" pill (dam labels now live mid-river, not here)
const BOTTOM_PAD = 24;
const GROUP_GAP = 12; // vertical gap between (school) groups
// Uniform lane height — every raft is the SAME height regardless of paper count;
// width grows with batch size instead (Fahad's constraint). LANE_MIN === LANE_MAX
// makes clamp() collapse to a constant, so the lane height is fixed.
const LANE_MIN = 50;
const LANE_MAX = 50;
const CAPTION_H = 22; // room below each hull for the raft's 2-line caption

// ── Dam columns ─────────────────────────────────────────────────────────────
// One x per stage, evenly spaced left(intake)→right(done). Dams (gates) are
// drawn at the flow stages; queued is the intake shore, done is the waterfall.

export interface Columns {
  x: Record<StageId, number>;
  damStages: StageId[]; // stages that get a drawn gate (excludes queued/done)
  intakeX: number;
  waterfallX: number;
  laneLeft: number;
  laneRight: number;
}

export function computeColumns(d: WallDims): Columns {
  const usable = Math.max(1, d.width - LEFT_PAD - RIGHT_PAD);
  const step = usable / (STAGES.length - 1);
  const x = {} as Record<StageId, number>;
  STAGES.forEach((s, i) => (x[s] = LEFT_PAD + i * step));
  return {
    x,
    damStages: STAGES.filter((s) => s !== "queued" && s !== "done"),
    intakeX: x["queued"],
    waterfallX: x["done"],
    laneLeft: LEFT_PAD,
    laneRight: d.width - RIGHT_PAD,
  };
}

// ── Swimlanes ───────────────────────────────────────────────────────────────
// Each raft gets its own lane. Lanes are CLUSTERED by school·grade·subject·section
// so the wall reads as structured groups, not a soup of rafts. A small gap
// separates SCHOOL groups (the outermost bay).

export interface Lane {
  batchId: string;
  groupKey: string; // "DPS | 12 | Maths" (school | grade | subject)
  groupFirst: boolean; // first lane of its group
  y: number; // top of the lane band
  height: number;
  zebra: number; // 0/1 for alternating lane tint
}

/** Clean breadcrumb for the left dock: `DPS | 12 | Maths` (school | grade | subject). */
export function groupKeyOf(b: Batch): string {
  return `${b.key.school} | ${gradeLabel(b.key.grade)} | ${b.key.subject}`;
}

/** The fields that DISTINGUISH rafts within a group → compact caption for the
 *  drilled-in detail header, where the bay breadcrumb already supplies context. */
export function raftCaptionOf(b: Batch): string {
  return `${b.key.exam} · ${b.key.section}`;
}

/**
 * Short school CODE for on-raft display: first 4 letters of the school name,
 * uppercased ("Delhi Public School" → "DELH", "DPS" → "DPS").
 *
 * NOTE: this DERIVES the code from the name as a stopgap. Schools should carry an
 * explicit 4-letter school code in their record (see school onboarding); when that
 * lands, read it here instead of slicing the name.
 */
export function schoolCode(school: string): string {
  return school.replace(/[^A-Za-z]/g, "").slice(0, 4).toUpperCase();
}

/** Bare grade NUMBER (no ordinal suffix): "Class 12" → "12". */
export function gradeNumber(grade: string): string {
  const m = grade.match(/\d+/);
  return m ? m[0] : grade.trim();
}

/**
 * The full generated exam name shown on a raft, in the canonical order
 * `{SCHOOL} {grade}-{section} {subject} {exam}` → "DELH 12-A Maths July Unit Test".
 * Mirrors how exam names are generated product-wide ({exam} already carries the
 * exam-type + its index, e.g. "Unit Test 1").
 */
export function raftLabelOf(b: Batch): string {
  const k = b.key;
  return `${schoolCode(k.school)} ${gradeNumber(k.grade)}-${k.section} ${k.subject} ${k.exam}`;
}

/** Sort key that clusters lanes: school → grade → subject → section → exam. */
function sortKey(b: Batch): string {
  const k = b.key;
  return [k.school, k.grade, k.subject, k.section, k.exam].join("¦");
}

export function assignLanes(batches: Batch[], d: WallDims): Lane[] {
  const sorted = [...batches].sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));

  // Group breaks are at the SCHOOL boundary (outermost bay swallows internal gaps).
  const schoolOf = (b: Batch) => b.key.school;

  let groups = 0;
  let prev: string | null = null;
  for (const b of sorted) {
    const g = schoolOf(b);
    if (g !== prev) groups++;
    prev = g;
  }

  // Reserve the dam band: usable vertical space excludes DAM_BAND_H so lanes sit
  // above and below the dam row, never through it (see bandedLanes / drawScene).
  const top = TOP_PAD;
  const bottom = d.height - BOTTOM_PAD;
  const { bandTop, bandBottom } = damBand(top, bottom);
  const avail = Math.max(
    1,
    bottom - top - DAM_BAND_H - Math.max(0, groups - 1) * GROUP_GAP,
  );
  const laneH = clamp(avail / Math.max(1, sorted.length), LANE_MIN, LANE_MAX);

  const lanes: Lane[] = [];
  let y = top;
  prev = null;
  let groupIdx = -1;
  for (const b of sorted) {
    const g = groupKeyOf(b);
    const school = schoolOf(b);
    const first = school !== prev;
    if (first) {
      if (prev !== null) y += GROUP_GAP;
      groupIdx++;
    }
    // jump the cursor past the reserved dam band if this lane would cross it
    if (y < bandBottom && y + laneH > bandTop) y = bandBottom;
    lanes.push({ batchId: b.id, groupKey: g, groupFirst: first, y, height: laneH, zebra: groupIdx % 2 });
    y += laneH;
    prev = school;
  }
  return lanes;
}

// ── Cargo packing ───────────────────────────────────────────────────────────
// FIXED cell size (constant across every raft) so cargo COLOR — the progress
// signal — is comparable everywhere; cells never shrink with bundle count
// (Fahad's constraint). The variable count is absorbed by the raft's WIDTH
// instead: rows are FIXED at 2, and columns grow with the bundle count.

export const CARGO_CELL = 6; // px, square — the same on every raft
export const CARGO_GAP = 1;
export const CARGO_ROWS = 2; // FIXED — every raft is 2 cargo rows tall
const CARGO_PAD = 4; // inner padding between hull edge and cargo grid

export interface CargoGrid {
  cols: number;
  rows: number;
  cell: number;
  gap: number;
}

/**
 * Cargo grid: default 2 rows × ceil(count/2) cols (cell fixed at 6px). If a
 * `maxWidth` budget is given (the space before the next dam), cap the columns so
 * the raft can't overrun the inter-dam span and GROW rows instead — keeps a 35-40
 * paper batch from bleeding across the neighbouring sequence line.
 */
export function cargoLayout(count: number, maxWidth?: number): CargoGrid {
  if (count <= 0) return { cols: 0, rows: 0, cell: CARGO_CELL, gap: CARGO_GAP };
  let rows = Math.min(CARGO_ROWS, count);
  let cols = Math.max(1, Math.ceil(count / CARGO_ROWS));
  if (maxWidth && maxWidth > 0) {
    const maxCols = Math.max(1, Math.floor((maxWidth - CARGO_PAD * 2 + CARGO_GAP) / (CARGO_CELL + CARGO_GAP)));
    if (cols > maxCols) {
      cols = maxCols;
      rows = Math.ceil(count / cols); // wrap into more rows to stay within maxWidth
    }
  }
  return { cols, rows, cell: CARGO_CELL, gap: CARGO_GAP };
}

/** Raft hull width that holds a `cols`-wide cargo grid, clamped to a sane min. */
export function hullWidth(cols: number): number {
  const cargoW = cols * (CARGO_CELL + CARGO_GAP) - CARGO_GAP;
  return Math.max(MIN_RAFT_W, cargoW + CARGO_PAD * 2);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ── Nested loading bays ───────────────────────────────────────────────────────
// Generalized across granularity levels. The wall draws nested CONTIGUOUS vertical
// territories on the left dock for the hierarchy levels ABOVE the current one:
// e.g. at `batches` → school ⊃ grade ⊃ subject; at `grades` → just school.
//
// Each input row is one drawn item (a raft lane, an aggregate container, a
// paper-group) carrying its y/height and the hierarchy LABELS outermost→innermost
// for the levels above it. computeBays accumulates min-top/max-bottom across the
// rows sharing each prefix, so an outer territory SWALLOWS the gaps between its
// children and stays contiguous.

export interface BayRow {
  y: number;
  height: number;
  keys: string[]; // hierarchy labels OUTERMOST→innermost, e.g. ["DPS", "11", "Maths"]
}

export interface Bay {
  key: string; // full path key, e.g. "DPS" / "DPS¦11" / "DPS¦11¦Maths"
  label: string; // the leaf name shown on the box, e.g. "DPS" / "11" / "Maths"
  y: number; // top
  height: number;
  center: number; // y + height/2 — camera pan target
  depth: number; // 0 outermost … — for inset / fill / label styling
}

/**
 * Build nested CONTIGUOUS vertical territories from generic rows. For every prefix
 * of a row's `keys` (depth 0 = outermost) we accumulate the min-top / max-bottom
 * across the rows that share that prefix.
 */
export function computeBays(rows: BayRow[]): Bay[] {
  type Acc = { label: string; top: number; bottom: number; depth: number };
  const order: string[] = []; // preserve first-seen order
  const acc = new Map<string, Acc>();

  const bump = (key: string, label: string, depth: number, top: number, bottom: number) => {
    const cur = acc.get(key);
    if (!cur) {
      order.push(key);
      acc.set(key, { label, top, bottom, depth });
    } else {
      cur.top = Math.min(cur.top, top);
      cur.bottom = Math.max(cur.bottom, bottom);
    }
  };

  for (const r of rows) {
    const top = r.y;
    const bottom = r.y + r.height;
    let path = "";
    r.keys.forEach((k, depth) => {
      path = depth === 0 ? k : `${path}¦${k}`;
      bump(path, k, depth, top, bottom);
    });
  }

  return order.map((key) => {
    const a = acc.get(key)!;
    return {
      key,
      label: a.label,
      y: a.top,
      height: a.bottom - a.top,
      center: a.top + (a.bottom - a.top) / 2,
      depth: a.depth,
    };
  });
}

// ── Reserved dam band ───────────────────────────────────────────────────────
// The dam STRUCTURES are drawn at the vertical MIDDLE of the river. We reserve a
// horizontal band centered on that mid-row so NO item (raft / aggregate container
// / paper-group lane) is ever laid out across the dams. The manual-gate stick
// tangle extends ~±48 vertically, so a band of ±56 (height 112) clears it.
// Shared by every layout path AND drawRaftDetail so they all reserve the SAME
// gap. Helper returns the band's [top, bottom] for a given content [top, bottom].
export const DAM_BAND_H = 112;
export function damBand(top: number, bottom: number): { yMid: number; bandTop: number; bandBottom: number } {
  const yMid = (top + bottom) / 2;
  return { yMid, bandTop: yMid - DAM_BAND_H / 2, bandBottom: yMid + DAM_BAND_H / 2 };
}

/**
 * Lay out `count` uniform lanes into the vertical space [top, bottom] while
 * skipping the reserved dam band, so lanes sit ABOVE and BELOW the dam row but
 * never through it. Usable height = full height − band height; lane height is
 * sized from that. Lanes are placed continuously from `top`; when the next lane
 * would intersect the band, the cursor jumps to `bandBottom` and continues.
 * Returns one `{ y, height }` per lane (uniform height).
 */
export function bandedLanes(
  count: number,
  top: number,
  bottom: number,
  laneMin: number,
  laneMax: number,
): { y: number; height: number }[] {
  const { bandTop, bandBottom } = damBand(top, bottom);
  const usable = Math.max(1, bottom - top - DAM_BAND_H);
  const laneH = clamp(usable / Math.max(1, count), laneMin, laneMax);
  const out: { y: number; height: number }[] = [];
  let y = top;
  for (let i = 0; i < count; i++) {
    // if this lane would cross into the reserved band, jump past it
    if (y < bandBottom && y + laneH > bandTop) y = bandBottom;
    out.push({ y, height: laneH });
    y += laneH;
  }
  return out;
}

export const MIN_RAFT_W = 30; // floor so 1–2-bundle rafts aren't slivers
export const CARGO_INNER_PAD = CARGO_PAD;
export const LANE_CAPTION_H = CAPTION_H;
export const LAYOUT_PADS = { LEFT_PAD, RIGHT_PAD, TOP_PAD, BOTTOM_PAD };

// ── Loading-dock geometry (shared by drawBays + parked-raft placement) ──────
// The dock (LEFT_PAD strip) nests bays inset from the left; the innermost
// (subject) bay is the dock region where queued rafts park before pushing off.
export const DOCK = {
  pad: 6, // dock outer padding
  spineW: 24, // left strip reserved for the rotated school label
  // inset per depth (school/grade/subject) so nested boxes nest visibly
  insets: [0, 24 + 4, 24 + 22] as const,
  labelSizes: [16, 12, 9] as const,
};
/** Left x and width of the innermost (subject) bay interior — the parking dock. */
export function dockInterior(): { x: number; w: number } {
  const inset = DOCK.insets[DOCK.insets.length - 1]!;
  const x = DOCK.pad + inset;
  const w = LEFT_PAD - DOCK.pad * 2 - inset;
  return { x, w };
}
