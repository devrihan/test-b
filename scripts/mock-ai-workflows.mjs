#!/usr/bin/env node
// Mock of beaver-api's /api/ai-workflows/* surface, for developing and
// reviewing the AI workflows page without heron, Temporal or a database.
//
//   node scripts/mock-ai-workflows.mjs            # listens on 4010
//   PORT=4020 node scripts/mock-ai-workflows.mjs
//
// Point the app at it:
//   NEXT_PUBLIC_BEAVER_API_URL=http://localhost:4010 npm run dev
//
// State lives in memory: starting a run appends to the run list and the run
// advances through its stages on a timer, so the Runs tab has something real
// to poll. Restarting the server resets everything back to the fixtures.
//
// Flags:
//   --unconfigured   report every dependency as not configured, to exercise
//                    the "backend is not set up" banner.

import http from "node:http";

const PORT = Number(process.env.PORT || 4010);
const UNCONFIGURED = process.argv.includes("--unconfigured");

// ── Fixtures ───────────────────────────────────────────────────────────────

const SECTIONS_8 = ["A", "B", "C", "D", "E", "F", "G", "H"];
const SECTIONS_4 = ["P", "Q", "R", "S"];
const SECTIONS_3 = ["A", "B", "C"];

const PAPERS = [
  {
    qp_id: "qp-2411",
    display_name: "Physics — Unit Test 1",
    exam: "Unit Test 1 (2026-27)",
    grade: "12",
    subject: "Physics",
    exam_type: "UT1",
    exam_date: "2026-07-14",
    batches: 8,
    sections: SECTIONS_8,
    students: 312,
  },
  {
    qp_id: "qp-2298",
    display_name: "Chemistry — Annual",
    exam: "Annual (2025-26)",
    grade: "11",
    subject: "Chemistry",
    exam_type: "ANNUAL",
    exam_date: "2026-03-02",
    batches: 4,
    sections: SECTIONS_4,
    students: 164,
  },
  {
    qp_id: "qp-2150",
    display_name: "Mathematics — Unit Test 2",
    exam: "Unit Test 2 (2026-27)",
    grade: "10",
    subject: "Mathematics",
    exam_type: "UT2",
    exam_date: "2026-08-21",
    batches: 3,
    sections: SECTIONS_3,
    students: 118,
  },
];

const CHAPTERS_12_PHY = [
  "Electric Charges and Fields",
  "Electrostatic Potential",
  "Current Electricity",
  "Moving Charges and Magnetism",
  "Electromagnetic Induction",
  "Alternating Current",
  "Ray Optics",
  "Wave Optics",
  "Dual Nature of Radiation",
  "Atoms and Nuclei",
];

const CHAPTERS_11_CHEM = [
  "Structure of Atom",
  "Chemical Bonding",
  "Thermodynamics",
  "Equilibrium",
  "Redox Reactions",
];

const CHAPTERS_10_MATH = [
  "Real Numbers",
  "Polynomials",
  "Pair of Linear Equations",
  "Triangles",
];

// Deterministic pseudo-random so the grid looks the same on every restart —
// a reviewer comparing two screenshots should see the same cells.
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buildQuestions(qpId, sections, count, chapters, seed) {
  const rnd = seeded(seed);
  const questions = [];
  for (let q = 1; q <= count; q += 1) {
    const chapter = chapters[(q - 1) % chapters.length];
    // Grain mix: most chapter-level, a few unit-level, one or two with nothing.
    let grain = "chapter";
    if (q % 7 === 0) grain = "unit";
    if (q % 11 === 0) grain = "none";
    const codes =
      grain === "none"
        ? []
        : grain === "unit"
          ? ["U-CONCEPT", "U-METHOD", "U-PRESENTATION"]
          : ["C-DEFINITION", "C-FORMULA", "C-SUBSTITUTION", "C-UNITS", "C-DIAGRAM"];

    const cells = {};
    for (const sec of sections) {
      const answers = 30 + Math.floor(rnd() * 15);
      // Skew coverage so the grid has a believable mix of ready / warn / blocked.
      const roll = rnd();
      let coverage;
      if (roll < 0.62) coverage = 0.85 + rnd() * 0.14;
      else if (roll < 0.82) coverage = 0.8 + rnd() * 0.05;
      else coverage = 0.42 + rnd() * 0.36;
      const withText = Math.round(answers * coverage);
      const noLosses = rnd() < 0.03;
      cells[sec] = noLosses
        ? { answers: 0, with_text: 0, coverage: null }
        : {
            answers,
            with_text: withText,
            coverage: Number((withText / answers).toFixed(3)),
          };
    }

    const hasGold = q % 3 === 1;
    const goldBroken = q === 5;
    const hasBrief = q % 4 === 1;

    questions.push({
      question: q,
      chapter: grain === "none" ? null : chapter,
      taxonomy: {
        key: grain === "none" ? "" : grain === "unit" ? `unit:${chapter}` : `chapter:${chapter}`,
        grain,
        codes,
      },
      gold_total: goldBroken ? null : hasGold ? 20 + Math.floor(rnd() * 30) : null,
      gold: goldBroken
        ? { error: "The gold sheet for this question has two rows with the same student id — fix the sheet before comparing." }
        : {},
      briefs: hasBrief
        ? [
            {
              run_id: `${qpId}-q${q}-cls-0007`,
              started_at: "2026-09-02T09:14:00Z",
            },
          ]
        : [],
      cells,
      prior_runs: hasBrief
        ? [
            {
              id: `${qpId}-q${q}-cls-0007`,
              mode: "compare",
              status: "done",
              sections: sections.slice(0, 2),
              coded: 61,
              rows_written: 70,
              started_at: "2026-09-02T09:14:00Z",
              started_by: "ops.anita",
            },
          ]
        : [],
    });
  }
  return questions;
}

