"use client";

// Everything about one run: how far each section got, what the agent handed
// back, the files it wrote, who did what and when, and — for a finished
// classification run — the button that writes the result to the dashboard.

import { Fragment, useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Spinner,
  cn,
} from "@student-ds/ui";
import { AlertTriangle, Ban, FileText, RotateCcw, Upload } from "lucide-react";
import {
  applyRun,
  cancelRun,
  getApplyPreview,
  errMsg,
  getArtifactText,
  getRun,
  listArtifacts,
  type ApplyPreview,
  type ApplyResult,
  type Artifact,
  type RunDetail,
  type RunEvent,
  repairRunCodes,
} from "../lib/api";
import {
  KIND_LABEL,
  STATUS_EXPLAIN,
  absoluteTime,
  briefReason,
  bytes,
  duration,
  relativeTime,
  scoreReport,
  scoreWords,
  sectionReason,
} from "../lib/readiness";
import { Failed, Field, Loading, Note, StageChip, StatusBadge } from "./Bits";
import { usePoll } from "../hooks/useApi";

export function RunDrawer({
  runId,
  open,
  onClose,
  onChanged,
  briefsAvailable = false,
  onStartAgain,
  onOpenCell,
}: {
  runId: string | null;
  open: boolean;
  onClose: () => void;
  onChanged: () => void;
  /** Whether this run's question has a brief an earlier run left behind. */
  briefsAvailable?: boolean;
  onStartAgain?: StartAgain;
  /** Open one question x section cell answer by answer (e.g. to re-code its leftovers). */
  onOpenCell?: (question: number, section: string, preselect?: "uncoded") => void;
}) {
  const [run, setRun] = useState<RunDetail | null>(null);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    async (showSpinner: boolean) => {
      if (!runId) return;
      if (showSpinner) setLoading(true);
      try {
        const detail = await getRun(runId);
        setRun(detail);
        setError(null);
        // The detail response carries the file list already; only ask for it
        // separately if this run predates that.
        if (detail.artifacts) setArtifacts(detail.artifacts);
        else {
          try {
            setArtifacts(await listArtifacts(runId));
          } catch {
            // Artifacts are a nicety — a run is still readable without them.
            setArtifacts([]);
          }
        }
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setLoading(false);
      }
    },
    [runId]
  );

  useEffect(() => {
    setRun(null);
    setArtifacts([]);
    setError(null);
    if (open && runId) load(true);
  }, [open, runId, load]);

  usePoll(open && run?.status === "running", 10_000, () => load(false));

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        <SheetHeader className="border-b border-gray-200 px-6 py-4">
          <SheetTitle className="flex items-center gap-3">
            <span className="font-mono text-base">{runId}</span>
            {run && <StatusBadge status={run.status} />}
          </SheetTitle>
          <SheetDescription>
            {run
              ? `${KIND_LABEL[run.kind] ?? run.kind} · ${
                  run.kind === "pipeline"
                    ? `section ${run.sections[0] ?? "?"}`
                    : run.question == null
                      ? "whole paper"
                      : `Q${run.question}`
                } · Grade ${run.grade} ${run.subject} ${run.exam_name ?? ""}`
              : error
                ? "This run could not be opened."
                : "Loading…"}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-6 py-5">
          {loading && !run && <Loading what="this run" />}
          {error && !run && <Failed what="this run" error={error} />}
          {run && (
            <RunBody
              run={run}
              artifacts={artifacts}
              briefsAvailable={briefsAvailable}
              onStartAgain={onStartAgain}
              onOpenCell={onOpenCell}
              onChanged={() => {
                load(false);
                onChanged();
              }}
            />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function RunBody({
  run,
  artifacts,
  onChanged,
  briefsAvailable,
  onStartAgain,
  onOpenCell,
}: {
  run: RunDetail;
  artifacts: Artifact[];
  onChanged: () => void;
  briefsAvailable: boolean;
  onStartAgain?: StartAgain;
  onOpenCell?: (question: number, section: string, preselect?: "uncoded") => void;
}) {
  const isClassification = run.kind === "classification";
  const scope = subsetScope(run);
  // Compare-mode runs apply too: their verdicts are recorded the same way, and
  // the server writes the export dry run on demand before anything is applied.
  const canApply =
    isClassification && (run.status === "done" || run.status === "partial");

  return (
    <>
      <Note tone={run.status === "done" ? "plain" : run.status === "running" ? "info" : "warn"}>
        {STATUS_EXPLAIN[run.status] ?? run.status}
        {run.temporal_error && (
          <span className="mt-1 block">
            Temporal could not be reached for the live view: {run.temporal_error}
          </span>
        )}
      </Note>

      {run.override_reason && (
        <Note tone="warn" title="Started despite a failed check">
          {run.override_reason}
        </Note>
      )}
      {(run.status === "failed" || run.status === "cancelled") && failureWords(run) && (
        <Note tone="warn" title={run.status === "failed" ? "Why it failed" : "Why it stopped"}>
          <span className="whitespace-pre-wrap break-words font-mono text-xs">{failureWords(run)}</span>
        </Note>
      )}
      {run.status === "running" &&
        run.temporal_status &&
        ["FAILED", "TERMINATED", "TIMED_OUT", "CANCELED"].includes(run.temporal_status) && (
          <Note tone="warn" title="The workflow is no longer running">
            Temporal reports it {run.temporal_status.toLowerCase()}. The ledger row is being closed; reload in a moment.
          </Note>
        )}
      <LiveTasks run={run} />

      <section className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Field label="Started by">{run.started_by}</Field>
        <Field label="Started">
          <span title={absoluteTime(run.started_at)}>{relativeTime(run.started_at)}</span>
        </Field>
        <Field label="Took">{duration(run.started_at, run.finished_at)}</Field>
        {/* The worker fills these in; older runs and runs not yet picked up
            have neither. */}
        <Field label="Lane">{run.lane || "—"}</Field>
        <Field label="Queue">
          {run.queue ? (
            <span className="font-mono text-xs">{run.queue}</span>
          ) : (
            "—"
          )}
        </Field>
        <Field label="Mode">
          {run.mode === "compare"
            ? "compared against human answers"
            : run.mode === "load"
              ? "classified for real"
              : "—"}
        </Field>
        {scope && (
          <Field label="Scope">
            <span title={scope.detail}>{scope.words}</span>
          </Field>
        )}
        <Field label="Coded">{codedWords(run)}</Field>
        <Field label="Workflow">
          <span className="font-mono text-xs">{run.workflow_id}</span>
        </Field>
        <Field label="Applied">
          {run.applied_at ? (
            <span className="text-emerald-700">
              {run.applied_by} · {relativeTime(run.applied_at)}
            </span>
          ) : (
            <span className="text-gray-500">not yet</span>
          )}
        </Field>
      </section>

      <WhatToDoNext run={run} briefsAvailable={briefsAvailable} onStartAgain={onStartAgain} />
      {run.kind === "pipeline" ? <PipelineIterations run={run} /> : <Sections run={run} onOpenCell={onOpenCell} />}
      <Handoffs run={run} />
      <Artifacts runId={run.id} artifacts={artifacts} />
      <Events run={run} />

      {run.status === "running" && (
        <div className="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-5">
          <CancelButton run={run} onChanged={onChanged} />
        </div>
      )}

      {canApply && <ApplyPanel run={run} onChanged={onChanged} />}
    </>
  );
}

/** What an operator reads when a run did not end well: the workflow's own
 *  error, the brief's reason, or the first section's error. */
function failureWords(run: RunDetail): string | null {
  const sm = (run.summary ?? {}) as { error?: string; brief?: { result?: { reason?: string } } };
  if (sm.error) return sm.error;
  if (sm.brief?.result?.reason) return sm.brief.result.reason;
  const bad = run.sections_detail.find((s) => (s as { error?: string | null }).error);
  return bad ? `${bad.section}: ${(bad as { error?: string }).error}` : null;
}

/** Every agent task of the run as its worker last reported it — the agent's
 *  own done/total/note every 30 s, the seat it is on, and its log when it
 *  ended. This is the "what is it doing right now" the page never had. */
function LiveTasks({ run }: { run: RunDetail }) {
  const tasks = Object.values(run.tasks ?? {});
  // The log is fetched with the session token and shown inline: a raw link
  // to the API opens without the bearer and beaver-api answers "No token".
  const [openLog, setOpenLog] = useState<string | null>(null);
  const [logText, setLogText] = useState<string | null>(null);
  const [logError, setLogError] = useState<string | null>(null);
  async function showLog(taskId: string) {
    if (openLog === taskId) {
      setOpenLog(null);
      return;
    }
    setOpenLog(taskId);
    setLogText(null);
    setLogError(null);
    try {
      setLogText(await getArtifactText(run.id, taskId, "agent.log"));
    } catch (e) {
      setLogError(errMsg(e));
    }
  }
  if (tasks.length === 0) {
    if (run.status !== "running") return null;
    return (
      <Note tone="plain">
        No agent task has reported yet. While a task runs, its progress appears here within about a minute.
      </Note>
    );
  }
  const sorted = [...tasks].sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-gray-900">Agent tasks</h3>
      <ul className="flex flex-col gap-2">
        {sorted.map((t) => {
          const pct = t.total ? Math.min(100, Math.round(((t.done ?? 0) / t.total) * 100)) : null;
          const live = run.status === "running" && !t.log;
          return (
            <li key={t.task_id} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-mono text-xs text-gray-900">{t.task_id}</span>
                <span className="text-xs text-gray-500">
                  {t.account ? `seat ${t.account}` : ""}
                  {t.elapsed_s != null ? ` · ${Math.round(t.elapsed_s / 60)} min` : ""}
                  {t.updated_at ? ` · ${relativeTime(t.updated_at)}` : ""}
                  {live ? " · live" : ""}
                </span>
              </div>
              {pct != null && (
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded bg-gray-100">
                  <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
                </div>
              )}
              <div className="mt-1 flex flex-wrap items-baseline justify-between gap-2 text-xs text-gray-700">
                <span>
                  {t.total ? `${t.done ?? 0} of ${t.total}` : ""}
                  {t.note ? `${t.total ? " — " : ""}${t.note}` : ""}
                  {t.waiting_for_slot_s ? ` (waiting ${Math.round(t.waiting_for_slot_s / 60)} min for a free seat)` : ""}
                </span>
                {t.log && (
                  <button
                    type="button"
                    onClick={() => showLog(t.task_id)}
                    className="text-indigo-700 underline decoration-indigo-300 underline-offset-2"
                  >
                    {openLog === t.task_id ? "hide agent log" : "agent log"}
                  </button>
                )}
              </div>
              {openLog === t.task_id && (
                <div className="mt-2">
                  {logError && <p className="text-xs text-rose-800">{logError}</p>}
                  {!logError && logText === null && <p className="text-xs text-gray-500">Loading…</p>}
                  {logText !== null && (
                    <pre className="max-h-80 overflow-auto rounded border border-gray-200 bg-gray-50 p-2 text-[11px] leading-snug whitespace-pre-wrap text-gray-800">
                      {logText}
                    </pre>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type PipelineIteration = {
  iteration: number;
  counts?: Record<string, number>;
  taxonomy?: { blocked?: boolean; reason?: string | null };
  actions?: Record<string, unknown>;
  error?: string;
};

/**
 * A section pipeline is a loop: each pass looks at every answer of the
 * section and does the cheapest thing that moves it on. This shows what each
 * pass found and did, from the summary the workflow leaves in the ledger (the
 * live status while it runs).
 */
function PipelineIterations({ run }: { run: RunDetail }) {
  const summary = (run.summary ?? {}) as {
    iterations?: PipelineIteration[];
    auto_apply?: boolean;
    ops_todos_filed?: string[];
    pending_apply?: { runs: string[]; answers: number; questions: number[]; corrections: number };
  };
  const live = (run as RunDetail & { live_status?: { stage?: string; iteration?: number; counts?: Record<string, number>; children?: string[] } }).live_status;
  const iterations = summary.iterations ?? [];
  const params = run.params as { auto_apply?: boolean };
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-gray-900">Passes over the section</h3>
      <Note tone="plain">
        {params.auto_apply
          ? "This deployment writes the test dashboard, so the pipeline applies OCR corrections and finished runs by itself."
          : "This deployment writes the prod dashboard: the pipeline stops at “pending apply” and a person on the allowlist applies from the run."}
      </Note>
      {summary.pending_apply && (
        <Note tone="info" title="Ready to apply">
          {summary.pending_apply.answers} answer{summary.pending_apply.answers === 1 ? "" : "s"}
          {summary.pending_apply.questions.length > 0 && (
            <> across Q{summary.pending_apply.questions.join(", Q")}</>
          )}{" "}
          wait in {summary.pending_apply.runs.length} run{summary.pending_apply.runs.length === 1 ? "" : "s"}
          {summary.pending_apply.corrections > 0 && (
            <>, plus {summary.pending_apply.corrections} OCR correction{summary.pending_apply.corrections === 1 ? "" : "s"} to apply on the paper</>
          )}
          . Open each run from the Runs tab and apply it:
          <span className="mt-1 block font-mono text-xs">{summary.pending_apply.runs.join(", ")}</span>
        </Note>
      )}
      {run.status === "running" && live && (
        <p className="mt-2 text-sm text-gray-700">
          Pass {live.iteration ?? "?"}: <span className="font-medium">{live.stage ?? "…"}</span>
          {live.counts && Object.keys(live.counts).length > 0 && (
            <span className="ml-2 text-xs text-gray-500">{countsWords(live.counts)}</span>
          )}
          {live.children && live.children.length > 0 && (
            <span className="mt-1 block font-mono text-xs text-gray-500">runs: {live.children.join(", ")}</span>
          )}
        </p>
      )}
      {iterations.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">No pass has finished yet.</p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2">
          {iterations.map((it) => (
            <li key={it.iteration} className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium text-gray-900">Pass {it.iteration}</span>
                {it.counts && <span className="text-xs text-gray-500">{countsWords(it.counts)}</span>}
              </div>
              {it.taxonomy?.blocked && (
                <p className="mt-1 text-xs text-amber-800">Taxonomy: {it.taxonomy.reason}</p>
              )}
              {it.error && <p className="mt-1 text-xs text-rose-800">{it.error}</p>}
              {it.actions && Object.keys(it.actions).length > 0 && (
                <ul className="mt-1 flex flex-col gap-0.5 text-xs text-gray-700">
                  {Object.entries(it.actions).map(([name, v]) => (
                    <li key={name}>
                      <span className="font-medium">{ACTION_WORDS[name] ?? name}:</span>{" "}
                      <span className="font-mono">{actionWords(v)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ol>
      )}
      {summary.ops_todos_filed && summary.ops_todos_filed.length > 0 && (
        <p className="mt-2 text-xs text-gray-600">
          {summary.ops_todos_filed.length} answer{summary.ops_todos_filed.length === 1 ? "" : "s"} parked on the Ops TO-DO
          (no bounding box).
        </p>
      )}
    </section>
  );
}

const ACTION_WORDS: Record<string, string> = {
  rebuild: "crops rebuilt",
  ops_todo: "sent to Ops TO-DO",
  reread: "OCR sweep (no text re-read, stored text audited)",
  corrections: "OCR corrections applied",
  classify: "classification runs",
  apply: "applied to the dashboard",
};

function countsWords(counts: Record<string, number>): string {
  return Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([k, n]) => `${n} ${k.replace(/_/g, " ")}`)
    .join(" · ");
}

function actionWords(v: unknown): string {
  if (Array.isArray(v)) {
    return v
      .map((x) => {
        const o = x as Record<string, unknown>;
        return o.run_id
          ? `${o.run_id}${o.status ? ` (${o.status})` : ""}${o.error ? ` — ${o.error}` : ""}${o.refused ? ` — refused: ${o.refused}` : ""}`
          : JSON.stringify(x);
      })
      .join("; ");
  }
  if (v && typeof v === "object") {
    return Object.entries(v as Record<string, unknown>)
      .map(([k, x]) => `${k} ${typeof x === "object" ? JSON.stringify(x) : String(x)}`)
      .join(", ");
  }
  return String(v);
}

/**
 * Whether the run covered whole sections or named students. Read off the
 * workflow input the run was started with, which the ledger keeps verbatim.
 */
function subsetScope(run: RunDetail): { words: string; detail: string } | null {
  const raw = run.params?.students_by_section;
  if (!raw || typeof raw !== "object") return null;
  const entries = Object.entries(raw as Record<string, unknown>).filter(
    ([, v]) => Array.isArray(v) && v.length > 0
  ) as [string, unknown[]][];
  if (entries.length === 0) return null;
  const task = run.params?.task === "recode" ? "re-coded" : "classified";
  const total = entries.reduce((n, [, v]) => n + v.length, 0);
  const words = `${total} answer${total === 1 ? "" : "s"} ${task} in ${entries
    .map(([s]) => s)
    .join(", ")}`;
  const detail = entries.map(([s, v]) => `${s}: ${v.length}`).join(" · ");
  return { words, detail };
}

/** Re-open the start drawer for this run's question, pre-set as asked. */
export type StartAgain = (opts: {
  question: number;
  sections: string[];
  brief: "reuse" | "author";
}) => void;

/**
 * The block that turns a stopped run into a next step. Whatever the agent
 * wrote is shown as it wrote it; when it wrote nothing we say so rather than
 * put words in its mouth.
 */
function WhatToDoNext({
  run,
  briefsAvailable,
  onStartAgain,
}: {
  run: RunDetail;
  briefsAvailable: boolean;
  onStartAgain?: StartAgain;
}) {
  if (run.kind !== "classification" || run.question == null) return null;

  const briefStuck = run.status === "brief_needs_human";
  const stuckSections = run.sections_detail.filter(
    (s) => s.stage === "needs_human" || s.stage === "error"
  );
  if (!briefStuck && stuckSections.length === 0) return null;

  const question = run.question;
  const reason = briefStuck ? briefReason(run.summary) : "";
  const failed = stuckSections.map((s) => s.section);

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50/50 px-4 py-4">
      <h3 className="text-sm font-semibold text-gray-900">What to do next</h3>

      {briefStuck && (
        <>
          <p className="mt-0.5 text-sm text-gray-700">
            The run stopped before classifying anything: the agent could not
            settle the marking brief for Q{question} on its own.
          </p>
          {reason ? (
            <div className="mt-2 rounded border border-gray-200 bg-white px-3 py-2">
              <p className="text-xs font-medium text-gray-500">
                What the agent said
              </p>
              <p className="mt-0.5 text-sm whitespace-pre-wrap text-gray-800">
                {reason}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-gray-600">
              It did not record why. The brief it got as far as writing is under
              &ldquo;Files this run wrote&rdquo; below — reading that is usually
              the fastest way to see what it was unsure about.
            </p>
          )}
        </>
      )}

      {!briefStuck && (
        <>
          <p className="mt-0.5 text-sm text-gray-700">
            {failed.length === 1 ? "One section" : `${failed.length} sections`}{" "}
            did not finish ({failed.join(", ")}). The rest of the run kept what
            it wrote.
          </p>
          <div className="mt-2 flex flex-col gap-2">
            {stuckSections.map((s) => {
              const why = sectionReason(s);
              return (
                <div
                  key={s.section}
                  className="rounded border border-gray-200 bg-white px-3 py-2"
                >
                  <p className="text-xs font-medium text-gray-500">
                    Section {s.section}
                  </p>
                  <p className="mt-0.5 text-sm whitespace-pre-wrap text-gray-800">
                    {why || "No reason was recorded for this section."}
                  </p>
                </div>
              );
            })}
          </div>
        </>
      )}

      {onStartAgain && (
        <div className="mt-3 flex flex-wrap gap-2">
          {briefStuck ? (
            <>
              <Button
                size="sm"
                onClick={() =>
                  onStartAgain({ question, sections: run.sections, brief: "author" })
                }
              >
                <RotateCcw className="size-3.5" />
                Start again with a fresh brief
              </Button>
              {briefsAvailable && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    onStartAgain({ question, sections: run.sections, brief: "reuse" })
                  }
                >
                  Start again reusing a brief from another run
                </Button>
              )}
            </>
          ) : (
            <Button
              size="sm"
              onClick={() =>
                onStartAgain({
                  question,
                  sections: failed,
                  brief: briefsAvailable ? "reuse" : "author",
                })
              }
            >
              <RotateCcw className="size-3.5" />
              Run only the failed section{failed.length === 1 ? "" : "s"} again
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * How many answers came back with a code. The detail endpoint reports this per
 * section rather than on the run, so add the sections up.
 */
function codedWords(run: RunDetail): string {
  let coded = run.coded ?? null;
  let written = run.rows_written ?? null;
  if (coded == null || written == null) {
    const rows = run.sections_detail.filter((s) => s.coded != null);
    if (rows.length === 0) return "—";
    coded = rows.reduce((a, s) => a + (s.coded ?? 0), 0);
    written = rows.reduce((a, s) => a + (s.rows_written ?? 0), 0);
  }
  if (!written) return "—";
  return `${coded} of ${written} (${Math.round((coded / written) * 100)}%)`;
}

function Sections({
  run,
  onOpenCell,
}: {
  run: RunDetail;
  onOpenCell?: (question: number, section: string, preselect?: "uncoded") => void;
}) {
  const isSweep = run.kind === "ocr_sweep";
  // A finished classification section with uncoded answers can be re-coded
  // cheaply — the diagnosis stays, only the code is tried again.
  const canRecode = (s: { stage: string; uncoded: number | null }) =>
    !isSweep && !!onOpenCell && run.question != null && s.stage === "done" && (s.uncoded ?? 0) > 0;
  if (run.sections_detail.length === 0)
    return (
      <section>
        <h3 className="mb-2 text-sm font-semibold text-gray-900">
          {isSweep ? "Shards" : "Sections"}
        </h3>
        <Note tone="plain">
          Nothing has been recorded per {isSweep ? "shard" : "section"} yet. If the
          run has only just started, this fills in within a minute.
        </Note>
      </section>
    );

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-gray-900">
        {isSweep ? "Shards" : "Sections"}
      </h3>
      <div className="overflow-x-auto rounded-lg border border-gray-200">
        <table className="w-full min-w-[620px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/80 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
              <th className="px-3 py-2">{isSweep ? "Shard" : "Section"}</th>
              <th className="px-3 py-2">Stage</th>
              <th className="px-3 py-2">Answers</th>
              <th className="px-3 py-2">Rows written</th>
              {!isSweep && <th className="px-3 py-2">Coded / uncoded</th>}
              <th className="px-3 py-2">Updated</th>
            </tr>
          </thead>
          <tbody>
            {run.sections_detail.map((s) => (
              <Fragment key={s.section}>
                <tr className="border-b border-gray-100 align-top last:border-0">
                  <td className="px-3 py-2 font-medium text-gray-900">{s.section}</td>
                  <td className="px-3 py-2">
                    <StageChip stage={s.stage} />
                  </td>
                  <td className="px-3 py-2 tabular-nums text-gray-700">
                    {s.answers ?? "—"}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-gray-700">
                    {s.rows_written ?? "—"}
                  </td>
                  {!isSweep && (
                    <td className="px-3 py-2 tabular-nums text-gray-700">
                      {s.coded == null ? "—" : `${s.coded} / ${s.uncoded ?? 0}`}
                      {canRecode(s) && (
                        <button
                          type="button"
                          onClick={() => onOpenCell!(run.question!, s.section, "uncoded")}
                          className="ml-2 inline-flex items-center gap-1 text-[11px] font-medium text-indigo-700 underline-offset-2 hover:underline"
                          title="Open this cell answer by answer with the uncoded ones ticked, ready to re-code."
                        >
                          <RotateCcw className="size-3" />
                          re-code the uncoded
                        </button>
                      )}
                    </td>
                  )}
                  <td className="px-3 py-2 whitespace-nowrap text-xs text-gray-500">
                    {relativeTime(s.updated_at)}
                  </td>
                </tr>
                {(s.error || scoreWords(s.score ?? {}) || scoreReport(s.score)) && (
                  <tr className="border-b border-gray-100 last:border-0">
                    <td colSpan={isSweep ? 5 : 6} className="px-3 pb-3">
                      {s.error && (
                        <p className="flex items-start gap-1.5 rounded border border-amber-200 bg-amber-50 px-2.5 py-2 text-xs text-amber-900">
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                          {s.error}
                        </p>
                      )}
                      {s.score && (scoreWords(s.score) || scoreReport(s.score)) && (
                        <div className="mt-1.5 rounded border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs text-gray-700">
                          {scoreWords(s.score) && (
                            <p>
                              <span className="font-medium">
                                Scored against the human answers:{" "}
                              </span>
                              {scoreWords(s.score)}
                            </p>
                          )}
                          {/* The scorer writes a short report with its own line
                              breaks; run it together and it is unreadable. */}
                          {scoreReport(s.score) && (
                            <pre className="mt-1 overflow-x-auto font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-gray-600">
                              {scoreReport(s.score)}
                            </pre>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/**
 * Findings are recorded as lists of items, but older runs wrote a bare count.
 * Accept either.
 */
function countOf(v: unknown): number {
  if (Array.isArray(v)) return v.length;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function Handoffs({ run }: { run: RunDetail }) {
  const rows = run.sections_detail.filter((s) => s.result && Object.keys(s.result).length);
  if (rows.length === 0) return null;

  const totalDefects = rows.reduce(
    (a, s) => a + countOf(s.result?.paper_defects_found),
    0
  );
  const totalDisagreements = rows.reduce(
    (a, s) => a + countOf(s.result?.brief_disagreements),
    0
  );
  const handoffs = rows
    .map((s) => ({ section: s.section, text: String(s.result?.handoff ?? "").trim() }))
    .filter((h) => h.text);

  if (!totalDefects && !totalDisagreements && handoffs.length === 0) return null;

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-gray-900">
        What the agent wants you to know
      </h3>
      <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-white px-4 py-3 text-sm">
        {totalDefects > 0 && (
          <p className="text-gray-800">
            <span className="font-medium">{totalDefects}</span>{" "}
            {totalDefects === 1 ? "problem" : "problems"} with the paper or the
            scan {totalDefects === 1 ? "was" : "were"} spotted while reading the
            answers — a missing figure, a mis-cut crop, that sort of thing.
          </p>
        )}
        {totalDisagreements > 0 && (
          <p className="text-gray-800">
            <span className="font-medium">{totalDisagreements}</span>{" "}
            {totalDisagreements === 1 ? "place" : "places"} where the agent
            disagreed with its own marking brief. Worth a look if the coded share
            is lower than you expected.
          </p>
        )}
        {handoffs.map((h) => (
          <p key={h.section} className="text-gray-800">
            <span className="font-medium">Section {h.section}: </span>
            {h.text}
          </p>
        ))}
      </div>
    </section>
  );
}

function Artifacts({ runId, artifacts }: { runId: string; artifacts: Artifact[] }) {
  const [openFile, setOpenFile] = useState<{ section: string; name: string } | null>(null);
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The viewer opens below the row of file buttons, which on a long run is off
  // the bottom of the drawer — clicking a file would look like nothing happened.
  const viewerRef = useRef<HTMLDivElement>(null);

  async function show(section: string, name: string) {
    if (openFile?.section === section && openFile?.name === name) {
      setOpenFile(null);
      return;
    }
    setOpenFile({ section, name });
    setText(null);
    setError(null);
    setLoading(true);
    try {
      setText(await getArtifactText(runId, section, name));
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (openFile)
      viewerRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [openFile]);

  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-gray-900">
        Files this run wrote
      </h3>
      {artifacts.length === 0 ? (
        <Note tone="plain">
          No files yet. A run writes its brief, its classifications and its dry-run
          log as it goes, so these appear while it is still working.
        </Note>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {artifacts.map((a) => {
              const on =
                openFile?.section === a.section && openFile?.name === a.name;
              return (
                <button
                  key={`${a.section}/${a.name}`}
                  type="button"
                  onClick={() => show(a.section, a.name)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs transition",
                    on
                      ? "border-indigo-400 bg-indigo-50 text-indigo-900"
                      : "border-gray-200 bg-white text-gray-700 hover:border-gray-300"
                  )}
                >
                  <FileText className="size-3.5" />
                  <span className="font-medium">{a.section}</span>
                  <span>/</span>
                  <span>{a.name}</span>
                  <span className="text-gray-400">{bytes(a.bytes)}</span>
                </button>
              );
            })}
          </div>
          {openFile && (
            <div ref={viewerRef} className="overflow-hidden rounded-lg border border-gray-200">
              <div className="border-b border-gray-200 bg-gray-50 px-3 py-1.5 text-xs text-gray-600">
                {openFile.section} / {openFile.name}
              </div>
              <div className="max-h-96 overflow-auto bg-white px-3 py-2">
                {loading && <Spinner className="size-4 text-gray-400" />}
                {error && <p className="text-xs text-rose-700">{error}</p>}
                {text !== null && (
                  <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-gray-800">
                    {text}
                  </pre>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/** Event names are recorded as snake_case verbs; read them back as English. */
function eventWords(what: string): string {
  const known: Record<string, string> = {
    started: "Started",
    started_from_ui: "Started from this page",
    cancelled: "Stopped by a person",
    applied: "Applied to the dashboard",
    finished: "Finished",
  };
  return known[what] ?? what.replace(/_/g, " ");
}

/**
 * Event detail arrives as an object of whatever the workflow recorded. Show it
 * as `key value` pairs rather than handing React an object to render.
 */
function detailWords(detail: RunEvent["detail"]): string {
  if (!detail) return "";
  if (typeof detail === "string") return detail;
  return Object.entries(detail)
    .filter(([, v]) => v !== null && v !== undefined && v !== "")
    .map(([k, v]) => `${k.replace(/_/g, " ")} ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}

function Events({ run }: { run: RunDetail }) {
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-gray-900">What happened</h3>
      {run.events.length === 0 ? (
        <Note tone="plain">
          Nothing was written to this run&apos;s history. Older runs predate the
          event log, so this being empty does not mean the run did nothing.
        </Note>
      ) : (
      <ol className="flex flex-col gap-0 border-l border-gray-200 pl-4">
        {[...run.events]
          .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
          .map((e, i) => (
            <li key={`${e.at}-${i}`} className="relative py-1.5 text-sm">
              <span className="absolute -left-[21px] top-3 size-2 rounded-full bg-gray-300" />
              <span className="text-gray-900">{eventWords(e.what)}</span>
              {detailWords(e.detail) && (
                <span className="block text-xs text-gray-600">
                  {detailWords(e.detail)}
                </span>
              )}
              <span className="block text-[11px] text-gray-400">
                {e.who} · {absoluteTime(e.at)}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function CancelButton({ run, onChanged }: { run: RunDetail; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Ban className="size-4" />
        Stop this run
      </Button>
      <Dialog open={open} onOpenChange={(v) => !busy && setOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Stop run {run.id}?</DialogTitle>
            <DialogDescription>
              Sections that have already finished keep what they wrote. Anything
              still going stops where it is, and the run is marked cancelled. You
              cannot resume it — you would start a new run.
            </DialogDescription>
          </DialogHeader>
          {error && <Note tone="error">{error}</Note>}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Leave it running
            </Button>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await cancelRun(run.id);
                  setOpen(false);
                  onChanged();
                } catch (e) {
                  setError(errMsg(e));
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy && <Spinner className="size-4" />}
              Stop it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** The one place a run is written to the dashboard. Also used by the cell drawer. */
export function ApplyPanel({ run, onChanged }: { run: RunDetail; onChanged: () => void }) {
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [preview, setPreview] = useState<ApplyPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [repairing, setRepairing] = useState(false);
  const [repairNote, setRepairNote] = useState<string | null>(null);

  async function repairCodes() {
    setRepairing(true);
    setRepairNote(null);
    try {
      const r = await repairRunCodes(run.id);
      const n = Object.keys(r.repaired).length;
      setRepairNote(
        `${n} code${n === 1 ? "" : "s"} repaired in ${r.rows} row${r.rows === 1 ? "" : "s"}` +
          (r.unresolved.length ? `; still unknown: ${r.unresolved.join(", ")} — re-code those answers from the cell.` : ". Apply again.")
      );
      if (n) {
        setError(null);
        setPreview(null);
        onChanged();
      }
    } catch (e) {
      setRepairNote(errMsg(e));
    } finally {
      setRepairing(false);
    }
  }

  // The server's own dry run, fetched before the confirmation is offered. For
  // a run that never stored one (compare mode) this is also what writes it, so
  // nothing is ever applied that was not dry-run first.
  async function openConfirm() {
    setPreviewing(true);
    setError(null);
    try {
      setPreview(await getApplyPreview(run.id));
      setConfirming(true);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setPreviewing(false);
    }
  }

  const willWrite = run.sections_detail.filter((s) => (s.rows_written ?? 0) > 0);
  const totalRows = willWrite.reduce((a, s) => a + (s.rows_written ?? 0), 0);
  const totalUncoded = willWrite.reduce((a, s) => a + (s.uncoded ?? 0), 0);
  const alreadyApplied = !!run.applied_at;

  return (
    <section className="rounded-lg border border-indigo-200 bg-indigo-50/40 px-4 py-4">
      <h3 className="text-sm font-semibold text-gray-900">Apply to the dashboard</h3>
      <p className="mt-0.5 text-sm text-gray-700">
        Until you do this, nothing from the run is visible to teachers. Applying
        writes the error codes into the dashboard database, where the Question and
        Chapter pages read them.
      </p>

      {alreadyApplied && !result && (
        <Note tone="plain" className="mt-3">
          Already applied by {run.applied_by} on {absoluteTime(run.applied_at)}.
          Applying again would rewrite the same rows.
        </Note>
      )}

      {!result && (
        <div className="mt-3 overflow-hidden rounded-lg border border-gray-200 bg-white">
          <div className="border-b border-gray-200 bg-gray-50 px-3 py-1.5 text-xs font-medium text-gray-600">
            What this will write, from the run&apos;s own dry run
          </div>
          <table className="w-full border-collapse text-sm">
            <tbody>
              {willWrite.map((s) => (
                <tr key={s.section} className="border-b border-gray-100 last:border-0">
                  <td className="px-3 py-2 font-medium text-gray-900">
                    Section {s.section}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-gray-700">
                    {s.rows_written} rows
                  </td>
                  <td className="px-3 py-2 text-xs text-gray-600">
                    {s.uncoded
                      ? `${s.uncoded} answers have no code and are left as they are`
                      : "every answer carries a code"}
                  </td>
                </tr>
              ))}
              {willWrite.length === 0 && (
                <tr>
                  <td className="px-3 py-3 text-sm text-gray-500">
                    This run wrote no rows, so there is nothing to apply.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {result && (
        <div className="mt-3 flex flex-col gap-2 rounded-lg border border-emerald-200 bg-white px-3 py-3">
          <p className="text-sm font-semibold text-emerald-900">
            Applied by {result.applied_by} on {absoluteTime(result.applied_at)}.
          </p>
          {Object.entries(result.sections).map(([section, s]) => (
            <div key={section} className="text-sm">
              <span className="font-medium text-gray-900">Section {section}: </span>
              <span className="text-gray-700">
                {/* Rows the dashboard actually changed when the publisher did the
                    writing; otherwise the statement counts of the dry run. */}
                {Object.entries(s.rows && Object.keys(s.rows).length ? s.rows : s.statements)
                  .filter(([, n]) => n > 0)
                  .map(([stmt, n]) => `${n} × ${stmt}`)
                  .join(", ") || "nothing written"}
                {s.audit_id != null && (
                  <span className="ml-2 text-xs text-gray-500">audit #{s.audit_id}</span>
                )}
              </span>
              {s.warnings.length > 0 && (
                <ul className="mt-0.5 list-disc pl-5 text-xs text-amber-800">
                  {s.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </div>
      )}

      {error && (
        <Note tone="error" title="Not applied" className="mt-3">
          {error}
          {/taxonomy/i.test(error) && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                disabled={repairing}
                onClick={repairCodes}
                className="inline-flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-800 hover:border-indigo-400 disabled:opacity-50"
              >
                {repairing ? <Spinner className="size-3" /> : null}
                Repair abbreviated codes
              </button>
              <span className="text-xs text-gray-600">
                Rewrites a code written short (a dropped prefix) to the one taxonomy code it matches. Anything
                ambiguous is left for a re-code.
              </span>
            </div>
          )}
          {repairNote && <p className="mt-2 text-xs text-gray-800">{repairNote}</p>}
        </Note>
      )}

      {!result && willWrite.length > 0 && (
        <div className="mt-3">
          {!confirming ? (
            <Button onClick={openConfirm} disabled={previewing}>
              {previewing ? <Spinner className="size-4" /> : <Upload className="size-4" />}
              Apply {totalRows} rows to the dashboard
            </Button>
          ) : (
            <div className="flex flex-col gap-2 rounded-lg border border-rose-300 bg-white px-3 py-3">
              <p className="text-sm font-semibold text-rose-900">
                This writes to the dashboard database.
              </p>
              {preview && (
                <div className="rounded border border-gray-200 bg-gray-50 px-2.5 py-2 text-xs text-gray-700">
                  <p className="font-medium text-gray-900">From the dry run just checked:</p>
                  {Object.entries(preview.sections).map(([section, s]) => (
                    <div key={section} className="mt-1">
                      <span className="font-medium">Section {section}: </span>
                      {Object.entries(s.statements)
                        .filter(([, n]) => n > 0)
                        .map(([stmt, n]) => `${n} × ${stmt}`)
                        .join(", ") || "no statements"}
                      {s.warnings.map((w) => (
                        <p key={w} className="mt-0.5 text-amber-800">
                          {w}
                        </p>
                      ))}
                    </div>
                  ))}
                  <p className="mt-1 text-gray-500">
                    The full log is under &ldquo;Files this run wrote&rdquo; as
                    export_dry.log.
                  </p>
                </div>
              )}
              <p className="text-sm text-gray-700">
                {totalRows} rows across {willWrite.length} section
                {willWrite.length === 1 ? "" : "s"} become visible to teachers.
                {totalUncoded > 0 &&
                  ` ${totalUncoded} answers have no code and stay as they are.`}{" "}
                Type the run id to confirm.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  value={typed}
                  onChange={(e) => setTyped(e.target.value)}
                  placeholder={run.id}
                  className="w-48 rounded-md border border-gray-300 px-2 py-1.5 font-mono text-sm outline-none focus:border-indigo-400"
                />
                <Button
                  disabled={typed.trim() !== run.id || busy}
                  onClick={async () => {
                    setBusy(true);
                    setError(null);
                    try {
                      setResult(await applyRun(run.id));
                      onChanged();
                    } catch (e) {
                      setError(errMsg(e));
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {busy && <Spinner className="size-4" />}
                  Write it
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    setConfirming(false);
                    setTyped("");
                  }}
                  disabled={busy}
                >
                  Back out
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
