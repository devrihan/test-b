"use client";

import { useState, useCallback } from "react";
import { useQueries, useQueryClient } from "@tanstack/react-query";
import { keys } from "@/app/lib/queryKeys";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Loader2, Plus, ChevronDown, ChevronUp } from "lucide-react";
import { useBatchList } from "@/app/hooks/useBatchList";
import { getBatchStudents, BatchStudent } from "@/app/(dashboard)/pdfExtract/lib/beaverApi";
import { SetBadge, ConfigChips } from "./components/BatchConfig";

const STATUS_COLORS: Record<string, string> = {
  created:       "bg-gray-100 text-gray-600",
  preprocessing: "bg-blue-50 text-blue-600",
  preprocessed:  "bg-indigo-50 text-indigo-600",
  completed:     "bg-green-50 text-green-700",
  failed:        "bg-red-50 text-red-600",
};

const STATUS_BADGE_COLORS: Record<string, string> = {
  pending:             "bg-gray-200 text-gray-700",
  uploaded:            "bg-slate-200 text-slate-700",
  preprocessing:       "bg-blue-200 text-blue-700",
  preprocessed:        "bg-blue-300 text-blue-800",
  bbox_detecting:      "bg-violet-200 text-violet-700",
  bbox_detected:       "bg-yellow-200 text-yellow-700",
  processing:          "bg-amber-200 text-amber-700",
  ocr_running:         "bg-orange-200 text-orange-700",
  extracting_grid:     "bg-teal-200 text-teal-700",
  identifying_or:      "bg-cyan-200 text-cyan-700",
  extracting_answers:  "bg-emerald-200 text-emerald-700",
  completed:           "bg-green-200 text-green-700",
  ocr_completed:       "bg-indigo-200 text-indigo-700",
  failed:              "bg-red-200 text-red-700",
};

const STATUS_ROW_COLORS: Record<string, string> = {
  pending:             "bg-gray-50",
  uploaded:            "bg-slate-50",
  preprocessing:       "bg-blue-50",
  preprocessed:        "bg-blue-50",
  bbox_detecting:      "bg-violet-50",
  bbox_detected:       "bg-yellow-50",
  processing:          "bg-amber-50",
  ocr_running:         "bg-orange-50",
  extracting_grid:     "bg-teal-50",
  identifying_or:      "bg-cyan-50",
  extracting_answers:  "bg-emerald-50",
  completed:           "bg-green-50",
  ocr_completed:       "bg-indigo-50",
  failed:              "bg-red-50",
};

const STATUS_LABELS: Record<string, string> = {
  pending:             "Pending",
  uploaded:            "Uploaded",
  preprocessing:       "Preprocessing",
  preprocessed:        "Preprocessed",
  bbox_detecting:      "Bbox Detecting",
  bbox_detected:       "Bbox Detected",
  processing:          "Post Processing",
  ocr_running:         "OCR Running",
  ocr_completed:       "OCR Completed",
  extracting_grid:     "Extracting Grid",
  identifying_or:      "Identifying OR",
  extracting_answers:  "Extracting Answers",
  completed:           "Completed",
  failed:              "Failed",
};

