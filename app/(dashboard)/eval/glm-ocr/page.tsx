"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "@/app/lib/queryKeys";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Play, RefreshCcw, Sparkles, X } from "lucide-react";
import { apiClient } from "@/app/lib/apiClient";

const BEAVER_BASE = process.env.NEXT_PUBLIC_BEAVER_API_URL ?? "http://localhost:4000";

// Mirrors beaver-api DEFAULT_OCR_PROMPT (routes/eval.ts) — prefilled so operators
// tweak the real prompt rather than start from blank.
const DEFAULT_OCR_PROMPT =
  "Text Recognition:\n" +
  "Transcribe exactly as written, preserving original line breaks.\n" +
  "If items are written side-by-side, keep them on the SAME line.";
const MAX_STUDENTS = 30;

type Aggregate = Record<string, number | string | null | undefined>;

interface EvalRun {
  id: string;
  started_at: string;
  finished_at: string | null;
  status: string;
  test_set_version: string;
  aggregate: Aggregate | null;
  workflow_id: string | null;
  workflow_run_id: string | null;
  error_message: string | null;
  created_by: string | null;
  pinned_as_baseline: boolean;
}

interface RunListResponse {
  runs: EvalRun[];
  total: number;
  limit: number;
  offset: number;
}

interface TestSetsResponse {
  versions: string[];
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

const NO_RUNS: EvalRun[] = [];
const NO_VERSIONS: string[] = [];

export default function GlmOcrEvalListPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [actionError, setError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  // Custom-prompt run panel
  const [customOpen, setCustomOpen] = useState(false);
  const [customPrompt, setCustomPrompt] = useState(DEFAULT_OCR_PROMPT);
  const [numStudents, setNumStudents] = useState(MAX_STUDENTS);

  const runsQuery = useQuery({
    queryKey: keys.eval.runs(),
    queryFn: () =>
      apiClient
        .get<RunListResponse>(`${BEAVER_BASE}/api/eval/glm-ocr/runs?limit=50`)
        .then(r => r.runs),
  });

  const versionsQuery = useQuery({
    queryKey: keys.eval.testSets(),
    queryFn: () =>
      apiClient
        .get<TestSetsResponse>(`${BEAVER_BASE}/api/eval/glm-ocr/test-sets`)
        .then(r => r.versions),
  });

  const runs = runsQuery.data ?? NO_RUNS;
  const loading = runsQuery.isPending;
  const error =
    actionError ??
    (runsQuery.error instanceof Error ? runsQuery.error.message : null);

  const versions = versionsQuery.data ?? NO_VERSIONS;

  // Default to "v1" unless the server doesn't offer it; the operator's own
  // pick (if any) always wins, so a refetch can't move the dropdown under them.
  const [versionOverride, setSelectedVersion] = useState<string | null>(null);
  const selectedVersion =
    versionOverride ??
    (versions.length > 0 && !versions.includes("v1") ? versions[0] : "v1");

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: keys.eval.runs() });

  async function startRun() {
    setStarting(true);
    try {
      const created = await apiClient.post<EvalRun>(
        `${BEAVER_BASE}/api/eval/glm-ocr/runs`,
        { test_set_version: selectedVersion },
      );
      router.push(`/eval/glm-ocr/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start eval");
      setStarting(false);
    }
  }

  async function startCustomRun() {
    const prompt = customPrompt.trim();
    if (!prompt) {
      setError("Prompt can't be empty");
      return;
    }
    const n = Math.max(1, Math.min(MAX_STUDENTS, Math.floor(numStudents) || MAX_STUDENTS));
    setStarting(true);
    setError(null);
    try {
      const created = await apiClient.post<EvalRun>(
        `${BEAVER_BASE}/api/eval/glm-ocr/runs`,
        { test_set_version: selectedVersion, ocr_config: { prompt }, max_students: n },
      );
      router.push(`/eval/glm-ocr/${created.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start eval");
      setStarting(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium transition mb-4"
        >
          <ArrowLeft size={15} /> Back
        </button>

        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-gray-900">GLM-OCR Eval</h1>
            <p className="text-xs text-gray-500 mt-1">
              Score the model against a versioned test set. Each run writes per-crop CER/WER
              and the aggregate is computed once at finalize.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedVersion}
              onChange={(e) => setSelectedVersion(e.target.value)}
              className="h-9 px-3 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-indigo-400"
            >
              {(versions.length ? versions : ["v1"]).map((v) => (
                <option key={v} value={v}>{v}</option>
              ))}
            </select>
            <button
              onClick={startRun}
              disabled={starting}
              className="flex items-center gap-1.5 h-9 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-300 text-white text-sm font-semibold rounded-lg transition"
            >
              {starting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
              Run new eval
            </button>
            <button
              onClick={() => { setCustomOpen((v) => !v); setError(null); }}
              className={`flex items-center gap-1.5 h-9 px-4 text-sm font-semibold rounded-lg transition border ${
                customOpen
                  ? "bg-violet-600 text-white border-violet-600"
                  : "bg-white text-violet-700 border-violet-300 hover:bg-violet-50"
              }`}
            >
              <Sparkles size={14} /> Run new eval with custom prompt
            </button>
            <button
              onClick={refresh}
              title="Refresh"
              className="flex items-center justify-center h-9 w-9 border border-gray-200 hover:border-indigo-300 bg-white rounded-lg transition"
            >
              <RefreshCcw size={14} className="text-gray-500" />
            </button>
          </div>
        </div>

        {customOpen && (
          <div className="bg-white border border-violet-200 rounded-xl p-5 mb-6 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="flex items-center gap-1.5 text-sm font-bold text-violet-700">
                <Sparkles size={15} /> Custom-prompt eval run
              </h2>
              <button
                onClick={() => setCustomOpen(false)}
                className="text-gray-400 hover:text-gray-700"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>

            <label className="block text-xs font-semibold text-gray-600 mb-1">OCR prompt</label>
            <textarea
              value={customPrompt}
              onChange={(e) => setCustomPrompt(e.target.value)}
              rows={5}
              spellCheck={false}
              className="w-full text-sm font-mono text-gray-800 border border-gray-200 rounded-lg p-3 focus:outline-none focus:border-violet-400 resize-y"
              placeholder="Prompt sent to GLM-OCR for every crop…"
            />

            <div className="flex items-end justify-between gap-4 mt-3 flex-wrap">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">
                  Students to test
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    min={1}
                    max={MAX_STUDENTS}
                    value={numStudents}
                    onChange={(e) => setNumStudents(Number(e.target.value))}
                    className="h-9 w-24 px-3 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:border-violet-400"
                  />
                  <span className="text-xs text-gray-400">
                    max {MAX_STUDENTS} · uses all available if fewer
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setCustomPrompt(DEFAULT_OCR_PROMPT); setNumStudents(MAX_STUDENTS); }}
                  className="h-9 px-3 text-sm font-medium text-gray-500 hover:text-gray-800 border border-gray-200 rounded-lg transition"
                >
                  Reset
                </button>
                <button
                  onClick={startCustomRun}
                  disabled={starting || !customPrompt.trim()}
                  className="flex items-center gap-1.5 h-9 px-4 bg-violet-600 hover:bg-violet-700 disabled:bg-violet-300 text-white text-sm font-semibold rounded-lg transition"
                >
                  {starting ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} />}
                  Run with this prompt
                </button>
              </div>
            </div>
          </div>
        )}

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-indigo-500" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3 mb-4">
            {error}
          </div>
        )}

        {!loading && runs.length === 0 && !error && (
          <div className="text-center py-20">
            <p className="text-gray-400 text-sm font-medium">No eval runs yet</p>
            <p className="text-gray-400 text-xs mt-1">Hit “Run new eval” above to start.</p>
          </div>
        )}

        {!loading && runs.length > 0 && (
          <div className="space-y-2">
            {runs.map((run) => {
              const overall = (run.aggregate as Aggregate | null)?.overall_accuracy_pct;
              const mcq     = (run.aggregate as Aggregate | null)?.mcq_accuracy_pct;
              const cerMed  = (run.aggregate as Aggregate | null)?.desc_cer_median;
              return (
                <div
                  key={run.id}
                  onClick={() => router.push(`/eval/glm-ocr/${run.id}`)}
                  className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center gap-4 hover:border-indigo-300 hover:shadow-sm transition cursor-pointer"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-sm font-semibold text-gray-900">Run #{run.id}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[run.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {run.status}
                      </span>
                      {run.pinned_as_baseline && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 text-purple-700">
                          baseline
                        </span>
                      )}
                      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700">
                        {run.test_set_version}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-400">
                      <span>{new Date(run.started_at).toLocaleString()}</span>
                      {run.created_by && (
                        <>
                          <span>·</span>
                          <span className="font-medium text-gray-500">{run.created_by}</span>
                        </>
                      )}
                      {run.error_message && (
                        <>
                          <span>·</span>
                          <span className="text-red-500 truncate">{run.error_message}</span>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-6 shrink-0">
                    <Metric label="overall" value={fmtPct(overall)} />
                    <Metric label="mcq"     value={fmtPct(mcq)} />
                    <Metric
                      label="cer p50"
                      value={typeof cerMed === "number" ? cerMed.toFixed(3) : "—"}
                    />
                  </div>

                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2" className="shrink-0">
                    <path d="M9 18l6-6-6-6"/>
                  </svg>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-lg font-bold text-gray-900">{value}</p>
      <p className="text-[10px] text-gray-400 font-medium">{label}</p>
    </div>
  );
}
