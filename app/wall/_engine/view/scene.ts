import { Container, Graphics, Text } from "pixi.js";
import { STAGE_INDEX, STAGE_LABEL, isHumanGate, type StageId } from "../model/dams";
import type { Batch, Paper } from "../model/types";
import { computeProgress } from "../store/riverStore";
import { COLORS, STAGE_TINT, stageColor } from "./palette";
import {
  assignLanes,
  bandedLanes,
  type Bay,
  cargoLayout,
  CARGO_INNER_PAD,
  type Columns,
  computeBays,
  computeColumns,
  damBand,
  DOCK,
  dockInterior,
  gradeLabel,
  groupKeyOf,
  hullWidth,
  LANE_CAPTION_H,
  LAYOUT_PADS,
  raftCaptionOf,
  raftLabelOf,
  type WallDims,
} from "./layout";
import { orderedBundles } from "./navigation";
import { buildAggregate, type AggContainer, type AggLevel } from "./aggregate";
import type { ViewLevel } from "./navState";

const { TOP_PAD, BOTTOM_PAD, LEFT_PAD } = LAYOUT_PADS;

const DIM_ALPHA = 0.25; // unmatched (filtered-out) items render dimmed, not hidden


// ── Filter predicate (highlight/dim, never hide) ───────────────────────────
// A compact org filter. Empty string = "any". status: "" any, "failed" only
// rafts with a failure, "active" only rafts not yet done.
export interface WallFilter {
  school: string;
  grade: string;
  section: string;
  subject: string;
  exam: string;
  status: "" | "failed" | "active";
  /** free-text search over a batch's identity (school/grade/section/subject/exam/id) */
  search: string;
}

export const EMPTY_FILTER: WallFilter = {
  school: "",
  grade: "",
  section: "",
  subject: "",
  exam: "",
  status: "",
  search: "",
};

export function filterActive(f: WallFilter): boolean {
  return !!(f.school || f.grade || f.section || f.subject || f.exam || f.status || f.search.trim());
}

// Grade filter values are ORDINALS ("11th") coming from the dropdown; normalize
// both sides through gradeLabel so "11th" matches a batch whose key.grade is "11"
// or "Class 11".
const gradeNorm = (g: string) => gradeLabel(g);

/** Does a single batch match the filter? */
export function batchMatches(b: Batch, f: WallFilter): boolean {
  if (f.school && b.key.school !== f.school) return false;
  if (f.grade && gradeNorm(b.key.grade) !== gradeNorm(f.grade)) return false;
  if (f.section && b.key.section !== f.section) return false;
  if (f.subject && b.key.subject !== f.subject) return false;
  if (f.exam && b.key.exam !== f.exam) return false;
  if (f.status) {
    const p = computeProgress(b);
    if (f.status === "failed" && p.failed === 0) return false;
    if (f.status === "active" && p.frontier === "done" && p.straggler === "done") return false;
  }
  const q = f.search.trim().toLowerCase();
  if (q) {
    const hay = `${b.key.school} ${gradeLabel(b.key.grade)} ${b.key.section} ${b.key.subject} ${b.key.exam} ${b.id}`.toLowerCase();
    // every whitespace-separated term must appear (AND) — type "12 pre" → DPSE 12 Preboard…
    if (!q.split(/\s+/).every((t) => hay.includes(t))) return false;
  }
  return true;
}

export interface SceneHandlers {
  onPickRaft: (b: Batch) => void;
  onHoverRaft: (b: Batch | null) => void;
  onPickBundle: (b: Batch, p: Paper) => void;
  onHoverBundle: (b: Batch, p: Paper | null) => void;
  /** Hover on a free-floating paper in the global a-papers view (batch-level
   *  action, since these are overview placeholders without a real student id). */
  onHoverPaper: (b: Batch, p: Paper | null) => void;
  onPickContainer: (id: string) => void;
  onHoverContainer: (c: AggContainer | null) => void;
  onPickBay: (bay: Bay) => void;
  /** Hover a loading bay → highlight every entity inside it, dim the rest (and
   *  fade sibling bays). Passing null clears the highlight. */
  onHoverBay: (bay: Bay | null) => void;
  /** Click a dam → open that stage's review/edit page (bbox_review → pdfExtract,
   *  answer_editing → answerEditing). Batch-agnostic (the whole stage queue). */
  onPickDam: (stage: StageId) => void;
  /** Hover a sequence line (or its HTML label) → glow the line + label. null clears. */
  onHoverDam: (stage: StageId | null) => void;
}

/** What the wall is currently showing (semantic-zoom depth). */
export interface SceneView {
  level: ViewLevel;
  containerId: string | null;
  focusedId: string | null;
  filter: WallFilter;
  /** ¦-joined key of the currently hovered loading bay (e.g. "DPS" / "DPS¦11th¦
   *  Maths"), or null. When set, entities NOT inside this bay render dimmed —
   *  the hover-to-highlight requested for the dock. */
  bayHover?: string | null;
  /** Stage whose sequence line is hovered (from the line OR its HTML label). */
  hoverDam?: StageId | null;
  /** Stage soft-selected by keyboard (L/R after focusing a raft). Glows like hover. */
  stageFocus?: StageId | null;
  /** Batch ids where MORE papers were uploaded than the onboarded roster (too many)
   *  → the raft gets an alarming red outline + "‼". */
  alarmBatchIds?: Set<string>;
}

// ── Bay membership (hover-to-highlight) ─────────────────────────────────────
// A bay's key is the ¦-joined hierarchy prefix the SAME way computeBays builds it
// (school, ORDINAL grade, subject). An item "belongs" to the hovered bay when its
// own prefix equals or descends from the bay key. The "+ ¦" guard stops "DPS"
// from matching a hypothetical "DPSX" — membership is on path segments, not chars.
function bayMatchKey(school: string, gradeRaw: string, subject: string): string {
  return [school, gradeLabel(gradeRaw), subject].join("¦");
}
function inBay(itemKey: string, bayKey: string | null | undefined): boolean {
  if (!bayKey) return true;
  return itemKey === bayKey || itemKey.startsWith(bayKey + "¦");
}

const AGG_LEVELS: ReadonlySet<ViewLevel> = new Set(["schools", "grades", "subjects", "exams"]);
export function isAggLevel(l: ViewLevel): l is AggLevel {
  return AGG_LEVELS.has(l);
}

const label = (text: string, size: number, color: number, weight: "400" | "600" = "400") =>
  new Text({
    text,
    style: { fill: color, fontFamily: "ui-monospace, Menlo, monospace", fontSize: size, fontWeight: weight },
  });