const PREPARE = {
  "qp-2411": {
    paper: { qp_id: "qp-2411", display_name: "Physics — Unit Test 1", grade: "12", subject: "Physics" },
    sections: SECTIONS_8,
    threshold: 0.8,
    unapplied_corrections: 137,
    questions: buildQuestions("qp-2411", SECTIONS_8, 20, CHAPTERS_12_PHY, 20260714),
  },
  "qp-2298": {
    paper: { qp_id: "qp-2298", display_name: "Chemistry — Annual", grade: "11", subject: "Chemistry" },
    sections: SECTIONS_4,
    threshold: 0.8,
    unapplied_corrections: 0,
    questions: buildQuestions("qp-2298", SECTIONS_4, 12, CHAPTERS_11_CHEM, 20260302),
  },
  "qp-2150": {
    paper: { qp_id: "qp-2150", display_name: "Mathematics — Unit Test 2", grade: "10", subject: "Mathematics" },
    sections: SECTIONS_3,
    threshold: 0.8,
    unapplied_corrections: 4,
    questions: buildQuestions("qp-2150", SECTIONS_3, 8, CHAPTERS_10_MATH, 20260821),
  },
};

const now = Date.now();
const iso = (msAgo) => new Date(now - msAgo).toISOString();

function classificationRun(over) {
  return {
    id: over.id,
    workflow_id: `cls-${over.id}`,
    kind: "classification",
    qp_id: "qp-2411",
    exam_id: "ex-881",
    grade: "12",
    subject: "Physics",
    exam_name: "Unit Test 1 (2026-27)",
    question: 3,
    sections: ["A", "B"],
    mode: "compare",
    params: { brief: "author", text_only: false, model_brief: "sonnet", model_classify: "sonnet" },
    status: "done",
    summary: {},
    started_by: "ops.anita",
    started_at: iso(3 * 3600e3),
    finished_at: iso(3 * 3600e3 - 900e3),
    override_reason: null,
    applied_by: null,
    applied_at: null,
    lane: "lane-a",
    stages: { A: "done", B: "done" },
    coded: 58,
    rows_written: 66,
    ...over,
  };
}

