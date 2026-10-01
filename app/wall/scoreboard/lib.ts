// Scanning Scoreboard — data + validation for the per-batch buckets.
//
// A bucket answers one ops question per batch: "have all the students who were
// SUPPOSED to sit this exam been scanned in, and ONLY those students?"
//
//   expected  = the ONBOARDING roster the school provides before any scanning
//               (Name / AdmissionNo / Section / RollNumber), scoped to the
//               batch's exact (school, grade, section). This is the source of
//               truth — NOT the answer-based data-quality query (which is empty
//               until papers are graded). Fetched via /api/student-lookup/list.
//   uploaded  = the students actually scanned into the batch (loam_ops).
//
// Matching uploaded ↔ roster splits the uploaded papers into:
//   arrived   — uploaded AND on the section roster
//   misplaced — uploaded but NOT on the roster (wrong section/grade/school) →
//               a validation failure
//   missing   — on the roster but not yet uploaded
//
// Identity match: roll numbers are unreliable (uploads zero-pad to strings like
// "0010"; grade-12 onboarding rolls are null), so we match primarily on a
// normalised NAME ("AmoghShetty" ⇄ "Amogh Shetty" → "AMOGHSHETTY") and fall
// back to roll-as-integer ("0010" → 10).
//
// Bucket colour (section-STRICT, per ops decision):
//   green   — every expected student arrived and nobody is misplaced/failed
//   red     — at least one misplaced paper, or a failed scan (a batch whose
//             section isn't in the roster → every paper misplaced → red)
//   yellow  — still incomplete (some expected students haven't arrived yet)
//   unknown — the school has no onboarding roster at all → can't validate (gray)

import {
  getBatches,
  getBatchStudents,
  type Batch,
  type BatchStudent,
} from "@/app/(dashboard)/pdfExtract/lib/beaverApi";
import {
  listOnboardedStudents,
  type OnboardedStudent,
} from "@/app/(dashboard)/answerEditing/lib/dataQualityApi";

export type BucketStatus = "green" | "yellow" | "red" | "unknown";

export type StudentKind = "arrived" | "missing" | "misplaced";

export interface StudentCell {
  key: string;
  rollNumber: string;
  name: string;
  kind: StudentKind;
  failed: boolean;
  status?: string;
  updatedAt?: string; // for stuck detection (uploaded papers only)
  errorMessage?: string | null;
}

export interface BucketData {
  batch: Batch;
  expected: number | null; // section roster size; null = no school roster
  uploadedCount: number;
  arrived: StudentCell[];
  missing: StudentCell[];
  misplaced: StudentCell[];
  failedCount: number;
  status: BucketStatus;
}

// trim + uppercase (grade / section comparison)
const norm = (s: string | null | undefined) => (s ?? "").trim().toUpperCase();
// name match key: drop everything but letters/digits, uppercase
const normName = (s: string | null | undefined) => (s ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
// roll as integer (handles "0010" → 10); null when not numeric
const rollInt = (s: string | number | null | undefined) => {
  const n = parseInt(String(s ?? "").trim(), 10);
  return Number.isFinite(n) ? n : null;
};
const isFailed = (s: BatchStudent) =>
  Boolean(s.error_message) || /fail|error/i.test(s.status || "");

// The /list endpoint ignores grade/section, so fetch a school's roster once.
const schoolRosterCache = new Map<number, Promise<OnboardedStudent[] | null>>();
function schoolRoster(schoolId: number): Promise<OnboardedStudent[] | null> {
  let p = schoolRosterCache.get(schoolId);
  if (!p) {
    p = listOnboardedStudents(schoolId)
      .then((r) => (Array.isArray(r.students) ? r.students : null))
      .catch(() => null); // no token / no roster → unknown
    schoolRosterCache.set(schoolId, p);
  }
  return p;
}

/** Reset the per-session roster cache (used by a manual refresh). */
export function clearScoreboardCache() {
  schoolRosterCache.clear();
}

export async function computeBucket(batch: Batch): Promise<BucketData> {
  const [uploaded, school] = await Promise.all([
    getBatchStudents(batch.batch_id)
      .then((r) => r.students ?? [])
      .catch(() => [] as BatchStudent[]),
    schoolRoster(batch.school_id),
  ]);

  // No onboarding roster for this school at all → can't validate.
  if (!school) {
    return {
      batch,
      expected: null,
      uploadedCount: uploaded.length,
      arrived: [],
      missing: [],
      misplaced: [],
      failedCount: 0,
      status: "unknown",
    };
  }

  // Section-strict roster: the batch's exact (grade, section).
  const g = norm(batch.grade);
  const sec = norm(batch.section);
  const roster = school.filter((s) => norm(s.grade) === g && norm(s.section) === sec);
  const rosterNames = new Set(roster.map((s) => normName(s.name)));
  const rosterRolls = new Set(
    roster.map((s) => rollInt(s.rollNumber)).filter((x): x is number => x != null),
  );

  const matchedNames = new Set<string>();
  const matchedRolls = new Set<number>();
  const arrived: StudentCell[] = [];
  const misplaced: StudentCell[] = [];
  for (const u of uploaded) {
    const nm = normName(u.student_name);
    const rl = rollInt(u.roll_number);
    const hitName = nm !== "" && rosterNames.has(nm);
    const hitRoll = rl != null && rosterRolls.has(rl);
    const inRoster = hitName || hitRoll;
    const cell: StudentCell = {
      key: u.student_id || nm || u.student_name,
      rollNumber: u.roll_number || "—",
      name: u.student_name || "(unnamed)",
      kind: inRoster ? "arrived" : "misplaced",
      failed: isFailed(u),
      status: u.status,
      updatedAt: u.updated_at,
      errorMessage: u.error_message,
    };
    (inRoster ? arrived : misplaced).push(cell);
    if (hitName) matchedNames.add(nm);
    if (hitRoll && rl != null) matchedRolls.add(rl);
  }

  // Roster students nobody uploaded for.
  const missing: StudentCell[] = roster
    .filter((s) => {
      const nm = normName(s.name);
      const rl = rollInt(s.rollNumber);
      return !matchedNames.has(nm) && !(rl != null && matchedRolls.has(rl));
    })
    .map((s) => ({
      key: `roster-${s.id}`,
      rollNumber: s.rollNumber != null ? String(s.rollNumber) : "—",
      name: s.name || "(unnamed)",
      kind: "missing" as const,
      failed: false,
    }));

  const failedCount =
    arrived.filter((c) => c.failed).length + misplaced.filter((c) => c.failed).length;
  const expected = roster.length;

  let status: BucketStatus;
  if (misplaced.length > 0 || failedCount > 0) status = "red";
  else if (expected > 0 && arrived.length >= expected && missing.length === 0) status = "green";
  else if (expected === 0 && uploaded.length === 0) status = "unknown"; // nothing to show
  else status = "yellow";

  return {
    batch,
    expected,
    uploadedCount: uploaded.length,
    arrived,
    missing,
    misplaced,
    failedCount,
    status,
  };
}

/** List all batches (the buckets to show). Details are computed per-batch by the page. */
export async function listScoreboardBatches(): Promise<Batch[]> {
  const { batches } = await getBatches();
  return batches;
}

/** Fill level 0..1 for the bucket liquid: arrived / expected (or uploaded presence). */
export function fillLevel(b: BucketData): number {
  if (b.expected && b.expected > 0)
    return Math.min(1, b.arrived.length / b.expected);
  return b.uploadedCount > 0 ? 1 : 0;
}
