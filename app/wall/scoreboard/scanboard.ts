// Consolidated scoreboard — data layer.
//
// Built on Faiza's `computeBucket` (roster reconciliation: arrived / missing / misplaced)
// so her axis is preserved, then enriched with the pipeline phase + error overlays from
// `phases.ts`. One cell per paper, coloured by pipeline status, with missing roster
// students shown as ghost cells.
//
// Degenerate-suppression: on ops the uploaded papers don't reconcile to the roster (the
// `needs_onboarding` identity bug → every paper "misplaced", every roster student
// "missing"). When a section has uploaded papers but ZERO reconcile, we treat the roster
// as unlinked: drop the misplaced/missing flags so the board isn't flooded. The flags
// switch back on automatically once identity-linkage is fixed.

import { computeBucket, type BucketData, type StudentCell } from "./lib";
import { getBatches, getReviewQueue, type Batch } from "@/app/(dashboard)/pdfExtract/lib/beaverApi";
import { statusVis, classifyError, MISSING_VIS, type StatusVis, type CellError, type PhaseId } from "./phases";

export type ReviewState = { maker: boolean; checker: boolean };
// review_unit statuses at/after the maker's "checked" mark.
const MAKER_DONE = new Set(["awaiting_approval", "approved", "pushed"]);

export type CellKind = "paper" | "missing";

export interface Cell {
  id: string;
  studentId: string;
  name: string;
  roll: string;
  kind: CellKind;
  status: string;
  vis: StatusVis;
  error: CellError | null;
  misplaced: boolean;
  /** Last pipeline event time (uploaded papers only) — for the "last progress" detail. */
  updatedAt?: string | null;
  /** t092 review overlay — populated once the review-state fetch is wired (follow-up). */
  review?: { maker: boolean; checker: boolean };
  hover: string;
}

export interface SectionMetrics {
  papers: number;
  completed: number;
  inProgress: number;
  awaitingReview: number; // the bbox human gate — ops-actionable
  missing: number;
  misplaced: number;
  blocking: number;
  soft: number;
}

export interface SectionBoard {
  key: string;
  label: string;
  school: string;
  grade: string;
  /** Academic year ("2025-2026"). Not yet on the Batch (lives in aggregatedData's
   * section config) → null today; the scope-nav's grade·year nesting lights up
   * automatically once this is plumbed through. See follow-up task #6. */
  year: string | null;
  subject: string;
  exam: string;
  section: string;
  batchIds: string[];
  cells: Cell[];
  expected: number | null;
  rosterUnlinked: boolean;
  metrics: SectionMetrics;
}

const norm = (s: string | null | undefined) => (s ?? "").trim();
const sectionKey = (b: Batch) =>
  `${norm(b.school_name)}|${norm(b.grade)}|${norm(b.subject)}|${norm(b.exam_type)}|${norm(b.section)}`;

const PHASE_ORDER: Record<PhaseId, number> = {
  missing: 0, scan: 1, chunking: 2, review_gate: 3, extraction: 4, done: 5, unknown: 6,
};

const rollPfx = (roll: string) => (roll && roll !== "—" ? `#${roll} ` : "");

function paperCell(sc: StudentCell, misplaced: boolean, nowMs: number): Cell {
  const vis = statusVis(sc.status);
  const error = classifyError(
    { status: sc.status ?? "", misplaced, errorMessage: sc.errorMessage ?? null, updatedAt: sc.updatedAt ?? null },
    nowMs,
  );
  const extra = [misplaced ? "misplaced" : "", error ? error.reason : ""].filter(Boolean).join(" · ");
  return {
    id: sc.key,
    studentId: sc.key,
    name: sc.name,
    roll: sc.rollNumber,
    kind: "paper",
    status: sc.status ?? "",
    vis,
    error,
    misplaced,
    updatedAt: sc.updatedAt ?? null,
    hover: `${rollPfx(sc.rollNumber)}${sc.name} — ${vis.hover}${extra ? " · " + extra : ""}`,
  };
}