const RUNS = [
  classificationRun({
    id: "r-1041",
    question: 7,
    sections: ["A", "B", "C"],
    mode: "load",
    status: "running",
    stages: { A: "done", B: "classify", C: "dump" },
    started_at: iso(6 * 60e3),
    finished_at: null,
    coded: 31,
    rows_written: 38,
    lane: "lane-a",
    params: { brief: "reuse", brief_src: "run:qp-2411-q7-cls-0007", text_only: false },
  }),
  classificationRun({
    id: "r-1040",
    question: 4,
    sections: ["A", "B", "C", "D"],
    mode: "load",
    status: "done",
    stages: { A: "done", B: "done", C: "done", D: "done" },
    coded: 143,
    rows_written: 152,
    started_at: iso(2 * 3600e3),
    finished_at: iso(2 * 3600e3 - 1420e3),
    applied_by: null,
    applied_at: null,
  }),
  classificationRun({
    id: "r-1039",
    question: 1,
    sections: ["A", "B"],
    mode: "compare",
    status: "partial",
    stages: { A: "done", B: "needs_human" },
    coded: 34,
    rows_written: 70,
    started_at: iso(5 * 3600e3),
    finished_at: iso(5 * 3600e3 - 1100e3),
  }),
  classificationRun({
    id: "r-1038",
    question: 12,
    sections: ["E"],
    mode: "load",
    status: "blocked_on_ocr",
    stages: { E: "error" },
    coded: 0,
    rows_written: 0,
    started_at: iso(26 * 3600e3),
    finished_at: iso(26 * 3600e3 - 40e3),
  }),
  classificationRun({
    id: "r-1037",
    question: 9,
    sections: ["A", "B"],
    mode: "load",
    status: "done",
    stages: { A: "done", B: "done" },
    coded: 71,
    rows_written: 74,
    started_at: iso(50 * 3600e3),
    finished_at: iso(50 * 3600e3 - 1300e3),
    applied_by: "ops.lead.rahul",
    applied_at: iso(49 * 3600e3),
  }),
  {
    id: "r-1036",
    workflow_id: "swp-r-1036",
    kind: "ocr_sweep",
    qp_id: "qp-2411",
    exam_id: "ex-881",
    grade: "12",
    subject: "Physics",
    exam_name: "Unit Test 1 (2026-27)",
    question: null,
    sections: ["A", "B", "C", "D"],
    mode: null,
    params: { min_question: 5, per_shard: 120, model_review: "sonnet", source: "crops" },
    status: "done",
    summary: { corrections_written: 418, shards: 4 },
    started_by: "ops.anita",
    started_at: iso(28 * 3600e3),
    finished_at: iso(28 * 3600e3 - 2600e3),
    override_reason: null,
    applied_by: null,
    applied_at: null,
    lane: "lane-sweep",
    stages: { "shard-1": "done", "shard-2": "done", "shard-3": "done", "shard-4": "done" },
    coded: null,
    rows_written: 418,
  },
];

const SECTIONS_DETAIL = {
  "r-1041": [
    {
      section: "A",
      stage: "done",
      answers: 38,
      rows_written: 38,
      coded: 31,
      uncoded: 7,
      task_meta: { model: "sonnet", lane: "lane-a", attempts: 1 },
      score: null,
      export: { rows: 38, path: "authored.tsv" },
      result: { paper_defects_found: 2, brief_disagreements: 1, handoff: "Two answers reference a figure that is missing from the scan; left uncoded." },
      error: null,
      updated_at: iso(90e3),
    },
    { section: "B", stage: "classify", answers: 41, rows_written: 0, coded: 0, uncoded: 0, task_meta: { model: "sonnet", lane: "lane-a", attempts: 1 }, score: null, export: null, result: null, error: null, updated_at: iso(20e3) },
    { section: "C", stage: "dump", answers: 36, rows_written: 0, coded: 0, uncoded: 0, task_meta: {}, score: null, export: null, result: null, error: null, updated_at: iso(10e3) },
  ],
  "r-1040": ["A", "B", "C", "D"].map((section, i) => ({
    section,
    stage: "done",
    answers: 36 + i,
    rows_written: 36 + i,
    coded: 34 + i,
    uncoded: 2,
    task_meta: { model: "sonnet", lane: "lane-a", attempts: 1 },
    score: null,
    export: { rows: 36 + i, path: "authored.tsv" },
    result: { paper_defects_found: i === 1 ? 3 : 0, brief_disagreements: 0, handoff: i === 1 ? "Three answers were written on the wrong side of the sheet." : "" },
    error: null,
    updated_at: iso(2 * 3600e3),
  })),
  "r-1039": [
    {
      section: "A",
      stage: "done",
      answers: 35,
      rows_written: 35,
      coded: 34,
      uncoded: 1,
      task_meta: { model: "sonnet", lane: "lane-b", attempts: 1 },
      score: { agreement: 0.86, n: 35, exact: 30, partial: 3, missed: 2 },
      export: { rows: 35, path: "authored.tsv" },
      result: { paper_defects_found: 0, brief_disagreements: 2, handoff: "" },
      error: null,
      updated_at: iso(5 * 3600e3),
    },
    {
      section: "B",
      stage: "needs_human",
      answers: 35,
      rows_written: 35,
      coded: 0,
      uncoded: 35,
      task_meta: { model: "sonnet", lane: "lane-b", attempts: 2 },
      score: null,
      export: null,
      result: null,
      error: "The brief and the gold sheet disagree on what counts as a unit error for this question. A person needs to settle it before the codes mean anything.",
      updated_at: iso(5 * 3600e3),
    },
  ],
  "r-1038": [
    {
      section: "E",
      stage: "error",
      answers: 0,
      rows_written: 0,
      coded: 0,
      uncoded: 0,
      task_meta: {},
      score: null,
      export: null,
      result: null,
      error: "Only 46% of the answers that lost marks have readable text. The agent would be guessing. Apply the pending OCR corrections, or start again with a reason.",
      updated_at: iso(26 * 3600e3),
    },
  ],
  "r-1037": ["A", "B"].map((section) => ({
    section,
    stage: "done",
    answers: 37,
    rows_written: 37,
    coded: 35,
    uncoded: 2,
    task_meta: { model: "sonnet", lane: "lane-a", attempts: 1 },
    score: null,
    export: { rows: 37, path: "authored.tsv" },
    result: { paper_defects_found: 0, brief_disagreements: 0, handoff: "" },
    error: null,
    updated_at: iso(50 * 3600e3),
  })),
  "r-1036": [1, 2, 3, 4].map((n) => ({
    section: `shard-${n}`,
    stage: "done",
    answers: 120,
    rows_written: 104 + n,
    coded: null,
    uncoded: null,
    task_meta: { model: "sonnet", lane: "lane-sweep" },
    score: null,
    export: { rows: 104 + n },
    result: { corrections_written: 104 + n },
    error: null,
    updated_at: iso(28 * 3600e3),
  })),
};

