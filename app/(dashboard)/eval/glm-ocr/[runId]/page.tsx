"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "@/app/lib/queryKeys";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Download, Loader2, Pin, PinOff, RefreshCw, Sparkles, Eye, Type } from "lucide-react";
import { apiClient } from "@/app/lib/apiClient";
import LatexPreview from "@/app/components/LatexPreview";

const BEAVER_BASE = process.env.NEXT_PUBLIC_BEAVER_API_URL ?? "http://localhost:4000";

type Aggregate = Record<string, number | string | null | undefined>;

interface WorstRow {
  section: string | null;
  student_name: string;
  question_key: string;
  row_type: string;
  ground_truth: string | null;
  predicted: string | null;
  wer: number | null;
  cer: number | null;
  correct: boolean | null;
  latency_ms: number | null;
  error: string | null;
}

interface RunDetail {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  test_set_version: string;
  ocr_config: Record<string, unknown> | null;
  aggregate: Aggregate | null;
  workflow_id: string | null;
  workflow_run_id: string | null;
  error_message: string | null;
  created_by: string | null;
  pinned_as_baseline: boolean;
  worst_predictions: WorstRow[];
  result_counts: Record<string, number>;
}

const STATUS_COLORS: Record<string, string> = {
  queued:    "bg-gray-100 text-gray-600",
  running:   "bg-blue-50 text-blue-600",
  success:   "bg-green-50 text-green-700",
  failed:    "bg-red-50 text-red-600",
  cancelled: "bg-amber-50 text-amber-700",
};

function fmtPct(v: unknown): string {
  if (typeof v !== "number" || Number.isNaN(v)) return "—";
  return `${v.toFixed(1)}%`;
}
function fmtNum(v: unknown, digits = 3): string {
  if (typeof v !== "number" || Number.isNaN(v)) return "—";
  return v.toFixed(digits);
}