// ── Dam structure ───────────────────────────────────────────────────────────
// A "nice dam" graphic centered at (x, yMid) straddling the gate line: a chunky
// wooden-plank/stone gate block (stacked horizontal planks framed by two piers),
// the short stage name across its face, and the actor chip (creature initial)
// perched on top. Warm wood for human gates, cool stone for compute gates, so the
// beaver-rule colour reading carries over from the old column markers.
// The vertical band the dam STRUCTURE occupies around its center yMid is reserved
// by EVERY layout path so no raft / container / paper-group / bundle-cell ever
// covers a dam. The single source of truth is `DAM_BAND_H` / `damBand()` in
// layout.ts (band ±56 clears the manual-gate stick tangle, which extends ~±48).

// A chewed log (pointed both ends), rotated about (cx,cy). Returns the 6 hull
// points so we can both fill the timber and draw a grain line down its length.
function logPoints(cx: number, cy: number, len: number, thick: number, ang: number): number[] {
  const hl = len / 2;
  const ht = thick / 2;
  const tip = thick * 0.85;
  const raw: [number, number][] = [
    [-hl - tip, 0], [-hl, -ht], [hl, -ht], [hl + tip, 0], [hl, ht], [-hl, ht],
  ];
  const ca = Math.cos(ang);
  const sa = Math.sin(ang);
  return raw.flatMap(([px, py]) => [cx + px * ca - py * sa, cy + px * sa + py * ca]);
}

// Fixed (deterministic) stick tangle + leaf sprigs — kept compact enough to sit
// within the shared reserved dam band (DAM_BAND_H / damBand in layout.ts).
const TANGLE: [number, number, number][] = [
  [-22, -22, 0.5], [28, -20, -0.6], [-34, -6, -0.4], [36, -4, 0.5],
  [-14, 14, 0.7], [22, 16, -0.5], [-36, 22, 0.3], [38, 24, -0.35],
  [0, -28, 0.12], [-6, 28, -0.15], [30, 8, 1.0], [-30, -16, -1.0],
  [14, -12, 0.9], [-18, 26, -0.8],
];
const SPRIGS: [number, number, number][] = [
  [-30, -28, -0.5], [34, -26, 0.6], [42, 4, 0.15], [-42, 16, -0.25], [4, -34, 0.0],
];
const WOOD_TONES = [COLORS.raftHull, COLORS.raftHullEdge, COLORS.raftHi, 0x6e4a26];
const LEAF = 0x6f9a3c;
const LEAF_DK = 0x4f7a2a;

// Two-line stage labels for the HTML Tailwind chips (rendered in RiverWall.tsx).
const DAM_LABEL: Partial<Record<StageId, string>> = {
  upload_scan: "Scan\nUploading",
  answer_chunking: "Ans\nChunking",
  bbox_review: "Chunk\nEditing",
  answer_extraction: "Ans\nExtraction",
  answer_editing: "Ans\nEditing",
  insight_generation: "Insight\nGeneration",
};
/** Display label for a dam's HTML chip (2-line where defined, else the stage name). */
export function damDisplayLabel(s: StageId): string {
  return DAM_LABEL[s] ?? STAGE_LABEL[s];
}

// Horizontal spacing between adjacent dam columns = the width budget a raft has
// before it would reach the next sequence line. Used to cap cargo width so big
// rafts don't overrun the next dam.
const damStepW = (cols: Columns): number => Math.abs(cols.x.answer_chunking - cols.x.upload_scan);

// ── Name STREAMER — a prominent banner trailing from a raft (like a banner behind
// a plane), carrying the batch/aggregate NAME. It streams toward screen CENTRE so
// it never runs off the edge: a raft on the LEFT half flies its streamer to the
// RIGHT (ahead/downstream, anchored at the raft's right edge), a raft on the RIGHT
// half flies it to the LEFT (anchored at the left edge). Drawn into the raft's own
// container so it inherits the raft's alpha + hover hit-area. `anchorRightX` is the
// raft's right edge (= the frontier line); `leftX` its left edge.
const TXT_FONT = "ui-monospace, Menlo, monospace";
function drawStreamer(parent: Container, text: string, leftX: number, anchorRightX: number, midY: number, screenCenterX: number) {
  const onLeftHalf = anchorRightX < screenCenterX;
  const dir: 1 | -1 = onLeftHalf ? 1 : -1; // +1 = stream right, −1 = stream left
  const anchorX = onLeftHalf ? anchorRightX : leftX; // emanate from the centre-facing edge
  const H = 16;
  const notch = 9; // forked-tail depth at the far end
  const t = new Text({ text, style: { fill: 0x3a2a14, fontFamily: TXT_FONT, fontSize: 10, fontWeight: "600" } });
  const len = Math.min(Math.max(56, t.width + 18 + notch), 260);
  const x0 = dir === 1 ? anchorX : anchorX - len; // left end of the ribbon box
  const x1 = dir === 1 ? anchorX + len : anchorX; // right end
  const y0 = midY - H / 2;

  const ribbon = new Graphics();
  ribbon.rect(anchorX - 1, midY - H, 2, H * 2).fill(0x6e4a26); // short flagpole at the raft
  // parchment ribbon with a forked (notched) tail at the FAR end (away from the raft)
  if (dir === 1) {
    ribbon.poly([x0, y0, x1, y0, x1 - notch, midY, x1, y0 + H, x0, y0 + H]).fill(0xf3ead6).stroke({ width: 1, color: 0xc7b48f });
  } else {
    ribbon.poly([x1, y0, x0, y0, x0 + notch, midY, x0, y0 + H, x1, y0 + H]).fill(0xf3ead6).stroke({ width: 1, color: 0xc7b48f });
  }
  parent.addChild(ribbon);

  // centre the name in the solid part (excluding the forked tail)
  t.anchor.set(0.5);
  t.x = dir === 1 ? (x0 + (x1 - notch)) / 2 : ((x0 + notch) + x1) / 2;
  t.y = midY;
  parent.addChild(t);
}

// The dam STRUCTURE is now just the beaver-tangle (chewed sticks + leaf sprigs) on
// MANUAL gates — the plaque/label/emoji moved to an HTML Tailwind chip, and the
// gate line is drawn separately. Auto gates draw nothing here (line + chip only).
function drawDamStructure(scene: Container, s: StageId, x: number, yMid: number) {
  if (!isHumanGate(s)) return;
  const spread = 1.4; // fixed (no plaque width to derive from)

  const sticks = new Graphics();
  TANGLE.forEach(([dx, dy, ang], i) => {
    const pts = logPoints(x + dx * spread, yMid + dy, 64, 10, ang);
    sticks.poly(pts).fill(WOOD_TONES[i % WOOD_TONES.length]!).stroke({ width: 1.5, color: 0x3f2c19 });
  });
  scene.addChild(sticks);

  const leaves = new Graphics();
  SPRIGS.forEach(([dx, dy, ang], i) => {
    const lx = x + dx * spread;
    const ly = yMid + dy;
    const twig = logPoints(lx, ly, 14, 3, ang);
    leaves.poly(twig).fill(0x5b4126);
    const c = i % 2 ? LEAF_DK : LEAF;
    leaves.ellipse(lx + Math.cos(ang) * 6, ly + Math.sin(ang) * 6 - 3, 5, 3).fill(c).stroke({ width: 1, color: 0x3c5e20 });
    leaves.ellipse(lx + Math.cos(ang) * 6 + 4, ly + Math.sin(ang) * 6 + 2, 4, 2.5).fill(c).stroke({ width: 1, color: 0x3c5e20 });
  });
  scene.addChild(leaves);
}

