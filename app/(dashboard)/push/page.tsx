"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "@/app/lib/queryKeys";
import { getBatches, type Batch } from "@/app/(dashboard)/pdfExtract/lib/beaverApi";
import { useRouter } from "next/navigation";
import PushToLoam from "./components/PushToLoam";
import { ArrowLeft, Loader2, CheckCircle, AlertCircle, Upload, ChevronDown } from "lucide-react";
import { getAuthToken as getToken } from "@/app/lib/auth";

const BASE = process.env.NEXT_PUBLIC_BEAVER_API_URL ?? "http://localhost:4000";
const AGG_BASE = process.env.NEXT_PUBLIC_AGGREGATED_DATA_URL ?? "http://localhost:8082";


const NO_BATCHES: Batch[] = [];

export default function PushToRegistryPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [actionError, setError] = useState<string | null>(null);
  const [pushingBatchId, setPushingBatchId] = useState<string | null>(null);
  const [pushResult, setPushResult] = useState<any | null>(null);
  const [pushResultBatchId, setPushResultBatchId] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any | null>(null);

  // Shares the dashboard-wide batch list cache (keys.batch.all()).
  const batchesQuery = useQuery({
    queryKey: keys.batch.all(),
    queryFn: () => getBatches().then(res => res.batches ?? []),
  });

  const batches = batchesQuery.data ?? NO_BATCHES;
  const loading = batchesQuery.isPending;
  const error =
    actionError ??
    (batchesQuery.error instanceof Error
      ? batchesQuery.error.message
      : null);

  // Push a batch
  const handlePush = async (batchId: string) => {
    try {
      setPushingBatchId(batchId);
      setPushResult(null);
      setPushResultBatchId(null);
      setError(null);

      const token = getToken();
      const res = await fetch(`${BASE}/api/batches/${batchId}/push`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Push failed: ${res.status}`);
      }

      const data = await res.json();
      setPushResult(data.pushResult);
      setPushResultBatchId(batchId);

      // Reflect the new status in the shared batch cache immediately.
      queryClient.setQueryData<Batch[]>(keys.batch.all(), prev =>
        prev?.map(b => (b.batch_id === batchId ? { ...b, status: "pushed" } : b))
      );

    } catch (err) {
      setError(err instanceof Error ? err.message : "Push failed");
    } finally {
      setPushingBatchId(null);
    }
  };

  const handleSync = async () => {
    try {
      setSyncing(true);
      setSyncResult(null);
      setError(null);

      const token = getToken();
      const res = await fetch(`${AGG_BASE}/api/admin/sync`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Sync failed: ${res.status}`);
      }

      const data = await res.json();
      setSyncResult(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="max-w-[1600px] mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium transition"
          >
            <ArrowLeft size={15} /> Back
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <h1 className="text-lg font-bold text-gray-900">Push to LOAM</h1>
          <span className="text-xs text-gray-400 ml-2">loam_ops → loam_db</span>
        </div>

        {/* Push exams to LOAM (async) */}
        <PushToLoam />

           {/* Sync to Production */}
        <div className="mb-6 bg-white border border-gray-200 rounded-2xl p-5 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-gray-900">Sync to Production</h2>
            <p className="text-xs text-gray-400 mt-0.5">Push verified data from loam_db (ops) → loam_db (prod)</p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition"
          >
            {syncing ? (
              <><Loader2 size={12} className="animate-spin" /> Syncing...</>
            ) : (
              <><Upload size={12} /> Sync to Production</>
            )}
          </button>
        </div>

        {/* Sync Result */}
        {syncResult && (
          <div className="mb-6 bg-white border border-emerald-200 rounded-2xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-bold text-gray-900">
                Sync {syncResult.status === "completed" ? "Complete ✓" : "Partial ⚠"}
              </h3>
              <button onClick={() => setSyncResult(null)} className="text-gray-400 hover:text-gray-600 text-xs">✕</button>
            </div>
            <div className="flex gap-4 text-xs mb-3">
              <span className="text-gray-600">Duration: <strong>{syncResult.duration}</strong></span>
              <span className="text-green-600">Rows synced: <strong>{syncResult.totalRowsSynced}</strong></span>
              <span className="text-gray-600">Tables: <strong>{syncResult.tablesCompleted}/{syncResult.tablesCompleted + (syncResult.tablesFailed || 0)}</strong></span>
            </div>
            <details className="text-xs">
              <summary className="cursor-pointer text-indigo-600 font-medium">View table details</summary>
              <div className="mt-2 max-h-60 overflow-y-auto">
                {syncResult.tables?.map((t: any, i: number) => (
                  <div key={i} className="flex justify-between py-1 border-b border-gray-50">
                    <span className="text-gray-700">{t.tableName}</span>
                    <span className={t.status === "completed" ? "text-green-600" : t.status === "failed" ? "text-red-600" : "text-gray-400"}>
                      {t.rowsSynced > 0 ? `${t.rowsSynced} rows` : t.status}
                    </span>
                  </div>
                ))}
              </div>
            </details>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg mb-4">
            <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
            <p className="text-xs text-red-600 font-medium">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600 text-xs">✕</button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-indigo-500" />
            <span className="ml-3 text-sm text-gray-500">Loading batches...</span>
          </div>
        )}

        {/* Batches Table */}
        {!loading && batches.length > 0 && (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-4 py-3 font-semibold text-gray-600">Batch</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">School</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Grade</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Section</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Exam</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Students</th>
                  <th className="px-4 py-3 font-semibold text-gray-600">Status</th>
                  <th className="px-4 py-3 font-semibold text-gray-600 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {batches.map((batch: any) => (
                  <tr key={batch.batch_id} className="border-t border-gray-100 hover:bg-gray-50/50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-gray-900">{batch.batch_name || batch.batch_id}</div>
                      <div className="text-xs text-gray-400 font-mono">{batch.batch_id}</div>
                    </td>
                    <td className="px-4 py-3 text-gray-600">{batch.school_name || `School ${batch.school_id}`}</td>
                    <td className="px-4 py-3 text-gray-600">{batch.grade}</td>
                    <td className="px-4 py-3 text-gray-600">{batch.section}</td>
                    <td className="px-4 py-3 text-gray-600">{batch.exam_type || batch.subject}</td>
                    <td className="px-4 py-3 text-gray-600">{batch.total_students ?? 0}</td>
                    <td className="px-4 py-3">
                      {batch.status === "pushed" ? (
                        <span className="inline-flex items-center gap-1 text-green-600 text-xs font-semibold">
                          <CheckCircle size={12} /> Pushed
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-600 text-xs font-semibold">
                          {batch.status}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {batch.status === "pushed" ? (
                        <button
                          onClick={() => {
                            if (pushResultBatchId === batch.batch_id) {
                              setPushResult(null);
                              setPushResultBatchId(null);
                            }
                          }}
                          className="text-xs text-gray-400"
                        >
                          —
                        </button>
                      ) : (
                        <button
                          onClick={() => handlePush(batch.batch_id)}
                          disabled={pushingBatchId !== null}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-lg transition"
                        >
                          {pushingBatchId === batch.batch_id ? (
                            <><Loader2 size={12} className="animate-spin" /> Pushing...</>
                          ) : (
                            <><Upload size={12} /> Push</>
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && batches.length === 0 && (
          <div className="text-center py-20">
            <p className="text-sm text-gray-500">No batches found</p>
          </div>
        )}

        {/* Push Result Panel */}
        {pushResult && pushResultBatchId && (
          <div className="mt-6 bg-white border border-gray-200 rounded-2xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-bold text-gray-900">
                Push Result — {pushResultBatchId}
              </h2>
              <button
                onClick={() => { setPushResult(null); setPushResultBatchId(null); }}
                className="text-gray-400 hover:text-gray-600 text-sm"
              >
                ✕ Close
              </button>
            </div>

            {/* Summary */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div className="text-center p-3 bg-gray-50 rounded-xl">
                <div className="text-2xl font-bold text-gray-900">{pushResult.totalStudents}</div>
                <div className="text-xs text-gray-500 mt-1">Total Students</div>
              </div>
              <div className="text-center p-3 bg-green-50 rounded-xl">
                <div className="text-2xl font-bold text-green-600">{pushResult.successCount}</div>
                <div className="text-xs text-green-600 mt-1">Success</div>
              </div>
              <div className="text-center p-3 bg-red-50 rounded-xl">
                <div className="text-2xl font-bold text-red-600">{pushResult.failedCount}</div>
                <div className="text-xs text-red-600 mt-1">Failed</div>
              </div>
            </div>

            {/* Success List */}
            {pushResult.results?.length > 0 && (
              <div className="mb-4">
                <h3 className="text-xs font-semibold text-gray-600 mb-2">Pushed Students</h3>
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 text-left">
                        <th className="px-3 py-2 font-semibold text-gray-600">Student ID</th>
                        <th className="px-3 py-2 font-semibold text-gray-600">Admission No</th>
                        <th className="px-3 py-2 font-semibold text-gray-600">Answer Paper</th>
                        <th className="px-3 py-2 font-semibold text-gray-600">Answers</th>
                        <th className="px-3 py-2 font-semibold text-gray-600">Total Marks</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pushResult.results.map((r: any, i: number) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="px-3 py-2 text-gray-900">{r.studentId}</td>
                          <td className="px-3 py-2 text-gray-500 font-mono">{r.admissionNo}</td>
                          <td className="px-3 py-2 text-gray-500">{r.answerPaperId}</td>
                          <td className="px-3 py-2 text-gray-500">{r.answersCreated}</td>
                          <td className="px-3 py-2 text-gray-900 font-medium">{r.totalMarks ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

         

            {/* Errors */}
            {pushResult.errors?.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold text-red-600 mb-2">Failed</h3>
                <div className="border border-red-200 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-red-50 text-left">
                        <th className="px-3 py-2 font-semibold text-red-600">Admission No</th>
                        <th className="px-3 py-2 font-semibold text-red-600">Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pushResult.errors.map((e: any, i: number) => (
                        <tr key={i} className="border-t border-red-100">
                          <td className="px-3 py-2 text-gray-900 font-mono">{e.admissionNo}</td>
                          <td className="px-3 py-2 text-red-600">{e.reason}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}