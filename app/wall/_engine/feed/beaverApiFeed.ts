import type { StageId } from "../model/dams";
import type { BatchKey, StatusKind } from "../model/types";
import type { RiverEvent, RiverFeed } from "./types";

// ── Real feed adapter ───────────────────────────────────────────────────────
// Implements the SAME RiverFeed contract as MockRiverFeed, but driven by polling
// beaver-api's `GET /api/batches`. It diffs successive snapshots and folds the
// difference into the river event stream the store already understands — so the
// model/store/view layers above the feed are untouched (the seam's whole point).
//
// ── How real batch data maps onto the dam ladder ────────────────────────────
// The list endpoint gives us, per batch, a COARSE `status`
// (waiting_for_scans → processing → completed → pushed, + failed) plus the real
// per-stage WATERLINE in four count columns:
//   preprocessed_count   → papers past preprocessing  (ready for bbox AI)
//   bbox_detected_count  → papers past answer_chunking (bbox AI done)
//   bbox_validated_count → papers past bbox_review     (human bbox review done)
//   ocr_completed_count  → papers past answer_extraction (OCR done → answer editing)
// The coarse status alone can't tell which dam a "processing" raft sits at, so we
// distribute its papers across the dams using these counts. Each paper index is
// assigned the furthest dam its waterline reached, giving a multi-coloured raft
// that reflects real progress instead of a monolith parked at one dam.

/** The slice of beaver-api's Batch we actually read. Kept minimal + local so the
 *  engine stays decoupled from beaver's full client type. */
export interface RawBatch {
  batch_id: string;
  school_name: string;
  grade: string;
  section: string;
  subject: string;
  exam_type: string;
  status: string;
  total_students: number;
  preprocessed_count?: number;
  bbox_detected_count?: number;
  bbox_validated_count?: number;
  ocr_completed_count?: number;
}

export interface BeaverApiFeedOptions {
  /** Returns the current batch list. The page injects beaver's auth'd getBatches. */
  fetchBatches: () => Promise<RawBatch[]>;
  /** Poll cadence in ms. */
  pollMs?: number;
  /** Called on a failed poll (network/auth). The feed keeps polling regardless. */
  onError?: (err: unknown) => void;
}

// ── Coarse BatchStatus → fallback dam (StageId) ──────────────────────────────
// Used for the whole-batch fallback (e.g. a `waiting_for_scans` raft with no
// papers yet). The fine per-paper placement comes from the count waterline in
// derivePaperStages — this map only decides where a status with no usable counts
// sits. `pushed`→done (over the waterfall); `failed` keeps its last-known dam.
const STATUS_TO_STAGE: Record<string, StageId> = {
  waiting_for_scans: "upload_scan",
  pending: "upload_scan",
  processing: "upload_scan", // overridden per-paper by the count waterline
  completed: "answer_editing",
  pushed: "done",
};

// Coarse statuses that read as "actively working" (gentle motion) vs moored.
const PROCESSING = new Set(["processing", "preprocessing"]);

export function mapStatusToStage(status: string): StageId {
  const s = STATUS_TO_STAGE[status];
  if (s || status === "failed") return s ?? "upload_scan"; // failed keeps last stage upstream
  warnUnmapped("batch", status);
  return "upload_scan";
}

export function mapStatusToKind(status: string): StatusKind {
  if (status === "failed") return "failed";
  if (status === "pushed") return "done";
  if (status === "waiting_for_scans" || status === "pending") return "queued";
  if (PROCESSING.has(status)) return "processing";
  return "waiting";
}

/**
 * Distribute a batch's `total_students` papers across the dam ladder using the
 * count-column waterline, most-advanced papers first (index 0 = furthest along).
 * Returns one StageId per paper index (length === total_students).
 *
 * Real count columns can be slightly NON-nested (a later count can momentarily
 * exceed an earlier one), so we enforce monotonicity from the most-advanced stage
 * backward — if N papers reached OCR, at least N must have cleared validation,
 * detection, preprocessing. This keeps the buckets summing to `total`.
 */