export default function BatchesPage() {
  const router = useRouter();
  const { filtered, loading, error, refresh } = useBatchList();

  const queryClient = useQueryClient();
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // One query per expanded batch. Collapsing stops watching it; the data stays
  // cached for gcTime so re-expanding is instant. The old hand-rolled
  // studentsCache / loadingIds / refetch-on-refresh effect is all replaced by
  // this — Refresh below invalidates the whole per-batch prefix.
  const expandedList = Array.from(expandedIds);
  const studentQueries = useQueries({
    queries: expandedList.map(id => ({
      queryKey: keys.batch.students(id),
      queryFn: () => getBatchStudents(id).then(r => r.students ?? []),
    })),
  });

  const studentsCache: Record<string, BatchStudent[]> = {};
  const loadingIds = new Set<string>();
  expandedList.forEach((id, i) => {
    const q = studentQueries[i];
    studentsCache[id] = q?.data ?? [];
    if (q?.isPending) loadingIds.add(id);
  });

  const toggleExpand = useCallback((batchId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  }, []);

  // Refresh reloads the batch cards AND any expanded batch's students.
  const refreshAll = useCallback(() => {
    refresh();
    void queryClient.invalidateQueries({ queryKey: keys.batch.byId() });
  }, [refresh, queryClient]);

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Left side - Beaver image */}
      <div className="hidden lg:flex w-64 shrink-0 items-center justify-center bg-gradient-to-b from-indigo-50 to-white border-r border-gray-100">
        <img src="/beaver.jpg" alt="Beaver" className="w-48 h-48 object-cover rounded-2xl shadow-lg" />
      </div>

      {/* Right side - Content */}
      <div className="flex-1 px-6 py-6">
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium transition mb-4"
        >
          <ArrowLeft size={15} /> Back
        </button>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-indigo-500" />
          </div>
        )}

        {error && (
          <div className="text-center py-20">
            <p className="text-red-500 text-sm font-medium">{error}</p>
            <button onClick={refreshAll} className="mt-3 text-indigo-600 text-sm underline">Try again</button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-400 text-sm font-medium">No batches found</p>
            <button
              onClick={() => router.push("/batches/new")}
              className="mt-4 flex items-center gap-1.5 h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition mx-auto"
            >
              <Plus size={14} /> Create your first batch
            </button>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map(batch => {
              const isExpanded       = expandedIds.has(batch.batch_id);
              const isLoadingStudents = loadingIds.has(batch.batch_id);
              const students         = studentsCache[batch.batch_id] ?? [];

              return (
                <div
                  key={batch.batch_id}
                  className="bg-white border border-gray-200 rounded-xl overflow-hidden hover:border-indigo-200 transition"
                >
                  {/* ── Batch header row ── */}
                  <div className="px-5 py-4 flex items-center gap-4">

                    {/* Left: name + metadata — clicking toggles student list */}
                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => toggleExpand(batch.batch_id)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-semibold text-gray-900 truncate">{batch.batch_name}</span>
                        <SetBadge setName={batch.set_name} />
                        <span className={`shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full ${STATUS_COLORS[batch.status] ?? "bg-gray-100 text-gray-600"}`}>
                          {batch.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs text-gray-400 mb-1.5">
                        <span className="font-mono text-[10px]">{batch.batch_id}</span>
                        <span>·</span>
                        {batch.school_name && <><span className="font-medium text-gray-500">{batch.school_name}</span><span>·</span></>}
                        <span>{batch.grade}</span>
                        <span>·</span>
                        <span>{batch.subject}</span>
                        <span>·</span>
                        <span>{batch.section}</span>
                        <span>·</span>
                        <span>{batch.exam_type}</span>
                        {batch.set_name && (
                          <>
                            <span>·</span>
                            <span className="font-semibold text-indigo-500">Set {batch.set_name}</span>
                          </>
                        )}
                      </div>
                      <ConfigChips batch={batch} dense />
                    </div>

                    {/* Right: counters + date — clicking also toggles */}
                    <div
                      className="flex items-center gap-6 shrink-0 cursor-pointer"
                      onClick={() => toggleExpand(batch.batch_id)}
                    >
                      <div className="text-center">
                        <p className="text-lg font-bold text-gray-900">{batch.total_students}</p>
                        <p className="text-[10px] text-gray-400 font-medium">students</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-gray-900">{batch.total_questions}</p>
                        <p className="text-[10px] text-gray-400 font-medium">questions</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-gray-400">{new Date(batch.created_at).toLocaleDateString()}</p>
                        <p className="text-[10px] text-gray-300">created</p>
                      </div>
                    </div>

                    {/* Chevron — navigates to batch detail page */}
                    <button
                      onClick={(e) => { e.stopPropagation(); router.push(`/batches/${batch.batch_id}`); }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition shrink-0"
                      title="Open batch detail"
                    >
                      <ArrowRight size={16} />
                    </button>
                  </div>

                  {/* ── Collapsible student list ── */}
                  {isExpanded && (
                    <div className="border-t border-gray-100 px-5 py-3">
                      {isLoadingStudents ? (
                        <div className="flex items-center justify-center py-4">
                          <Loader2 size={16} className="animate-spin text-indigo-400" />
                        </div>
                      ) : students.length === 0 ? (
                        <p className="text-xs text-gray-400 text-center py-4">No students in this batch yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {students.map(s => (
                            <div
                              key={s.student_id}
                              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${STATUS_ROW_COLORS[s.status] ?? "bg-gray-50"} ${s.status === "failed" ? "border-red-200" : s.status === "completed" ? "border-green-200" : "border-transparent"}`}
                            >
                              <div className="flex-1 min-w-0">
                                <p className={`text-sm font-semibold ${s.validation_status === "invalid" ? "text-red-600" : "text-gray-800"}`}>
                                  {s.student_name}
                                  {s.roll_number && (
                                    <span className="ml-1.5 text-xs font-normal text-gray-400">({s.roll_number})</span>
                                  )}
                                </p>
                                <p className="text-xs text-gray-500">
                                  {s.exam_marks != null
                                    ? <span className="font-medium text-gray-700">{batch?.subject ?? "Marks"}: {s.exam_marks} · </span>
                                    : <span className="text-gray-400">Marks: — · </span>}
                                  {s.total_pages} pages · {s.verified_questions_count}/{s.total_questions} verified
                                </p>
                                {s.validation_status === "invalid" && (s.validation_reasons?.length ?? 0) > 0 && (
                                  <p className="text-[11px] text-red-500 mt-0.5">{s.validation_reasons!.join(" · ")}</p>
                                )}
                              </div>

                              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE_COLORS[s.status] ?? "bg-gray-200 text-gray-700"}`}>
                                {STATUS_LABELS[s.status] ?? s.status}
                              </span>

                              {s.status === "bbox_detected" && (
                                <button
                                  onClick={() => {
                                    const params = new URLSearchParams({
                                      batchId:   batch.batch_id,
                                      studentId: s.student_id,
                                      ...(batch.school_name && { school: batch.school_name }),
                                      ...(batch.grade       && { grade:  batch.grade }),
                                      ...(batch.section     && { section: batch.section }),
                                      ...(batch.subject     && { subject: batch.subject }),
                                      ...(batch.exam_type   && { exam:   batch.exam_type }),
                                    });
                                    router.push(`/pdfExtract?${params.toString()}`);
                                  }}
                                  className="h-7 px-3 text-xs font-semibold rounded-lg transition shrink-0 bg-indigo-50 hover:bg-indigo-100 text-indigo-600"
                                >
                                  Mark →
                                </button>
                              )}

                              {(s.status === "ocr_completed" || s.status === "completed") && (
                                <button
                                  onClick={() => {
                                    const params = new URLSearchParams({
                                      batchId:   batch.batch_id,
                                      studentId: s.student_id,
                                      ...(batch.school_name && { school: batch.school_name }),
                                      ...(batch.grade       && { grade:  batch.grade }),
                                      ...(batch.section     && { section: batch.section }),
                                      ...(batch.subject     && { subject: batch.subject }),
                                      ...(batch.exam_type   && { exam:   batch.exam_type }),
                                    });
                                    router.push(`/answerEditing?${params.toString()}`);
                                  }}
                                  className="h-7 px-3 text-xs font-semibold rounded-lg transition shrink-0 bg-green-50 hover:bg-green-100 text-green-600"
                                >
                                  Edit Answers →
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
