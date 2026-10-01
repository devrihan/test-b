// The canonical dam spine — the pipeline's stages laid out left (intake) → right (done).
// Workflows may SKIP stages; this ordered list is the superset ("spine"). Horizontal
// position of a raft is read off this order, so the order here IS the layout order.
//
// LOCKED by the build brief: river flows left→right; this is that axis.

export const STAGES = [
  "queued", // pre-river: batch created & configured, not yet flowing
  "upload_scan", // ops scans & uploads papers (roll no + name)
  "answer_chunking", // AI draws bounding boxes around each answer
  "bbox_review", // human confirms the bounding boxes
  "answer_extraction", // OCR reads handwriting into text
  "answer_editing", // human edits the extracted answers
  "insight_generation", // analytics / insights per answer
  "done", // over the waterfall
] as const;

export type StageId = (typeof STAGES)[number];

export const STAGE_INDEX: Record<StageId, number> = Object.fromEntries(
  STAGES.map((s, i) => [s, i]),
) as Record<StageId, number>;

/** Human-readable dam label for the wall. */
export const STAGE_LABEL: Record<StageId, string> = {
  queued: "Queued",
  upload_scan: "Upload & Scan",
  answer_chunking: "Answer Chunking",
  bbox_review: "Bounding-box Review",
  answer_extraction: "Answer Extraction (OCR)",
  answer_editing: "Answer Editing",
  insight_generation: "Insight Generation",
  done: "Done",
};

/**
 * The next stage in the canonical spine, or null at the waterfall.
 * NOTE: this is the *canonical* successor. Real workflows can skip stages, so a
 * stage-change event may jump further than one step — never assume +1 from this.
 */
export function nextStage(stage: StageId): StageId | null {
  const i = STAGE_INDEX[stage];
  return i < STAGES.length - 1 ? STAGES[i + 1] : null;
}

// ── Actors (the "beaver rule") ─────────────────────────────────────────────
// LOCKED: a beaver means a HUMAN is in the loop; every automated service is its
// own distinct creature; heron = OCR. The point is information design: rafts
// piling up at a beaver dam = actionable ops backlog; rafts piling at any other
// creature = compute in flight (just wait). Same picture, two meanings, no legend.
//
// Creatures beyond beaver/heron are DEFAULTS (adjustable). Chosen here to be
// visually distinct and to hint at their job:
//   kingfisher — dives to a precise spot → bounding boxes (chunking)
//   heron      — LOCKED: OCR / answer extraction
//   owl        — "insight" / wisdom → insight generation

export interface Actor {
  /** stable id */
  id: string;
  /** label for tooltips / dev harness */
  label: string;
  /** the beaver rule: true = a human gate (ops backlog if it piles up) */
  isHuman: boolean;
  /** sprite name → which pixel creature to draw at this dam */
  sprite: "beaver" | "kingfisher" | "heron" | "owl";
}

/** Which actor works each dam. Stages with no actor (queued/done) are absent. */
export const STAGE_ACTOR: Partial<Record<StageId, Actor>> = {
  upload_scan: { id: "ops_upload", label: "Ops — scan & upload", isHuman: true, sprite: "beaver" },
  answer_chunking: { id: "chunker", label: "Chunker — bbox AI", isHuman: false, sprite: "kingfisher" },
  bbox_review: { id: "ops_bbox", label: "Ops — bbox review", isHuman: true, sprite: "beaver" },
  answer_extraction: { id: "ocr", label: "OCR — answer extraction", isHuman: false, sprite: "heron" },
  answer_editing: { id: "ops_edit", label: "Ops — answer editing", isHuman: true, sprite: "beaver" },
  insight_generation: { id: "insighter", label: "Insight generation", isHuman: false, sprite: "owl" },
};

/** True when a backlog at this dam is an ops problem (a human is the gate). */
export function isHumanGate(stage: StageId): boolean {
  return STAGE_ACTOR[stage]?.isHuman ?? false;
}