export default function GlmOcrEvalDetailPage() {
  const router = useRouter();
  const params = useParams<{ runId: string }>();
  const runId  = params?.runId;

  const queryClient = useQueryClient();
  const [actionError, setActionError] = useState<string | null>(null);
  const [renderLatex, setRenderLatex] = useState(false);

  const runQuery = useQuery({
    queryKey: keys.eval.run(runId ?? ""),
    queryFn: () =>
      apiClient.get<RunDetail>(`${BEAVER_BASE}/api/eval/glm-ocr/runs/${runId}`),
    enabled: !!runId,
    // Poll while the run is still active.
    refetchInterval: query =>
      query.state.data?.status === "queued" || query.state.data?.status === "running"
        ? 3000
        : false,
    refetchIntervalInBackground: false,
  });

  const run = runQuery.data ?? null;
  const loading = runQuery.isPending;
  const error =
    actionError ??
    (runQuery.error instanceof Error ? runQuery.error.message : null);

  const pinMutation = useMutation({
    mutationFn: (pinned: boolean) =>
      apiClient.put<{ id: string; pinned_as_baseline: boolean }>(
        `${BEAVER_BASE}/api/eval/glm-ocr/runs/${run!.id}/pin`,
        { pinned },
      ),
    onSuccess: r =>
      queryClient.setQueryData<RunDetail>(keys.eval.run(runId ?? ""), prev =>
        prev ? { ...prev, pinned_as_baseline: r.pinned_as_baseline } : prev,
      ),
  });

  const reEvalMutation = useMutation({
    mutationFn: () =>
      apiClient.post(`${BEAVER_BASE}/api/eval/glm-ocr/runs/${run!.id}/re-evaluate`, {}),
    // Flip to running locally so the poll (above) refreshes the metrics.
    onSuccess: () =>
      queryClient.setQueryData<RunDetail>(keys.eval.run(runId ?? ""), prev =>
        prev ? { ...prev, status: "running" } : prev,
      ),
  });

  const pinPending = pinMutation.isPending;
  const reEvalPending = reEvalMutation.isPending;

  async function togglePin() {
    if (!run) return;
    setActionError(null);
    try {
      await pinMutation.mutateAsync(!run.pinned_as_baseline);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to update pin");
    }
  }

  async function reEvaluate() {
    if (!run) return;
    if (!window.confirm("Re-score this run's stored predictions with the current metrics? This overwrites the run's existing numbers (no OCR is re-run).")) {
      return;
    }
    setActionError(null);
    try {
      await reEvalMutation.mutateAsync();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to re-evaluate run");
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 size={24} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <div className="max-w-3xl mx-auto">
          <button
            onClick={() => router.push("/eval/glm-ocr")}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium transition mb-4"
          >
            <ArrowLeft size={15} /> Back
          </button>
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            {error ?? "Run not found"}
          </div>
        </div>
      </div>
    );
  }

  const agg = (run.aggregate ?? {}) as Aggregate;
  const csvHref = `${BEAVER_BASE}/api/eval/glm-ocr/runs/${run.id}/results.csv`;
  const promptText = typeof run.ocr_config?.prompt === "string" ? run.ocr_config.prompt : "";
  // Re-evaluate re-scores stored predictions, so it's available for any finished
  // run that has results — including a `failed` run whose only failure was a
  // re-evaluate trigger glitch (the re-run clears that error and recomputes).
  const hasResults = Object.values(run.result_counts ?? {}).reduce((a, b) => a + (b ?? 0), 0) > 0;
  const canReEvaluate = hasResults && (run.status === "success" || run.status === "failed");

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <button
          onClick={() => router.push("/eval/glm-ocr")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium transition mb-4"
        >
          <ArrowLeft size={15} /> Back to runs
        </button>

        <div className="flex items-end justify-between mb-6">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-gray-900">Run #{run.id}</h1>
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[run.status] ?? "bg-gray-100 text-gray-600"}`}>
                {run.status}
              </span>
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                {run.test_set_version}
              </span>
              {run.pinned_as_baseline && (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">
                  baseline
                </span>
              )}
            </div>
            <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
              <span>Started {new Date(run.started_at).toLocaleString()}</span>
              {run.finished_at && (
                <>
                  <span>·</span>
                  <span>Finished {new Date(run.finished_at).toLocaleString()}</span>
                </>
              )}
              {run.created_by && (
                <>
                  <span>·</span>
                  <span>by {run.created_by}</span>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {canReEvaluate && (
              <button
                onClick={reEvaluate}
                disabled={reEvalPending}
                title="Re-score the stored predictions with the current metrics (no OCR)"
                className="flex items-center gap-1.5 h-9 px-3 text-sm border border-gray-200 hover:border-indigo-300 bg-white rounded-lg transition disabled:opacity-60"
              >
                <RefreshCw size={14} className={reEvalPending ? "animate-spin" : ""} />
                Re-evaluate
              </button>
            )}
            <button
              onClick={togglePin}
              disabled={pinPending}
              className="flex items-center gap-1.5 h-9 px-3 text-sm border border-gray-200 hover:border-indigo-300 bg-white rounded-lg transition"
            >
              {run.pinned_as_baseline ? <PinOff size={14} /> : <Pin size={14} />}
              {run.pinned_as_baseline ? "Unpin" : "Pin as baseline"}
            </button>
            <a
              href={csvHref}
              className="flex items-center gap-1.5 h-9 px-3 text-sm border border-gray-200 hover:border-indigo-300 bg-white rounded-lg transition"
            >
              <Download size={14} />
              Results CSV
            </a>
          </div>
        </div>

        {run.error_message && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
            {run.error_message}
          </div>
        )}

        {/* Aggregate metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Card label="Overall accuracy" value={fmtPct(agg.overall_accuracy_pct)} hint="blanks excluded" />
          <Card label="MCQ accuracy"     value={fmtPct(agg.mcq_accuracy_pct)} />
          <Card label="Blank accuracy"   value={fmtPct(agg.blank_accuracy_pct)} />
          <Card label="Descriptive char acc" value={fmtPct(agg.desc_char_accuracy_pct)} />
          <Card label="CER p50" value={fmtNum(agg.desc_cer_median)} />
          <Card label="CER p90" value={fmtNum(agg.desc_cer_p90)} />
          <Card label="WER p50" value={fmtNum(agg.desc_wer_median)} />
          <Card label="WER p90" value={fmtNum(agg.desc_wer_p90)} />
        </div>

        {/* Counts */}
        <div className="flex items-center gap-4 text-xs text-gray-500 mb-6">
          <span><b className="text-gray-900">{run.result_counts.mcq ?? 0}</b> mcq</span>
          <span><b className="text-gray-900">{run.result_counts.blank ?? 0}</b> blank</span>
          <span><b className="text-gray-900">{run.result_counts.descriptive ?? 0}</b> descriptive</span>
          {typeof agg.total === "number" && (
            <span><b className="text-gray-900">{agg.total}</b> scored</span>
          )}
        </div>

        {/* Prompt used for this run — associates the exact prompt with the run */}
        {promptText.trim() !== "" && (
          <div className="bg-white border border-violet-200 rounded-xl overflow-hidden mb-6 shadow-sm">
            <div className="flex items-center gap-2 px-5 py-3 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-pink-500">
              <Sparkles size={14} className="text-white" />
              <h2 className="text-sm font-bold text-white">Prompt used for this run</h2>
            </div>
            <pre className="px-5 py-4 text-xs leading-relaxed text-gray-700 whitespace-pre-wrap break-words font-mono max-h-72 overflow-auto bg-violet-50/40">
              {promptText}
            </pre>
          </div>
        )}

        {/* Worst predictions */}
        <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 flex items-start justify-between gap-4">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Top 100 worst predictions (CER desc)</h2>
              <p className="text-[11px] text-gray-500 mt-0.5">
                Descriptive rows only. Blank/MCQ omitted.{" "}
                {renderLatex
                  ? "Showing rendered LaTeX (raw) — hover for the unified compared text."
                  : "Text shown is the unified (LaTeX-canonicalized) form actually compared — hover for the raw OCR."}
              </p>
            </div>
            <button
              onClick={() => setRenderLatex((v) => !v)}
              className="shrink-0 flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:text-indigo-600 hover:border-indigo-300 transition"
              title={renderLatex ? "Show the unified text" : "Render the LaTeX visually"}
            >
              {renderLatex ? <><Type size={13} /> Show text</> : <><Eye size={13} /> Render LaTeX</>}
            </button>
          </div>
          {run.worst_predictions.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-gray-400">
              {run.status === "queued" || run.status === "running"
                ? "Run in progress — results stream in as crops are scored."
                : "No descriptive rows in this run."}
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {run.worst_predictions.map((row, i) => (
                <div key={`${row.student_name}-${row.question_key}-${i}`} className="px-5 py-3">
                  <div className="flex items-center gap-3 text-xs text-gray-500 mb-2">
                    {row.section && (
                      <span className="font-mono px-1.5 py-0.5 bg-gray-50 border border-gray-100 rounded">
                        {row.section}
                      </span>
                    )}
                    <span className="font-medium text-gray-700">{row.student_name}</span>
                    <span>·</span>
                    <span>Q{row.question_key}</span>
                    <span>·</span>
                    <span>CER {fmtNum(row.cer)}</span>
                    <span>·</span>
                    <span>WER {fmtNum(row.wer)}</span>
                    {typeof row.latency_ms === "number" && (
                      <>
                        <span>·</span>
                        <span>{row.latency_ms}ms</span>
                      </>
                    )}
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Cell title="ground truth" body={unifiedGroundTruth(row.ground_truth)} raw={row.ground_truth} render={renderLatex} />
                    <Cell title="predicted"    body={unifiedPredicted(row.predicted)}       raw={row.predicted}     render={renderLatex} />
                  </div>
                  {row.error && (
                    <div className="text-xs text-red-600 mt-2">{row.error}</div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Card({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
      {hint && <p className="text-[10px] text-gray-400 mt-0.5">{hint}</p>}
    </div>
  );
}

// ── LaTeX "unifying" — mirrors riverWorkflow src/lib/ocr_eval_metrics.py
// (clean_prediction + canonicalize_latex). Both sides are run through this
// canonical form before CER/WER, so the worst-list shows the text AS COMPARED
// (notation-only differences already folded away), not the raw OCR output.
// Pure/deterministic regex — keep in sync with the Python source.
const MD_FENCE_RE = /^[ \t]*```(?:markdown|latex|math)?[ \t]*\n?|\n?```[ \t]*$/gim;
function cleanPrediction(text: string): string {
  return (text ?? "").replace(MD_FENCE_RE, "").trim();
}

const LX_DELIMS_RE = /\$\$|\$|\\\(|\\\)|\\\[|\\\]/g;
const LX_ENV_RE = /\\(?:begin|end)\s*\{[^}]*\}/g;
const LX_TAG_RE = /\\tag\*?\s*\{[^}]*\}|\\label\s*\{[^}]*\}|\\nonumber(?![a-zA-Z])/g;
const LX_TRAILING_NUM_RE = /\(\s*\d+\s*\)\s*$/;
const LX_SIZING_RE = /\\(?:left|right|middle|biggl|biggr|Biggl|Biggr|bigl|bigr|Bigl|Bigr|bigg|Bigg|big|Big)(?![a-zA-Z])/g;
const LX_SPACING_RE = /\\\\|\\[,;:!> ]|\\(?:qquad|quad|thinspace|enspace)(?![a-zA-Z])|~/g;
const LX_TEXTWRAP_RE = /\\(?:text|mathrm|operatorname|mathit|mathbf|mathsf|mathtt|textbf|textit|boldsymbol|mathbb|mathcal)\s*\{([^{}]*)\}/g;
const LX_ACCENT_BRACE_RE = /\\(vec|hat|tilde|bar|dot|ddot|overline)\s+([A-Za-z0-9])(?![A-Za-z0-9])/g;
const LX_SUPSUB_BRACE_RE = /([\^_])\s*([A-Za-z0-9])/g;
const LX_OP_SPACE_RE = /\s*([^\w\s])\s*/g;
const LX_SYNONYMS: Record<string, string> = {
  "\\overrightarrow": "\\vec", "\\widehat": "\\hat", "\\widetilde": "\\tilde", "\\overline": "\\bar",
  "\\dfrac": "\\frac", "\\tfrac": "\\frac", "\\cfrac": "\\frac",
  "\\ge": "\\geq", "\\le": "\\leq", "\\ne": "\\neq",
  "\\to": "\\rightarrow", "\\implies": "\\Rightarrow", "\\iff": "\\Leftrightarrow",
  "\\cdots": "\\dots", "\\ldots": "\\dots", "\\dotsc": "\\dots",
  "\\varphi": "\\phi", "\\varepsilon": "\\epsilon", "\\vartheta": "\\theta",
};
const LX_SYN_RE = new RegExp(
  "(?:" +
    Object.keys(LX_SYNONYMS)
      .sort((a, b) => b.length - a.length)
      .map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join("|") +
    ")(?![a-zA-Z])",
  "g",
);

function canonicalizeLatex(text: string): string {
  let s = text ?? "";
  s = s.replace(LX_DELIMS_RE, " ");
  s = s.replace(LX_ENV_RE, " ");
  s = s.replace(LX_TAG_RE, " ");
  s = s.replace(LX_SYN_RE, (m) => LX_SYNONYMS[m]);
  for (let i = 0; i < 5; i++) {
    const next = s.replace(LX_TEXTWRAP_RE, "$1");
    if (next === s) break;
    s = next;
  }
  s = s.replace(LX_ACCENT_BRACE_RE, "\\$1{$2}");
  s = s.replace(LX_SUPSUB_BRACE_RE, "$1{$2}");
  s = s.replace(LX_SIZING_RE, "");
  s = s.replace(LX_SPACING_RE, " ");
  s = s.replace(/\s+/g, " ").trim();
  s = s.replace(LX_TRAILING_NUM_RE, "").trim();
  s = s.replace(LX_OP_SPACE_RE, "$1");
  return s.trim().toLowerCase();
}

/** Canonical form of the ground truth — exactly what CER/WER compared. */
function unifiedGroundTruth(raw: string | null): string | null {
  return canonicalizeLatex(raw ?? "") || null;
}
/** Canonical form of the prediction — strip fences (clean_prediction) then canonicalize. */
function unifiedPredicted(raw: string | null): string | null {
  return canonicalizeLatex(cleanPrediction(raw ?? "")) || null;
}

function Cell({
  title,
  body,
  raw,
  render = false,
}: {
  title: string;
  body: string | null;
  raw?: string | null;
  render?: boolean;
}) {
  return (
    <div className="bg-gray-50 border border-gray-100 rounded-lg px-3 py-2">
      <p className="text-[10px] text-gray-400 uppercase tracking-wide font-semibold mb-1">{title}</p>
      {render ? (
        // Render the RAW LaTeX (original delimiters + case) for a faithful visual.
        // The unified text stays on hover so the compared form is still inspectable.
        raw && raw.trim() ? (
          <div className="text-sm text-gray-800 overflow-x-auto" title={body ? `unified: ${body}` : undefined}>
            <LatexPreview text={raw} />
          </div>
        ) : (
          <span className="text-gray-400">∅</span>
        )
      ) : (
        <pre
          className="text-xs text-gray-800 whitespace-pre-wrap break-words font-mono"
          title={raw ? `raw: ${raw}` : undefined}
        >
          {body ?? <span className="text-gray-400 not-italic">∅</span>}
        </pre>
      )}
    </div>
  );
}