function missingCell(sc: StudentCell): Cell {
  return {
    id: sc.key,
    studentId: sc.key,
    name: sc.name,
    roll: sc.rollNumber,
    kind: "missing",
    status: "",
    vis: MISSING_VIS,
    error: null,
    misplaced: false,
    hover: `${rollPfx(sc.rollNumber)}${sc.name} — ${MISSING_VIS.hover}`,
  };
}

function computeMetrics(cells: Cell[]): SectionMetrics {
  const m: SectionMetrics = { papers: 0, completed: 0, inProgress: 0, awaitingReview: 0, missing: 0, misplaced: 0, blocking: 0, soft: 0 };
  for (const c of cells) {
    if (c.kind === "missing") { m.missing++; continue; }
    m.papers++;
    if (c.vis.phase === "done") m.completed++;
    else if (c.vis.phase === "review_gate") m.awaitingReview++;
    else m.inProgress++;
    if (c.misplaced) m.misplaced++;
    if (c.error?.level === "blocking") m.blocking++;
    else if (c.error?.level === "soft") m.soft++;
  }
  return m;
}

const attention = (s: SectionBoard) =>
  s.metrics.blocking * 3 + s.metrics.awaitingReview + s.metrics.missing;

/** List the batches to score. */
export async function listBatches(): Promise<Batch[]> {
  const { batches } = await getBatches();
  return batches;
}

/** Reconcile one batch (roster + uploaded papers) — Faiza's computeBucket. */
export const loadBatchBucket = computeBucket;

/**
 * Fetch the answers-stage review state for a batch and reduce to per-student
 * maker/checker booleans. Returns [] on any failure (review plane is optional).
 */
export async function loadBatchReview(batchId: string): Promise<Array<[string, ReviewState]>> {
  try {
    const rows = await getReviewQueue(batchId, "answers");
    const out: Array<[string, ReviewState]> = [];
    for (const r of rows) {
      const sid = r.unit_ref?.student_id;
      if (!sid) continue;
      const checker = r.stage_approved === true;
      const maker = checker || MAKER_DONE.has(r.status);
      if (maker || checker) out.push([sid, { maker, checker }]);
    }
    return out;
  } catch {
    return [];
  }
}

/** Build the section boards from resolved buckets. Pure — re-run as buckets stream in. */
export function buildSections(
  batches: Batch[],
  buckets: Map<string, BucketData>,
  reviewByStudent: Map<string, ReviewState> = new Map(),
  nowMs: number = Date.now(),
): SectionBoard[] {
  const groups = new Map<string, Batch[]>();
  for (const b of batches) {
    const k = sectionKey(b);
    (groups.get(k) ?? groups.set(k, []).get(k)!).push(b);
  }

  const out: SectionBoard[] = [];
  for (const [key, secBatches] of groups) {
    const bds = secBatches.map((b) => buckets.get(b.batch_id)).filter((x): x is BucketData => Boolean(x));
    const first = secBatches[0];

    const arrived = bds.flatMap((d) => d.arrived);
    const misplacedCells = bds.flatMap((d) => d.misplaced);
    const missing = bds.flatMap((d) => d.missing);
    const expected = bds.reduce<number | null>(
      (mx, d) => (d.expected == null ? mx : Math.max(mx ?? 0, d.expected)),
      null,
    );

    const papersRaw = [
      ...arrived.map((c) => ({ c, mis: false })),
      ...misplacedCells.map((c) => ({ c, mis: true })),
    ];
    // Identity bug: papers exist but none reconcile → don't flood with missing/misplaced.
    const rosterUnlinked = arrived.length === 0 && papersRaw.length > 0 && (expected ?? 0) > 0;

    const cells: Cell[] = papersRaw.map(({ c, mis }) => {
      const cell = paperCell(c, mis && !rosterUnlinked, nowMs);
      const rv = reviewByStudent.get(c.key);
      if (rv) cell.review = rv;
      return cell;
    });
    if (!rosterUnlinked) for (const m of missing) cells.push(missingCell(m));

    cells.sort(
      (a, b) =>
        Number(b.error?.level === "blocking") - Number(a.error?.level === "blocking") ||
        PHASE_ORDER[a.vis.phase] - PHASE_ORDER[b.vis.phase],
    );

    out.push({
      key,
      label: `${norm(first.grade)} ${norm(first.section)}`.trim() || "—",
      school: norm(first.school_name),
      grade: norm(first.grade),
      year: (first as unknown as { academic_year?: string | null }).academic_year ?? null,
      subject: norm(first.subject),
      exam: norm(first.exam_type),
      section: norm(first.section),
      batchIds: secBatches.map((b) => b.batch_id),
      cells,
      expected,
      rosterUnlinked,
      metrics: computeMetrics(cells),
    });
  }

  out.sort((a, b) => attention(b) - attention(a) || a.label.localeCompare(b.label, undefined, { numeric: true }));
  return out;
}