/**
 * FIXED dam spine — drawn in SCREEN space into a container that sits ON TOP of the
 * scrolling world. Each gate's full-viewport-height line + (manual gates) the beaver
 * tangle, positioned at the dam's x PROJECTED through the camera (so they track
 * horizontal pan/zoom) but FIXED in y (always span the screen; never cut off by a
 * tall river). The HTML label chips (RiverWall) sit in a fixed middle band over this.
 * A line glows (wider/brighter/halo) when its line OR its HTML chip is hovered, or
 * the stage is keyboard-soft-selected. Redrawn only when the camera moves / glow
 * changes / on resize (see RiverWall ticker).
 */
export function drawDamSpine(
  spine: Container,
  cols: Columns,
  camX: number,
  camZoom: number,
  screenW: number,
  screenH: number,
  glowStage: StageId | null,
  h: SceneHandlers,
) {
  for (const c of spine.removeChildren()) c.destroy({ children: true });
  const projX = (wx: number) => screenW / 2 + (wx - camX) * camZoom;
  for (const s of cols.damStages) {
    const x = projX(cols.x[s]);
    const on = s === glowStage;
    const line = new Graphics();
    line.rect(x - 9, 0, 18, screenH).fill({ color: 0xffffff, alpha: 0.001 }); // wide hit strip
    if (on) line.rect(x - 7, 0, 14, screenH).fill({ color: STAGE_TINT[s], alpha: 0.22 }); // halo
    line.rect(x - (on ? 3 : 2), 0, on ? 6 : 4, screenH).fill({ color: STAGE_TINT[s], alpha: on ? 1 : 0.85 });
    line.eventMode = "static";
    line.cursor = "pointer";
    line.on("pointerover", () => h.onHoverDam(s));
    line.on("pointerout", () => h.onHoverDam(null));
    line.on("pointertap", () => h.onPickDam(s));
    spine.addChild(line);
    // beaver tangle on MANUAL gates, centred in the fixed middle band (where the
    // HTML chip sits) so the dam graphic is "around" the label.
    if (isHumanGate(s)) drawDamStructure(spine, s, x, screenH / 2);
  }
}

/**
 * Rebuild the whole scene graph from the current batches. Step 2 is STATIC: we
 * clear and redraw on change rather than diffing — cheap at ~tens of rafts, and
 * keeps the draw code a pure function of state. Motion/diffing come later.
 */
