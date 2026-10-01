// Scoreboard signal map — the single source of truth for how every paper signal
// renders. Derived from riverWorkflow (mid-pipeline statuses) + beaver-api (intake +
// review). See infnotes cld_scoreboard_signal_map.

export type PhaseId = "missing" | "scan" | "chunking" | "review_gate" | "extraction" | "done" | "unknown";

export interface StatusVis {
  phase: PhaseId;
  label: string; // short, for legend
  hover: string; // full sentence, for the cell tooltip
  cls: string; // tailwind bg (+ ring) for the cell
  anim?: boolean; // compute in flight → pulse
}

// Raw `batch_students.status` → visual. Keys are lowercased status strings.
// `processing` (River, generic OCR) and `ocr_running` (beaver-api) both = OCR in flight.
const STATUS: Record<string, StatusVis> = {
  uploaded:        { phase: "scan",        label: "Uploaded",        hover: "Uploaded — scanned in, waiting to start",            cls: "bg-amber-300" },
  preprocessing:   { phase: "scan",        label: "Preprocessing",   hover: "Preprocessing — uploading pages",                    cls: "bg-amber-400", anim: true },
  preprocessed:    { phase: "scan",        label: "Preprocessed",    hover: "Scanned & preprocessed — ready for chunking",        cls: "bg-amber-500" },
  partial:         { phase: "scan",        label: "Partial upload",  hover: "Partial — some pages failed to upload",              cls: "bg-amber-400" },
  bbox_detecting:  { phase: "chunking",    label: "Chunking",        hover: "Chunking — AI detecting answer boxes",               cls: "bg-violet-500", anim: true },
  bbox_detected:   { phase: "review_gate", label: "Awaiting review", hover: "Awaiting box review — needs an ops check",           cls: "bg-blue-500" },
  ocr_running:     { phase: "extraction",  label: "OCR",             hover: "OCR — reading the handwriting",                      cls: "bg-cyan-500", anim: true },
  processing:      { phase: "extraction",  label: "OCR",             hover: "OCR — reading the handwriting",                      cls: "bg-cyan-500", anim: true },
  ocr_completed:   { phase: "extraction",  label: "OCR done",        hover: "OCR complete",                                       cls: "bg-teal-500" },
  identifying_or:  { phase: "extraction",  label: "OR questions",    hover: "Identifying OR-choice questions",                    cls: "bg-indigo-400", anim: true },
  or_identified:   { phase: "extraction",  label: "OR questions",    hover: "OR-choice questions identified",                     cls: "bg-indigo-400" },
  extracting_grid: { phase: "extraction",  label: "Marks grid",      hover: "Reading the marks grid",                             cls: "bg-indigo-400", anim: true },
  processing_grid: { phase: "extraction",  label: "Marks grid",      hover: "Reading the marks grid",                             cls: "bg-indigo-400", anim: true },
  extracting_answers: { phase: "extraction", label: "Extracting",    hover: "Extracting answers",                                 cls: "bg-indigo-500", anim: true },
  posting_to_api:  { phase: "extraction",  label: "Publishing",      hover: "Publishing results",                                 cls: "bg-indigo-600", anim: true },
  completed:       { phase: "done",        label: "Completed",       hover: "Completed — over the waterfall",                     cls: "bg-emerald-500" },
};

const UNKNOWN: StatusVis = { phase: "unknown", label: "Unknown", hover: "Unknown status", cls: "bg-slate-400" };
export const MISSING_VIS: StatusVis = {
  phase: "missing", label: "Missing",
  hover: "Missing — on the roster but not yet scanned in",
  cls: "bg-transparent ring-1 ring-dashed ring-slate-300",
};

export function statusVis(status: string | null | undefined): StatusVis {
  const k = (status ?? "").trim().toLowerCase();
  if (!k) return UNKNOWN;
  return STATUS[k] ?? { ...UNKNOWN, label: status!, hover: `Status: ${status}` };
}

// ── Errors → a single exclamation overlay (orange soft / red blocking) ──────────
export type ErrorLevel = "soft" | "blocking";
export interface CellError { level: ErrorLevel; reason: string; }

// Hard failures freeze a paper at its last status (River never writes `failed`), so a
// compute paper untouched for this long is treated as STUCK = blocking.
export const STUCK_HOURS = 3;
const TERMINAL = new Set(["completed", "bbox_detected"]); // done, or a human gate (expected to wait)

