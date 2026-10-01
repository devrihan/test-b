"use client";

import { useState, useEffect, useRef } from "react";
import {
  Plus, Trash2, Save, Loader2, X, GripVertical,
  AlertTriangle, CheckCircle, ChevronLeft, ChevronRight, ChevronDown,
  FileText, Zap, ZoomIn, ZoomOut, RotateCw,
} from "lucide-react";
import { patchAnswerKeyRow, reExtractAnswerKeyRow } from "../lib/answerKeyApi";
import type { AnswerKeyRow, StepItem, AKStatus } from "../types";
import LatexPreview from "@/app/components/LatexPreview";
import Toast from "@/app/components/Toast";

// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  row:              AnswerKeyRow;
  latexPreview:     boolean;
  akPdfUrl:         string | null;
  questionPaperId:  number;
  onSaved:          (updated: AnswerKeyRow) => void;
  onReExtracted:    () => void;
  onNavigate:       (direction: "prev" | "next") => void;
  hasPrev:          boolean;
  hasNext:          boolean;
};

const STATUS_STYLE: Record<AKStatus, string> = {
  DRAFT:       "bg-emerald-50 text-emerald-700 border-emerald-200",
  MISSING:     "bg-red-50 text-red-600 border-red-200",
  UNMAPPED:    "bg-gray-50 text-gray-600 border-gray-200",
  MARKS_ISSUE: "bg-amber-50 text-amber-700 border-amber-200",
  READY:       "bg-blue-50 text-blue-700 border-blue-200",
};

const STATUS_OPTIONS: { value: AKStatus; label: string }[] = [
  { value: "READY",       label: "✓ READY"    },
  { value: "DRAFT",       label: "DRAFT"       },
  { value: "MISSING",     label: "MISSING"     },
  { value: "MARKS_ISSUE", label: "MARKS ISSUE" },
  { value: "UNMAPPED",    label: "UNMAPPED"    },
];