export function drawScene(scene: Container, batches: Batch[], d: WallDims, h: SceneHandlers, view: SceneView) {
  for (const c of scene.removeChildren()) c.destroy({ children: true });

  const cols = computeColumns(d);
  const top = TOP_PAD;
  const bottom = d.height - BOTTOM_PAD;
  const focusedId = view.focusedId;
  const filter = view.filter;
  const fActive = filterActive(filter);

  // ── 1. backdrop: shore · river band · waterfall ──────────────────────────
  const bg = new Graphics();
  // The water reads EDGE-TO-EDGE: shore / river / waterfall fill the FULL viewport
  // height (0 → d.height), and the base bg fill is the river colour too, so there
  // are no lighter sky margins above/below. Content padding (TOP_PAD/BOTTOM_PAD)
  // still governs where lanes/dams sit, but the water fills the whole screen. The
  // old top/bottom bank-edge lines are dropped so nothing cuts across mid-water.
  bg.rect(0, 0, d.width, d.height).fill(COLORS.river); // base = river (no sky margins)
  bg.rect(0, 0, cols.laneLeft, d.height).fill(COLORS.shore); // left intake shore / dock
  bg.rect(cols.intakeX, 0, cols.waterfallX - cols.intakeX, d.height).fill(COLORS.river);
  // waterfall zone (right) — full height
  bg.rect(cols.waterfallX, 0, d.width - cols.waterfallX, d.height).fill(COLORS.riverEdge);
  for (let yy = 0; yy < d.height; yy += 6) bg.rect(cols.waterfallX, yy, d.width - cols.waterfallX, 3).fill(COLORS.waterfall);
  scene.addChild(bg);

  // ── 2. dam spine moved OUT of the scrolling scene ────────────────────────
  // The gate lines + dam structures + their HTML label chips are now a FIXED
  // screen-space overlay (drawDamSpine, below + the HTML band in RiverWall) so the
  // lines always span the full viewport (never cut off when the river is tall) and
  // the labels sit in a fixed middle band with the dam graphic around them. The
  // river content (rafts/bays) scrolls BEHIND that fixed spine.

  // ── 3a. drilled into a raft → render its bundles across the same dams ─────
  if (view.level === "raft" && view.containerId) {
    const container = batches.find((b) => b.id === view.containerId);
    if (container) {
      drawRaftDetail(scene, container, cols, top, bottom, focusedId, h);
      return;
    }
    // container retired/gone → fall through to batches
  }

  // ── 3a′. global a-papers view ────────────────────────────────────────────
  if (view.level === "papers") {
    drawAllPapers(scene, batches, cols, top, bottom, focusedId, h, filter, fActive);
    return;
  }

  // ── 3a″. aggregate levels (zoom out): schools / grades / subjects / exams ─
  if (isAggLevel(view.level)) {
    drawAggregate(scene, buildAggregate(batches, view.level), view.level, cols, top, bottom, focusedId, h, filter, fActive, view.bayHover, d.width / 2);
    return;
  }

  // ── 3b. batches: nested loading bays + rafts ─────────────────────────────
  const lanes = assignLanes(batches, d);
  const byId = new Map(batches.map((b) => [b.id, b]));

  // bays at the batches level: rows = lanes; keys = [school, grade, subject]
  drawBays(
    scene,
    computeBays(
      lanes.flatMap((lane) => {
        const b = byId.get(lane.batchId);
        if (!b) return [];
        return [{ y: lane.y, height: lane.height, keys: [b.key.school, gradeLabel(b.key.grade), b.key.subject] }];
      }),
    ),
    h,
    view.bayHover,
  );

  for (const lane of lanes) {
    const b = byId.get(lane.batchId);
    if (!b) continue;
    const p = computeProgress(b);
    const dimByBay = !inBay(bayMatchKey(b.key.school, b.key.grade, b.key.subject), view.bayHover);
    const dim = (fActive && !batchMatches(b, filter)) || dimByBay;
    const itemAlpha = dim ? DIM_ALPHA : 1;

    // PARKED at the dock: work hasn't begun (frontier still "queued" — uploads not
    // started). These rafts wait inside their subject bay (the dock interior) on
    // the LEFT, compact, instead of mooring out in the river. They "push off" into
    // the river only once their frontier advances past "queued".
    if (p.frontier === "queued") {
      drawParkedRaft(scene, b, lane.y, lane.height, focusedId, h, cols.intakeX, itemAlpha);
      continue;
    }

    // The lane splits into a hull region (top) and a caption region (bottom).
    const hullBandH = lane.height - LANE_CAPTION_H;
    const frontierX = cols.x[p.frontier];
    const stragglerX = cols.x[p.straggler];

    const pad = 3;
    const hullY = lane.y + pad;
    const hullH = hullBandH - pad * 2;
    const midY = hullY + hullH / 2;

    // Cargo layout drives the hull WIDTH from the batch's CAPACITY (total papers),
    // not the count loaded so far — so the raft is a fixed size for its whole life
    // and scanning FILLS it rather than growing it. Width scales with capacity but
    // is CAPPED to ~85% of the inter-dam span so a 35-40 paper raft wraps into more
    // rows instead of overrunning the next sequence line.
    const grid = cargoLayout(b.paperCount, damStepW(cols) * 0.85);
    const hullW = hullWidth(grid.cols);
    // A raft only CLEARS a stage once ALL its papers have, so it moors at the
    // STRAGGLER (slowest paper's stage), right edge on that line — it can't take off
    // from a stage while any paper still sits there (Fahad). The papers that have
    // raced ahead show as a forward lead line to the frontier.
    const moorX = stragglerX;
    const hullX = moorX - hullW;

    // forward lead line: the most-advanced papers reach ahead to the frontier
    if (frontierX > moorX + 1) {
      const lead = new Graphics();
      lead.moveTo(moorX, midY).lineTo(frontierX, midY).stroke({ width: 1, color: COLORS.tail, alpha: 0.7 });
      lead.circle(frontierX, midY, 2).fill(COLORS.tail);
      lead.alpha = itemAlpha;
      scene.addChild(lead);
    }

    // raft container (interactive)
    const raft = new Container();
    raft.alpha = itemAlpha;
    raft.eventMode = "static";
    raft.cursor = "pointer";
    raft.on("pointertap", () => h.onPickRaft(b));
    raft.on("pointerover", () => h.onHoverRaft(b));
    raft.on("pointerout", () => h.onHoverRaft(null));

    // ALARM: more papers uploaded than the onboarded roster → something's seriously
    // wrong. For now: the whole hull outline goes alarming red + a prominent "‼".
    // (Enhancement backlog: the raft SINKS + its bundle-squares float around it.)
    const alarm = view.alarmBatchIds?.has(b.id) ?? false;
    const hull = new Graphics();
    hull.roundRect(hullX, hullY, hullW, hullH, 3)
      .fill(COLORS.raftHull)
      .stroke({ width: alarm ? 3 : 1, color: alarm ? 0xd62828 : COLORS.raftHullEdge });
    hull.rect(hullX, hullY, hullW, 2).fill(COLORS.raftHi);
    raft.addChild(hull);
    if (alarm) {
      const bang = new Text({
        text: "‼",
        style: { fill: 0xd62828, fontFamily: TXT_FONT, fontSize: 22, fontWeight: "700" },
      });
      bang.anchor.set(0.5, 1);
      bang.x = hullX + hullW / 2;
      bang.y = hullY - 2;
      raft.addChild(bang);
    }

    // cargo: one FIXED-size cell per CAPACITY slot.
    if (b.paperCount > 0) {
      const cargoH = grid.rows * (grid.cell + grid.gap) - grid.gap;
      const boxX = hullX + CARGO_INNER_PAD;
      const boxY = hullY + (hullH - cargoH) / 2;
      const cargo = new Graphics();
      for (let i = 0; i < b.paperCount; i++) {
        const r = Math.floor(i / grid.cols);
        const c = i % grid.cols;
        const cx = boxX + c * (grid.cell + grid.gap);
        const cy = boxY + r * (grid.cell + grid.gap);
        const paper = b.papers[i];
        if (!paper) {
          cargo.roundRect(cx, cy, grid.cell, grid.cell, 1).fill(COLORS.cargoEmpty); // empty capacity slot
        } else {
          // On the raft, cargo is the FULLY-coloured cell — the whole cell is the
          // stage colour so the batch's stage distribution reads at a glance (more
          // informative at this size than a cream card). failed → red; processing →
          // a small amber corner so "actively working" still pops.
          const failed = paper.status === "failed";
          cargo.roundRect(cx, cy, grid.cell, grid.cell, 1).fill(failed ? COLORS.failed : stageColor(paper.stage));
          if (paper.status === "processing") cargo.rect(cx, cy, grid.cell, 2).fill(0xe0a020); // amber top band = in progress
        }
      }
      raft.addChild(cargo);
    }

    // batch name on a prominent STREAMER flying from the raft toward screen centre.
    drawStreamer(raft, raftLabelOf(b), hullX, moorX, midY, d.width / 2);

    // keyboard focus ring
    if (b.id === focusedId) {
      const ring = new Graphics();
      ring.roundRect(hullX - 3, hullY - 3, hullW + 6, hullH + 6, 4).stroke({ width: 2, color: COLORS.focusRing });
      raft.addChild(ring);
    }

    // failed flag
    if (p.failed > 0) {
      const flag = new Graphics();
      const fx = hullX + hullW - 4;
      const fy = hullY - 1;
      flag.rect(fx, fy - 12, 1.5, 14).fill(COLORS.flagPole);
      flag.poly([fx + 1.5, fy - 12, fx + 12, fy - 8, fx + 1.5, fy - 4]).fill(COLORS.flag);
      raft.addChild(flag);
    }

    scene.addChild(raft);
  }
}