const EVENTS = {
  "r-1041": [
    { at: iso(6 * 60e3), who: "ops.anita", what: "started", detail: "Question 7, sections A B C, load mode, reusing the brief from run qp-2411-q7-cls-0007" },
    { at: iso(5 * 60e3), who: "system", what: "section A → dump", detail: "38 answers pulled" },
    { at: iso(3 * 60e3), who: "system", what: "section A → done", detail: "31 of 38 coded" },
    { at: iso(90e3), who: "system", what: "section B → classify", detail: "" },
  ],
  "r-1039": [
    { at: iso(5 * 3600e3), who: "ops.anita", what: "started", detail: "Question 1, sections A B, compare mode" },
    { at: iso(5 * 3600e3 - 600e3), who: "system", what: "section A → done", detail: "agreement 86% over 35 answers" },
    { at: iso(5 * 3600e3 - 1100e3), who: "system", what: "section B → needs a person", detail: "brief and gold sheet disagree" },
  ],
  "r-1040": [
    { at: iso(2 * 3600e3), who: "ops.anita", what: "started", detail: "Question 4, sections A B C D, load mode" },
    { at: iso(2 * 3600e3 - 700e3), who: "system", what: "section B → done", detail: "3 problems with the paper or the scan noted" },
    { at: iso(2 * 3600e3 - 1420e3), who: "system", what: "finished", detail: "143 of 152 coded" },
  ],
  "r-1038": [
    { at: iso(26 * 3600e3), who: "ops.anita", what: "started", detail: "Question 12, section E, load mode" },
    { at: iso(26 * 3600e3 - 40e3), who: "system", what: "stopped before classifying", detail: "only 46% of the answers that lost marks have readable text" },
  ],
  "r-1036": [
    { at: iso(28 * 3600e3), who: "ops.anita", what: "started", detail: "OCR sweep from question 5 onwards, sections A B C D" },
    { at: iso(28 * 3600e3 - 2600e3), who: "system", what: "finished", detail: "418 corrections written across 4 shards" },
  ],
  "r-1037": [
    { at: iso(50 * 3600e3), who: "ops.anita", what: "started", detail: "Question 9, sections A B, load mode" },
    { at: iso(50 * 3600e3 - 1300e3), who: "system", what: "finished", detail: "70 of 74 coded" },
    { at: iso(49 * 3600e3), who: "ops.lead.rahul", what: "applied to dashboard", detail: "74 rows written across 2 sections" },
  ],
};

const ARTIFACT_TEXT = {
  "brief.md": `# Marking brief — Question 7

## What the question asks
Derive the drift velocity of electrons in a conductor and use it to explain why
resistance rises with temperature. 5 marks.

## Where marks are lost
1. **Formula not stated** — the student jumps to a number without writing
   v = I / (n A e). Code: C-FORMULA.
2. **Substitution slip** — right formula, wrong value put in (often the
   cross-section in mm² not m²). Code: C-SUBSTITUTION.
3. **Units missing or wrong** — an answer given as a bare number. Code: C-UNITS.
4. **Definition muddled** — drift velocity described as the speed of the
   electric signal. Code: C-DEFINITION.
5. **No diagram where the marking scheme wants one.** Code: C-DIAGRAM.

## Boundary calls
- A correct formula written only inside the substitution line still counts as
  stated. Do not code C-FORMULA.
- If the arithmetic is right but the unit is absent, code C-UNITS alone, not
  C-SUBSTITUTION as well.
`,
  "authored.tsv": [
    "student_id\tquestion\tmarks_lost\tcodes\tevidence",
    "s-40118\t7\t2\tC-UNITS\t\"answer given as 1.2, no unit\"",
    "s-40119\t7\t3\tC-FORMULA;C-SUBSTITUTION\t\"no formula line; 2mm used as 2\"",
    "s-40120\t7\t1\tC-DIAGRAM\t\"no diagram\"",
    "s-40121\t7\t5\tC-DEFINITION\t\"describes signal speed\"",
    "s-40122\t7\t2\tC-SUBSTITUTION\t\"cross-section in mm^2\"",
  ].join("\n"),
  "score.txt": `Compared against 35 human-classified answers.

exact match       30   86%
partial match      3    9%
missed             2    6%

Most common disagreement: the agent codes C-UNITS where the human coded
C-SUBSTITUTION when both faults appear in the same line.
`,
  "export_dry.log": `dry run — nothing was written

section A
  insert into student_answer_error_codes   38 rows
  update  student_answer_crops.coded_at    38 rows
  warning: 7 answers have no code and will be left as they are

section B
  insert into student_answer_error_codes   41 rows
  update  student_answer_crops.coded_at    41 rows
`,
  "result.json": `{
  "paper_defects_found": 2,
  "brief_disagreements": 1,
  "handoff": "Two answers reference a figure that is missing from the scan; left uncoded.",
  "coded": 31,
  "rows_written": 38
}
`,
};