export function hoursSince(iso: string | null | undefined, nowMs: number): number {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? (nowMs - t) / 3_600_000 : 0;
}

/** Classify a paper's error overlay. nowMs passed in so the data layer owns "now". */
export function classifyError(
  p: { status: string; misplaced: boolean; errorMessage: string | null; updatedAt: string | null },
  nowMs: number,
): CellError | null {
  const k = (p.status ?? "").toLowerCase();
  // Blocking: an explicit error, or stuck in a compute stage too long.
  if (p.errorMessage) return { level: "blocking", reason: p.errorMessage };
  if (k === "failed") return { level: "blocking", reason: "Processing failed" };
  if (!TERMINAL.has(k) && k !== "" && hoursSince(p.updatedAt, nowMs) >= STUCK_HOURS)
    return { level: "blocking", reason: `Stuck — no progress for ${Math.floor(hoursSince(p.updatedAt, nowMs))}h` };
  // Soft: scan/upload hiccups + placement — don't block downstream.
  if (k === "partial") return { level: "soft", reason: "Some pages failed to upload" };
  if (p.misplaced) return { level: "soft", reason: "Misplaced — not on this section's roster" };
  return null;
}

// ── Pipeline stages (the separate-stage panels) ─────────────────────────────────
// The board is one collapsible panel per pipeline stage. Only the wired stages render
// real per-paper data scoped to that stage; the rest are stubs — the framework is here
// so they slot in once their data is mapped. (Restored from the eed539c separate-stages
// design; the consolidated single-board layout it replaced is in git history.)
export type StageKey = "scanning" | "chunking" | "extraction";

export const STAGE_DEFS: Array<{ key: StageKey; title: string; enabled: boolean }> = [
  { key: "scanning", title: "Scanning & Uploading", enabled: true },
  { key: "chunking", title: "Answer Chunking", enabled: true },
  { key: "extraction", title: "Answer Extraction", enabled: true },
];

// Which global phases live "in" each stage. A paper before all of a stage's phases is
// "not yet"; past them, "cleared". This is what makes a status STAGE-SCOPED.
const STAGE_PHASES: Record<StageKey, PhaseId[]> = {
  scanning: ["scan"],
  chunking: ["chunking", "review_gate"],
  extraction: ["extraction"],
};
const STAGE_RANK: Record<StageKey, number> = { scanning: 1, chunking: 2, extraction: 3 };

/** The stage a paper's phase belongs to (null for missing/done/unknown). */
export function phaseStage(phase: PhaseId): StageKey | null {
  for (const k of Object.keys(STAGE_PHASES) as StageKey[]) {
    if (STAGE_PHASES[k].includes(phase)) return k;
  }
  return null;
}

// A paper's flow position as a rank, so we can tell "before / in / past" a given stage.
function phaseRank(phase: PhaseId): number {
  switch (phase) {
    case "missing": return 0;
    case "scan": return 1;
    case "chunking":
    case "review_gate": return 2;
    case "extraction": return 3;
    case "done": return 4;
    default: return 99; // unknown — render verbatim, never "cleared"
  }
}

// A paper re-projected onto ONE stage's vocabulary. Each panel renders this, not the raw
// global status, so it speaks only its own stage's language.
export type StageState = "in" | "cleared" | "notyet" | "missing";
export interface StageView {
  state: StageState;
  cls: string;
  label: string;
  hover: string;
  anim?: boolean;
  error: CellError | null;
}

const CLEARED: StageView = { state: "cleared", cls: "bg-emerald-400", label: "Cleared", hover: "Cleared this stage — moved downstream", error: null };
const NOT_YET: StageView = { state: "notyet", cls: "bg-slate-200", label: "Not yet", hover: "Hasn't reached this stage yet", error: null };
const SCAN_MISSING: StageView = { state: "missing", cls: MISSING_VIS.cls, label: "Missing", hover: MISSING_VIS.hover, error: null };

// The minimal cell shape the projector needs (Cell satisfies it; declared here to avoid
// importing from scanboard, which would be circular).
export interface ProjectableCell {
  kind: "paper" | "missing";
  vis: StatusVis;
  error: CellError | null;
  misplaced: boolean;
}