// ── Nested loading bays (left dock) ─────────────────────────────────────────
// Neat nested CONTIGUOUS "loading bays" on the left dock for the hierarchy levels
// ABOVE the current granularity. Outermost (e.g. school) ⊃ … ⊃ innermost. Depth 0
// is drawn first/back (faintest, widest); inner depths nest on top, each inset
// from the left so all three labels are readable side-by-side.
//
// ALL three depths now label VERTICALLY (rotated 90°) along the LEFT SPINE of
// their nested region, freeing the bay's horizontal interior for parked rafts.
// Each box is pickable → center-on-rafts (no zoom).
function drawBays(scene: Container, bays: Bay[], h: SceneHandlers, bayHover?: string | null) {
  if (bays.length === 0) return;
  const PAD = DOCK.pad;
  const dockW = LEFT_PAD - PAD * 2;
  // Depth-tinted fills: outer faintest, inner slightly stronger. Alpha climbs with
  // depth so nested territories read as progressively "more solid" loading bays.
  const fills = [COLORS.baySchool, COLORS.bayGrade, COLORS.baySubject];
  const alphas = [0.55, 0.7, 0.85];
  const insets = DOCK.insets;
  const labelSizes = DOCK.labelSizes;
  // width of the rotated-label spine reserved at the LEFT edge of each depth's box
  const spineWByDepth = [DOCK.spineW, 16, 14];

  // draw outer→inner so inner territories sit on top of their parents
  const ordered = [...bays].sort((a, b) => a.depth - b.depth);

  for (const bay of ordered) {
    const inset = insets[bay.depth] ?? insets[insets.length - 1]!;
    const x = PAD + inset;
    const w = dockW - inset;
    // Hover-to-highlight: a bay stays bright if it's the hovered one, an ANCESTOR
    // of it, or a DESCENDANT; unrelated sibling bays fade with the rest.
    const related = inBay(bay.key, bayHover) || inBay(bayHover ?? "", bay.key);
    const box = new Container();
    box.alpha = related ? 1 : DIM_ALPHA;
    box.eventMode = "static";
    box.cursor = "pointer";
    box.on("pointertap", () => h.onPickBay(bay));
    box.on("pointerover", () => h.onHoverBay(bay));
    box.on("pointerout", () => h.onHoverBay(null));

    const g = new Graphics();
    g.roundRect(x, bay.y + 1, w, bay.height - 2, 4)
      .fill({ color: fills[bay.depth] ?? COLORS.baySubject, alpha: alphas[bay.depth] ?? 0.85 })
      .stroke({ width: 1, color: COLORS.bayBorder });
    box.addChild(g);

    // VERTICAL label, pinned to the TOP of this bay's region so it stays visible
    // when a tall bay is scrolled. Reads top→down the left spine (rotation +90°,
    // anchored at the text's START), starting just under the bay's top edge.
    const size = labelSizes[Math.min(bay.depth, labelSizes.length - 1)]!;
    const weight: "400" | "600" = bay.depth <= 1 ? "600" : "400";
    const spineW = spineWByDepth[Math.min(bay.depth, spineWByDepth.length - 1)]!;
    const lbl = label(bay.label, size, COLORS.bayLabel, weight);
    lbl.rotation = Math.PI / 2;
    lbl.anchor.set(0, 0.5);
    lbl.x = x + spineW / 2;
    lbl.y = bay.y + 8;
    box.addChild(lbl);

    scene.addChild(box);
  }
}

// ── Parked raft (waiting at the dock) ───────────────────────────────────────
// A queued raft that hasn't pushed off yet — uploads haven't begun, so there is
// no cargo progress. Rendered as a REAL (small) empty raft so it looks just like
// it will once it moors in the river, only empty: the same wood hull + fixed
// 2-row cargo grid (cargoLayout/hullWidth), but every cargo cell is an EMPTY
// recessed bay (cargoEmpty). It sits inside its subject bay's dock interior,
// starting to the RIGHT of the rotated subject-label spine (so it never covers
// the "Science"/subject label), vertically centered in its lane. If the empty
// grid is wider than the dock interior, the whole raft is scaled down to fit.
// Still pickable/hoverable like a moored raft.
function drawParkedRaft(
  scene: Container,
  b: Batch,
  laneY: number,
  laneH: number,
  focusedId: string | null,
  h: SceneHandlers,
  intakeX: number,
  itemAlpha: number,
) {
  const dock = dockInterior();
  // The subject (innermost) bay reserves a rotated-label spine on its left edge;
  // keep the raft's left edge to the RIGHT of it so it never covers the label.
  const SUBJECT_SPINE_W = 14; // matches drawBays' spineWByDepth for depth 2
  const innerPad = 4;
  const minLeft = dock.x + SUBJECT_SPINE_W + innerPad;

  // Same hull + 2-row cargo grid a normal overview raft uses, sized from CAPACITY.
  const grid = cargoLayout(b.paperCount);
  const hullW = hullWidth(grid.cols);
  const cargoH = grid.rows > 0 ? grid.rows * (grid.cell + grid.gap) - grid.gap : 0;
  const hullH = Math.max(12, cargoH + CARGO_INNER_PAD * 2);

  // Height-only fit (never scale up). The raft is allowed to extend onto the
  // WATER — it parks straddling the dock edge, ~half on the river ("pushing off").
  const fit = Math.min(1, (laneH - 6) / hullH);

  const raft = new Container();
  raft.alpha = itemAlpha;
  raft.eventMode = "static";
  raft.cursor = "pointer";
  raft.on("pointertap", () => h.onPickRaft(b));
  raft.on("pointerover", () => h.onHoverRaft(b));
  raft.on("pointerout", () => h.onHoverRaft(null));

  // Draw the raft at origin (0,0), then position+scale the container so the empty
  // grid stays crisp under clamping. Anchored left of its dock interior.
  const hull = new Graphics();
  hull.roundRect(0, 0, hullW, hullH, 3).fill(COLORS.raftHull).stroke({ width: 1, color: COLORS.raftHullEdge });
  hull.rect(0, 0, hullW, 2).fill(COLORS.raftHi);
  raft.addChild(hull);

  // cargo: one EMPTY recessed bay per CAPACITY slot (no papers uploaded yet)
  if (b.paperCount > 0) {
    const boxX = CARGO_INNER_PAD;
    const boxY = (hullH - cargoH) / 2;
    const cargo = new Graphics();
    for (let i = 0; i < b.paperCount; i++) {
      const r = Math.floor(i / grid.cols);
      const c = i % grid.cols;
      const cx = boxX + c * (grid.cell + grid.gap);
      const cy = boxY + r * (grid.cell + grid.gap);
      cargo.rect(cx, cy, grid.cell, grid.cell).fill(COLORS.cargoEmpty);
    }
    raft.addChild(cargo);
  }

  if (b.id === focusedId) {
    const ring = new Graphics();
    ring.roundRect(-3, -3, hullW + 6, hullH + 6, 4).stroke({ width: 2, color: COLORS.focusRing });
    raft.addChild(ring);
  }

  const scaledW = hullW * fit;
  raft.scale.set(fit);
  // Straddle the dock→water boundary so ~half sits on the river; clamp the left
  // edge so it never slides over the subject label spine.
  raft.x = Math.max(minLeft, intakeX - scaledW * 0.5);
  raft.y = laneY + (laneH - hullH * fit) / 2;
  scene.addChild(raft);

  // full generated exam name below the little raft, unscaled so it stays readable.
  const cap = label(raftLabelOf(b), 8, COLORS.caption);
  cap.anchor.set(0, 0);
  cap.x = raft.x;
  cap.y = raft.y + hullH * fit + 1;
  cap.alpha = itemAlpha;
  scene.addChild(cap);
}

// Derive a bay-hierarchy key array (outermost→innermost) for an aggregate
// container or paper-group from its ¦-joined id (`school¦grade¦subject¦exam`),
// taking only the levels ABOVE the given count. e.g. count=3 → [school, grade, subject].
function bayKeysFromId(id: string, count: number): string[] {
  const parts = id.split("¦");
  const keys: string[] = [];
  if (count >= 1 && parts[0] != null) keys.push(parts[0]); // school
  if (count >= 2 && parts[1] != null) keys.push(gradeLabel(parts[1])); // grade (ordinal)
  if (count >= 3 && parts[2] != null) keys.push(parts[2]); // subject
  return keys;
}

