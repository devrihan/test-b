import { STAGE_INDEX, STAGE_LABEL } from "../model/dams";
import type { Batch, Paper } from "../model/types";
import { computeProgress } from "../store/riverStore";
import { assignLanes, gradeLabel, type WallDims } from "./layout";

// ── Pure navigation helpers ────────────────────────────────────────────────
// Rafts are laid out one-per-lane top→bottom (grouped by subject·section), so
// keyboard focus is a 1-D walk over that reading order — which is also the right
// model for an accessible listbox. Kept pure so it's testable without Pixi.

/** Rafts in visual top→bottom order (the keyboard / screen-reader order). */
export function orderedRaftIds(batches: Batch[], d: WallDims): string[] {
  return assignLanes(batches, d).map((l) => l.batchId);
}

/** The id `step` positions away from `current` in the order (clamped). */
export function neighbor(ids: string[], current: string | null, step: number): string | null {
  if (ids.length === 0) return null;
  if (current === null) return step > 0 ? ids[0]! : ids[ids.length - 1]!;
  const i = ids.indexOf(current);
  if (i < 0) return ids[0]!;
  const j = Math.max(0, Math.min(ids.length - 1, i + step));
  return ids[j]!;
}

/** Bundles of a raft in stage order (then roll number) — the drill-in focus order. */
export function orderedBundles(b: Batch): Paper[] {
  return [...b.papers].sort((x, y) => {
    const dx = STAGE_INDEX[x.stage] - STAGE_INDEX[y.stage];
    return dx !== 0 ? dx : x.rollNumber.localeCompare(y.rollNumber);
  });
}

export function orderedBundleIds(b: Batch): string[] {
  return orderedBundles(b).map((p) => p.id);
}

/** Description of a single bundle (answer paper) for announcements / hover. */
export function describeBundle(p: Paper): string {
  return `Paper, roll ${p.rollNumber}, ${p.studentName}. At ${STAGE_LABEL[p.stage]}, ${p.status}.`;
}

/** Human-readable description of a raft for announcements + ARIA labels. */
export function describeRaft(b: Batch): string {
  const p = computeProgress(b);
  const k = b.key;
  const failed = p.failed ? `, ${p.failed} failed` : "";
  return (
    `${k.school} ${gradeLabel(k.grade)} section ${k.section}, ${k.subject}, ${k.exam}. ` +
    `${p.total} bundles, at ${STAGE_LABEL[p.frontier]}${failed}.`
  );
}
