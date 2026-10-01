// The checks that decide whether a question/section can be run, and the plain
// wording used for each one. Kept in one place so the grid, the legend, the
// start drawer and the tooltips all say the same thing.

import type { AnswerStatus, Cell, CellState, PrepareQuestion, RunStatus, Stage, TaxonomyGrain } from "./api";

export type Verdict = "ready" | "warn" | "blocked" | "empty";

/** Bar colour per verdict. `warn` is the band just above the threshold. */
export const VERDICT_BAR: Record<Verdict, string> = {
  ready: "bg-emerald-500",
  warn: "bg-amber-500",
  blocked: "bg-rose-500",
  empty: "bg-gray-300",
};

/** How close above the threshold still counts as "close to the line". */
const WARN_MARGIN = 0.05;

export function cellVerdict(cell: Cell | undefined, threshold: number): Verdict {
  if (!cell || cell.answers === 0 || cell.coverage === null) return "empty";
  if (cell.coverage < threshold) return "blocked";
  if (cell.coverage < threshold + WARN_MARGIN) return "warn";
  return "ready";
}

export function cellExplanation(
  cell: Cell | undefined,
  threshold: number,
  section: string
): string {
  const verdict = cellVerdict(cell, threshold);
  if (verdict === "empty")
    return `Section ${section}: no answers lost marks here, so there is nothing for the agent to classify.`;
  const pct = Math.round((cell!.coverage ?? 0) * 100);
  const target = Math.round(threshold * 100);
  const head = `Section ${section}: ${cell!.with_text} of ${cell!.answers} answers that lost marks have readable text (${pct}%).`;
  if (verdict === "blocked")
    return `${head} That is under the ${target}% we need — the agent would be judging answers it cannot read. Blocked unless you give a reason.`;
  if (verdict === "warn")
    return `${head} Only just over the ${target}% we need. It will run, but expect more answers to come back uncoded.`;
  return `${head} Comfortably over the ${target}% we need.`;
}

// ── Cell state: where a cell stands on the dashboard ────────────────────────
// The grid is coloured by this, not by readable text. Green means a teacher can
// see every answer's diagnosis with a code; everything short of that has its
// own colour so "could be run" is never mistaken for "has been done".

/** The state to paint. Older servers send no `state`; fall back to readiness. */
export function cellState(cell: Cell | undefined, threshold: number): CellState {
  if (cell?.state) return cell.state;
  const v = cellVerdict(cell, threshold);
  return v === "empty" ? "empty" : v === "blocked" ? "blocked" : "ready";
}

export const CELL_STATE_ORDER: CellState[] = [
  "done",
  "exported_uncoded",
  "pending_apply",
  "partial",
  "ready",
  "blocked",
  "empty",
];

export const CELL_STATE_LABEL: Record<CellState, string> = {
  done: "On the dashboard",
  exported_uncoded: "Exported, some uncoded",
  pending_apply: "Classified, not applied",
  partial: "Partly classified",
  ready: "Not classified — ready",
  blocked: "Not classified — unreadable",
  empty: "Nothing to do",
};

export const CELL_STATE_CLASS: Record<CellState, string> = {
  done: "border-emerald-300 bg-emerald-50",
  exported_uncoded: "border-lime-300 bg-lime-50",
  pending_apply: "border-indigo-300 bg-indigo-50",
  partial: "border-amber-300 bg-amber-50",
  ready: "border-sky-200 bg-sky-50",
  blocked: "border-rose-200 bg-rose-50",
  empty: "border-gray-200 bg-gray-50",
};

export const CELL_STATE_SWATCH: Record<CellState, string> = {
  done: "bg-emerald-400",
  exported_uncoded: "bg-lime-400",
  pending_apply: "bg-indigo-400",
  partial: "bg-amber-400",
  ready: "bg-sky-400",
  blocked: "bg-rose-400",
  empty: "bg-gray-300",
};

export const CELL_STATE_EXPLAIN: Record<CellState, string> = {
  done: "Every answer that lost marks is on the dashboard with an error code (or a person's review). This is the only green.",
  exported_uncoded:
    "Every answer is on the dashboard, but some have no error code yet. Open the cell and re-code those — the diagnosis is kept, only the code is tried again.",
  pending_apply:
    "A finished run has verdicts for this cell that the dashboard has not received. Open the run from the Runs tab and apply it — no re-running needed.",
  partial:
    "Some answers are on the dashboard and others were never classified. Open the cell to classify just the ones that are missing.",
  ready:
    "Nothing here has been classified yet. Enough answers have readable text, so it can be started.",
  blocked:
    "Nothing here has been classified, and too few answers have readable text to start. Re-read the scans first (open the cell, or run an OCR sweep).",
  empty: "No answers in this section lost marks on this question, so there is nothing to classify.",
};