// ── Raft detail (drilled-in / bundle level) ─────────────────────────────────
function drawRaftDetail(
  scene: Container,
  b: Batch,
  cols: Columns,
  top: number,
  bottom: number,
  focusedId: string | null,
  h: SceneHandlers,
) {
  // headers live in the top-left corner (the centered filter pill owns top-center)
  const header = label(`▸ Inside  ${groupKeyOf(b)}  ·  ${raftCaptionOf(b)}`, 12, COLORS.caption, "600");
  header.x = 12;
  header.y = 8;
  scene.addChild(header);
  const exit = label(`${b.papers.length}/${b.paperCount} papers loaded   ·   Esc ↩ batches`, 10, COLORS.textDim);
  exit.x = 12;
  exit.y = 24;
  scene.addChild(exit);

  // bucket papers by stage → each dam holds that stage's queue of papers
  const byStage = new Map<StageId, Paper[]>();
  for (const p of orderedBundles(b)) {
    const arr = byStage.get(p.stage) ?? [];
    arr.push(p);
    byStage.set(p.stage, arr);
  }

  const CELL = 22;
  const GAP = 6;
  const ROWP = CELL + GAP + 2; // row pitch: cell + gap (no name line now)
  const COLP = CELL + GAP; // column pitch

  // RESERVE the vertical band the dam STRUCTURE occupies (its block + label +
  // actor chip, centered at midRiver) so paper cells never cover the dam label.
  // Cells stack in the region ABOVE the band first, then continue in the region
  // BELOW it, leaving a clear gap where the dam sits.
  const { bandTop, bandBottom } = damBand(top, bottom);

  const topRegionTop = top + 8;
  const botRegionBottom = bottom - 8;
  const aboveH = Math.max(0, bandTop - topRegionTop);
  const belowH = Math.max(0, botRegionBottom - bandBottom);

  const rowsFor = (hgt: number) => Math.max(0, Math.floor((hgt + GAP) / ROWP));
  const rowsAbove = rowsFor(aboveH);
  const rowsBelow = rowsFor(belowH);
  // Fallback to at least 1 row/col so we always draw something even if (degenerately)
  // neither region fits a row.
  const rowsPerCol = Math.max(1, rowsAbove + rowsBelow);

  for (const [stage, papers] of byStage) {
    const x = cols.x[stage];
    const gridCols = Math.max(1, Math.ceil(papers.length / rowsPerCol));
    const gridW = gridCols * COLP - (COLP - CELL);
    const x0 = x - gridW / 2;

    // ABOVE region: cells anchored so the column BOTTOM sits just above the band
    // (grow upward away from the dam). BELOW region: anchored just under the band
    // (grow downward). Each column holds rowsAbove cells, then rowsBelow cells.
    const aboveBlockH = rowsAbove > 0 ? rowsAbove * ROWP - GAP : 0;
    const aboveY0 = bandTop - GAP - aboveBlockH; // top of the above-band stack
    const belowY0 = bandBottom + GAP; // top of the below-band stack

    papers.forEach((p, i) => {
      const c = Math.floor(i / rowsPerCol); // column-major → vertical queue at the dam
      const rInCol = i % rowsPerCol;
      const cx = x0 + c * COLP;
      const cy = rInCol < rowsAbove
        ? aboveY0 + rInCol * ROWP
        : belowY0 + (rInCol - rowsAbove) * ROWP;
      // full-colour cell (NOT the cream card) — drilled-in is "inside a batch", not
      // the a-papers level, so it reads by colour like the rest; roll on the cell,
      // name on hover.
      drawColourCell(scene, p, cx, cy, CELL, {
        tap: () => h.onPickBundle(b, p),
        over: () => h.onHoverBundle(b, p),
        out: () => h.onHoverBundle(b, null),
      }, p.id === focusedId);
    });
  }
}

// ── Aggregate level (zoom out): schools / grades / subjects / exams ─────────
function drawAggregate(
  scene: Container,
  containers: AggContainer[],
  level: AggLevel,
  cols: Columns,
  top: number,
  bottom: number,
  focusedId: string | null,
  h: SceneHandlers,
  filter: WallFilter,
  fActive: boolean,
  bayHover?: string | null,
  screenCenterX = 0,
) {
  const hdr = label(`▾ ${level}  —  ${containers.length}`, 12, COLORS.caption, "600");
  hdr.x = 12;
  hdr.y = 8;
  scene.addChild(hdr);

  // Lay lanes out skipping the reserved dam band (above + below the dam row).
  const lanes = bandedLanes(containers.length, top, bottom, 30, 66);

  // nested loading bays for the levels ABOVE this one:
  //   grades → [school]; subjects → [school, grade]; exams → [school, grade, subject]
  //   schools → none (top level).
  const bayKeyCount: Record<AggLevel, number> = { schools: 0, grades: 1, subjects: 2, exams: 3 };
  const keyCount = bayKeyCount[level];
  if (keyCount > 0) {
    drawBays(
      scene,
      computeBays(
        containers.map((cont, idx) => ({ y: lanes[idx]!.y, height: lanes[idx]!.height, keys: bayKeysFromId(cont.id, keyCount) })),
      ),
      h,
      bayHover,
    );
  }

  containers.forEach((cont, idx) => {
    const laneY = lanes[idx]!.y;
    const laneH = lanes[idx]!.height;
    const hullBandH = laneH - LANE_CAPTION_H;
    const pad = 3;
    const hullY = laneY + pad;
    const hullH = hullBandH - pad * 2;

    // a container is "matched" if its id/breadcrumb contains the filtered school/grade/etc.
    const parts = cont.id.split("¦");
    const dimByBay = !inBay(bayMatchKey(parts[0] ?? "", parts[1] ?? "", parts[2] ?? ""), bayHover);
    const dim = (fActive && !aggMatches(cont, filter)) || dimByBay;
    const itemAlpha = dim ? DIM_ALPHA : 1;

    const grid = cargoLayout(cont.cells.length, damStepW(cols) * 0.85);
    const hullW = hullWidth(grid.cols);
    const frontierX = cols.x[cont.frontier];
    const stragglerX = cols.x[cont.straggler];
    const moorX = stragglerX; // moor at the straggler — clears a stage only when all children have
    const hullX = moorX - hullW; // right edge on the straggler line
    const midY = hullY + hullH / 2;

    // forward lead line to the frontier (children that have raced ahead)
    if (frontierX > moorX + 1) {
      const lead = new Graphics();
      lead.moveTo(moorX, midY).lineTo(frontierX, midY).stroke({ width: 1, color: COLORS.tail, alpha: 0.7 });
      lead.circle(frontierX, midY, 2).fill(COLORS.tail);
      lead.alpha = itemAlpha;
      scene.addChild(lead);
    }

    const box = new Container();
    box.alpha = itemAlpha;
    box.eventMode = "static";
    box.cursor = "pointer";
    box.on("pointertap", () => h.onPickContainer(cont.id));
    box.on("pointerover", () => h.onHoverContainer(cont));
    box.on("pointerout", () => h.onHoverContainer(null));

    const hull = new Graphics();
    hull.roundRect(hullX, hullY, hullW, hullH, 3).fill(COLORS.raftHull).stroke({ width: 1, color: COLORS.raftHullEdge });
    hull.rect(hullX, hullY, hullW, 2).fill(COLORS.raftHi);
    box.addChild(hull);

    const cargoH = grid.rows * (grid.cell + grid.gap) - grid.gap;
    const boxX = hullX + CARGO_INNER_PAD;
    const boxY = hullY + (hullH - cargoH) / 2;
    const cargo = new Graphics();
    cont.cells.forEach((cell, i) => {
      const r = Math.floor(i / grid.cols);
      const c = i % grid.cols;
      const cx = boxX + c * (grid.cell + grid.gap);
      const cy = boxY + r * (grid.cell + grid.gap);
      cargo.roundRect(cx, cy, grid.cell, grid.cell, 1).fill(cell.failed ? COLORS.failed : stageColor(cell.stage));
      if (!cell.failed && cell.processing) cargo.rect(cx, cy, grid.cell, 2).fill(0xe0a020); // amber = in progress
    });
    box.addChild(cargo);

    // streamer carrying the aggregate name + child count, flying toward screen centre
    drawStreamer(box, `${cont.label} · ${cont.cells.length} ${cont.childKind}`, hullX, moorX, midY, screenCenterX);

    if (cont.id === focusedId) {
      const ring = new Graphics();
      ring.roundRect(hullX - 3, hullY - 3, hullW + 6, hullH + 6, 4).stroke({ width: 2, color: COLORS.focusRing });
      box.addChild(ring);
    }
    if (cont.failed > 0) {
      const flag = new Graphics();
      const fx = hullX + hullW - 4;
      const fy = hullY - 1;
      flag.rect(fx, fy - 12, 1.5, 14).fill(COLORS.flagPole);
      flag.poly([fx + 1.5, fy - 12, fx + 12, fy - 8, fx + 1.5, fy - 4]).fill(COLORS.flag);
      box.addChild(flag);
    }
    scene.addChild(box);
  });
}

