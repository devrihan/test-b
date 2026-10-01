"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "@/app/lib/queryKeys";
import {
  Loader2, RefreshCw, CheckCircle, AlertTriangle,
  XCircle, Send, Eye, EyeOff,
} from "lucide-react";
import { getAnswerKeyRows, publishAnswerKey } from "../lib/answerKeyApi";
import type { AnswerKeyRow, AKStatus } from "../types";
import AKRowEditor from "./AKRowEditor";

// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  questionPaperId: number;
  onBack:          () => void;
};

const STATUS_STYLE: Record<AKStatus, string> = {
  DRAFT:       "bg-emerald-50 text-emerald-700 border-emerald-200",
  MISSING:     "bg-red-50 text-red-600 border-red-200",
  UNMAPPED:    "bg-gray-50 text-gray-600 border-gray-200",
  MARKS_ISSUE: "bg-amber-50 text-amber-700 border-amber-200",
  READY:       "bg-blue-50 text-blue-700 border-blue-200",
};

const STATUS_ICON: Record<AKStatus, React.ReactNode> = {
  DRAFT:        <CheckCircle   size={11} />,
  MISSING:      <XCircle       size={11} />,
  UNMAPPED:     <XCircle       size={11} />,
  MARKS_ISSUE:  <AlertTriangle size={11} />,
  READY:        <CheckCircle   size={11} />,
};

const NO_ROWS: AnswerKeyRow[] = [];