/** One sentence for a cell's tooltip: the state, with its numbers. */
export function cellStateWords(cell: Cell | undefined, threshold: number, section: string): string {
  const state = cellState(cell, threshold);
  if (state === "empty" || !cell) return `Section ${section}: ${CELL_STATE_EXPLAIN.empty}`;
  const onDash = cell.prod_students;
  const head =
    onDash == null
      ? `Section ${section}: ${cell.answers} answers lost marks; the dashboard could not be asked how many it holds.`
      : `Section ${section}: ${onDash} of ${cell.answers} answers that lost marks are on the dashboard, ${cell.prod_coded ?? 0} with a code.` +
        (cell.pending_apply ? ` ${cell.pending_apply} more are waiting in an unapplied run.` : "");
  return `${head} ${CELL_STATE_EXPLAIN[state]}`;
}

export const GRAIN_LABEL: Record<TaxonomyGrain, string> = {
  chapter: "Chapter codes",
  unit: "Unit codes only",
  none: "No codes",
};

export const GRAIN_CLASS: Record<TaxonomyGrain, string> = {
  chapter: "bg-emerald-50 text-emerald-800 border-emerald-200",
  unit: "bg-amber-50 text-amber-800 border-amber-200",
  none: "bg-rose-50 text-rose-800 border-rose-200",
};

export function grainExplanation(grain: TaxonomyGrain, codes: number): string {
  if (grain === "chapter")
    return `This question's chapter has its own ${codes} error codes. The agent can name faults precisely.`;
  if (grain === "unit")
    return `Only broader unit-level codes exist for this chapter (${codes} of them). The agent will still run, but the codes are coarser and fewer answers end up coded.`;
  return "No error codes exist for this chapter at all. The agent has nothing to classify into — either add codes first, or run it text-only so it writes findings without codes.";
}

/** Everything wrong with a question, worst first, in words a person can act on. */
export function questionBlockers(
  q: PrepareQuestion,
  sections: string[],
  threshold: number,
  unappliedCorrections: number
): { level: "blocked" | "warn"; text: string }[] {
  const out: { level: "blocked" | "warn"; text: string }[] = [];

  if (q.taxonomy.grain === "none")
    out.push({
      level: "blocked",
      text: "No error codes exist for this chapter. Run it text-only, or add codes first.",
    });

  const blockedSections = sections.filter(
    (s) => cellVerdict(q.cells[s], threshold) === "blocked"
  );
  if (blockedSections.length)
    out.push({
      level: "blocked",
      text: `Not enough readable text in ${
        blockedSections.length === 1 ? "section" : "sections"
      } ${blockedSections.join(", ")} — under ${Math.round(threshold * 100)}% of the answers that lost marks can be read.`,
    });

  if (q.taxonomy.grain === "unit")
    out.push({
      level: "warn",
      text: "Only unit-level codes are available, so the codes will be broader than usual.",
    });

  if (unappliedCorrections > 0)
    out.push({
      level: "warn",
      text: `${unappliedCorrections} OCR corrections for this paper have not been applied yet, so the agent would read the uncorrected text.`,
    });

  return out;
}

/** A question's chapter, or null — the API sends "" for questions with none. */
export function chapterOf(q: PrepareQuestion): string | null {
  const c = (q.chapter ?? "").trim();
  return c || null;
}

// ── Stage and status wording ───────────────────────────────────────────────

export const STAGE_LABEL: Record<Stage, string> = {
  pending: "waiting",
  dump: "pulling answers",
  classify: "classifying",
  check: "checking",
  stage: "staging",
  review: "reviewing",
  load: "loading",
  done: "done",
  needs_human: "needs a person",
  error: "error",
};

export const STAGE_CLASS: Record<Stage, string> = {
  pending: "bg-gray-100 text-gray-600 border-gray-200",
  dump: "bg-sky-50 text-sky-800 border-sky-200",
  classify: "bg-sky-50 text-sky-800 border-sky-200",
  check: "bg-indigo-50 text-indigo-800 border-indigo-200",
  stage: "bg-sky-50 text-sky-800 border-sky-200",
  review: "bg-indigo-50 text-indigo-800 border-indigo-200",
  load: "bg-indigo-50 text-indigo-800 border-indigo-200",
  done: "bg-emerald-50 text-emerald-800 border-emerald-200",
  needs_human: "bg-amber-50 text-amber-800 border-amber-200",
  error: "bg-rose-50 text-rose-800 border-rose-200",
};