// crude org-filter match for aggregate containers (id is the ¦-joined path
// school¦grade¦subject¦exam; the grade segment is the RAW grade, so compare it
// through gradeLabel against the ordinal filter value).
function aggMatches(c: AggContainer, f: WallFilter): boolean {
  const id = c.id;
  const gradeSeg = id.split("¦")[1];
  if (f.school && !id.includes(f.school)) return false;
  if (f.grade && (gradeSeg == null || gradeNorm(gradeSeg) !== gradeNorm(f.grade))) return false;
  if (f.subject && !id.includes(f.subject)) return false;
  if (f.exam && !id.includes(f.exam)) return false;
  // section/status not resolvable at the aggregate grain → don't dim on them
  return true;
}

// ── Global a-papers view ─────────────────────────────────────────────────────
// Every answer-paper across all batches, grouped by the deepest container
// (school¦grade¦subject¦exam). One wood hull per group moored at the group's
// frontier; cargo cells = every Paper colored by its stage (red if failed),
// fixed 2-row grid, width = ceil(n/2). For perf the cells are ONE batched
// non-interactive Graphics and the hull is the single pickable target per group.
export function papersGroupKey(b: Batch): string {
  return `${b.key.school}¦${b.key.grade}¦${b.key.subject}¦${b.key.exam}`;
}

interface PaperGroup {
  id: string;
  crumb: string; // human breadcrumb
  batches: Batch[];
  papers: Paper[];
  paperCount: number;
}

export function buildPaperGroups(batches: Batch[]): PaperGroup[] {
  const m = new Map<string, PaperGroup>();
  for (const b of batches) {
    const id = papersGroupKey(b);
    let g = m.get(id);
    if (!g) {
      g = {
        id,
        crumb: `${b.key.school} | ${gradeLabel(b.key.grade)} | ${b.key.subject} · ${b.key.exam}`,
        batches: [],
        papers: [],
        paperCount: 0,
      };
      m.set(id, g);
    }
    g.batches.push(b);
    g.papers.push(...b.papers);
    g.paperCount += b.paperCount;
  }
  const groups = [...m.values()];
  groups.sort((a, b) => (a.crumb < b.crumb ? -1 : 1));
  return groups;
}

export function paperGroupIds(batches: Batch[]): string[] {
  return buildPaperGroups(batches).map((g) => g.id);
}

// Flat, stage-ordered list of EVERY paper for the global a-papers view — shared by
// the renderer and keyboard nav so their order matches exactly. Sort key: pipeline
// stage, then batch id (stable within a batch by insertion order).
export function orderedFloatingPapers(batches: Batch[]): { p: Paper; b: Batch }[] {
  const items: { p: Paper; b: Batch }[] = [];
  for (const b of batches) for (const p of b.papers) items.push({ p, b });
  items.sort(
    (x, y) =>
      STAGE_INDEX[x.p.stage] - STAGE_INDEX[y.p.stage] ||
      (x.b.id < y.b.id ? -1 : x.b.id > y.b.id ? 1 : 0),
  );
  return items;
}

export function allPaperIds(batches: Batch[]): string[] {
  return orderedFloatingPapers(batches).map((it) => it.p.id);
}

function frontierStageOf(batches: Batch[]): StageId {
  let best: StageId = batches[0] ? computeProgress(batches[0]).frontier : "queued";
  let bestI = -1;
  for (const b of batches) {
    const f = computeProgress(b).frontier;
    const i = STAGE_INDEX[f];
    if (i > bestI) {
      bestI = i;
      best = f;
    }
  }
  return best;
}

