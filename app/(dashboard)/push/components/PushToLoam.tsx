"use client";

// Push to LOAM: select a subset of exams, start an async migration job on
// beaver-api (loam_ops -> loam_db dashboard tables), and check back later —
// jobs keep running server-side after you leave this page.

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "@/app/lib/queryKeys";
import { Loader2, CheckCircle, AlertCircle, Send, RefreshCw } from "lucide-react";
import { getAuthToken as getToken } from "@/app/lib/auth";

const BASE = process.env.NEXT_PUBLIC_BEAVER_API_URL ?? "http://localhost:4000";


async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getToken()}`,
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as any)?.error ?? `${res.status} ${res.statusText}`);
  return body as T;
}

interface PushableExam {
  exam_id: number;
  exam: string | null;
  batches: number;
  students: number;
  bboxes: number;
  marked: number;
  ocr: number;
  pushed_crops: number;
}

interface PushJob {
  job_id: string;
  status: string;
  progress: number;
  total_files: number;
  processed_files: number;
  current_step: string | null;
  current_file: string | null;
  message: string | null; // JSON: per-exam results
  error_message: string | null;
  created_by: string | null;
  created_at: string;
  completed_at: string | null;
}

const JOB_BADGE: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700",
  running: "bg-blue-50 text-blue-700",
  completed: "bg-green-50 text-green-700",
  failed: "bg-red-50 text-red-700",
};

const ACTIVE = new Set(["pending", "running"]);

const NO_EXAMS: PushableExam[] = [];
const NO_JOBS: PushJob[] = [];

export default function PushToLoam() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  const examsQuery = useQuery({
    queryKey: keys.push.exams(),
    queryFn: () =>
      api<{ exams: PushableExam[] }>("/api/loam-migration/exams").then(d => d.exams),
  });

  // Poll while any job is active; stop once everything is terminal.
  const jobsQuery = useQuery({
    queryKey: keys.push.jobs(),
    queryFn: () =>
      api<{ jobs: PushJob[] }>("/api/loam-migration/jobs").then(d => d.jobs),
    refetchInterval: query =>
      (query.state.data ?? []).some(j => ACTIVE.has(j.status)) ? 4000 : false,
    refetchIntervalInBackground: false,
  });

  const exams = examsQuery.data ?? NO_EXAMS;
  const jobs = jobsQuery.data ?? NO_JOBS;
  const loading = examsQuery.isPending || jobsQuery.isPending;
  const error =
    startError ??
    (examsQuery.error instanceof Error ? examsQuery.error.message : null) ??
    (jobsQuery.error instanceof Error ? jobsQuery.error.message : null);

  const loadJobs = useCallback(
    () => queryClient.invalidateQueries({ queryKey: keys.push.jobs() }),
    [queryClient]
  );

  const loadAll = useCallback(
    () => queryClient.invalidateQueries({ queryKey: keys.push.all() }),
    [queryClient]
  );

  // Pushed-counts change once a run lands, so refresh exams on the
  // active → terminal transition (what the old poll did on its last tick).
  const anyActive = jobs.some(j => ACTIVE.has(j.status));
  const wasActive = useRef(false);
  useEffect(() => {
    if (wasActive.current && !anyActive) {
      void queryClient.invalidateQueries({ queryKey: keys.push.exams() });
    }
    wasActive.current = anyActive;
  }, [anyActive, queryClient]);

  const toggle = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const start = async () => {
    setStarting(true);
    setStartError(null);
    try {
      await api<{ job_id: string }>("/api/loam-migration", {
        method: "POST",
        body: JSON.stringify({ exam_ids: Array.from(selected) }),
      });
      setSelected(new Set());
      await loadJobs();
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "Failed to start job");
    } finally {
      setStarting(false);
    }
  };

  const hasActive = jobs.some(j => ACTIVE.has(j.status));

  return (
    <div className="mb-6 bg-white border border-gray-200 rounded-2xl p-5">
      <div className="flex items-center justify-between mb-1">
        <div>
          <h2 className="text-sm font-bold text-gray-900">Push exams to LOAM</h2>
          <p className="text-xs text-gray-400 mt-0.5">
            Copies the selected exams&apos; scans, marks and OCR into the LOAM dashboard tables
            (loam_ops → loam_db). Runs in the background — you can leave and check back later.
          </p>
        </div>
        <button
          onClick={loadAll}
          className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 font-medium transition"
        >
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      {error && (
        <div className="mt-3 flex items-center gap-2 text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-400 py-6 justify-center">
          <Loader2 size={16} className="animate-spin" /> Loading exams…
        </div>
      ) : (
        <>
          <div className="mt-3 border border-gray-100 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-gray-500">
                  <th className="p-2 w-8" />
                  <th className="p-2 text-left font-semibold">Exam</th>
                  <th className="p-2 text-right font-semibold">Batches</th>
                  <th className="p-2 text-right font-semibold">Students</th>
                  <th className="p-2 text-right font-semibold">Answers</th>
                  <th className="p-2 text-right font-semibold">Marked</th>
                  <th className="p-2 text-right font-semibold">OCR</th>
                  <th className="p-2 text-right font-semibold">In LOAM now</th>
                </tr>
              </thead>
              <tbody>
                {exams.filter(e => e.exam !== null).map(e => (
                  <tr
                    key={e.exam_id}
                    onClick={() => toggle(e.exam_id)}
                    className={`border-t border-gray-100 cursor-pointer transition ${
                      selected.has(e.exam_id) ? "bg-indigo-50/60" : "hover:bg-gray-50"
                    }`}
                  >
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        readOnly
                        checked={selected.has(e.exam_id)}
                        className="accent-indigo-600"
                      />
                    </td>
                    <td className="p-2 font-medium text-gray-800">{e.exam}</td>
                    <td className="p-2 text-right text-gray-600">{e.batches}</td>
                    <td className="p-2 text-right text-gray-600">{e.students}</td>
                    <td className="p-2 text-right text-gray-600">{e.bboxes.toLocaleString()}</td>
                    <td className="p-2 text-right text-gray-600">{e.marked.toLocaleString()}</td>
                    <td className="p-2 text-right text-gray-600">{e.ocr.toLocaleString()}</td>
                    <td className="p-2 text-right text-gray-600">
                      {e.pushed_crops > 0 ? e.pushed_crops.toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-gray-400">
              {selected.size > 0 ? `${selected.size} exam${selected.size === 1 ? "" : "s"} selected` : "Select exams to push"}
            </span>
            <button
              onClick={start}
              disabled={selected.size === 0 || starting || hasActive}
              className="flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {starting ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
              {hasActive ? "A push is already running" : "Start push"}
            </button>
          </div>
        </>
      )}

      {jobs.length > 0 && (
        <div className="mt-4">
          <h3 className="text-xs font-bold text-gray-700 mb-2">Recent pushes</h3>
          <div className="space-y-2">
            {jobs.slice(0, 5).map(job => {
              let results: { exam: string; crops: number; pages: number; students: number }[] = [];
              try { results = JSON.parse(job.message ?? "[]"); } catch { /* older rows */ }
              return (
                <div key={job.job_id} className="border border-gray-100 rounded-xl px-3 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${JOB_BADGE[job.status] ?? "bg-gray-100 text-gray-600"}`}>
                      {job.status.toUpperCase()}
                    </span>
                    {ACTIVE.has(job.status) && (
                      <span className="flex items-center gap-1 text-[11px] text-gray-500">
                        <Loader2 size={11} className="animate-spin" />
                        {job.processed_files}/{job.total_files} exams
                        {job.current_file ? ` — ${job.current_file}` : ""}
                      </span>
                    )}
                    {job.status === "completed" && (
                      <span className="flex items-center gap-1 text-[11px] text-green-700">
                        <CheckCircle size={11} /> {results.length} exam{results.length === 1 ? "" : "s"} pushed
                      </span>
                    )}
                    {job.status === "failed" && (
                      <span className="flex items-center gap-1 text-[11px] text-red-600">
                        <AlertCircle size={11} /> {job.error_message ?? "failed"}
                      </span>
                    )}
                    <span className="ml-auto text-[10px] text-gray-400">
                      {new Date(job.created_at).toLocaleString()}
                      {job.created_by ? ` · ${job.created_by}` : ""}
                    </span>
                  </div>
                  {results.length > 0 && (
                    <div className="mt-1.5 text-[11px] text-gray-500 space-x-3">
                      {results.map(r => (
                        <span key={r.exam}>
                          {r.exam}: {r.crops.toLocaleString()} answers, {r.students} students
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