export const STATUS_LABEL: Record<RunStatus, string> = {
  running: "Running",
  done: "Done",
  partial: "Partly done",
  blocked_on_ocr: "Blocked — text unreadable",
  brief_needs_human: "Brief needs a person",
  nothing_in_scope: "Nothing to do",
  cancelled: "Cancelled",
  failed: "Failed",
  blocked_on_taxonomy: "blocked on taxonomy",
  pending_apply: "pending apply",
  waiting_on_ops: "waiting on ops",
  stalled: "stalled",
};

export const STATUS_EXPLAIN: Record<RunStatus, string> = {
  running: "The workflow is still going.",
  done: "Every section finished.",
  partial: "Some sections finished and some did not — open the run to see which.",
  blocked_on_ocr:
    "Stopped before classifying: too few of the answers that lost marks have readable text.",
  brief_needs_human:
    "The agent could not settle the marking brief on its own and is waiting for a person.",
  nothing_in_scope: "Nothing matched the sections and questions asked for.",
  cancelled: "Someone stopped this run.",
  failed: "The workflow errored out.",
  blocked_on_taxonomy:
    "Stopped before classifying: a question that lost marks resolves to no codes in this grade and subject's taxonomy. Fix the chapter tag or the taxonomy, then start again.",
  pending_apply:
    "Everything automatic is done; verdicts or OCR corrections are waiting for a person to apply them.",
  waiting_on_ops:
    "Waited for the Ops TO-DO (a bounding box to be drawn) as long as it was allowed to. Start again once ops have drawn.",
  stalled: "Ran out of iterations with work still left — open the run to see what kept coming back.",
};

export const STATUS_CLASS: Record<RunStatus, string> = {
  running: "bg-sky-50 text-sky-800 border-sky-200",
  done: "bg-emerald-50 text-emerald-800 border-emerald-200",
  partial: "bg-amber-50 text-amber-800 border-amber-200",
  blocked_on_ocr: "bg-rose-50 text-rose-800 border-rose-200",
  brief_needs_human: "bg-amber-50 text-amber-800 border-amber-200",
  nothing_in_scope: "bg-gray-100 text-gray-600 border-gray-200",
  cancelled: "bg-gray-100 text-gray-600 border-gray-200",
  failed: "bg-rose-50 text-rose-800 border-rose-200",
  blocked_on_taxonomy: "bg-amber-50 text-amber-800 border-amber-200",
  pending_apply: "bg-indigo-50 text-indigo-800 border-indigo-200",
  waiting_on_ops: "bg-amber-50 text-amber-800 border-amber-200",
  stalled: "bg-rose-50 text-rose-800 border-rose-200",
};

export const KIND_LABEL: Record<string, string> = {
  classification: "Error classification",
  ocr_sweep: "OCR sweep",
  pipeline: "Section pipeline",
  sync: "Dashboard bridge",
  summaries: "AI summaries",
};

// ── Answer statuses (one cell, answer by answer) ────────────────────────────

export const ANSWER_STATUS_LABEL: Record<AnswerStatus, string> = {
  reviewed: "reviewed by a person",
  coded: "coded",
  uncoded: "uncoded",
  unclassified: "not classified",
  pending_apply: "waiting to be applied",
  no_text: "no text",
  no_crop_has_regions: "no crop (box drawn)",
  no_crop: "no bounding box",
  full_marks: "full marks",
  unresolved: "no admission number",
};

export const ANSWER_STATUS_CLASS: Record<AnswerStatus, string> = {
  reviewed: "bg-violet-50 text-violet-800 border-violet-200",
  coded: "bg-emerald-50 text-emerald-800 border-emerald-200",
  uncoded: "bg-amber-50 text-amber-800 border-amber-200",
  unclassified: "bg-sky-50 text-sky-800 border-sky-200",
  pending_apply: "bg-indigo-50 text-indigo-800 border-indigo-200",
  no_text: "bg-rose-50 text-rose-800 border-rose-200",
  no_crop_has_regions: "bg-orange-50 text-orange-800 border-orange-200",
  no_crop: "bg-gray-100 text-gray-700 border-gray-300",
  full_marks: "bg-gray-50 text-gray-500 border-gray-200",
  unresolved: "bg-gray-50 text-gray-500 border-gray-200",
};

export const ANSWER_STATUS_EXPLAIN: Record<AnswerStatus, string> = {
  reviewed:
    "A person has corrected this row on the dashboard. Runs never overwrite it, so there is nothing to do here.",
  coded: "The dashboard holds a taxonomy code for this answer.",
  uncoded:
    "It was classified, but no taxonomy code fitted. Re-coding keeps the diagnosis as written and only tries the code again — much cheaper than classifying afresh.",
  unclassified:
    "Readable text, lost marks, and no verdict anywhere yet. Classifying writes a fresh diagnosis and code.",
  pending_apply:
    "A finished run already has a verdict for this answer; the dashboard just has not received it. Apply that run from the Runs tab instead of re-running.",
  no_text:
    "The scan was cropped but nothing was ever transcribed. Re-reading sends the crop back through a reader.",
  no_crop_has_regions:
    "A bounding box is drawn but the crop image was never made. Rebuilding cuts it from the page image; then it can be re-read.",
  no_crop:
    "Nothing is drawn for this answer, so there is no picture to read. Someone has to draw the box in Answer Chunking — add it to the Ops TO-DO.",
  full_marks: "Did not lose marks, so it is outside the classification scope.",
  unresolved:
    "No admission number could be found for this student in either database, so their verdicts cannot be filed. Fix the roster first.",
};

