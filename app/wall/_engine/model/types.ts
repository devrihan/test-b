import type { StageId } from "./dams";

// ── Domain entity model ────────────────────────────────────────────────────
// Vocabulary is LOCKED by the build brief:
//   Batch  → Raft     (the unit ops works in)
//   Paper  → Bundle   (one student's answer paper, rides on a raft)
//   Answer → Stick    (one question's response, makes up a bundle)
//   Stage  → Dam      (a gate across the river)
//   Actor  → Animal sprite working at a dam
//
// We keep these data names (Batch/Paper/Answer) in the model layer and map them
// to the river vocabulary (Raft/Bundle/Stick) only at the render layer, so the
// portable core reads in domain terms.

export type StatusKind =
  | "queued" // not started
  | "processing" // actively being worked (gentle motion on the wall)
  | "waiting" // sitting at a mooring, waiting for the next step (still)
  | "done" // cleared the final dam
  | "failed"; // raised-flag failure

/**
 * The five keys that uniquely identify a batch. One exam fans out into many
 * batches — one per (section × subject). This shape also drives the zoom ladder
 * and the filter selector.
 */
export interface BatchKey {
  school: string; // e.g. "DPS"
  grade: string; // e.g. "Class 12"
  section: string; // e.g. "A"  (subdivision of a grade)
  subject: string; // e.g. "Maths"
  exam: string; // e.g. "July Unit Test"
}

/**
 * Stick — answer grain. Modeled now as a FIRST-CLASS grain ("ready but dark"):
 * river does not yet emit answer-level events and can't operate per-answer, so
 * the store ignores answer-scope transitions by default and the render layer
 * draws this layer only once real answer events exist. Deepest live zoom today
 * is the Paper (bundle).
 */
export interface Answer {
  id: string;
  paperId: string;
  questionNumber: number;
  stage: StageId;
  status: StatusKind;
}

/** Bundle — one student's answer paper, rides on a raft. */
export interface Paper {
  id: string;
  batchId: string;
  rollNumber: string;
  studentName: string;
  /** the dam this paper has reached (its frontier) */
  stage: StageId;
  status: StatusKind;
  /** answer-grain children — present in the model, dark in the render today */
  answers: Answer[];
}

/** Raft — the unit ops works in: all papers for one (school,grade,section,subject,exam). */
export interface Batch {
  id: string;
  key: BatchKey;
  createdAt: number;
  /** total answer papers the batch will hold — fixes the raft's size for its life */
  paperCount: number;
  papers: Paper[];
}

// ── Derived, render-facing view of a batch ─────────────────────────────────
// The wall reads two things off a raft at once:
//   frontier  → where the raft MOORS (its horizontal position = progress bar)
//   straggler → the earliest dam still holding a child (the "tail" cue so a
//               39/40-done raft blocked by one stuck paper doesn't read as done)

export interface BatchProgress {
  /** furthest dam any child has reached → the raft's position */
  frontier: StageId;
  /** earliest non-done dam still holding a child → the straggler/tail cue */
  straggler: StageId;
  /** per-stage paper counts → drives the cargo-rectangle fill */
  countsByStage: Partial<Record<StageId, number>>;
  total: number;
  failed: number;
  done: number;
}
