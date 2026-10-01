"use client";

// The start drawer. Same form whether one question or twenty are being started;
// with more than one, the settings apply to all of them and each question is
// posted separately so a single failure does not sink the rest.

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Checkbox,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Spinner,
  Textarea,
  cn,
} from "@student-ds/ui";
import { ChevronDown, Play } from "lucide-react";
import {
  errMsg,
  paperName,
  startClassification,
  type Prepare,
  type Run,
} from "../lib/api";
import { cellVerdict, chapterOf, questionBlockers } from "../lib/readiness";
import { Note } from "./Bits";
import { AccountPicker } from "./AccountPicker";

type Mode = "compare" | "load";
type BriefChoice = "reuse" | "author";

export type StartOutcome = { question: number; run?: Run; error?: string };

export function StartClassificationDrawer({
  prepare,
  questions,
  open,
  onClose,
  onDone,
  initialSections,
  initialBrief,
  subset,
}: {
  prepare: Prepare;
  questions: number[];
  open: boolean;
  onClose: () => void;
  onDone: (outcomes: StartOutcome[]) => void;
  /** Set when re-opened from a stopped run, to repeat its scope. */
  initialSections?: string[];
  initialBrief?: BriefChoice;
  /** Answer-level scope from the cell drawer: one section, these students only,
      and whether to re-code (keep the diagnosis) or classify afresh. Locks the
      section picker to that section. */
  subset?: { section: string; studentIds: string[]; task: "classify" | "recode" };
}) {
  const { threshold } = prepare;
  const sections = useMemo(
    () => prepare.sections.map((s) => s.section),
    [prepare.sections]
  );
  const rows = useMemo(
    () => prepare.questions.filter((q) => questions.includes(q.question)),
    [prepare.questions, questions]
  );
  const bulk = rows.length > 1;
  const recode = subset?.task === "recode";

  const goldEverywhere = rows.length > 0 && rows.every((q) => !!q.gold_total);
  const briefEverywhere = rows.length > 0 && rows.every((q) => q.briefs.length > 0);
  const anyNoCodes = rows.some((q) => q.taxonomy.grain === "none");

  // Pre-check the sections that are ready for every question being started.
  const defaultSections = useMemo(
    () =>
      sections.filter((s) =>
        rows.every((q) => cellVerdict(q.cells[s], threshold) === "ready")
      ),
    [sections, rows, threshold]
  );

  // The drawer is remounted per selection (the caller keys it on the question
  // list), so these initial values are the defaults for this selection.
  const [picked, setPicked] = useState<string[]>(
    // A subset run is one section by definition. Repeating a stopped run means
    // repeating exactly the sections it had, even where a check would not have
    // ticked them.
    subset
      ? [subset.section]
      : initialSections?.length
        ? initialSections.filter((s) => sections.includes(s))
        : defaultSections
  );
  // Re-coding is only meaningful for real: it exists to fill codes the
  // dashboard is missing, so compare mode is not offered for it.
  const [mode, setMode] = useState<Mode>(goldEverywhere && !recode ? "compare" : "load");
  const [brief, setBrief] = useState<BriefChoice>(
    initialBrief && (initialBrief === "author" || briefEverywhere)
      ? initialBrief
      : briefEverywhere
        ? "reuse"
        : "author"
  );
  const [textOnly, setTextOnly] = useState(anyNoCodes);
  const [reason, setReason] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [modelBrief, setModelBrief] = useState("");
  const [modelClassify, setModelClassify] = useState("");
  const [account, setAccount] = useState("");
  const [thresholdInput, setThresholdInput] = useState(String(threshold));
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const effThreshold = Number(thresholdInput);
  const thresholdValid =
    Number.isFinite(effThreshold) && effThreshold > 0 && effThreshold <= 1;

  // Which of the picked cells would the backend refuse without a reason? A
  // subset section is measured over its own answers server-side — every one of
  // them has text by construction — so it is never blocked here.
  const blockedCells = useMemo(() => {
    if (!thresholdValid) return [];
    const out: { question: number; section: string }[] = [];
    for (const q of rows)
      for (const s of picked)
        if (!(subset && s === subset.section) && cellVerdict(q.cells[s], effThreshold) === "blocked")
          out.push({ question: q.question, section: s });
    return out;
  }, [rows, picked, effThreshold, thresholdValid, subset]);

  const noCodesInPlay = rows.some((q) => q.taxonomy.grain === "none") && !textOnly;
  const reasonRequired = blockedCells.length > 0 || noCodesInPlay;

  // The reason box sits at the foot of a long form, below the fold. Bring it
  // into view the moment a check starts demanding one, so the footer's "write
  // a reason" is never advice about something nobody can see.
  const reasonRef = useRef<HTMLDivElement>(null);
  const reasonInputRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (reasonRequired) reasonRef.current?.scrollIntoView({ block: "nearest" });
  }, [reasonRequired]);

  const focusReason = () => {
    reasonRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    reasonInputRef.current?.focus();
  };
  const canStart =
    picked.length > 0 &&
    thresholdValid &&
    !busy &&
    (!reasonRequired || reason.trim().length >= 10);

  const toggleSection = (s: string) => {
    if (subset) return; // one section, fixed by the cell that opened this
    setPicked((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  };

  async function start() {
    setBusy(true);
    setFailure(null);
    setProgress({ done: 0, total: rows.length });
    const outcomes: StartOutcome[] = [];
    for (const q of rows) {
      try {
        const run = await startClassification({
          qp: prepare.paper.qp,
          question: q.question,
          sections: picked,
          mode,
          brief: brief === "reuse" && q.briefs.length > 0 ? "reuse" : "author",
          ...(brief === "reuse" && q.briefs.length > 0
            ? { brief_src: `run:${q.briefs[0].run_id}` }
            : {}),
          text_only: textOnly,
          ...(modelBrief.trim() ? { model_brief: modelBrief.trim() } : {}),
          ...(modelClassify.trim() ? { model_classify: modelClassify.trim() } : {}),
          ...(account ? { account } : {}),
          coverage_threshold: effThreshold,
          ...(reason.trim() ? { override_reason: reason.trim() } : {}),
          ...(subset
            ? { students_by_section: { [subset.section]: subset.studentIds }, task: subset.task }
            : {}),
        });
        outcomes.push({ question: q.question, run });
      } catch (e) {
        outcomes.push({ question: q.question, error: errMsg(e) });
      }
      setProgress({ done: outcomes.length, total: rows.length });
    }
    setBusy(false);
    const failed = outcomes.filter((o) => o.error);
    if (failed.length === outcomes.length) {
      setFailure(
        outcomes.length === 1
          ? outcomes[0].error!
          : `None of the ${outcomes.length} runs started. First reason: ${failed[0].error}`
      );
      onDone(outcomes);
      return;
    }
    onDone(outcomes);
    onClose();
  }

  if (rows.length === 0) return null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && !busy && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <SheetHeader className="border-b border-gray-200 px-6 py-4">
          <SheetTitle>
            {subset
              ? `${recode ? "Re-code" : "Classify"} ${subset.studentIds.length} answer${
                  subset.studentIds.length === 1 ? "" : "s"
                } — Q${rows[0].question}, section ${subset.section}`
              : bulk
                ? `Start error classification on ${rows.length} questions`
                : `Start error classification on Q${rows[0].question}`}
          </SheetTitle>
          <SheetDescription>
            {bulk
              ? `These settings apply to every question you ticked (Q${rows
                  .map((r) => r.question)
                  .join(", Q")}). One run is started per question.`
              : `${chapterOf(rows[0]) ?? "No chapter recorded"} — ${paperName(
                  prepare.paper
                )}`}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
          {subset && (
            <Note tone="info" title={recode ? "Only the code is attempted again" : "Only these answers are classified"}>
              {subset.studentIds.length} of the{" "}
              {rows[0].cells[subset.section]?.answers ?? "?"} answers that lost marks in
              section {subset.section} are in this run. The rest keep what they have — the
              dashboard rows and rollups for the whole cell are merged, not replaced.
              {recode &&
                " Each answer's diagnosis and evidence are kept word for word; the agent only tries again to name a taxonomy code from the brief."}
            </Note>
          )}

          {/* Sections */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900">Sections to run</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              {subset
                ? "Fixed to the section the cell came from."
                : "Ticked by default: the sections where every question you picked has enough readable text. Anything under the threshold is marked so you know what you are taking on."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {sections.map((s) => {
                const worst = rows.reduce<"ready" | "warn" | "blocked" | "empty">(
                  (acc, q) => {
                    const v = cellVerdict(q.cells[s], effThreshold || threshold);
                    const rank = { ready: 0, warn: 1, empty: 2, blocked: 3 } as const;
                    return rank[v] > rank[acc] ? v : acc;
                  },
                  "ready"
                );
                const on = picked.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggleSection(s)}
                    disabled={!!subset}
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition",
                      on
                        ? "border-indigo-400 bg-indigo-50 text-indigo-900"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300",
                      subset && !on && "opacity-40"
                    )}
                  >
                    <Checkbox checked={on} className="pointer-events-none" />
                    <span className="font-medium">{s}</span>
                    <span
                      className={cn(
                        "size-2 rounded-full",
                        worst === "ready" && "bg-emerald-500",
                        worst === "warn" && "bg-amber-500",
                        worst === "blocked" && "bg-rose-500",
                        worst === "empty" && "bg-gray-300"
                      )}
                      title={
                        worst === "blocked"
                          ? "At least one of these questions is under the readable-text threshold in this section."
                          : worst === "warn"
                            ? "Only just over the readable-text threshold here."
                            : worst === "empty"
                              ? "No answers lost marks in this section."
                              : "Enough readable text."
                      }
                    />
                  </button>
                );
              })}
            </div>
            {picked.length === 0 && (
              <p className="mt-2 text-xs text-rose-700">
                Pick at least one section — nothing will run otherwise.
              </p>
            )}
          </section>

          {/* Mode */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900">What the run is for</h3>
            <div className="mt-2 flex flex-col gap-2">
              <ModeCard
                on={mode === "compare"}
                disabled={!goldEverywhere || recode}
                onClick={() => setMode("compare")}
                title="Compare against the human answers"
                body={
                  recode
                    ? "Not available for re-coding — it fills codes the dashboard is missing, which only makes sense for real."
                    : goldEverywhere
                    ? "Scores the agent against answers a person already classified. Nothing is written to the dashboard. Use this to see whether the agent can be trusted on this question."
                    : bulk
                      ? "Not available — at least one of the questions you picked has no human-classified answers to compare against."
                      : "Not available — nobody has classified answers for this question yet, so there is nothing to score against."
                }
              />
              <ModeCard
                on={mode === "load"}
                onClick={() => setMode("load")}
                title="Classify for real"
                body="The agent classifies every answer and the result is held for review. Nothing reaches the dashboard until someone applies the run from the Runs tab."
              />
            </div>
          </section>

          {/* Brief */}
          <section>
            <h3 className="text-sm font-semibold text-gray-900">Marking brief</h3>
            <p className="mt-0.5 text-xs text-gray-500">
              The brief is the agent&apos;s written account of how marks are lost on
              this question. It writes one first unless an earlier run left one.
            </p>
            <div className="mt-2 flex flex-col gap-2">
              <ModeCard
                on={brief === "reuse"}
                disabled={!briefEverywhere}
                onClick={() => setBrief("reuse")}
                title="Reuse the brief from an earlier run"
                body={
                  briefEverywhere
                    ? "Skips the brief-writing step, so the run starts classifying straight away."
                    : bulk
                      ? "Not available — at least one of the questions you picked has no earlier brief."
                      : "Not available — no earlier run has written a brief for this question."
                }
              />
              <ModeCard
                on={brief === "author"}
                onClick={() => setBrief("author")}
                title="Write a fresh brief"
                body="The agent reads a sample of answers and writes the brief before classifying. Slower, but right after the answer key or the marking has changed."
              />
            </div>
          </section>

          {/* Text only */}
          <section>
            <label className="flex cursor-pointer items-start gap-2">
              <Checkbox
                checked={textOnly}
                onCheckedChange={(v) => setTextOnly(v === true)}
                className="mt-0.5"
              />
              <span>
                <span className="block text-sm font-medium text-gray-900">
                  Text only — write findings without error codes
                </span>
                <span className="block text-xs text-gray-500">
                  {anyNoCodes
                    ? "Suggested: at least one question you picked has no error codes for its chapter, so there is nothing to classify into."
                    : "Use when the codes do not fit the question and you want the agent's prose findings instead."}
                </span>
              </span>
            </label>
          </section>

          {/* Advanced */}
          <section className="rounded-lg border border-gray-200">
            <button
              type="button"
              onClick={() => setAdvancedOpen((o) => !o)}
              className="flex w-full items-center justify-between px-3 py-2 text-sm font-medium text-gray-700"
            >
              Advanced
              <ChevronDown
                className={cn("size-4 transition", advancedOpen && "rotate-180")}
              />
            </button>
            {advancedOpen && (
              <div className="flex flex-col gap-3 border-t border-gray-200 px-3 py-3">
                <LabelledInput
                  label="Model for writing the brief"
                  placeholder="leave blank for the default"
                  value={modelBrief}
                  onChange={setModelBrief}
                />
                <LabelledInput
                  label="Model for classifying"
                  placeholder="leave blank for the default"
                  value={modelClassify}
                  onChange={setModelClassify}
                />
                <AccountPicker kind="classification" value={account} onChange={setAccount} />
                <LabelledInput
                  label="Readable-text threshold"
                  hint="Between 0 and 1. Sections under this need a reason before they run."
                  value={thresholdInput}
                  onChange={setThresholdInput}
                  invalid={!thresholdValid}
                />
              </div>
            )}
          </section>

          {/* Kept next to the button it gates, at the end of the form. */}
          {rows.length === 1 && (
            <QuestionWarnings
              prepare={prepare}
              question={rows[0].question}
              textOnly={textOnly}
            />
          )}

          {reasonRequired && (
            <div
              ref={reasonRef}
              className="flex flex-col gap-2 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3"
            >
              <p className="text-sm font-semibold text-rose-900">
                This run needs a reason before it can start
              </p>
              <ul className="list-disc pl-5 text-sm text-rose-900">
                {blockedCells.length > 0 && (
                  <li>
                    {blockedCells.length}{" "}
                    {blockedCells.length === 1 ? "cell is" : "cells are"} under the
                    readable-text threshold
                    {blockedCells.length <= 6
                      ? ` (${blockedCells
                          .map((c) => `Q${c.question}·${c.section}`)
                          .join(", ")})`
                      : ""}
                    . The agent will be judging answers it cannot fully read.
                  </li>
                )}
                {noCodesInPlay && (
                  <li>
                    At least one question has no error codes for its chapter. Either
                    tick text-only above, or say why you are running anyway.
                  </li>
                )}
              </ul>
              <Textarea
                ref={reasonInputRef}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Why is it worth running despite this? This is recorded against the run."
                className="min-h-20 bg-white"
              />
              {reason.trim().length > 0 && reason.trim().length < 10 && (
                <p className="text-xs text-rose-800">
                  Write a full sentence — this is what the next person reads when
                  they wonder why the numbers look odd.
                </p>
              )}
            </div>
          )}

          {failure && (
            <Note tone="error" title="Nothing started">
              {failure}
            </Note>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-gray-200 bg-white px-6 py-4">
          <div className="min-w-0 text-xs text-gray-500">
            {progress ? (
              <span className="flex items-center gap-2">
                <Spinner className="size-3.5" />
                Started {progress.done} of {progress.total}…
              </span>
            ) : reasonRequired && reason.trim().length < 10 ? (
              <button
                type="button"
                onClick={focusReason}
                className="font-medium text-rose-700 underline underline-offset-2"
              >
                A check failed — write a reason before this can start.
              </button>
            ) : subset ? (
              <span>
                {subset.studentIds.length} answer{subset.studentIds.length === 1 ? "" : "s"} in
                section {subset.section}
              </span>
            ) : (
              <span>
                {picked.length} section{picked.length === 1 ? "" : "s"} ×{" "}
                {rows.length} question{rows.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="flex shrink-0 gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={start} disabled={!canStart}>
              {busy ? <Spinner className="size-4" /> : <Play className="size-4" />}
              {reasonRequired ? "Start anyway" : recode ? "Re-code" : "Start"}
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ModeCard({
  on,
  disabled,
  onClick,
  title,
  body,
}: {
  on: boolean;
  disabled?: boolean;
  onClick: () => void;
  title: string;
  body: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "rounded-lg border px-3 py-2.5 text-left transition",
        on && !disabled
          ? "border-indigo-400 bg-indigo-50"
          : "border-gray-200 bg-white hover:border-gray-300",
        disabled && "cursor-not-allowed opacity-60"
      )}
    >
      <span
        className={cn(
          "block text-sm font-medium",
          on && !disabled ? "text-indigo-900" : "text-gray-900"
        )}
      >
        {title}
      </span>
      <span className="mt-0.5 block text-xs leading-relaxed text-gray-600">{body}</span>
    </button>
  );
}

function LabelledInput({
  label,
  hint,
  value,
  onChange,
  placeholder,
  invalid,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  invalid?: boolean;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-700">{label}</span>
      {hint && <span className="block text-[11px] text-gray-500">{hint}</span>}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={cn(
          "mt-1 w-full rounded-md border px-2 py-1.5 text-sm outline-none focus:border-indigo-400",
          invalid ? "border-rose-400 bg-rose-50" : "border-gray-300"
        )}
      />
    </label>
  );
}

function QuestionWarnings({
  prepare,
  question,
  textOnly,
}: {
  prepare: Prepare;
  question: number;
  textOnly: boolean;
}) {
  const q = prepare.questions.find((x) => x.question === question);
  if (!q) return null;
  const items = questionBlockers(
    q,
    prepare.sections.map((s) => s.section),
    prepare.threshold,
    prepare.unapplied_corrections
  ).filter((b) => !(textOnly && b.text.startsWith("No error codes")));
  const warnings = items.filter((b) => b.level === "warn");
  if (warnings.length === 0) return null;
  return (
    <Note tone="warn" title="Worth knowing before you start">
      <ul className="list-disc pl-5">
        {warnings.map((w) => (
          <li key={w.text}>{w.text}</li>
        ))}
      </ul>
    </Note>
  );
}