export function derivePaperStages(b: RawBatch): StageId[] {
  const total = Math.max(0, b.total_students | 0);
  if (total === 0) return [];
  if (b.status === "pushed") return new Array(total).fill("done");
  if (b.status === "waiting_for_scans" || b.status === "pending")
    return new Array(total).fill("upload_scan");

  const clamp = (n: number | undefined) => Math.min(total, Math.max(0, n ?? 0));
  const wOcr = clamp(b.ocr_completed_count);
  const wVal = Math.max(clamp(b.bbox_validated_count), wOcr);
  const wDet = Math.max(clamp(b.bbox_detected_count), wVal);
  const wPre = Math.max(clamp(b.preprocessed_count), wDet);
  // A 'completed' batch is fully through OCR → lift the OCR waterline to total
  // even if a count lagged, so everything sits at answer_editing (human edit).
  const ocrLine = b.status === "completed" ? total : wOcr;

  const stages: StageId[] = [];
  for (let i = 0; i < total; i++) {
    if (i < ocrLine) stages.push("answer_editing"); // OCR done → human answer editing
    else if (i < wVal) stages.push("answer_extraction"); // validated → OCR running
    else if (i < wDet) stages.push("bbox_review"); // detected → human bbox review
    else if (i < wPre) stages.push("answer_chunking"); // preprocessed → bbox AI
    else stages.push("upload_scan"); // not yet processed
  }
  return stages;
}

// ── Per-STUDENT status (batch_students.status) → dam, for real drill-in ──────
// The actionable dams MUST match the buttons on /batches/[batchId]:
//   bbox_detected → bbox_review    (→ /pdfExtract  "Mark bboxes")
//   ocr_completed / completed → answer_editing (→ /answerEditing "Edit answers")
const STUDENT_STATUS_TO_STAGE: Record<string, StageId> = {
  pending: "upload_scan",
  uploaded: "upload_scan",
  preprocessing: "answer_chunking",
  preprocessed: "answer_chunking",
  bbox_detecting: "answer_chunking",
  bbox_detected: "bbox_review",
  processing: "answer_extraction",
  ocr_running: "answer_extraction",
  extracting_grid: "answer_extraction",
  identifying_or: "answer_extraction",
  or_identified: "answer_extraction", // real live-ops value (verified 21-06 against the droplet)
  extracting_answers: "answer_extraction",
  ocr_completed: "answer_editing",
  completed: "answer_editing",
};
// Warn ONCE per unmapped status so future pipeline-vocabulary drift surfaces in the
// console instead of silently piling papers at the first dam.
const warnedStatuses = new Set<string>();
function warnUnmapped(kind: string, status: string) {
  if (warnedStatuses.has(kind + status)) return;
  warnedStatuses.add(kind + status);
  // eslint-disable-next-line no-console
  console.warn(`[wall] unmapped ${kind} status "${status}" → upload_scan (add it to the map)`);
}
export function studentStatusToStage(status: string): StageId {
  const s = STUDENT_STATUS_TO_STAGE[status];
  if (s) return s;
  warnUnmapped("student", status);
  return "upload_scan";
}
// "processing" kind = a paper actively inside an AI/compute step (the -ing states +
// the OCR sub-steps) → gets the amber "being worked" highlight. At-rest states
// (uploaded / *_detected / preprocessed / completed) read as "waiting" (calm cream).
const STUDENT_ACTIVE = new Set([
  "preprocessing", "bbox_detecting", "ocr_running", "processing",
  "extracting_grid", "identifying_or", "or_identified", "extracting_answers",
]);
export function studentStatusToKind(status: string): StatusKind {
  if (status === "failed") return "failed";
  if (STUDENT_ACTIVE.has(status)) return "processing";
  return "waiting";
}

interface SeenBatch {
  status: string;
  paperStages: StageId[]; // current dam per paper index
}