const ARTIFACTS = {
  "r-1041": [
    { section: "A", name: "brief.md", bytes: ARTIFACT_TEXT["brief.md"].length, created_at: iso(5 * 60e3) },
    { section: "A", name: "authored.tsv", bytes: ARTIFACT_TEXT["authored.tsv"].length, created_at: iso(3 * 60e3) },
    { section: "A", name: "result.json", bytes: ARTIFACT_TEXT["result.json"].length, created_at: iso(3 * 60e3) },
  ],
  "r-1040": ["A", "B", "C", "D"].flatMap((section) => [
    { section, name: "brief.md", bytes: ARTIFACT_TEXT["brief.md"].length, created_at: iso(2 * 3600e3) },
    { section, name: "authored.tsv", bytes: ARTIFACT_TEXT["authored.tsv"].length, created_at: iso(2 * 3600e3) },
    { section, name: "export_dry.log", bytes: ARTIFACT_TEXT["export_dry.log"].length, created_at: iso(2 * 3600e3) },
  ]),
  "r-1039": [
    { section: "A", name: "brief.md", bytes: ARTIFACT_TEXT["brief.md"].length, created_at: iso(5 * 3600e3) },
    { section: "A", name: "score.txt", bytes: ARTIFACT_TEXT["score.txt"].length, created_at: iso(5 * 3600e3) },
  ],
  "r-1037": ["A", "B"].map((section) => ({ section, name: "authored.tsv", bytes: ARTIFACT_TEXT["authored.tsv"].length, created_at: iso(50 * 3600e3) })),
};

const LANES = {
  workers: [
    {
      host: "claude-server-01",
      lane: "lane-a",
      kind: "classification",
      queue: "heron-classify-a",
      logins: [
        { name: "agent-01", max_parallel: 3, in_flight: 2, state: "working", cooling_until: null },
        { name: "agent-02", max_parallel: 3, in_flight: 1, state: "working", cooling_until: null },
      ],
      slots_in_use: 3,
      code_sha: "8f31c0a94d2b7e5613aa",
      seen_at: iso(9e3),
      age_s: 9,
      stale: false,
    },
    {
      host: "claude-server-01",
      lane: "lane-b",
      kind: "classification",
      queue: "heron-classify-b",
      logins: [{ name: "agent-03", max_parallel: 2, in_flight: 0, state: "cooling", cooling_until: new Date(now + 640e3).toISOString() }],
      slots_in_use: 0,
      code_sha: "8f31c0a94d2b7e5613aa",
      seen_at: iso(21e3),
      age_s: 21,
      stale: false,
    },
    {
      host: "claude-server-02",
      lane: "lane-sweep",
      kind: "ocr_sweep",
      queue: "heron-sweep",
      logins: [{ name: "agent-07", max_parallel: 4, in_flight: 0, state: "idle", cooling_until: null }],
      slots_in_use: 0,
      code_sha: "3c07be115fa9d0442277",
      seen_at: iso(41 * 60e3),
      age_s: 2460,
      stale: true,
    },
  ],
  running: {
    "heron-classify-a": [
      { workflow_id: "cls-r-1041", type: "ClassificationWorkflow", started: iso(6 * 60e3) },
    ],
    "heron-classify-b": [],
    "heron-sweep": [],
  },
};

// ── Mutable state ──────────────────────────────────────────────────────────

const runs = [...RUNS];
const sectionsDetail = { ...SECTIONS_DETAIL };
const events = { ...EVENTS };
const artifacts = { ...ARTIFACTS };
let nextRunNumber = 1042;

const CLASSIFICATION_STAGES = ["pending", "dump", "classify", "check", "done"];
const SWEEP_STAGES = ["pending", "stage", "review", "load", "done"];

