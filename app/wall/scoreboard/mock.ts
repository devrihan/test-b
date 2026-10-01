// Mock feed for the scoreboard — a self-contained set of sections + papers spanning every
// scan/upload sub-status, error, and roster case, so the separate-stage panels, scoped
// statuses, inline student list, and scope-nav can all be eyeballed WITHOUT a backend.
//
// Gated entirely by NEXT_PUBLIC_SCOREBOARD_MOCK=1 (see page.tsx) — never used in prod.

import { statusVis, classifyError, MISSING_VIS } from "./phases";
import type { Cell, SectionBoard, SectionMetrics } from "./scanboard";

const NAMES = [
  "Aarav Sharma", "Diya Patel", "Kabir Singh", "Ananya Reddy", "Vivaan Gupta",
  "Ishaan Nair", "Saanvi Iyer", "Reyansh Rao", "Aadhya Menon", "Arjun Mehta",
  "Myra Desai", "Vihaan Joshi", "Anika Kapoor", "Krishna Bose", "Sara Pillai",
  "Aryan Verma", "Navya Shah", "Dhruv Malhotra", "Pari Chawla", "Advait Ghosh",
  "Riya Banerjee", "Kiaan Sethi", "Tara Kulkarni", "Veer Saxena", "Mira Trivedi",
  "Shaurya Bhat", "Ira Mishra", "Yash Agarwal", "Zara Khan", "Atharv Das",
  "Nitara Jain", "Rudra Pandey", "Kyra Sinha", "Ayaan Hegde", "Siya Bhatt",
  "Ved Chauhan", "Anvi Naidu", "Reyaan Roy", "Mahira Lal", "Devansh Vyas",
];

// One paper (or a missing roster slot). status "" → a missing ghost.
function cell(
  i: number,
  roll: number,
  status: string,
  opts: { misplaced?: boolean; errorMessage?: string | null; stuckHours?: number } = {},
): Cell {
  const kind = status === "" ? "missing" : "paper";
  const vis = status === "" ? MISSING_VIS : statusVis(status);
  const updatedAt = opts.stuckHours
    ? new Date(Date.now() - opts.stuckHours * 3_600_000).toISOString()
    : new Date().toISOString();
  const error =
    kind === "paper"
      ? classifyError({ status, misplaced: !!opts.misplaced, errorMessage: opts.errorMessage ?? null, updatedAt }, Date.now())
      : null;
  const name = NAMES[i % NAMES.length];
  const rollStr = String(roll).padStart(2, "0");
  return {
    id: `m-${i}`,
    studentId: `m-${i}`,
    name,
    roll: rollStr,
    kind,
    status,
    vis,
    error,
    misplaced: !!opts.misplaced,
    updatedAt: kind === "paper" ? updatedAt : null,
    hover: `#${rollStr} ${name} — ${vis.hover}`,
  };
}

function metricsOf(cells: Cell[]): SectionMetrics {
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

// A compact section builder. `spec` is a list of [count, status, opts?] runs.
function section(
  meta: { school: string; grade: string; subject: string; exam: string; section: string; expected?: number },
  spec: Array<[number, string, Parameters<typeof cell>[3]?]>,
): SectionBoard {
  const cells: Cell[] = [];
  let roll = 1;
  let i = 0;
  for (const [n, status, opts] of spec) {
    for (let k = 0; k < n; k++) cells.push(cell(i++, roll++, status, opts ?? {}));
  }
  // Mirror the real feed (buildSections): surface errored papers to the top.
  cells.sort(
    (a, b) =>
      Number(b.error?.level === "blocking") - Number(a.error?.level === "blocking") ||
      Number(!!b.error) - Number(!!a.error),
  );
  return {
    key: `${meta.school}|${meta.grade}|${meta.subject}|${meta.exam}|${meta.section}`,
    label: `${meta.grade} ${meta.section}`,
    school: meta.school,
    grade: meta.grade,
    year: "2025-26",
    subject: meta.subject,
    exam: meta.exam,
    section: meta.section,
    batchIds: [`mock_${meta.section}`],
    cells,
    expected: meta.expected ?? cells.length,
    rosterUnlinked: false,
    metrics: metricsOf(cells),
  };
}

export function mockSections(): SectionBoard[] {
  return [
    // Healthy: mostly preprocessed/cleared, one still uploading, one missing.
    section(
      { school: "DPS East", grade: "12", subject: "Maths", exam: "Preboard 1", section: "A", expected: 40 },
      [[18, "preprocessed"], [10, "completed"], [6, "bbox_detected"], [3, "preprocessing"], [2, "uploaded"], [1, "", {}]],
    ),
    // Mid-upload + trouble: a partial upload (soft) and one stuck paper (blocking).
    section(
      { school: "DPS East", grade: "12", subject: "Maths", exam: "Preboard 1", section: "B", expected: 38 },
      [[12, "uploaded"], [9, "preprocessing"], [6, "preprocessed"], [1, "partial"], [1, "preprocessing", { stuckHours: 5 }], [2, "", {}]],
    ),
    // Mostly past scanning (cleared), a couple not back yet (missing).
    section(
      { school: "DPS East", grade: "12", subject: "Maths", exam: "Preboard 1", section: "C", expected: 34 },
      [[20, "completed"], [8, "ocr_running"], [3, "bbox_detected"], [3, "", {}]],
    ),
    // Different subject/grade so the scope-nav has real branches.
    section(
      { school: "DPS East", grade: "11", subject: "Physics", exam: "Unit Test 2", section: "A", expected: 30 },
      [[10, "preprocessed"], [8, "uploaded"], [5, "preprocessing"], [1, "partial"], [6, "", {}]],
    ),
    section(
      { school: "DPS East", grade: "11", subject: "Physics", exam: "Unit Test 2", section: "B", expected: 12 },
      [[6, "preprocessed"], [4, "completed"], [2, "uploaded"]],
    ),
    // Second school + a misplaced paper (uploaded but not on this section's roster).
    section(
      { school: "DPS West", grade: "12", subject: "Maths", exam: "Preboard 1", section: "A", expected: 28 },
      [[14, "preprocessed"], [6, "preprocessing"], [4, "uploaded"], [1, "uploaded", { misplaced: true }], [3, "", {}]],
    ),
  ];
}
