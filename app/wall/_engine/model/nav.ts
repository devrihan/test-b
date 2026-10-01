import { isHumanGate, type StageId } from "./dams";
import type { BatchKey } from "./types";

// ── Navigation seam ────────────────────────────────────────────────────────
// River is NOT a passive wall only — it is intended to become beaver's HOME PAGE
// and act as the navigation hub for the whole operation. From any entity on the
// wall you can jump straight into beaver's action screens:
//   • a beaver (human-gate) dam → the manual review queue for that stage/batch
//   • a raft / org grouping      → the configuration screens (school/grade/exam…)
//
// This is navigation OUT of the dashboard, not writes INTO the pipeline — so it
// fully preserves the LOCKED data-plane rule that the dashboard never sits in
// the pipeline's critical path. The two planes are independent.
//
// Like the feed, navigation is a pluggable SEAM: standalone dev uses a logging
// resolver; when embedded in beaver, beaver injects a resolver that maps these
// intents to its real Next.js routes. The wall code only ever speaks intents.

export type OrgLevel = "school" | "grade" | "section" | "subject" | "exam";

export type NavIntent =
  // Open the manual review screen for a human-gate dam, scoped to a batch
  // (optionally a specific paper). Only valid for beaver-tended stages. `key`
  // carries the org context the deep-link needs as query params (school/grade/…).
  | { kind: "reviewStage"; stage: StageId; batchId: string; paperId?: string; key?: BatchKey }
  // Open the batch configuration screen (page rotation, settings, etc.).
  | { kind: "configureBatch"; batchId: string }
  // Open a configuration screen for an org level (e.g. set up a new exam).
  | { kind: "configureOrg"; level: OrgLevel; value: string; key?: Partial<BatchKey> }
  // Open the read-only batch detail / management page (drill-in without an action).
  | { kind: "inspectBatch"; batchId: string };

export interface NavResolver {
  /** Resolve an intent to a destination (URL or route path), or null if N/A. */
  resolve(intent: NavIntent): string | null;
  /** Perform the navigation. In beaver this is router.push / window.open. */
  navigate(intent: NavIntent): void;
}

/** Is there a manual-review destination for this dam? (Only human gates qualify.) */
export function isReviewable(stage: StageId): boolean {
  return isHumanGate(stage);
}

/**
 * The next human action available on a paper sitting at `stage` → its button
 * label + nav intent. Mirrors the per-student buttons on `/batches/[batchId]`:
 *   bbox_review    (status bbox_detected)        → "Mark bboxes" → /pdfExtract
 *   answer_editing (status ocr_completed/done)   → "Edit answers" → /answerEditing
 * Every other dam is the pipeline still working → no actionable button (null).
 */
export function paperAction(
  stage: StageId,
  batchId: string,
  paperId: string,
  key: BatchKey,
): { label: string; intent: NavIntent } | null {
  if (stage === "bbox_review")
    return { label: "Mark bboxes →", intent: { kind: "reviewStage", stage, batchId, paperId, key } };
  if (stage === "answer_editing")
    return { label: "Edit answers →", intent: { kind: "reviewStage", stage, batchId, paperId, key } };
  return null;
}

/**
 * Real beaver resolver: maps intents to beaver's Next.js routes and pushes via the
 * injected router. Routes match how `/batches/[batchId]` deep-links today:
 *   inspectBatch/configureBatch → /batches/{id}            (the management page)
 *   reviewStage bbox_review     → /pdfExtract?…            (Mark bboxes)
 *   reviewStage answer_editing  → /answerEditing?…            (Edit answers)
 * Injected with router.push so the engine stays free of any React/Next import.
 */
export class BeaverNavResolver implements NavResolver {
  constructor(private readonly push: (url: string) => void) {}

  resolve(intent: NavIntent): string | null {
    switch (intent.kind) {
      case "inspectBatch":
      case "configureBatch":
        return `/batches/${encodeURIComponent(intent.batchId)}`;
      case "reviewStage": {
        // batchId/paperId/key are OPTIONAL: a per-paper click carries them; a DAM
        // click carries none → the bare stage page (the whole queue). Build the
        // query from whatever is present so both cases produce a clean URL.
        const params = new URLSearchParams();
        if (intent.batchId) params.set("batchId", intent.batchId);
        if (intent.paperId) params.set("studentId", intent.paperId);
        const k = intent.key;
        if (k?.school) params.set("school", k.school);
        if (k?.grade) params.set("grade", k.grade);
        if (k?.section) params.set("section", k.section);
        if (k?.subject) params.set("subject", k.subject);
        if (k?.exam) params.set("exam", k.exam);
        const qs = params.toString();
        const suffix = qs ? `?${qs}` : "";
        if (intent.stage === "bbox_review") return `/pdfExtract${suffix}`;
        if (intent.stage === "answer_editing") return `/answerEditing${suffix}`;
        return null;
      }
      case "configureOrg":
        return "/batches/new";
    }
  }

  navigate(intent: NavIntent): void {
    const dest = this.resolve(intent);
    if (dest) this.push(dest);
  }
}

/**
 * Standalone-dev resolver: no beaver routes exist here, so it just logs the
 * intent it WOULD navigate to. Swapped for a real resolver inside beaver.
 */
export class LoggingNavResolver implements NavResolver {
  resolve(intent: NavIntent): string | null {
    switch (intent.kind) {
      case "reviewStage":
        return isReviewable(intent.stage)
          ? `beaver://review/${intent.stage}/${intent.batchId}${intent.paperId ? `/${intent.paperId}` : ""}`
          : null;
      case "configureBatch":
        return `beaver://config/batch/${intent.batchId}`;
      case "configureOrg":
        return `beaver://config/${intent.level}/${encodeURIComponent(intent.value)}`;
      case "inspectBatch":
        return `beaver://batch/${intent.batchId}`;
    }
  }

  navigate(intent: NavIntent): void {
    const dest = this.resolve(intent);
    // eslint-disable-next-line no-console
    console.log(`[nav] ${intent.kind} →`, dest ?? "(no destination)");
  }
}