// Advance runs started through this server one stage every few seconds, so the
// Runs tab has live movement to poll. The seeded fixtures are left exactly as
// authored — a reviewer opening the page an hour later still finds a run in
// each state.
const FIXTURE_IDS = new Set(RUNS.map((r) => r.id));

setInterval(() => {
  for (const run of runs) {
    if (run.status !== "running" || FIXTURE_IDS.has(run.id)) continue;
    const order = run.kind === "ocr_sweep" ? SWEEP_STAGES : CLASSIFICATION_STAGES;
    const detail = sectionsDetail[run.id] ?? [];
    let moved = false;
    for (const row of detail) {
      const i = order.indexOf(row.stage);
      if (i >= 0 && i < order.length - 1) {
        row.stage = order[i + 1];
        row.updated_at = new Date().toISOString();
        if (row.stage === "done") {
          row.rows_written = row.answers;
          row.coded = Math.round(row.answers * 0.85);
          row.export = { rows: row.answers, path: "authored.tsv" };
          row.result = { paper_defects_found: 0, brief_disagreements: 0, handoff: "" };
        }
        run.stages[row.section] = row.stage;
        (events[run.id] ??= []).push({
          at: new Date().toISOString(),
          who: "system",
          what: `section ${row.section} → ${row.stage}`,
          detail: "",
        });
        moved = true;
        break;
      }
    }
    if (!moved) {
      run.status = "done";
      run.finished_at = new Date().toISOString();
      run.rows_written = detail.reduce((a, r) => a + (r.rows_written || 0), 0);
      run.coded = detail.reduce((a, r) => a + (r.coded || 0), 0);
      (events[run.id] ??= []).push({ at: new Date().toISOString(), who: "system", what: "finished", detail: "" });
    }
  }
}, 6000);

// ── Routing ────────────────────────────────────────────────────────────────

function send(res, status, body, contentType = "application/json") {
  const payload = contentType === "application/json" ? JSON.stringify(body) : String(body);
  res.writeHead(status, {
    "Content-Type": contentType === "application/json" ? "application/json" : "text/plain; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Cache-Control": "no-store",
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        resolve({});
      }
    });
  });
}

function health() {
  if (UNCONFIGURED) {
    const off = { configured: false, ok: false, error: "No connection string is set for this environment." };
    return { pg_ledger: off, temporal: off, loam_ops: off, loam_db: off };
  }
  return {
    pg_ledger: { configured: true, ok: true },
    temporal: { configured: true, ok: true, namespace: "default", address: "temporal.internal:7233" },
    loam_ops: { configured: true, ok: true },
    loam_db: { configured: true, ok: false, error: "connection refused — the dashboard database is not reachable from this host" },
  };
}

