import { STAGE_INDEX, STAGES, type StageId } from "../model/dams";
import type { Batch } from "../model/types";
import { computeProgress } from "../store/riverStore";
import { gradeLabel } from "./layout";

// ── Zoom-OUT aggregation (above the raft) ───────────────────────────────────
// The containment ladder upward: batch ⊂ exam ⊂ subject ⊂ grade ⊂ school. At each
// aggregate level the wall shows CONTAINERS, each rendered like a raft — moored at
// its aggregate frontier, with one cargo cell per child colored by that child's
// progress. So "% of children past each stage" is just the spread of cell colors.

export type AggLevel = "schools" | "grades" | "subjects" | "exams";

export interface AggCell {
  id: string;
  stage: StageId; // the child's aggregate frontier → cell color
  failed: boolean;
  processing: boolean; // any child paper actively being worked → in-progress mark
}

export interface AggContainer {
  id: string;
  label: string; // e.g. "July Unit Test" | "Class 12" | "DPS"
  breadcrumb: string; // parent context for the shore, e.g. "DPS | 12"
  childKind: string; // "batches" | "exams" | "grades"
  frontier: StageId; // furthest child → moor position
  straggler: StageId;
  cells: AggCell[];
  totalPapers: number;
  failed: number;
}

function fIdx(b: Batch): number {
  return STAGE_INDEX[computeProgress(b).frontier];
}
function sIdx(b: Batch): number {
  return STAGE_INDEX[computeProgress(b).straggler];
}
function frontierOf(batches: Batch[]): StageId {
  return STAGES[Math.max(...batches.map(fIdx))]!;
}
function stragglerOf(batches: Batch[]): StageId {
  return STAGES[Math.min(...batches.map(sIdx))]!;
}
function anyFailed(batches: Batch[]): boolean {
  return batches.some((b) => computeProgress(b).failed > 0);
}

function anyProcessing(batches: Batch[]): boolean {
  return batches.some((b) => b.papers.some((p) => p.status === "processing"));
}

function groupBy(batches: Batch[], key: (b: Batch) => string): Map<string, Batch[]> {
  const m = new Map<string, Batch[]>();
  for (const b of batches) {
    const k = key(b);
    const arr = m.get(k);
    if (arr) arr.push(b);
    else m.set(k, [b]);
  }
  return m;
}

/** Build the containers shown at an aggregate zoom level. */
export function buildAggregate(batches: Batch[], level: AggLevel): AggContainer[] {
  // containerKey groups batches into containers; cellKey groups a container's
  // batches into its child cells (one level down).
  const cfg: Record<
    AggLevel,
    { containerKey: (b: Batch) => string; cellKey: (b: Batch) => string; label: (b: Batch) => string; crumb: (b: Batch) => string; childKind: string }
  > = {
    schools: {
      containerKey: (b) => b.key.school,
      cellKey: (b) => b.key.grade, // cells = grades
      label: (b) => b.key.school,
      crumb: () => "",
      childKind: "grades",
    },
    grades: {
      containerKey: (b) => `${b.key.school}¦${b.key.grade}`,
      cellKey: (b) => b.key.subject, // cells = subjects
      label: (b) => gradeLabel(b.key.grade),
      crumb: (b) => b.key.school,
      childKind: "subjects",
    },
    subjects: {
      containerKey: (b) => `${b.key.school}¦${b.key.grade}¦${b.key.subject}`,
      cellKey: (b) => b.key.exam, // cells = exams
      label: (b) => b.key.subject,
      crumb: (b) => `${b.key.school} | ${gradeLabel(b.key.grade)}`,
      childKind: "exams",
    },
    exams: {
      containerKey: (b) => `${b.key.school}¦${b.key.grade}¦${b.key.subject}¦${b.key.exam}`,
      cellKey: (b) => b.id, // cells = individual batches (differentiated by section)
      label: (b) => b.key.exam,
      crumb: (b) => `${b.key.school} | ${gradeLabel(b.key.grade)} | ${b.key.subject}`,
      childKind: "batches",
    },
  };
  const c = cfg[level];

  const containers: AggContainer[] = [];
  for (const [cid, group] of groupBy(batches, c.containerKey)) {
    const cells: AggCell[] = [];
    for (const [cellId, cellBatches] of groupBy(group, c.cellKey)) {
      cells.push({ id: cellId, stage: frontierOf(cellBatches), failed: anyFailed(cellBatches), processing: anyProcessing(cellBatches) });
    }
    // order cells by progress so the spread reads left(early)→right(done)
    cells.sort((a, b) => STAGE_INDEX[a.stage] - STAGE_INDEX[b.stage]);
    const first = group[0]!;
    containers.push({
      id: cid,
      label: c.label(first),
      breadcrumb: c.crumb(first),
      childKind: c.childKind,
      frontier: frontierOf(group),
      straggler: stragglerOf(group),
      cells,
      totalPapers: group.reduce((n, b) => n + b.paperCount, 0),
      failed: group.reduce((n, b) => n + computeProgress(b).failed, 0),
    });
  }
  containers.sort((a, b) => (a.breadcrumb + a.label < b.breadcrumb + b.label ? -1 : 1));
  return containers;
}