function StatusDropdown({
  status, onChange,
}: {
  status:   AKStatus;
  onChange: (s: AKStatus) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen(v => !v)}
        className={`flex items-center justify-between gap-2 h-8 px-3 min-w-[140px] text-xs font-bold rounded-lg border transition ${STATUS_STYLE[status]}`}
      >
        {STATUS_OPTIONS.find(o => o.value === status)?.label}
        <ChevronDown size={11} />
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
           <div className="absolute right-0 top-9 z-20 bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden w-full">
            {STATUS_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`w-full text-left px-3 py-2 text-xs font-bold transition hover:opacity-80 ${
                  opt.value === status ? STATUS_STYLE[opt.value] : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

const MCQ_OPTIONS = ["A", "B", "C", "D", "E"] as const;

function isMCQ(row: Props["row"]) {
  return row.questionType?.toUpperCase() === "MCQ";
}

export default function AKRowEditor({
  row, latexPreview, akPdfUrl, questionPaperId, onSaved, onReExtracted, onNavigate, hasPrev, hasNext,
}: Props) {
  const [cleanText, setCleanText]             = useState(row.cleanText ?? "");
  const [mcqChoice, setMcqChoice] = useState<string | null>(row.mcqChoice ?? null);
  const [steps, setSteps]                     = useState<StepItem[]>(
    row.steps.length > 0
      ? row.steps
      : [{ stepNumber: 1, description: row.cleanText ?? row.ocrText ?? "", marks: row.maxMarks }]
  );
  const [status, setStatus] = useState<AKStatus>(
    row.status === "MISSING" || row.status === "UNMAPPED" || row.status === "MARKS_ISSUE"
      ? "DRAFT"
      : row.status
  );

  const [saving, setSaving]             = useState(false);
  const [reExtracting, setReExtracting] = useState(false);
  const [provider, setProvider]         = useState<"claude" | "openai">("claude");
  const [error, setError]             = useState<string | null>(null);
  const [saved, setSaved]             = useState(false);
  const [showPdf, setShowPdf] = useState(false);
  const [zoomed, setZoomed] = useState(false);
  const [cropZoom, setCropZoom] = useState(100);
  const [cropRotation, setCropRotation] = useState(0);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [toast, setToast]   = useState<{ message: string; type: "success" | "error" } | null>(null);

  const dragIndexRef = useRef<number | null>(null);

  // Reset zoom/rotation when row changes — shared between the inline
  // thumbnail and the lightbox so they always stay in sync.
  useEffect(() => { setZoomed(false); setCropZoom(100); setCropRotation(0); }, [row.id]);

  // Sync mcqChoice from the row prop after re-extraction reloads the data
  useEffect(() => {
    setMcqChoice(row.mcqChoice ?? null);
  }, [row.mcqChoice]);

  // ── Step helpers ───────────────────────────────────────────────────────────
  function addStep() {
    setSteps(prev => [
      ...prev,
      { stepNumber: prev.length + 1, description: "", marks: 0 },
    ]);
  }

  function removeStep(idx: number) {
    setSteps(prev =>
      prev
        .filter((_, i) => i !== idx)
        .map((s, i) => ({ ...s, stepNumber: i + 1 }))
    );
    setSaved(false);
  }

  function updateStep<K extends keyof StepItem>(
    idx: number, field: K, value: StepItem[K]
  ) {
    setSteps(prev =>
      prev.map((s, i) => (i === idx ? { ...s, [field]: value } : s))
    );
    setSaved(false);
  }

  // ── Drag-to-reorder helpers ────────────────────────────────────────────────
  function handleDragStart(idx: number) {
    dragIndexRef.current = idx;
  }

  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    setDragOverIdx(idx);
  }

  function handleDrop(idx: number) {
    const from = dragIndexRef.current;
    if (from === null || from === idx) { setDragOverIdx(null); return; }
    setSteps(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(idx, 0, moved);
      return next.map((s, i) => ({ ...s, stepNumber: i + 1 }));
    });
    setSaved(false);
    dragIndexRef.current = null;
    setDragOverIdx(null);
  }

  function handleDragEnd() {
    dragIndexRef.current = null;
    setDragOverIdx(null);
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const marksSum   = steps.reduce((acc, s) => acc + Number(s.marks ?? 0), 0);
  const marksMatch = Math.abs(marksSum - row.maxMarks) < 0.01;

  // ── Auto-save ──────────────────────────────────────────────────────────────
  const mountedRef       = useRef(true);
  const saveTimerRef     = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isFirstRenderRef = useRef(true);
  const handleSaveRef    = useRef<(isAuto?: boolean) => void>(() => {});

  useEffect(() => { handleSaveRef.current = handleSave; });

  // Debounce: save automatically ~1.5s after the user stops typing/editing.
  useEffect(() => {
    if (isFirstRenderRef.current) { isFirstRenderRef.current = false; return; }
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      handleSaveRef.current(true);
    }, 1500);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cleanText, mcqChoice, steps, status]);

  // Flush any pending auto-save immediately when leaving this row, so
  // switching questions right after typing doesn't drop the last edit.
  useEffect(() => {
    return () => {
      mountedRef.current = false;
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        handleSaveRef.current(true);
      }
    };
  }, []);

  // ── Save ───────────────────────────────────────────────────────────────────
  async function handleSave(isAuto = false) {
    if (!marksMatch) {
      const msg = `Steps sum to ${marksSum} but max marks is ${row.maxMarks}.`;
      if (mountedRef.current) {
        setError(msg);
        setToast({ message: msg, type: "error" });
      }
      return;
    }
    try {
      if (mountedRef.current) { setSaving(true); setError(null); }
      const updated = await patchAnswerKeyRow(row.id, cleanText, mcqChoice, steps, status);
      onSaved(updated);
      if (mountedRef.current) {
        setSaved(true);
        if (!isAuto) setToast({ message: "Answer key saved successfully.", type: "success" });
        setTimeout(() => { if (mountedRef.current) setSaved(false); }, 2000);
      }
    } catch (e: any) {
      const errMsg = e?.body?.error ?? e?.message ?? "Save failed.";
      if (mountedRef.current) {
        setError(errMsg);
        setToast({ message: errMsg, type: "error" });
      }
    } finally {
      if (mountedRef.current) setSaving(false);
    }
  }

  // ── Re-extract ─────────────────────────────────────────────────────────────
  async function handleReExtract() {
    if (!row.r2CroppedImageUrl) return;
    try {
      setReExtracting(true);
      setError(null);
      await reExtractAnswerKeyRow(
        questionPaperId,
        row.questionId,
        row.questionNumber,
        row.r2CroppedImageUrl,
        row.maxMarks,
        row.questionType,
        provider,
      );
      setToast({ message: "Re-extracted successfully! Reloading…", type: "success" });
      onReExtracted();
    } catch (e: any) {
      const errMsg = e?.body?.error ?? e?.message ?? "Re-extract failed.";
      setError(errMsg);
      setToast({ message: errMsg, type: "error" });
    } finally {
      setReExtracting(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-full bg-gray-50">
        {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* ── PDF panel ────────────────────────────────────────────────────── */}
      {showPdf && akPdfUrl && (
        <div className="w-[45%] shrink-0 border-r border-gray-200 flex flex-col bg-white">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
            <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Answer Key PDF
            </span>
            <button
              onClick={() => setShowPdf(false)}
              className="text-gray-400 hover:text-gray-600 transition"
            >
              <ChevronLeft size={14} />
            </button>
          </div>
          <iframe
            src={akPdfUrl}
            className="flex-1 w-full"
            title="Answer Key PDF"
          />
        </div>
      )}

      {/* ── Editor ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col flex-1 min-w-0 h-full overflow-hidden">

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-gray-100 bg-white shrink-0">
        <div className="flex items-center gap-3">
          {/* Nav arrows */}
          <button
            onClick={() => onNavigate("prev")}
            disabled={!hasPrev}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <ChevronLeft size={14} />
          </button>
          <button
            onClick={() => onNavigate("next")}
            disabled={!hasNext}
            className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-300 disabled:opacity-30 disabled:cursor-not-allowed transition"
          >
            <ChevronRight size={14} />
          </button>

          {/* Q number + status + marks */}
          <span className="w-8 h-8 rounded-lg bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">
            {row.questionNumber}
          </span>
          <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${STATUS_STYLE[row.status]}`}>
            {row.status.replace("_", " ")}
          </span>
          {isMCQ(row) && (
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full border bg-violet-50 text-violet-700 border-violet-200">
              MCQ{mcqChoice ? ` · ${mcqChoice}` : ""}
            </span>
          )}
          <span className="text-xs text-gray-400">{row.maxMarks} marks</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Status selector */}
          <StatusDropdown
            status={status}
            onChange={(s) => { setStatus(s); setSaved(false); }}
          />

          {/* PDF toggle button */}
          {akPdfUrl && (
            <button
              onClick={() => setShowPdf(v => !v)}
              className={`flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg border transition ${
                showPdf
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-indigo-400 hover:text-indigo-600"
              }`}
            >
              <FileText size={12} /> PDF
            </button>
          )}

          {/* Provider toggle + Re-extract button — only when a crop image exists */}
          {row.r2CroppedImageUrl && (
            <div className="flex items-center rounded-lg border border-amber-200 overflow-hidden">
              {/* Provider toggle */}
              <div className="flex">
                <button
                  onClick={() => setProvider("claude")}
                  disabled={reExtracting}
                  className={`h-8 px-2.5 text-xs font-semibold transition ${
                    provider === "claude"
                      ? "bg-amber-500 text-white"
                      : "bg-amber-50 text-amber-600 hover:bg-amber-100"
                  }`}
                >
                  Claude
                </button>
                <button
                  onClick={() => setProvider("openai")}
                  disabled={reExtracting}
                  className={`h-8 px-2.5 text-xs font-semibold border-l border-amber-200 transition ${
                    provider === "openai"
                      ? "bg-amber-500 text-white"
                      : "bg-amber-50 text-amber-600 hover:bg-amber-100"
                  }`}
                >
                  GPT
                </button>
              </div>

              {/* Re-extract action */}
              <button
                onClick={handleReExtract}
                disabled={reExtracting || saving}
                className="flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 border-l border-amber-200 disabled:opacity-40 disabled:cursor-not-allowed transition"
                title={`Re-run extraction using ${provider === "openai" ? "GPT-4o" : "Claude"}`}
              >
                {reExtracting
                  ? <><Loader2 size={12} className="animate-spin" /> Extracting…</>
                  : <><Zap size={12} /> Re-extract</>
                }
              </button>
            </div>
          )}

          {/* Save button */}
          <button
            onClick={() => handleSave()}
            disabled={saving}
            className="flex items-center gap-1.5 h-8 px-4 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 rounded-lg transition"
          >
            {saving
              ? <><Loader2 size={12} className="animate-spin" /> Saving…</>
              : saved
              ? <><CheckCircle size={12} /> Saved</>
              : <><Save size={12} /> Save</>
            }
          </button>
        </div>
      </div>

      {/* ── Scrollable body ────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

        {/* Question text */}
        {row.questionText && (
          <div className="bg-indigo-50/60 border border-indigo-100 rounded-xl px-4 py-3">
            <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider mb-2">
              Question
            </p>
            {latexPreview ? (
              <div className="text-sm text-gray-700 leading-relaxed">
                <LatexPreview text={row.questionText} />
              </div>
            ) : (
              <p className="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">
                {row.questionText}
              </p>
            )}
          </div>
        )}

        {/* Cropped image + OCR side by side */}
        {(row.r2CroppedImageUrl || row.ocrText) && (
          <div className="flex gap-3">

            {/* Cropped image */}
            {row.r2CroppedImageUrl && (
              <div className="w-1/2 shrink-0 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                    Cropped Answer Image
                  </p>
                  {/* Inline zoom/rotate — view-only, stays in sync with the lightbox */}
                  <div className="flex items-center gap-0.5">
                    <button
                      onClick={e => { e.stopPropagation(); setCropZoom(z => Math.max(50, z - 25)); }}
                      title="Zoom out"
                      className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-200 hover:text-indigo-600 transition"
                    >
                      <ZoomOut size={12} />
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setCropZoom(100); }}
                      title="Reset zoom"
                      className="text-[10px] font-semibold text-gray-400 w-8 text-center hover:text-indigo-600"
                    >
                      {cropZoom}%
                    </button>
                    <button
                      onClick={e => { e.stopPropagation(); setCropZoom(z => Math.min(300, z + 25)); }}
                      title="Zoom in"
                      className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-200 hover:text-indigo-600 transition"
                    >
                      <ZoomIn size={12} />
                    </button>
                    <div className="w-px h-3 bg-gray-300 mx-0.5" />
                    <button
                      onClick={e => { e.stopPropagation(); setCropRotation(r => (r + 90) % 360); }}
                      title="Rotate"
                      className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:bg-gray-200 hover:text-indigo-600 transition"
                    >
                      <RotateCw size={12} />
                    </button>
                  </div>
                </div>
                <div
                  className="relative group cursor-zoom-in max-h-56 overflow-auto flex items-center justify-center rounded-lg border border-gray-200 bg-white"
                  onClick={() => setZoomed(true)}
                >
                  <img
                    src={row.r2CroppedImageUrl}
                    alt={`Cropped answer for Q${row.questionNumber}`}
                    className="max-w-full max-h-56 object-contain shrink-0"
                    style={{ transform: `scale(${cropZoom / 100}) rotate(${cropRotation}deg)` }}
                  />
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition flex items-center justify-center pointer-events-none">
                    <span className="opacity-0 group-hover:opacity-100 transition text-[10px] font-semibold text-white bg-black/50 px-2 py-1 rounded-md">
                      Click to zoom
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* OCR raw text */}
            {row.ocrText && (
              <div className="flex-1 min-w-0 bg-gray-50 border border-gray-200 rounded-xl px-4 py-3">
                <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                  OCR Raw Text
                </p>
                <p className="text-xs text-gray-500 leading-relaxed whitespace-pre-wrap font-mono overflow-y-auto max-h-56">
                  {row.ocrText}
                </p>
              </div>
            )}

          </div>
        )}

        {/* Zoom lightbox */}
        {zoomed && row.r2CroppedImageUrl && (
          <div
            className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-center p-6"
            onClick={() => setZoomed(false)}
          >
            {/* Toolbar */}
            <div
              className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/60 rounded-lg px-1.5 py-1"
              onClick={e => e.stopPropagation()}
            >
              <button
                onClick={() => setCropZoom(z => Math.max(50, z - 25))}
                title="Zoom out"
                className="w-8 h-8 flex items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white transition"
              >
                <ZoomOut size={16} />
              </button>
              <button
                onClick={() => setCropZoom(100)}
                title="Reset zoom"
                className="text-xs font-semibold text-white/80 w-12 text-center hover:text-white"
              >
                {cropZoom}%
              </button>
              <button
                onClick={() => setCropZoom(z => Math.min(400, z + 25))}
                title="Zoom in"
                className="w-8 h-8 flex items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white transition"
              >
                <ZoomIn size={16} />
              </button>
              <div className="w-px h-5 bg-white/20 mx-1" />
              <button
                onClick={() => setCropRotation(r => (r + 90) % 360)}
                title="Rotate"
                className="w-8 h-8 flex items-center justify-center rounded-md text-white/80 hover:bg-white/10 hover:text-white transition"
              >
                <RotateCw size={16} />
              </button>
            </div>

            <button
              className="absolute top-4 right-4 text-white/70 hover:text-white transition"
              onClick={() => setZoomed(false)}
            >
              <X size={22} />
            </button>

            <div className="w-full h-full overflow-auto flex items-center justify-center">
              <img
                src={row.r2CroppedImageUrl}
                alt={`Cropped answer for Q${row.questionNumber}`}
                className="max-w-[90vw] max-h-[90vh] object-contain rounded-xl shadow-2xl shrink-0"
                style={{
                  transform: `scale(${cropZoom / 100}) rotate(${cropRotation}deg)`,
                }}
                onClick={e => e.stopPropagation()}
              />
            </div>
          </div>
        )}

        {/* MCQ normalised answer dropdown */}
        {isMCQ(row) && (
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              MCQ Choice
            </label>
            <select
              value={mcqChoice ?? ""}
              onChange={e => {
                setMcqChoice(e.target.value || null);
                setSaved(false);
              }}
              className="h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 bg-white text-gray-700 w-40"
            >
              <option value="">— Select —</option>
              {MCQ_OPTIONS.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
          </div>
        )}

        {/* Clean text */}
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5 ">
            Clean Answer Text
          </label>
          <textarea
            value={cleanText}
            onChange={e => { setCleanText(e.target.value); setSaved(false); }}
            rows={4}
            placeholder="Type the clean answer here…"
            className="w-full px-3 py-2.5 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-y leading-relaxed focus:bg-white"
          />
          {/* LaTeX preview of clean text */}
          {latexPreview && cleanText.trim() && (
            <div className="mt-2 bg-white border border-gray-200 rounded-lg px-4 py-3">
              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">
                Preview
              </p>
              <div className="text-sm text-gray-700 leading-relaxed">
                <LatexPreview text={cleanText} />
              </div>
            </div>
          )}
        </div>

        {/* Steps */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-gray-600">
              Marking Steps
            </label>
            <div className="flex items-center gap-2">
              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                marksMatch
                  ? "bg-emerald-50 text-emerald-600"
                  : "bg-amber-50 text-amber-600"
              }`}>
                {marksSum} / {row.maxMarks} marks
              </span>
              <button
                onClick={addStep}
                className="flex items-center gap-1 h-7 px-2.5 text-[11px] font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition border border-indigo-100"
              >
                <Plus size={12} /> Add Step
              </button>
            </div>
          </div>

          <div className="space-y-2">
            {steps.map((step, idx) => (
              <div
                key={idx}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={e => handleDragOver(e, idx)}
                onDrop={() => handleDrop(idx)}
                onDragEnd={handleDragEnd}
                className={`flex items-start gap-2 bg-white border rounded-lg px-3 py-2.5 transition-colors ${
                  dragOverIdx === idx
                    ? "border-indigo-400 bg-indigo-50/40"
                    : "border-gray-200"
                }`}
              >
                {/* Drag handle */}
                <div className="shrink-0 mt-1.5 cursor-grab active:cursor-grabbing text-gray-300 hover:text-gray-400 transition">
                  <GripVertical size={14} />
                </div>

                {/* Step number */}
                <div className="shrink-0 w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center mt-0.5">
                  <span className="text-[10px] font-bold text-gray-500">{step.stepNumber}</span>
                </div>

                {/* Description + optional LaTeX preview */}
                <div className="flex-1 space-y-1.5 min-w-0">
                  <input
                    type="text"
                    value={step.description}
                    onChange={e => updateStep(idx, "description", e.target.value)}
                    placeholder="Step description…"
                    className="w-full h-7 px-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-gray-50"
                  />
                  {latexPreview && step.description.trim() && (
                    <div className="px-2 py-1.5 bg-white border border-gray-100 rounded-md text-xs text-gray-600 leading-relaxed">
                      <LatexPreview text={step.description} />
                    </div>
                  )}
                </div>

                {/* Marks */}
                <div className="flex items-center gap-1 shrink-0">
                  <input
                    type="number"
                    value={step.marks}
                    onChange={e => updateStep(idx, "marks", Number(e.target.value))}
                    min={0}
                    step={0.5}
                    className="w-14 h-7 px-1.5 text-xs border border-gray-200 rounded-lg text-center focus:outline-none focus:border-indigo-400 bg-gray-50"
                  />
                  <span className="text-[10px] text-gray-400 font-medium">M</span>
                </div>

                {/* Delete */}
                <button
                  onClick={() => removeStep(idx)}
                  disabled={steps.length === 1}
                  className="shrink-0 p-1 rounded-lg text-gray-300 hover:text-red-400 hover:bg-red-50 transition disabled:opacity-30 disabled:cursor-not-allowed mt-0.5"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>

          {!marksMatch && (
            <div className="flex items-center gap-2 mt-2 text-[11px] text-amber-600 font-medium">
              <AlertTriangle size={12} className="shrink-0" />
              Steps must sum to {row.maxMarks}. Currently {marksSum}.
            </div>
          )}
        </div>

        

        {/* Error */}
        {error && (
          <div className="flex items-center gap-2 text-xs text-red-600 font-medium bg-red-50 border border-red-200 rounded-lg px-4 py-2.5">
            <AlertTriangle size={13} className="shrink-0" /> {error}
          </div>
        )}

      </div>
    </div>
    </div>
  );
}