const server = http.createServer(async (req, res) => {
  if (req.method === "OPTIONS") return send(res, 204, {});

  const url = new URL(req.url, `http://localhost:${PORT}`);
  const path = url.pathname.replace(/^\/api\/ai-workflows/, "");
  const q = url.searchParams;

  // GET /health
  if (req.method === "GET" && path === "/health") return send(res, 200, health());

  // GET /lanes
  if (req.method === "GET" && path === "/lanes") return send(res, 200, LANES);

  // GET /papers
  if (req.method === "GET" && path === "/papers") return send(res, 200, PAPERS);

  // GET /papers/{qp}/prepare
  let m = path.match(/^\/papers\/([^/]+)\/prepare$/);
  if (req.method === "GET" && m) {
    const data = PREPARE[decodeURIComponent(m[1])];
    if (!data) return send(res, 404, { detail: `No paper with id ${m[1]}.` });
    return send(res, 200, data);
  }

  // GET /papers/{qp}/sweep-preview
  m = path.match(/^\/papers\/([^/]+)\/sweep-preview$/);
  if (req.method === "GET" && m) {
    const data = PREPARE[decodeURIComponent(m[1])];
    if (!data) return send(res, 404, { detail: `No paper with id ${m[1]}.` });
    const secs = q.get("sections") ? q.get("sections").split(",").filter(Boolean) : data.sections;
    const explicit = q.get("questions") ? q.get("questions").split(",").filter(Boolean).map(Number) : null;
    const minQ = q.get("min_question") ? Number(q.get("min_question")) : null;
    const qs = data.questions.filter(
      (row) => (explicit ? explicit.includes(row.question) : true) && (minQ ? row.question >= minQ : true)
    );
    let answers = 0;
    for (const row of qs) for (const s of secs) answers += row.cells[s]?.answers ?? 0;
    const perShard = Number(q.get("per_shard") || 120);
    const shardCount = Math.max(1, Math.ceil(answers / perShard));
    const students = Math.round(answers / Math.max(1, qs.length));
    return send(res, 200, {
      answers,
      students,
      sections: secs,
      empty_ocr: Math.round(answers * 0.11),
      no_crop: Math.round(answers * 0.02),
      shards: Array.from({ length: shardCount }, (_, i) => ({
        shard: `shard-${i + 1}`,
        answers: Math.min(perShard, answers - i * perShard),
        students: Math.round(Math.min(perShard, answers - i * perShard) / Math.max(1, qs.length)),
      })),
    });
  }

  // POST /runs/classification
  if (req.method === "POST" && path === "/runs/classification") {
    const body = await readBody(req);
    if (!body.qp || !body.question) return send(res, 422, { detail: "A paper and a question number are both required." });
    if (!Array.isArray(body.sections) || body.sections.length === 0)
      return send(res, 400, { detail: "Pick at least one section to run." });
    const prepare = PREPARE[body.qp];
    const row = prepare?.questions.find((x) => x.question === Number(body.question));
    const blocked = !body.ignore_preflight && (body.sections ?? []).filter((s) => {
      const cell = row?.cells?.[s];
      return cell && cell.coverage !== null && cell.coverage < (body.coverage_threshold ?? 0.8);
    });
    if (blocked && blocked.length && !body.override_reason)
      return send(res, 400, {
        detail: `Sections ${blocked.join(", ")} are below the readable-text threshold. Give a reason to run them anyway.`,
      });
    if (runs.some((r) => r.status === "running" && r.qp_id === body.qp && r.question === Number(body.question)))
      return send(res, 409, { detail: `Question ${body.question} already has a run in flight. Wait for it or cancel it first.` });

    const id = `r-${nextRunNumber++}`;
    const run = {
      id,
      workflow_id: `cls-${id}`,
      kind: "classification",
      qp_id: body.qp,
      exam_id: "ex-881",
      grade: prepare?.paper.grade ?? "",
      subject: prepare?.paper.subject ?? "",
      exam_name: PAPERS.find((p) => p.qp_id === body.qp)?.exam ?? "",
      question: Number(body.question),
      sections: body.sections,
      mode: body.mode ?? "load",
      params: {
        brief: body.brief ?? "author",
        brief_src: body.brief_src ?? null,
        text_only: !!body.text_only,
        model_brief: body.model_brief ?? "sonnet",
        model_classify: body.model_classify ?? "sonnet",
        coverage_threshold: body.coverage_threshold ?? 0.8,
      },
      status: "running",
      summary: {},
      started_by: "you",
      started_at: new Date().toISOString(),
      finished_at: null,
      override_reason: body.override_reason ?? null,
      applied_by: null,
      applied_at: null,
      lane: "lane-a",
      stages: Object.fromEntries(body.sections.map((s) => [s, "pending"])),
      coded: 0,
      rows_written: 0,
    };
    runs.unshift(run);
    sectionsDetail[id] = body.sections.map((section) => ({
      section,
      stage: "pending",
      answers: row?.cells?.[section]?.answers ?? 30,
      rows_written: 0,
      coded: 0,
      uncoded: 0,
      task_meta: { model: body.model_classify ?? "sonnet" },
      score: null,
      export: null,
      result: null,
      error: null,
      updated_at: new Date().toISOString(),
    }));
    events[id] = [
      {
        at: new Date().toISOString(),
        who: "you",
        what: "started",
        detail: `Question ${body.question}, sections ${body.sections.join(" ")}, ${body.mode ?? "load"} mode`,
      },
    ];
    artifacts[id] = [];
    return send(res, 200, run);
  }

  // POST /runs/sweep
  if (req.method === "POST" && path === "/runs/sweep") {
    const body = await readBody(req);
    if (!body.qp) return send(res, 422, { detail: "A paper is required." });
    const prepare = PREPARE[body.qp];
    const secs = body.sections?.length ? body.sections : (prepare?.sections ?? []);
    const id = `r-${nextRunNumber++}`;
    const shards = ["shard-1", "shard-2", "shard-3"];
    const run = {
      id,
      workflow_id: `swp-${id}`,
      kind: "ocr_sweep",
      qp_id: body.qp,
      exam_id: "ex-881",
      grade: prepare?.paper.grade ?? "",
      subject: prepare?.paper.subject ?? "",
      exam_name: PAPERS.find((p) => p.qp_id === body.qp)?.exam ?? "",
      question: null,
      sections: secs,
      mode: null,
      params: {
        min_question: body.min_question ?? null,
        questions: body.questions ?? null,
        per_shard: body.per_shard ?? 120,
        model_review: body.model_review ?? "sonnet",
        source: body.source ?? "crops",
      },
      status: "running",
      summary: {},
      started_by: "you",
      started_at: new Date().toISOString(),
      finished_at: null,
      override_reason: null,
      applied_by: null,
      applied_at: null,
      lane: "lane-sweep",
      stages: Object.fromEntries(shards.map((s) => [s, "pending"])),
      coded: null,
      rows_written: 0,
    };
    runs.unshift(run);
    sectionsDetail[id] = shards.map((section) => ({
      section,
      stage: "pending",
      answers: body.per_shard ?? 120,
      rows_written: 0,
      coded: null,
      uncoded: null,
      task_meta: { model: body.model_review ?? "sonnet" },
      score: null,
      export: null,
      result: null,
      error: null,
      updated_at: new Date().toISOString(),
    }));
    events[id] = [{ at: new Date().toISOString(), who: "you", what: "started", detail: `OCR sweep over sections ${secs.join(" ")}` }];
    artifacts[id] = [];
    return send(res, 200, run);
  }

  // GET /runs
  if (req.method === "GET" && path === "/runs") {
    let out = runs;
    if (q.get("qp")) out = out.filter((r) => r.qp_id === q.get("qp"));
    if (q.get("status")) out = out.filter((r) => r.status === q.get("status"));
    if (q.get("kind")) out = out.filter((r) => r.kind === q.get("kind"));
    const limit = Number(q.get("limit") || 100);
    return send(res, 200, out.slice(0, limit));
  }

  // GET /runs/{id}/artifacts/{section}/{name}
  m = path.match(/^\/runs\/([^/]+)\/artifacts\/([^/]+)\/([^/]+)$/);
  if (req.method === "GET" && m) {
    const text = ARTIFACT_TEXT[decodeURIComponent(m[3])];
    if (!text) return send(res, 404, { detail: `No file named ${m[3]} on this run.` });
    return send(res, 200, text, "text/plain");
  }

  // GET /runs/{id}/artifacts
  m = path.match(/^\/runs\/([^/]+)\/artifacts$/);
  if (req.method === "GET" && m) return send(res, 200, artifacts[decodeURIComponent(m[1])] ?? []);

  // POST /runs/{id}/cancel
  m = path.match(/^\/runs\/([^/]+)\/cancel$/);
  if (req.method === "POST" && m) {
    const run = runs.find((r) => r.id === decodeURIComponent(m[1]));
    if (!run) return send(res, 404, { detail: "No run with that id." });
    run.status = "cancelled";
    run.finished_at = new Date().toISOString();
    (events[run.id] ??= []).push({ at: new Date().toISOString(), who: "you", what: "cancelled", detail: "" });
    return send(res, 200, run);
  }

  // POST /runs/{id}/apply
  m = path.match(/^\/runs\/([^/]+)\/apply$/);
  if (req.method === "POST" && m) {
    const run = runs.find((r) => r.id === decodeURIComponent(m[1]));
    if (!run) return send(res, 404, { detail: "No run with that id." });
    if (run.id === "r-1040" && !run.applied_at && process.env.MOCK_APPLY_FORBIDDEN === "1")
      return send(res, 403, { detail: "Only an operations lead can write results to the dashboard. Ask a lead to apply this run." });
    const detail = sectionsDetail[run.id] ?? [];
    const sections = {};
    for (const row of detail) {
      sections[row.section] = {
        statements: {
          "insert student_answer_error_codes": row.rows_written,
          "update student_answer_crops.coded_at": row.rows_written,
        },
        warnings: row.uncoded ? [`${row.uncoded} answers have no code and were left unchanged.`] : [],
      };
    }
    run.applied_by = "you";
    run.applied_at = new Date().toISOString();
    (events[run.id] ??= []).push({ at: run.applied_at, who: "you", what: "applied to dashboard", detail: "" });
    return send(res, 200, { sections, applied_by: run.applied_by, applied_at: run.applied_at });
  }

  // GET /runs/{id}
  m = path.match(/^\/runs\/([^/]+)$/);
  if (req.method === "GET" && m) {
    const id = decodeURIComponent(m[1]);
    const run = runs.find((r) => r.id === id);
    if (!run) return send(res, 404, { detail: `No run with id ${id}.` });
    return send(res, 200, {
      ...run,
      sections_detail: sectionsDetail[id] ?? [],
      events: events[id] ?? [],
      live_status: run.status === "running" ? { workflow_status: "RUNNING", task_queue: "heron-classify-a", run_id: `t-${id}` } : undefined,
    });
  }

  return send(res, 404, { detail: `No endpoint ${req.method} ${url.pathname} on the mock.` });
});

server.listen(PORT, () => {
  console.log(`mock ai-workflows API on http://localhost:${PORT}/api/ai-workflows`);
  if (UNCONFIGURED) console.log("running with --unconfigured: every dependency reports as not set up");
});