/** Board-wide totals for the header. */
export function totalMetrics(sections: SectionBoard[]): SectionMetrics {
  const t: SectionMetrics = { papers: 0, completed: 0, inProgress: 0, awaitingReview: 0, missing: 0, misplaced: 0, blocking: 0, soft: 0 };
  for (const s of sections) (Object.keys(t) as (keyof SectionMetrics)[]).forEach((k) => (t[k] += s.metrics[k]));
  return t;
}

// ── Scope nav ──────────────────────────────────────────────────────────────
// The breadcrumb / Finder-columns filter drills the flat section list along
// School → Grade·Year → Subject·Exam → Section. A Scope is a partial selection;
// `filterSections` keeps the sections matching every set field (null = "any").

export interface Scope {
  school: string | null;
  grade: string | null;
  year: string | null;
  subject: string | null;
  exam: string | null;
  section: string | null;
}

export const EMPTY_SCOPE: Scope = { school: null, grade: null, year: null, subject: null, exam: null, section: null };

export const isEmptyScope = (s: Scope) =>
  !s.school && !s.grade && !s.year && !s.subject && !s.exam && !s.section;

/** Keep sections matching every set field of the scope (null fields match anything). */
export function filterSections(sections: SectionBoard[], sc: Scope): SectionBoard[] {
  return sections.filter(
    (s) =>
      (!sc.school || s.school === sc.school) &&
      (!sc.grade || s.grade === sc.grade) &&
      (!sc.year || s.year === sc.year) &&
      (!sc.subject || s.subject === sc.subject) &&
      (!sc.exam || s.exam === sc.exam) &&
      (!sc.section || s.section === sc.section),
  );
}

// The "selected granularity" = the deepest scope level NOT yet chosen — i.e. the dimension
// the board is currently sliced into. Drives the error roll-up's grouping.
export type Granularity = "school" | "grade" | "subject" | "section";
export function granularityOf(sc: Scope): Granularity {
  if (!sc.school) return "school";
  if (!sc.grade) return "grade";
  if (!sc.subject) return "subject";
  return "section";
}
/** A section's value at a given granularity — the roll-up group key/label. */
export function granValue(s: SectionBoard, g: Granularity): string {
  switch (g) {
    case "school": return s.school || "—";
    case "grade": return s.year ? `${s.grade} · ${s.year}` : (s.grade || "—");
    case "subject": return s.exam ? `${s.subject} · ${s.exam}` : (s.subject || "—");
    case "section": return `${s.grade}-${s.section}`.replace(/^-|-$/g, "") || "—";
  }
}

// "11" → "11th" etc. — grade is stored bare; the scope label wants an ordinal (Fahad's spec).
function gradeOrdinal(g: string): string {
  const n = Number(g);
  if (!Number.isFinite(n)) return g;
  const s = ["th", "st", "nd", "rd"], v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

/**
 * The scope as a human trailing phrase for the stage rollups, e.g.
 * "for DPS East • 11th 2025-26 • Physics Unit Test 2 • Section A".
 * Grade·year and subject·exam are each ONE coupled unit (no bullet between them).
 */
export function scopeLabel(sc: Scope): string {
  const parts: string[] = [];
  if (sc.school) parts.push(sc.school);
  if (sc.grade) parts.push(sc.year ? `${gradeOrdinal(sc.grade)} ${sc.year}` : gradeOrdinal(sc.grade));
  if (sc.subject) parts.push(sc.exam ? `${sc.subject} ${sc.exam}` : sc.subject);
  if (sc.section) parts.push(`Section ${sc.section}`);
  return parts.length ? `for ${parts.join(" • ")}` : "across all schools";
}