export class BeaverApiFeed implements RiverFeed {
  private handlers = new Set<(e: RiverEvent) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private seen = new Map<string, SeenBatch>();
  private readonly fetchBatches: () => Promise<RawBatch[]>;
  private readonly pollMs: number;
  private readonly onError?: (err: unknown) => void;

  constructor(opts: BeaverApiFeedOptions) {
    this.fetchBatches = opts.fetchBatches;
    this.pollMs = opts.pollMs ?? 2500;
    this.onError = opts.onError;
  }

  subscribe(handler: (e: RiverEvent) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  start(): void {
    if (this.timer) return; // idempotent — survives StrictMode reconnects
    void this.poll(); // immediate first poll, then on cadence
    this.timer = setInterval(() => void this.poll(), this.pollMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  private emit(e: RiverEvent) {
    for (const h of this.handlers) h(e);
  }

  private async poll(): Promise<void> {
    let batches: RawBatch[];
    try {
      batches = await this.fetchBatches();
    } catch (err) {
      this.onError?.(err);
      return;
    }
    const now = Date.now();
    const live = new Set<string>();

    for (const b of batches) {
      live.add(b.batch_id);
      const kind = mapStatusToKind(b.status);
      const prev = this.seen.get(b.batch_id);
      // `failed` carries no waterline of its own → keep papers where they were.
      const stages = b.status === "failed" && prev ? prev.paperStages : derivePaperStages(b);

      if (!prev) {
        this.spawn(b, stages, kind, now);
        continue;
      }

      // Grow cargo if more papers appeared (late uploads).
      if (stages.length > prev.paperStages.length) {
        for (let i = prev.paperStages.length; i < stages.length; i++) {
          this.emitPaperAdded(b, i, now);
        }
      }
      // Move any paper whose dam changed (counts advanced) OR whose kind changed
      // (status flipped — re-emit all so motion/colour update together).
      const statusChanged = prev.status !== b.status;
      for (let i = 0; i < stages.length; i++) {
        if (statusChanged || stages[i] !== prev.paperStages[i]) {
          this.emit({
            type: "stage_changed", t: now, scope: "paper",
            batchId: b.batch_id, paperId: paperIdOf(b.batch_id, i), stage: stages[i]!, status: kind,
          });
        }
      }
      prev.status = b.status;
      prev.paperStages = stages;
    }

    // Batches that dropped out of the list have gone over the waterfall / been
    // archived → retire their rafts.
    for (const [id] of this.seen) {
      if (!live.has(id)) {
        this.emit({ type: "batch_retired", t: now, batchId: id });
        this.seen.delete(id);
      }
    }
  }

  private spawn(b: RawBatch, stages: StageId[], kind: StatusKind, now: number): void {
    const key: BatchKey = {
      school: b.school_name,
      grade: b.grade,
      section: b.section,
      subject: b.subject,
      exam: b.exam_type,
    };
    this.emit({ type: "batch_created", t: now, batchId: b.batch_id, key, paperCount: stages.length });
    for (let i = 0; i < stages.length; i++) {
      this.emitPaperAdded(b, i, now);
      this.emit({
        type: "stage_changed", t: now, scope: "paper",
        batchId: b.batch_id, paperId: paperIdOf(b.batch_id, i), stage: stages[i]!, status: kind,
      });
    }
    this.seen.set(b.batch_id, { status: b.status, paperStages: stages });
  }

  // Placeholder paper identity — overview never shows it (raft identity comes from
  // `key`); real drill-in replaces these from the students endpoint.
  private emitPaperAdded(b: RawBatch, i: number, now: number): void {
    this.emit({
      type: "paper_added", t: now, batchId: b.batch_id, paperId: paperIdOf(b.batch_id, i),
      rollNumber: String(i + 1).padStart(3, "0"), studentName: `Student ${i + 1}`, answerCount: 0,
    });
  }
}

const paperIdOf = (batchId: string, i: number) => `${batchId}::p${i}`;