export default function AKReviewTable({ questionPaperId, onBack }: Props) {
  const queryClient = useQueryClient();
  // null = nothing picked yet, so the first row shows by default — replaces the
  // old initialSelectDone ref + setSelectedId inside the fetch.
  const [selectedIdOverride, setSelectedId] = useState<number | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishError, setPublishError]     = useState<string | null>(null);
  const [publishSuccess, setPublishSuccess] = useState(false);

  // ── Global LaTeX toggle ────────────────────────────────────────────────────
  const [latexPreview, setLatexPreview] = useState(false);
  const [akPdfUrl, setAkPdfUrl] = useState<string | null>(null);

  // ── Fetch rows ─────────────────────────────────────────────────────────────
  const rowsQuery = useQuery({
    queryKey: keys.answerKey.rows(questionPaperId),
    queryFn: () => getAnswerKeyRows(questionPaperId),
  });

  const rows = rowsQuery.data ?? NO_ROWS;
  const loading = rowsQuery.isPending;
  const error =
    rowsQuery.error instanceof Error ? rowsQuery.error.message : null;
  const selectedId = selectedIdOverride ?? rows[0]?.id ?? null;

  const fetchRows = useCallback(
    () => queryClient.invalidateQueries({ queryKey: keys.answerKey.rows(questionPaperId) }),
    [queryClient, questionPaperId]
  );

  // Local row edits write into the cache, keeping existing call sites intact.
  const setRows = useCallback(
    (updater: (prev: AnswerKeyRow[]) => AnswerKeyRow[]) =>
      queryClient.setQueryData<AnswerKeyRow[]>(
        keys.answerKey.rows(questionPaperId),
        prev => updater(prev ?? []),
      ),
    [queryClient, questionPaperId]
  );

  // Fetch PDF URL
  useEffect(() => {
    async function fetchPdfUrl() {
      try {
        const res = await fetch(
          `${process.env.NEXT_PUBLIC_AGGREGATED_DATA_API_URL ?? "http://localhost:8082"}/api/answer-key/question-paper/${questionPaperId}/pdf-url`,
          { headers: { Authorization: `Bearer ${document.cookie.match(/token=([^;]+)/)?.[1] ?? ""}` } }
        );
        const data = await res.json();
        if (data.akPdfUrl) setAkPdfUrl(data.akPdfUrl);
      } catch { /* ignore */ }
    }
    fetchPdfUrl();
  }, [questionPaperId]);

  // ── Publish ────────────────────────────────────────────────────────────────
  async function handlePublish() {
    try {
      setPublishing(true);
      setPublishError(null);
      await publishAnswerKey(questionPaperId);
      setPublishSuccess(true);
      await fetchRows();
    } catch (e: any) {
      setPublishError(e?.body?.error ?? e?.message ?? "Publish failed.");
    } finally {
      setPublishing(false);
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const counts = rows.reduce<Record<AKStatus, number>>(
    (acc, r) => { acc[r.status] = (acc[r.status] ?? 0) + 1; return acc; },
    { DRAFT: 0, MISSING: 0, UNMAPPED: 0, MARKS_ISSUE: 0, READY: 0 }
  );

  const allReady   = rows.length > 0 && counts.READY === rows.length;
  const canPublish = rows.length > 0
    && counts.MISSING === 0
    && counts.UNMAPPED === 0
    && counts.MARKS_ISSUE === 0
    && !allReady;

  const selectedRow = rows.find(r => r.id === selectedId) ?? null;

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 size={24} className="animate-spin text-indigo-500" />
      </div>
    );
  }

  // ── Error ──────────────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className="text-center py-20">
        <p className="text-red-500 text-sm font-medium">{error}</p>
        <button onClick={() => fetchRows()} className="mt-3 text-indigo-600 text-sm underline">
          Try again
        </button>
      </div>
    );
  }

  // ── Empty ──────────────────────────────────────────────────────────────────
  if (rows.length === 0) {
    return (
      <div className="text-center py-20">
        <p className="text-gray-400 text-sm">No answer key rows found for this paper.</p>
        <button onClick={onBack} className="mt-3 text-indigo-600 text-sm underline">
          Go back and upload
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-full gap-0 bg-gray-50 overflow-hidden">

      {/* ── Left sidebar ──────────────────────────────────────────────────── */}
      <div className="w-72 shrink-0 flex flex-col border-r border-gray-200 bg-white">

        {/* Sidebar header */}
        <div className="px-4 py-3 border-b border-gray-100 shrink-0">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Questions
            </span>
            <div className="flex items-center gap-2">
              {/* Global LaTeX toggle */}
              <button
                onClick={() => setLatexPreview(v => !v)}
                className={`flex items-center gap-1 h-6 px-2 text-[11px] font-semibold rounded-md border transition ${
                  latexPreview
                    ? "bg-indigo-50 border-indigo-200 text-indigo-600"
                    : "bg-white border-gray-200 text-gray-400 hover:text-indigo-600"
                }`}
              >
                {latexPreview ? <EyeOff size={10} /> : <Eye size={10} />}
                LaTeX
              </button>
              <button
                onClick={() => fetchRows()}
                className="flex items-center gap-1 text-[11px] text-gray-400 hover:text-indigo-600 transition"
              >
                <RefreshCw size={11} />
              </button>
            </div>
          </div>

          {/* Status counts */}
          <div className="flex flex-wrap gap-1.5">
            {(Object.entries(counts) as [AKStatus, number][])
              .filter(([, c]) => c > 0)
              .map(([status, count]) => (
                <div
                  key={status}
                  className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${STATUS_STYLE[status]}`}
                >
                  {STATUS_ICON[status]} {count}
                </div>
              ))
            }
          </div>
        </div>

        {/* Question list */}
        <div className="flex-1 overflow-y-auto">
          {rows.map(row => (
            <button
              key={row.id}
              onClick={() => setSelectedId(row.id)}
              className={`w-full text-left px-4 py-3 border-b border-gray-50 transition ${
                selectedId === row.id
                  ? "bg-indigo-50 border-l-2 border-l-indigo-500"
                  : "hover:bg-gray-50 border-l-2 border-l-transparent"
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2">
                  <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-[11px] font-bold shrink-0 ${
                    selectedId === row.id
                      ? "bg-indigo-600 text-white"
                      : "bg-gray-100 text-gray-600"
                  }`}>
                    {row.questionNumber}
                  </span>
                  <span className={`flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${STATUS_STYLE[row.status]}`}>
                    {STATUS_ICON[row.status]}
                    {row.status.replace("_", " ")}
                  </span>
                </div>
                <span className="text-[10px] text-gray-400 shrink-0">{row.maxMarks}M</span>
              </div>
              <p className="text-[12px] text-gray-500 truncate pl-9">
                {row.questionText || <span className="italic text-gray-300">No text</span>}
              </p>
            </button>
          ))}
        </div>

        {/* Publish */}
        <div className="p-3 border-t border-gray-100 shrink-0 space-y-2">
          {publishError && (
            <p className="text-[11px] text-red-500 font-medium">{publishError}</p>
          )}
          {publishSuccess && (
            <p className="text-[11px] text-emerald-600 font-medium flex items-center gap-1">
              <CheckCircle size={11} /> Published successfully.
            </p>
          )}
          <button
            onClick={handlePublish}
            disabled={!canPublish || publishing || allReady}
            className="w-full flex items-center justify-center gap-1.5 h-9 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition"
          >
            {publishing
              ? <><Loader2 size={12} className="animate-spin" /> Publishing…</>
              : <><Send size={12} /> {allReady ? "Published" : "Publish All"}</>
            }
          </button>
        </div>
      </div>

      {/* ── Right panel ───────────────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 overflow-y-auto">
        {selectedRow ? (
          <AKRowEditor
            key={selectedRow.id}
            row={selectedRow}
            latexPreview={latexPreview}
            akPdfUrl={akPdfUrl}
            questionPaperId={questionPaperId}
            onSaved={(updatedRow) => {
              setRows(prev =>
                prev.map(r => r.id === updatedRow.id ? updatedRow : r)
              );
            }}
            onReExtracted={() => {
              // Pin the current row so the refetch can't move the selection.
              if (selectedId !== null) setSelectedId(selectedId);
              void fetchRows();
            }}
            onNavigate={(direction) => {
              const idx = rows.findIndex(r => r.id === selectedId);
              if (direction === "prev" && idx > 0) setSelectedId(rows[idx - 1].id);
              if (direction === "next" && idx < rows.length - 1) setSelectedId(rows[idx + 1].id);
            }}
            hasPrev={rows.findIndex(r => r.id === selectedId) > 0}
            hasNext={rows.findIndex(r => r.id === selectedId) < rows.length - 1}
          />
        ) : (
          <div className="flex items-center justify-center h-full text-gray-300 text-sm">
            Select a question from the left
          </div>
        )}
      </div>
    </div>
  );
}