/** Project a paper onto a stage: its scoped status + scoped error. */
export function projectStage(cell: ProjectableCell, stage: StageKey): StageView {
  // A roster student with no paper only means something on the scanning ("is it here?")
  // axis; downstream stages can't speak about a paper that was never scanned.
  if (cell.kind === "missing") return stage === "scanning" ? SCAN_MISSING : NOT_YET;

  if (STAGE_PHASES[stage].includes(cell.vis.phase)) {
    // In the stage → real sub-status + this stage's errors.
    return { state: "in", cls: cell.vis.cls, label: cell.vis.label, hover: cell.vis.hover, anim: cell.vis.anim, error: cell.error };
  }
  if (phaseRank(cell.vis.phase) > STAGE_RANK[stage]) {
    // Past the stage → cleared. Placement (misplaced) is a roster concern that still
    // matters at the scanning stage even after the paper has moved on.
    return { ...CLEARED, error: stage === "scanning" && cell.misplaced ? cell.error : null };
  }
  return NOT_YET; // before the stage (or unknown)
}

export interface StageMetrics { papers: number; inStage: number; cleared: number; notYet: number; missing: number; blocking: number; soft: number; }

/** Stage-scoped tallies for a section's cells — the per-stage metric chips. */
export function stageMetrics(cells: ProjectableCell[], stage: StageKey): StageMetrics {
  const m: StageMetrics = { papers: 0, inStage: 0, cleared: 0, notYet: 0, missing: 0, blocking: 0, soft: 0 };
  for (const c of cells) {
    const v = projectStage(c, stage);
    if (v.state === "missing") { m.missing++; continue; }
    m.papers++;
    if (v.state === "in") m.inStage++;
    else if (v.state === "cleared") m.cleared++;
    else m.notYet++;
    if (v.error?.level === "blocking") m.blocking++;
    else if (v.error?.level === "soft") m.soft++;
  }
  return m;
}

// ── Stage rollup (the "X/Y done for {scope}" bar) ───────────────────────────────
// The noun shown in each panel's rollup bar. `done` = papers that have FINISHED that
// stage; `total` = papers present (non-missing) in the current scope.
export const STAGE_ROLLUP: Record<StageKey, string> = {
  scanning: "uploaded",
  chunking: "ans-chunks done",
  extraction: "ans-extractions done",
};

// A paper has "finished" a stage once it's past it (scanning also counts `preprocessed`,
// which is the scan phase's terminal sub-status = pages fully in).
function stageDone(cell: ProjectableCell & { status?: string }, stage: StageKey): boolean {
  if (cell.kind === "missing") return false;
  const rank = phaseRank(cell.vis.phase);
  switch (stage) {
    case "scanning": return rank > 1 || (cell.status ?? "").trim().toLowerCase() === "preprocessed";
    case "chunking": return rank > 2;      // past the bbox-review gate → extraction or beyond
    case "extraction": return rank >= 4;   // completed
  }
}

export function stageRollup(cells: Array<ProjectableCell & { status?: string }>, stage: StageKey): { done: number; total: number } {
  let done = 0, total = 0;
  for (const c of cells) {
    if (c.kind === "missing") continue;
    total++;
    if (stageDone(c, stage)) done++;
  }
  return { done, total };
}

// ── Legend (per stage) ──────────────────────────────────────────────────────────
export interface LegendItem { cls: string; label: string; anim?: boolean }

export const STAGE_LEGEND: Record<StageKey, LegendItem[]> = {
  scanning: [
    { cls: "bg-amber-300", label: "Uploaded" },
    { cls: "bg-amber-400", label: "Uploading pages", anim: true },
    { cls: "bg-amber-500", label: "Preprocessed" },
    { cls: "bg-emerald-400", label: "Cleared" },
    { cls: "bg-slate-200", label: "Not yet" },
    { cls: "bg-transparent ring-1 ring-dashed ring-slate-300", label: "Missing" },
  ],
  chunking: [
    { cls: "bg-violet-500", label: "Chunking", anim: true },
    { cls: "bg-blue-500", label: "Awaiting review" },
    { cls: "bg-emerald-400", label: "Cleared" },
    { cls: "bg-slate-200", label: "Not yet" },
  ],
  extraction: [
    { cls: "bg-cyan-500", label: "OCR / extraction", anim: true },
    { cls: "bg-emerald-400", label: "Cleared" },
    { cls: "bg-slate-200", label: "Not yet" },
  ],
};