function drawAllPapers(
  scene: Container,
  batches: Batch[],
  cols: Columns,
  top: number,
  bottom: number,
  focusedId: string | null,
  h: SceneHandlers,
  filter: WallFilter,
  fActive: boolean,
) {
  const items = orderedFloatingPapers(batches);
  const hdr = label(`▾ a-papers  —  ${items.length} answer papers across the pipeline`, 12, COLORS.caption, "600");
  hdr.x = 12;
  hdr.y = 8;
  scene.addChild(hdr);

  // Cluster papers by STAGE → each stage gets a vertical block of cards on its dam
  // column. (Org grouping is the job of the broader granularity levels + bays.)
  const byStage = new Map<StageId, { p: Paper; b: Batch }[]>();
  for (const it of items) {
    let arr = byStage.get(it.p.stage);
    if (!arr) { arr = []; byStage.set(it.p.stage, arr); }
    arr.push(it);
  }

  // Same UNIT design as the drilled-in raft view: a stage-coloured cell with the
  // roll number INSIDE + the student's name UNDER it. A stage's cluster is CAPPED
  // to maxCols wide (≈ the inter-dam spacing) so it can't bleed into the next dam's
  // column; papers beyond that overflow DOWNWARD past the viewport → scrollable.
  // a-papers is the ONE level that keeps the cream card + a readable student name;
  // bigger cell + wider column pitch + a larger name font so names are legible
  // (trade: fewer columns per stage → taller, scrollable clusters).
  const SIZE = 22; // cell side
  const PX = 48; // column pitch — room for the (now-larger) name under each cell
  const PY = SIZE + 16; // row pitch — cell + name line
  const step = Math.abs(cols.x["answer_chunking"] - cols.x["upload_scan"]) || 180;
  const maxCols = Math.max(1, Math.floor((step * 0.85) / PX));

  // Row y-positions, skipping the reserved dam band; generate as many as the
  // tallest cluster needs (so a big stage spills below `bottom` → scrollable).
  const { bandTop, bandBottom } = damBand(top, bottom);
  const maxRows = Math.max(1, ...[...byStage.values()].map((l) => Math.ceil(l.length / maxCols)));
  const ys: number[] = [];
  for (let y = top + 20; ys.length < maxRows; y += PY) {
    if (y + SIZE > bandTop && y < bandBottom) continue; // never on the dam band
    ys.push(y);
  }

  for (const [stage, list] of byStage) {
    const cx = cols.x[stage] ?? cols.intakeX;
    const startX = cx - (maxCols * PX - (PX - SIZE)) / 2; // centre the (capped-width) cluster on the dam
    list.forEach((it, i) => {
      const x = startX + (i % maxCols) * PX;
      const y = ys[Math.floor(i / maxCols)]!;
      const dim = fActive && !batchMatches(it.b, filter);
      drawBundleCell(scene, it.p, x, y, SIZE, {
        tap: () => h.onPickRaft(it.b),       // click → drill into its batch
        over: () => h.onHoverPaper(it.b, it.p),
        out: () => h.onHoverPaper(it.b, null),
      }, it.p.id === focusedId, dim ? DIM_ALPHA : 1, true);
    });
  }
}

// student first name, truncated — drawn UNDER a bundle cell for clarity
function firstName(name: string, max = 10): string {
  const w = (name || "").trim().split(/\s+/)[0] ?? "";
  return w.length > max ? `${w.slice(0, max - 1)}…` : w;
}

// ── Shared UNIT renderer: one answer paper as a cream PAPER CARD — stage-colour
// foot band (status colouring), folded corner, roll number INSIDE, optional
// student name UNDER. The SAME unit everywhere: a-papers, drilled-in raft, and the
// batches-raft cargo, so a paper looks identical wherever you see it.
function drawBundleCell(
  scene: Container,
  p: Paper,
  x: number,
  y: number,
  size: number,
  on: { tap: () => void; over: () => void; out: () => void },
  focused: boolean,
  alpha: number,
  showName: boolean,
) {
  const color = p.status === "failed" ? COLORS.failed : stageColor(p.stage);
  const card = new Container();
  card.eventMode = "static";
  card.cursor = "pointer";
  card.on("pointertap", on.tap);
  card.on("pointerover", on.over);
  card.on("pointerout", on.out);
  paperCardGraphic(card, p, x, y, size, color);
  // roll number INSIDE the card — dark on the cream body
  const roll = label(p.rollNumber, Math.max(7, Math.round(size * 0.4)), 0x5b4a2e, "600");
  roll.anchor.set(0.5);
  roll.x = x + size / 2;
  roll.y = y + (size - 2) / 2;
  card.addChild(roll);
  card.alpha = alpha;
  scene.addChild(card);
  if (showName) {
    const nm = label(firstName(p.studentName), 9, COLORS.caption, "600");
    nm.anchor.set(0.5, 0);
    nm.x = x + size / 2;
    nm.y = y + size + 2;
    nm.alpha = alpha;
    scene.addChild(nm);
  }
  if (focused) {
    const ring = new Graphics();
    ring.roundRect(x - 2, y - 2, size + 4, size + 4, 3).stroke({ width: 2, color: COLORS.focusRing });
    scene.addChild(ring);
  }
}

// Full-colour answer-paper CELL — the WHOLE cell is the stage colour (failed→red,
// processing→amber top band), roll number on it. Used where the colour/progress
// reading matters more than per-student identity: the drilled-in raft (and, inline,
// the batches cargo + aggregate). The a-papers level keeps the cream card + name.
function drawColourCell(
  scene: Container,
  p: Paper,
  x: number,
  y: number,
  size: number,
  on: { tap: () => void; over: () => void; out: () => void },
  focused: boolean,
) {
  const color = p.status === "failed" ? COLORS.failed : stageColor(p.stage);
  const card = new Container();
  card.eventMode = "static";
  card.cursor = "pointer";
  card.on("pointertap", on.tap);
  card.on("pointerover", on.over);
  card.on("pointerout", on.out);
  const g = new Graphics();
  g.roundRect(x, y, size, size, 3).fill(color).stroke({ width: 1, color: COLORS.raftHullEdge });
  if (p.status === "processing") g.rect(x, y, size, 2).fill(0xe0a020); // amber = in progress
  card.addChild(g);
  // roll number ON the colour cell — white for contrast on the mid-tone stage colours
  const roll = label(p.rollNumber, Math.max(8, Math.round(size * 0.42)), 0xffffff, "600");
  roll.anchor.set(0.5);
  roll.x = x + size / 2;
  roll.y = y + size / 2;
  card.addChild(roll);
  scene.addChild(card);
  if (focused) {
    const ring = new Graphics();
    ring.roundRect(x - 2, y - 2, size + 4, size + 4, 4).stroke({ width: 2, color: COLORS.focusRing });
    scene.addChild(ring);
  }
}

// The cream paper-card shape (cream body + stage-colour foot band + folded corner),
// drawn into `g`. The foot band shows STAGE/progress; the body+border show STATUS
// (Fahad: mainly failure + processing) — failed → red body+border, processing →
// amber border. Shared by the interactive card and the batched raft cargo.
function paperCardGraphic(g: Container, p: Paper, x: number, y: number, size: number, footColor: number) {
  const failed = p.status === "failed";
  const processing = p.status === "processing";
  const body = failed ? 0xf6dede : 0xf7f3e8;
  const border = failed ? 0xcf3b3b : processing ? 0xe0a020 : COLORS.raftHullEdge;
  const gr = new Graphics();
  gr.roundRect(x, y, size, size, 2).fill(body).stroke({ width: failed || processing ? 1.5 : 1, color: border });
  gr.rect(x + 1, y + size - 3, size - 2, 2).fill(footColor); // stage-colour foot (progress)
  gr.poly([x + size - 4, y, x + size, y, x + size, y + 4]).fill(0xdcd2bd); // folded corner
  g.addChild(gr);
}
