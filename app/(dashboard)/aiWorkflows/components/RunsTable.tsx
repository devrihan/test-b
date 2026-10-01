"use client";

// Every run for the chosen paper, newest first. Refreshes itself every ten
// seconds while anything is still going, so nobody has to sit there hitting F5.

import { useMemo, useState } from "react";
import { Button, Spinner, cn } from "@student-ds/ui";
import { RefreshCw } from "lucide-react";
import type { Run, RunStatus } from "../lib/api";
import {
  KIND_LABEL,
  STATUS_LABEL,
  absoluteTime,
  duration,
  relativeTime,
} from "../lib/readiness";
import { Failed, Loading, Note, StageChip, StatusBadge } from "./Bits";

const STATUSES: RunStatus[] = [
  "running",
  "done",
  "partial",
  "blocked_on_ocr",
  "brief_needs_human",
  "nothing_in_scope",
  "cancelled",
  "failed",
];

export function RunsTable({
  runs,
  loading,
  error,
  onOpen,
  onRefresh,
  lastRefreshed,
}: {
  runs: Run[] | null;
  loading: boolean;
  error: string | null;
  onOpen: (runId: string) => void;
  onRefresh: () => void;
  lastRefreshed: number | null;
}) {
  const [status, setStatus] = useState<string>("");
  const [kind, setKind] = useState<string>("");

  const shown = useMemo(() => {
    let out = runs ?? [];
    if (status) out = out.filter((r) => r.status === status);
    if (kind) out = out.filter((r) => r.kind === kind);
    return [...out].sort(
      (a, b) => new Date(b.started_at).getTime() - new Date(a.started_at).getTime()
    );
  }, [runs, status, kind]);

  const anyRunning = (runs ?? []).some((r) => r.status === "running");

  if (loading && !runs) return <Loading what="runs" />;
  if (error && !runs) return <Failed what="the run list" error={error} />;

  const readyToApply = (runs ?? []).filter((r) => r.kind === "pipeline" && r.status === "pending_apply");
  return (
    <div className="flex flex-col gap-4">
      {readyToApply.length > 0 && (
        <div className="mb-3 rounded-lg border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
          <span className="font-semibold">Ready to apply.</span>{" "}
          {readyToApply.map((r) => {
            const d = (r.summary ?? {}) as { pending_apply?: { answers: number; questions: number[]; runs: string[] } };
            const p = d.pending_apply;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onOpen(r.id)}
                className="mr-2 underline decoration-indigo-300 underline-offset-2 hover:decoration-indigo-600"
                title="Open the pipeline run for the list of runs to apply"
              >
                section {r.sections[0] ?? "?"}
                {p ? `: ${p.answers} answer${p.answers === 1 ? "" : "s"}${p.questions.length ? ` across Q${p.questions.join(", Q")}` : ""} in ${p.runs.length} run${p.runs.length === 1 ? "" : "s"}` : ""}
              </button>
            );
          })}
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
          >
            <option value="">Every kind of run</option>
            <option value="classification">Error classification</option>
            <option value="ocr_sweep">OCR sweep</option>
            <option value="pipeline">Section pipeline</option>
            <option value="sync">Dashboard bridge</option>
            <option value="summaries">AI summaries</option>
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
          >
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          {(status || kind) && (
            <button
              type="button"
              onClick={() => {
                setStatus("");
                setKind("");
              }}
              className="text-xs text-indigo-600 hover:underline"
            >
              Clear filters
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 text-xs text-gray-500">
          {anyRunning && (
            <span className="flex items-center gap-1.5">
              <Spinner className="size-3" />
              refreshing every 10 seconds while a run is going
            </span>
          )}
          {lastRefreshed && <span>updated {relativeTime(new Date(lastRefreshed).toISOString())}</span>}
          <Button size="sm" variant="outline" onClick={onRefresh}>
            <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
            Refresh
          </Button>
        </div>
      </div>

      {error && (
        <Note tone="warn" title="The last refresh failed">
          {error} — what you see below may be out of date.
        </Note>
      )}

      {shown.length === 0 ? (
        <Note tone="plain">
          {runs && runs.length > 0
            ? "No runs match those filters."
            : "No runs have been started for this paper yet. Go to Prepare, find a question with green sections, and start one."}
        </Note>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full min-w-[900px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50/80 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
                <th className="px-3 py-2">Run</th>
                <th className="px-3 py-2">What it does</th>
                <th className="px-3 py-2">Question</th>
                <th className="px-3 py-2">Sections</th>
                <th className="px-3 py-2">Coded</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Started</th>
                <th className="px-3 py-2">Took</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const pct =
                  r.rows_written && r.coded != null
                    ? Math.round((r.coded / r.rows_written) * 100)
                    : null;
                return (
                  <tr
                    key={r.id}
                    onClick={() => onOpen(r.id)}
                    className="cursor-pointer border-b border-gray-100 align-top last:border-0 hover:bg-indigo-50/40"
                  >
                    <td className="px-3 py-2.5 font-mono text-xs text-gray-700">
                      {r.id}
                      {r.applied_at && (
                        <span className="mt-0.5 block font-sans text-[11px] text-emerald-700">
                          applied
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="block text-gray-900">
                        {KIND_LABEL[r.kind] ?? r.kind}
                      </span>
                      {r.mode && (
                        <span className="block text-xs text-gray-500">
                          {r.mode === "compare"
                            ? "compared against human answers"
                            : "classified for real"}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-900">
                      {r.kind === "pipeline" ? (
                        <span className="text-gray-700">section {r.sections[0] ?? "?"}</span>
                      ) : r.question == null ? (
                        <span className="text-gray-500">whole paper</span>
                      ) : (
                        `Q${r.question}`
                      )}
                    </td>
                    <td className="max-w-[260px] px-3 py-2.5">
                      <div className="flex flex-wrap gap-1">
                        {Object.entries(r.stages ?? {}).map(([section, stage]) => (
                          <StageChip key={section} stage={stage} label={section} />
                        ))}
                        {Object.keys(r.stages ?? {}).length === 0 && (
                          <span className="text-xs text-gray-400">
                            {r.sections.join(" ") || "—"}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap tabular-nums">
                      {pct === null ? (
                        <span className="text-gray-400">—</span>
                      ) : (
                        <span className="text-gray-900">
                          {pct}%
                          <span className="ml-1 text-xs text-gray-500">
                            ({r.coded}/{r.rows_written})
                          </span>
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <span className="block text-gray-900">{r.started_by}</span>
                      <span
                        className="block text-xs text-gray-500"
                        title={absoluteTime(r.started_at)}
                      >
                        {relativeTime(r.started_at)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap text-gray-700 tabular-nums">
                      {duration(r.started_at, r.finished_at)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
