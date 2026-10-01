"use client";

import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { keys } from "@/app/lib/queryKeys";
import { useRouter } from "next/navigation";
import {
  Upload, Loader2, X, CheckCircle, AlertTriangle,
  FileText, ChevronDown, ArrowRight, Zap, PenLine,
} from "lucide-react";
import { listQuestionPapers, ingestAnswerKey } from "../lib/answerKeyApi";
import { getStoredToken } from "@/app/lib/auth";
import type { PaperOption, IngestResult } from "../types";

const API_BASE = process.env.NEXT_PUBLIC_BEAVER_API_URL ?? "http://localhost:4000";

// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  onIngestComplete: (questionPaperId: number) => void;
};

type UploadMode = "quick" | "bbox";

const NO_PAPERS: PaperOption[] = [];

export default function AKUpload({ onIngestComplete }: Props) {
  const router       = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<UploadMode>("quick");


  const [selectedPaperId, setSelectedPaperId] = useState<number | null>(null);
  const [pdfFile, setPdfFile]                 = useState<File | null>(null);
  const [uploading, setUploading]             = useState(false);
  const [error, setError]                     = useState<string | null>(null);
  const [result, setResult]                   = useState<IngestResult | null>(null);

  // ── Load papers ────────────────────────────────────────────────────────────
  // Lazy: nothing fetches until the picker is first focused. Shares the key
  // with the parent page, so both together cost one request.
  const [wantPapers, setWantPapers] = useState(false);

  const papersQuery = useQuery({
    queryKey: keys.answerKey.questionPapers(),
    queryFn: listQuestionPapers,
    enabled: wantPapers,
  });

  const papers = papersQuery.data ?? NO_PAPERS;
  const papersLoading = papersQuery.isFetching;

  function handleLoadPapers() {
    setWantPapers(true);
  }

  // ── Quick parse (existing flow) ────────────────────────────────────────────
  async function handleQuickIngest() {
    if (!selectedPaperId) { setError("Select a question paper first."); return; }
    if (!pdfFile)         { setError("Select a PDF file first.");        return; }
    try {
      setUploading(true);
      setError(null);
      setResult(null);
      const data = await ingestAnswerKey(selectedPaperId, pdfFile);
      setResult(data);
    } catch (e: any) {
      setError(e?.body?.error ?? e?.message ?? "Ingest failed.");
    } finally {
      setUploading(false);
    }
  }

  // ── BBox flow (new) ────────────────────────────────────────────────────────
  async function handleBBoxUpload() {
    if (!selectedPaperId) { setError("Select a question paper first."); return; }
    if (!pdfFile)         { setError("Select a PDF file first.");        return; }

    try {
      setUploading(true);
      setError(null);

      const token   = getStoredToken() ?? "";
      const formData = new FormData();
      formData.append("files", pdfFile);

      const res = await fetch(
        `${API_BASE}/api/answer-key/${selectedPaperId}/pages/upload`,
        {
          method:  "POST",
          headers: { Authorization: `Bearer ${token}` },
          body:    formData,
        }
      );

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "Upload failed.");
      }

      await res.json();

      // Navigate to bbox page — pages are fetched from DB by the bbox page
      router.push(`/answerKey/bbox?paperId=${selectedPaperId}`);

    } catch (e: any) {
      setError(e?.message ?? "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  const selectedPaper = papers.find(p => p.id === selectedPaperId);

  return (
    <div className="max-w-xl mx-auto space-y-5">

      {/* ── Mode toggle ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        <button
          onClick={() => { setMode("quick"); setError(null); setResult(null); }}
          className={`flex flex-col items-start gap-1 p-3 rounded-xl border-2 text-left transition ${
            mode === "quick"
              ? "border-indigo-500 bg-indigo-50"
              : "border-gray-200 bg-white hover:border-gray-300"
          }`}
        >
          <div className="flex items-center gap-1.5">
            <Zap size={13} className={mode === "quick" ? "text-indigo-600" : "text-gray-400"} />
            <span className={`text-xs font-bold ${mode === "quick" ? "text-indigo-700" : "text-gray-600"}`}>
              Quick Parse
            </span>
          </div>
          <p className="text-[10px] text-gray-400 leading-relaxed">
            Claude reads the full PDF. Best for printed AKs.
          </p>
        </button>

        <button
          onClick={() => { setMode("bbox"); setError(null); setResult(null); }}
          className={`flex flex-col items-start gap-1 p-3 rounded-xl border-2 text-left transition ${
            mode === "bbox"
              ? "border-indigo-500 bg-indigo-50"
              : "border-gray-200 bg-white hover:border-gray-300"
          }`}
        >
          <div className="flex items-center gap-1.5">
            <PenLine size={13} className={mode === "bbox" ? "text-indigo-600" : "text-gray-400"} />
            <span className={`text-xs font-bold ${mode === "bbox" ? "text-indigo-700" : "text-gray-600"}`}>
              Draw Boxes
            </span>
          </div>
          <p className="text-[10px] text-gray-400 leading-relaxed">
            Draw boxes per question. Best for handwritten AKs.
          </p>
        </button>
      </div>

      {/* ── Paper selector ───────────────────────────────────────────────────── */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">
          Question Paper <span className="text-red-400">*</span>
        </label>
        <div className="relative">
          <select
            value={selectedPaperId ?? ""}
            onFocus={handleLoadPapers}
            onChange={e => {
              setSelectedPaperId(Number(e.target.value) || null);
              setError(null);
              setResult(null);
            }}
            className="w-full h-9 px-3 pr-8 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition appearance-none bg-white cursor-pointer"
          >
            <option value="">
              {papersLoading ? "Loading…" : "Select a question paper"}
            </option>
            {papers.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}{p.subjectName ? ` — ${p.subjectName}` : ""}{p.schoolName ? ` (${p.schoolName})` : ""}{p.setNumber ? ` (Set ${p.setNumber})` : ""}
              </option>
            ))}
          </select>
          <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
        </div>
        {selectedPaper && (
          <p className="mt-1 text-[11px] text-gray-400">
            Paper ID: {selectedPaper.id}
            {selectedPaper.maxMarks ? ` · ${selectedPaper.maxMarks} marks` : ""}
          </p>
        )}
      </div>

      {/* ── PDF picker ───────────────────────────────────────────────────────── */}
      <div>
        <label className="block text-xs font-semibold text-gray-600 mb-1.5">
          Answer Key PDF <span className="text-red-400">*</span>
        </label>
        <p className="text-xs text-gray-400 mb-2">
          {mode === "quick"
            ? "Upload the handwritten or printed answer key. Claude will parse it automatically."
            : "Upload the AK PDF. We'll convert it to images so you can draw boxes per question."
          }
        </p>

        {pdfFile ? (
          <div className="flex items-center gap-3 h-9 px-3 bg-green-50 border border-green-200 rounded-lg">
            <FileText size={13} className="text-green-500 shrink-0" />
            <span className="text-xs font-medium text-green-700 flex-1 truncate">{pdfFile.name}</span>
            <span className="text-xs text-green-500 shrink-0">{(pdfFile.size / 1024 / 1024).toFixed(1)} MB</span>
            <button
              onClick={() => { setPdfFile(null); setResult(null); setError(null); }}
              className="text-green-400 hover:text-red-400 transition"
            >
              <X size={14} />
            </button>
          </div>
        ) : (
          <button
            onClick={() => fileInputRef.current?.click()}
            className="w-full h-9 px-3 bg-white border border-dashed border-gray-300 hover:border-indigo-400 text-gray-500 hover:text-indigo-600 rounded-lg text-xs font-medium transition flex items-center justify-center gap-2"
          >
            <Upload size={13} /> Select PDF
          </button>
        )}

        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          className="hidden"
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) {
              if (!file.name.toLowerCase().endsWith(".pdf")) {
                setError("Please select a valid PDF file.");
              } else {
                setPdfFile(file);
                setError(null);
                setResult(null);
              }
            }
            if (fileInputRef.current) fileInputRef.current.value = "";
          }}
        />
      </div>

      {/* ── Error ────────────────────────────────────────────────────────────── */}
      {error && (
        <p className="text-xs text-red-500 font-medium">{error}</p>
      )}

      {/* ── Upload button ─────────────────────────────────────────────────────── */}
      {!result && (
        <button
          onClick={mode === "quick" ? handleQuickIngest : handleBBoxUpload}
          disabled={uploading || !selectedPaperId || !pdfFile}
          className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2"
        >
          {uploading ? (
            <><Loader2 size={14} className="animate-spin" />
              {mode === "quick" ? "Parsing with AI…" : "Uploading & converting…"}
            </>
          ) : mode === "quick" ? (
            <><Zap size={14} /> Upload & Parse Answer Key</>
          ) : (
            <><PenLine size={14} /> Upload & Draw Boxes</>
          )}
        </button>
      )}

      {/* ── Quick parse result ───────────────────────────────────────────────── */}
      {result && (
        <div className="space-y-4">
          <div className={`rounded-xl border p-4 ${
            result.requiresReview ? "bg-amber-50 border-amber-200" : "bg-emerald-50 border-emerald-200"
          }`}>
            <div className="flex items-start gap-2 mb-3">
              {result.requiresReview
                ? <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                : <CheckCircle   size={15} className="text-emerald-500 shrink-0 mt-0.5" />
              }
              <p className={`text-xs font-semibold ${result.requiresReview ? "text-amber-700" : "text-emerald-700"}`}>
                {result.summary.message}
              </p>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {[
                { label: "Draft",       count: result.summary.draftCount,      color: "text-emerald-600 bg-emerald-50 border-emerald-200" },
                { label: "Missing",     count: result.summary.missingCount,     color: "text-red-600 bg-red-50 border-red-200"             },
                { label: "Marks Issue", count: result.summary.marksIssueCount,  color: "text-amber-600 bg-amber-50 border-amber-200"       },
                { label: "Unmapped",    count: result.summary.unmappedCount,    color: "text-gray-600 bg-gray-50 border-gray-200"          },
              ].map(({ label, count, color }) => (
                <div key={label} className={`rounded-lg border px-2 py-1.5 text-center ${color}`}>
                  <p className="text-base font-bold">{count}</p>
                  <p className="text-[10px] font-medium">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {result.validationIssues.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 bg-gray-50 border-b border-gray-100">
                <p className="text-xs font-semibold text-gray-600">
                  Issues to fix ({result.validationIssues.length})
                </p>
              </div>
              <div className="divide-y divide-gray-100 max-h-48 overflow-y-auto">
                {result.validationIssues.map((issue, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                    <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded-full border mt-0.5 ${
                      issue.status === "MISSING"
                        ? "bg-red-50 text-red-600 border-red-200"
                        : "bg-amber-50 text-amber-600 border-amber-200"
                    }`}>
                      Q{issue.questionNumber}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-semibold text-gray-700">{issue.status}</p>
                      <p className="text-[10px] text-gray-400 truncate">{issue.reason}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => { setResult(null); setPdfFile(null); }}
              className="flex-1 h-9 border border-gray-200 hover:border-gray-300 text-gray-600 text-xs font-semibold rounded-xl transition"
            >
              Re-upload
            </button>
            <button
              onClick={() => onIngestComplete(result.questionPaperId)}
              className="flex-1 h-9 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-xl transition flex items-center justify-center gap-1.5"
            >
              Review Answer Key <ArrowRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}