/** The order statuses are listed in: things to act on first. */
export const ANSWER_STATUS_ORDER: AnswerStatus[] = [
  "uncoded",
  "unclassified",
  "no_text",
  "no_crop_has_regions",
  "no_crop",
  "pending_apply",
  "coded",
  "reviewed",
  "unresolved",
  "full_marks",
];

/** The short badge under a grid cell, or "" when there is nothing left over. */
export function cellProblemWords(cell: Cell | undefined): string {
  if (!cell || !cell.answers) return "";
  const parts: string[] = [];
  if (cell.prod_students != null) {
    const missing = Math.max(0, cell.answers - cell.prod_students);
    if (cell.prod_students === 0) parts.push("not classified");
    else if (missing > 0) parts.push(`${missing} not classified`);
    const uncoded = Math.max(0, cell.prod_students - (cell.prod_coded ?? 0));
    if (uncoded > 0) parts.push(`${uncoded} uncoded`);
  } else if (cell.prod_uncoded) parts.push(`${cell.prod_uncoded} uncoded`);
  if (cell.pending_apply) parts.push(`${cell.pending_apply} to apply`);
  const unreadable = cell.answers - cell.with_text;
  if (unreadable > 0) parts.push(`${unreadable} unreadable`);
  return parts.join(" · ");
}

// ── Formatting ─────────────────────────────────────────────────────────────

export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const secs = Math.round((Date.now() - then) / 1000);
  if (secs < 0) return "just now";
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

/** "in 4 min" for a moment in the future; "now" once it has passed. */
export function untilTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "—";
  const secs = Math.round((then - Date.now()) / 1000);
  if (secs <= 0) return "now";
  if (secs < 60) return `in ${secs}s`;
  const mins = Math.round(secs / 60);
  if (mins < 60) return `in ${mins} min`;
  return `in ${Math.round(mins / 60)}h`;
}

/**
 * Reads the numbers in a score object back as a sentence. Fractions between 0
 * and 1 are shown as percentages, which is how everyone talks about agreement.
 * The scorer's own multi-line report is left out — `scoreReport` returns that
 * separately so it can keep its line breaks.
 */
export function scoreWords(score: Record<string, unknown>): string {
  return Object.entries(score)
    .filter(([k, v]) => k !== "report" && v !== null && v !== undefined)
    .map(([k, v]) => {
      const label = k.replace(/_/g, " ");
      if (k === "passed") return v ? "matched the human answers" : "did not match";
      if (typeof v === "number" && v > 0 && v < 1)
        return `${label} ${Math.round(v * 100)}%`;
      return `${label} ${String(v)}`;
    })
    .join(" · ");
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function at(obj: unknown, path: string[]): unknown {
  let cur = obj;
  for (const key of path) {
    if (cur == null || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

/**
 * What the brief agent said when it stopped and asked for a person. It records
 * this under different keys depending on how it gave up, so take the first one
 * present and show it as written — never a summary of ours.
 */
export function briefReason(summary: Record<string, unknown> | null): string {
  const paths = [
    ["brief", "result", "reason"],
    ["brief", "reason"],
    ["brief", "result", "handoff"],
    ["brief", "handoff"],
    ["brief", "meta", "note"],
  ];
  for (const p of paths) {
    const v = str(at(summary, p));
    if (v) return v;
  }
  return "";
}

/** The same, for one section that errored or asked for a person. */
export function sectionReason(section: {
  error: string | null;
  result: Record<string, unknown> | null;
}): string {
  return (
    str(section.error) ||
    str(section.result?.reason) ||
    str(section.result?.handoff)
  );
}

/** The scorer's written report, if it wrote one. */
export function scoreReport(score: Record<string, unknown> | null): string {
  const r = score?.report;
  return typeof r === "string" ? r.trim() : "";
}

export function duration(from: string, to: string | null): string {
  const start = new Date(from).getTime();
  const end = to ? new Date(to).getTime() : Date.now();
  if (Number.isNaN(start) || Number.isNaN(end)) return "—";
  const secs = Math.max(0, Math.round((end - start) / 1000));
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
}

export function absoluteTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString(undefined, {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
