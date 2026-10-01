"use client";

// The readiness grid: one row per question, one column per section. Every cell
// answers the same question — could the agent read enough of these answers to
// judge them? — and every colour has a sentence behind it.

import { useMemo, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
  Spinner,
} from "@student-ds/ui";
import { ChevronDown, ChevronLeft, ChevronRight, FileText, Play } from "lucide-react";
import { applyPaperCorrections, errMsg, type Prepare, type PrepareQuestion } from "../lib/api";
import {
  CELL_STATE_CLASS,
  CELL_STATE_EXPLAIN,
  CELL_STATE_LABEL,
  CELL_STATE_ORDER,
  CELL_STATE_SWATCH,
  GRAIN_CLASS,
  GRAIN_LABEL,
  cellExplanation,
  cellProblemWords,
  cellState,
  cellStateWords,
  cellVerdict,
  chapterOf,
  grainExplanation,
  questionBlockers,
  relativeTime,
} from "../lib/readiness";
import { CoverageBar, Note } from "./Bits";

export function Legend() {
  // One short label each, with the full sentence on hover — a stacked legend
  // pushed the first question below the fold.
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 rounded-lg border border-gray-200 bg-white px-4 py-2">
      <span className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
        Colours
      </span>
      {CELL_STATE_ORDER.map((state) => (
        <Tooltip key={state}>
          <TooltipTrigger asChild>
            <span className="flex cursor-default items-center gap-1.5 text-xs text-gray-700">
              <span className={cn("size-2.5 shrink-0 rounded-sm", CELL_STATE_SWATCH[state])} />
              {CELL_STATE_LABEL[state]}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">{CELL_STATE_EXPLAIN[state]}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

function TaxonomyChip({ q }: { q: PrepareQuestion }) {
  const grain = q.taxonomy.grain;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex cursor-default items-center rounded border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
            GRAIN_CLASS[grain]
          )}
        >
          {GRAIN_LABEL[grain]}
          {q.taxonomy.codes.length > 0 && (
            <span className="ml-1 opacity-70">{q.taxonomy.codes.length}</span>
          )}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-sm">
        <span className="block">{grainExplanation(grain, q.taxonomy.codes.length)}</span>
        {q.taxonomy.codes.length > 0 && (
          <span className="mt-1 block opacity-80">
            Codes: {q.taxonomy.codes.join(", ")}
          </span>
        )}
      </TooltipContent>
    </Tooltip>
  );
}

export function PrepareGrid({
  prepare,
  selected,
  onToggle,
  onToggleAll,
  onStartOne,
  onStartSelected,
  onOpenRun,
  onOpenCell,
  disabled,
  onChanged,
}: {
  prepare: Prepare;
  selected: Set<number>;
  onToggle: (question: number) => void;
  onToggleAll: (questions: number[], on: boolean) => void;
  onStartOne: (question: number) => void;
  onStartSelected: () => void;
  onOpenRun: (runId: string) => void;
  /** Something on the paper changed server-side (corrections applied); reload it. */
  onChanged?: () => void;
  /** Open one question x section cell, answer by answer. */
  onOpenCell: (question: number, section: string) => void;
  disabled: boolean;
}) {
  const { threshold, questions, unapplied_corrections: unapplied } = prepare;
  const [onlyProblems, setOnlyProblems] = useState(false);

  // The API sends sections as objects carrying batch and student counts; every
  // check below is keyed by the letter alone.
  const sections = useMemo(
    () => prepare.sections.map((s) => s.section),
    [prepare.sections]
  );
  const studentsBySection = useMemo(
    () => new Map(prepare.sections.map((s) => [s.section, s.students])),
    [prepare.sections]
  );
  // Papers run to 17 sections and the table scrolls sideways; the jump bar
  // scrolls a section's column into view so the later ones (X, Y) are one
  // click away instead of a long drag.
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const colRefs = useRef(new Map<string, HTMLTableCellElement>());
  const jumpTo = (section: string) => {
    const el = colRefs.current.get(section);
    const box = scrollRef.current;
    if (!el || !box) return;
    // Keep the pinned question column clear: land the column just right of it.
    const pinnedWidth = 260;
    box.scrollTo({ left: Math.max(0, el.offsetLeft - pinnedWidth), behavior: "smooth" });
  };
  const nudge = (dir: -1 | 1) => {
    const box = scrollRef.current;
    if (!box) return;
    box.scrollBy({ left: dir * Math.max(240, box.clientWidth * 0.6), behavior: "smooth" });
  };
  /** Which questions have their run list expanded (collapsed by default). */
  const [runsOpen, setRunsOpen] = useState<Set<number>>(new Set());
  const [applying, setApplying] = useState(false);
  const [applyNote, setApplyNote] = useState<string | null>(null);
  async function applyCorrections() {
    setApplying(true);
    setApplyNote(null);
    try {
      const r = await applyPaperCorrections(prepare.paper.qp);
      const reasons = Object.entries(r.by_reason).map(([k, n]) => `${n} ${k.replace(/_/g, " ")}`).join(", ");
      setApplyNote(
        `${r.written} written${reasons ? ` (${reasons})` : ""}` +
          (r.changed_since_audit_or_no_bbox ? `; ${r.changed_since_audit_or_no_bbox} left: text changed since the audit or no box to write to.` : ".")
      );
      onChanged?.();
    } catch (e) {
      setApplyNote(errMsg(e));
    } finally {
      setApplying(false);
    }
  }

  const rows = useMemo(() => {
    if (!onlyProblems) return questions;
    return questions.filter(
      (q) => questionBlockers(q, sections, threshold, 0).length > 0
    );
  }, [questions, onlyProblems, sections, threshold]);

  const allShownSelected =
    rows.length > 0 && rows.every((q) => selected.has(q.question));

  // Two numbers a person actually acts on: how many questions can be run
  // without arguing about it, and how many are held up by a failed check.
  const cleanCount = questions.filter(
    (q) => questionBlockers(q, sections, threshold, 0).length === 0
  ).length;
  const heldUpCount = questions.filter((q) =>
    questionBlockers(q, sections, threshold, 0).some((b) => b.level === "blocked")
  ).length;

  return (
    <div className="flex flex-col gap-4">
      {unapplied > 0 && (
        <Note tone="warn" title="Some OCR corrections have not been applied">
          {unapplied} corrections exist for this paper that have not been written
          back yet, so the agent would read the uncorrected text. Applying writes
          only where the stored text is still blank or exactly what the audit read,
          and keeps a backup; the pipeline does this by itself per section.
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={disabled || applying}
              onClick={applyCorrections}
              className="inline-flex items-center gap-1 rounded border border-amber-300 bg-white px-2.5 py-1 text-xs font-medium text-amber-900 hover:border-amber-500 disabled:opacity-50"
            >
              {applying ? <Spinner className="size-3" /> : null}
              Apply {unapplied} pending corrections now
            </button>
            {applyNote && <span className="text-xs text-amber-900">{applyNote}</span>}
          </div>
        </Note>
      )}

      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-base font-semibold text-gray-900">
            Where each question stands on the dashboard
          </h2>
          <p className="mt-0.5 max-w-2xl text-sm text-gray-600">
            Each cell is one question in one section, coloured by what teachers
            can see: green only when every answer that lost marks is on the
            dashboard with a code. The bar inside is the share of those answers
            with readable text, which is what an agent needs before it can start.
            Click a cell to see its answers one by one and act on just the ones
            that need it — including exporting a finished run that was never
            applied. Of{" "}
            {questions.length} questions, {cleanCount} pass every check
            {heldUpCount > 0
              ? ` and ${heldUpCount} have at least one section blocked.`
              : "."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-700">
            <Checkbox
              checked={onlyProblems}
              onCheckedChange={(v) => setOnlyProblems(v === true)}
            />
            Only questions with a problem
          </label>
          <Button
            size="sm"
            disabled={disabled || selected.size === 0}
            onClick={onStartSelected}
          >
            <Play className="size-3.5" />
            Start {selected.size || ""} selected question
            {selected.size === 1 ? "" : "s"}
          </Button>
        </div>
      </div>

      <Legend />

      {rows.length === 0 ? (
        <Note tone="plain">
          {onlyProblems
            ? "Every question on this paper passes all its checks. Untick the filter to see them all."
            : "This paper has no questions with scanned answers yet."}
        </Note>
      ) : (
        <>
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-600">
          <span className="mr-1 font-medium text-gray-700">Go to section</span>
          <button
            type="button"
            onClick={() => nudge(-1)}
            className="rounded border border-gray-200 bg-white p-1 hover:border-gray-400"
            title="Scroll left"
            aria-label="Scroll left"
          >
            <ChevronLeft className="size-3.5" />
          </button>
          {sections.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => jumpTo(s)}
              className="rounded border border-gray-200 bg-white px-2 py-0.5 font-medium text-gray-700 hover:border-indigo-300 hover:text-indigo-700"
              title={`Scroll to section ${s}`}
            >
              {s}
            </button>
          ))}
          <button
            type="button"
            onClick={() => nudge(1)}
            className="rounded border border-gray-200 bg-white p-1 hover:border-gray-400"
            title="Scroll right"
            aria-label="Scroll right"
          >
            <ChevronRight className="size-3.5" />
          </button>
        </div>
        <div ref={scrollRef} className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50 text-left">
                {/* Papers run to 17 sections, so the table scrolls sideways —
                    the question stays pinned or you lose which row you are on. */}
                <th className="sticky left-0 z-20 w-10 bg-gray-50 px-3 py-2">
                  <Checkbox
                    aria-label="Select every question shown"
                    checked={allShownSelected}
                    onCheckedChange={(v) =>
                      onToggleAll(rows.map((q) => q.question), v === true)
                    }
                  />
                </th>
                <th className="sticky left-10 z-20 border-r border-gray-200 bg-gray-50 px-2 py-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
                  Question
                </th>
                {sections.map((s) => (
                  <th
                    key={s}
                    ref={(el) => {
                      if (el) colRefs.current.set(s, el);
                      else colRefs.current.delete(s);
                    }}
                    className="px-2 py-2 text-center text-xs font-semibold tracking-wide text-gray-500 uppercase"
                    title={`Section ${s} — ${studentsBySection.get(s) ?? 0} students scanned`}
                  >
                    {s}
                  </th>
                ))}
                <th className="px-3 py-2 text-xs font-semibold tracking-wide text-gray-500 uppercase">
                  Already have
                </th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((q) => {
                const blockers = questionBlockers(q, sections, threshold, unapplied);
                const isSelected = selected.has(q.question);
                // Pinned cells paint their own background, so they carry the
                // row's selected state themselves.
                const pinned = isSelected ? "bg-indigo-50" : "bg-white";
                return (
                  <tr
                    key={q.question}
                    className={cn(
                      "border-b border-gray-100 align-top last:border-0",
                      isSelected && "bg-indigo-50/40"
                    )}
                  >
                    <td className={cn("sticky left-0 z-10 w-10 px-3 py-2.5", pinned)}>
                      <Checkbox
                        aria-label={`Select question ${q.question}`}
                        checked={isSelected}
                        onCheckedChange={() => onToggle(q.question)}
                      />
                    </td>

                    <td
                      className={cn(
                        "sticky left-10 z-10 max-w-[240px] min-w-[200px] border-r border-gray-200 px-2 py-2.5",
                        pinned
                      )}
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="font-semibold whitespace-nowrap text-gray-900">
                          Q{q.question}
                          {q.max_marks ? (
                            <span className="ml-1 font-normal text-xs text-gray-500">
                              ({q.max_marks} marks)
                            </span>
                          ) : null}
                        </span>
                        <span
                          className="truncate text-xs text-gray-500"
                          title={chapterOf(q) ?? "no chapter recorded"}
                        >
                          {chapterOf(q) ?? "no chapter recorded"}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        <TaxonomyChip q={q} />
                        {blockers
                          .filter((b) => b.level === "blocked")
                          .slice(0, 1)
                          .map((b) => (
                            <Tooltip key={b.text}>
                              <TooltipTrigger asChild>
                                <span className="cursor-default rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[11px] font-medium text-rose-800">
                                  blocked
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-sm">{b.text}</TooltipContent>
                            </Tooltip>
                          ))}
                      </div>
                    </td>

                    {sections.map((s) => {
                      const cell = q.cells[s];
                      const verdict = cellVerdict(cell, threshold);
                      const state = cellState(cell, threshold);
                      const problems = cellProblemWords(cell);
                      const openable = !!cell?.answers;
                      return (
                        <td key={s} className="px-1.5 py-2.5">
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <button
                                type="button"
                                disabled={!openable}
                                onClick={() => onOpenCell(q.question, s)}
                                aria-label={`Q${q.question} section ${s}: open answer by answer`}
                                className={cn(
                                  "block w-full rounded border px-1.5 py-1 text-left",
                                  openable
                                    ? "cursor-pointer hover:ring-2 hover:ring-indigo-300 focus:ring-2 focus:ring-indigo-400 focus:outline-none"
                                    : "cursor-default",
                                  CELL_STATE_CLASS[state]
                                )}
                              >
                                <CoverageBar
                                  value={cell?.coverage ?? null}
                                  verdict={verdict}
                                />
                                <div className="mt-0.5 text-center text-[10px] text-gray-500 tabular-nums">
                                  {cell?.answers ? `${cell.with_text}/${cell.answers}` : "—"}
                                </div>
                                {problems && (
                                  // What is left over in this cell after the runs so far,
                                  // so a leftover is visible without opening every cell.
                                  <div className="mt-0.5 truncate text-center text-[10px] font-medium text-gray-700">
                                    {problems}
                                  </div>
                                )}
                              </button>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm">
                              <span className="block font-semibold">{CELL_STATE_LABEL[state]}</span>
                              <span className="block">{cellStateWords(cell, threshold, s)}</span>
                              {state !== "empty" && (
                                <span className="mt-1 block opacity-80">
                                  {cellExplanation(cell, threshold, s)}
                                </span>
                              )}
                              {state === "pending_apply" && (
                                <span className="mt-1 block font-medium">
                                  Click to export it to the dashboard.
                                </span>
                              )}
                            </TooltipContent>
                          </Tooltip>
                        </td>
                      );
                    })}

                    <td className="px-3 py-2.5">
                      <div className="flex flex-col gap-1">
                        {q.gold_total ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="w-fit cursor-default text-xs text-gray-700">
                                {q.gold_total} human-classified
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm">
                              A person has already classified {q.gold_total} answers
                              for this question, so a run can be scored against them
                              — that is what compare mode does.
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-xs text-gray-400">
                            no human answers
                          </span>
                        )}

                        {q.briefs.length > 0 ? (
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="flex w-fit cursor-default items-center gap-1 text-xs text-gray-700">
                                <FileText className="size-3" /> brief available
                              </span>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-sm">
                              A marking brief written by an earlier run{" "}
                              {relativeTime(q.briefs[0].started_at)} can be reused,
                              which skips the brief-writing step.
                            </TooltipContent>
                          </Tooltip>
                        ) : (
                          <span className="text-xs text-gray-400">
                            no brief yet
                          </span>
                        )}

                        {q.prior_runs.length > 0 && (
                          <div className="flex flex-col items-start gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                setRunsOpen((cur) => {
                                  const next = new Set(cur);
                                  if (next.has(q.question)) next.delete(q.question);
                                  else next.add(q.question);
                                  return next;
                                })
                              }
                              className="inline-flex items-center gap-1 rounded border border-gray-200 bg-gray-50 px-1.5 py-0.5 text-[11px] text-gray-700 hover:border-indigo-300 hover:text-indigo-700"
                              title="Runs already made on this question — click to list them"
                            >
                              {q.prior_runs.length} run{q.prior_runs.length === 1 ? "" : "s"}
                              <ChevronDown
                                className={cn("size-3 transition", runsOpen.has(q.question) && "rotate-180")}
                              />
                            </button>
                            {runsOpen.has(q.question) && (
                              <div className="flex flex-col gap-1">
                                {q.prior_runs.map((r) => (
                                  <button
                                    key={r.id}
                                    type="button"
                                    onClick={() => onOpenRun(r.id)}
                                    className="rounded border border-gray-200 bg-white px-1.5 py-0.5 text-left font-mono text-[11px] text-gray-700 hover:border-indigo-300 hover:text-indigo-700"
                                    title={`${r.mode ?? ""} run by ${r.started_by}, ${relativeTime(r.started_at)} — ${r.status}`}
                                  >
                                    {r.id}
                                    <span className="ml-1 font-sans text-gray-500">{r.status}</span>
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    </td>

                    <td className="px-3 py-2.5 text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={disabled}
                        onClick={() => onStartOne(q.question)}
                      >
                        Start…
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
    </div>
  );
}
