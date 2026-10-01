"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Download, FileText, Hexagon, History } from 'lucide-react';
import React from 'react';

/** Scenarios ops can pick when flagging a teacher error. `value` is what
 *  beaver-api stores in batch_students.teacher_error_kind (CHECK-constrained). */
export const TEACHER_ERROR_KINDS: { value: string; label: string }[] = [
  { value: "addition_mistake",  label: "Mistake in addition" },
  { value: "marks_not_in_grid", label: "Marks missing from grid" },
  { value: "over_max",          label: "More than max marks" },
  { value: "unmarked_question", label: "Question left unmarked" },
  { value: "total_unreadable",  label: "Hard to read marks" },
  { value: "other",             label: "Other" },
];

export interface TeacherErrorState {
  flagged: boolean;
  kind:    string | null;
  note:    string;
}

interface studentHeaderProps {
  studentName:   string;
  studentId:     string;
  total:         number | string;
  totalMax:      number;
  ocrTotal:      number;
  dirtyCount:    number;
  isSaved:       boolean;
  onTotalChange: (val: number | string) => void;
  /** Optional — fires on blur with the clamped numeric total, for callers that
   *  need to persist it (e.g. Pipeline's PATCH .../total). Omit to keep the
   *  previous behaviour of only updating local state via onTotalChange. */
  onTotalCommit?: (val: number) => void;
  /** Pipeline only — paper-level teacher error flag. Omit to hide the control
   *  entirely (Published editor doesn't have this). onTeacherErrorChange fires
   *  on every edit; `commit` is true when the change should be persisted
   *  (checkbox, dropdown pick, note blur) and false while typing the note. */
  teacherError?: TeacherErrorState;
  onTeacherErrorChange?: (next: TeacherErrorState, commit: boolean) => void;
  onSave:        () => void;
  onFileClick:   () => void;
  isPdfOpen:     boolean;
  latexPreview:  boolean;
  onLatexToggle: () => void;
  /** Optional chemical-structure preview toggle (Pipeline editor). When
   *  provided, renders an icon-only hexagon button that globally shows/hides
   *  structures detected in each answer's text. Omit to hide (Published editor). */
  chemPreview?:  boolean;
  onChemToggle?: () => void;
  /** Show the "Back" button (Pipeline default). The Published inline editor has
   *  no route to go back to, so it passes false. */
  showBack?:     boolean;
  /** Optional control rendered in the right cluster — used by the Published
   *  editor for the "Paper complete" checkbox (no equivalent in Pipeline). */
  completeControl?: React.ReactNode;
  ocrVerifiedCount?: number;
  totalQuestions?:   number;
  onVerifyAllOcr?:   () => void;
  /** Global model picker for the per-question Extract button. Omit to hide.
   *  Selection persists per session in component state; the caller decides
   *  whether to also stash it in localStorage. */
  modelOptions?: { value: string; label: string; hint?: string }[];
  selectedModel?: string;
  onModelChange?: (model: string) => void;
  /** Optional handler — when provided, renders a "Download crops" button
   *  that streams a zip of every stored bbox crop for the loaded student.
   *  Omit on screens (Published editor) that don't need it. */
  onDownloadCrops?: () => void;
  downloadingCrops?: boolean;
  /** Optional handler — when provided, renders a "Review history" button (#97)
   *  that opens the edit-history + comments drawer for the loaded unit. */
  onReviewHistory?: () => void;
  /** Optional maker-checker gate control (#97/t092) — the Checked / Re-checked
   *  button for the loaded paper. Rendered prominently at the start of the cluster. */
  reviewGate?: React.ReactNode;
}

function StudentHeader({
  studentName,
  studentId,
  total,
  totalMax,
  ocrTotal,
  dirtyCount,
  isSaved,
  onTotalChange,
  onTotalCommit,
  teacherError,
  onTeacherErrorChange,
  onSave,
  onFileClick,
  isPdfOpen,
  latexPreview,
  onLatexToggle,
  chemPreview = false,
  onChemToggle,
  showBack = true,
  completeControl,
  ocrVerifiedCount = 0,
  totalQuestions = 0,
  onVerifyAllOcr,
  modelOptions,
  selectedModel,
  onModelChange,
  onDownloadCrops,
  downloadingCrops = false,
  onReviewHistory,
  reviewGate,
}: studentHeaderProps) {

  const router = useRouter();

  const totalChanged        = total !== ocrTotal;
  // totalDiffersFromAuto only gated the OCR value box below, which is now
  // hidden from the header; kept commented rather than deleted in case the
  // box comes back.
  // const totalDiffersFromAuto = total !== ocrTotal;

  const statusBadge = () => {
    if (isSaved)
      return (
        <span className="inline-flex items-center gap-1 text-xs font-medium text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
          <CheckCircle2 size={10} /> Saved
        </span>
      );
    if (dirtyCount > 0)
      return (
        <span className="inline-flex items-center gap-1 text-base font-medium text-amber-700 bg-amber-100 px-2 py-0.5 rounded-sm">
          <AlertTriangle size={16} /> {dirtyCount} edited
        </span>
      );
    return <span className="text-xs text-gray-400">No changes yet</span>;
  };

  return (
    <div className="bg-white border-b border-gray-200 px-4 py-3 flex flex-wrap items-start justify-between gap-3">

      {/* Left — back button + student info */}
      <div className="min-w-0 max-w-full">

        {/* Back button */}
        {showBack && (
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-1 text-sm text-gray-400 hover:text-indigo-600 font-medium transition mb-1.5"
          >
            <svg
              width="14" height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Back
          </button>
        )}

        {/* Student name + id + status */}
        <div className="flex items-center gap-2 flex-wrap min-w-0">
          <h2 className="text-xl font-bold text-gray-900 truncate max-w-[16rem]" title={studentName}>
            {studentName}
          </h2>
          <span className="text-sm font-medium font-mono text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded shrink-0">
            {studentId}
          </span>
          {statusBadge()}
        </div>

      </div>

      {/* Right — gate control + tools + total marks */}
      <div className="flex flex-wrap items-center gap-2 justify-end">

        {/* Optional published-only control (Paper complete) */}
        {completeControl}

        {/* Maker-checker gate: Checked / Re-checked (#97/t092). */}
        {reviewGate}

        {/* Review history (#97) — icon-only to keep the toolbar compact. */}
        {onReviewHistory && (
          <button
            onClick={onReviewHistory}
            title="Review history"
            className="w-9 h-9 flex items-center justify-center rounded-md border border-gray-300 bg-white text-gray-600 transition hover:border-indigo-400 hover:text-indigo-600"
          >
            <History size={16} />
          </button>
        )}

        {/* Download crops — icon-only (zip of every stored bbox crop). */}
        {onDownloadCrops && (
          <button
            onClick={onDownloadCrops}
            disabled={downloadingCrops}
            title={downloadingCrops ? "Downloading…" : "Download crops"}
            className={`w-9 h-9 flex items-center justify-center rounded-md border transition ${
              downloadingCrops
                ? "bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed"
                : "bg-white border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600"
            }`}
          >
            <Download size={16} className={downloadingCrops ? "animate-pulse" : ""} />
          </button>
        )}

        {/* Verify-all-answers button (confirms the OCR text for every question) */}
        {onVerifyAllOcr && (
          <button
            onClick={onVerifyAllOcr}
            disabled={ocrVerifiedCount === totalQuestions && totalQuestions > 0}
            className={`px-3 py-1.5 text-sm font-semibold rounded-md border transition flex items-center gap-1.5 ${
              ocrVerifiedCount === totalQuestions && totalQuestions > 0
                ? "bg-green-50 border-green-300 text-green-700"
                : "bg-white border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600"
            }`}
          >
            <CheckCircle2 size={14} />
            {ocrVerifiedCount === totalQuestions && totalQuestions > 0
              ? "Answers verified ✓"
              : `Verify answers (${ocrVerifiedCount}/${totalQuestions})`
            }
          </button>
        )}

        {/* Global Extract-model picker. Drives the model each per-row Extract
            button targets. Hidden when no options are provided (Published
            editor doesn't use the dispatcher today). */}
        {modelOptions && modelOptions.length > 0 && onModelChange && (
          <label className="flex items-center gap-1.5 text-xs text-gray-500">
            <span className="font-medium uppercase tracking-wider">Extract with</span>
            <select
              value={selectedModel ?? modelOptions[0].value}
              onChange={(e) => onModelChange(e.target.value)}
              className="text-sm bg-white border border-gray-300 rounded-md px-2 py-1.5 text-gray-800 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
            >
              {modelOptions.map((m) => (
                <option key={m.value} value={m.value} title={m.hint}>
                  {m.label}
                </option>
              ))}
            </select>
          </label>
        )}

{/* LaTeX toggle — NEW */}
  <button
    onClick={onLatexToggle}
    className={`px-3 py-1.5 text-sm rounded-md border transition ${
      latexPreview
        ? "bg-indigo-50 border-indigo-300 text-indigo-700"
        : "bg-white border-gray-300 text-gray-600"
    }`}
  >
    {latexPreview ? "Hide math" : "Math preview"}
  </button>

  {/* Chemical-structure toggle — icon-only (benzene/hexagon) to save space.
      Renders structures detected in each answer's text. Pipeline editor only. */}
  {onChemToggle && (
    <button
      onClick={onChemToggle}
      title={chemPreview ? "Hide chemical structures" : "Show chemical structures"}
      className={`w-9 h-9 flex items-center justify-center rounded-md border transition ${
        chemPreview
          ? "bg-violet-50 border-violet-300 text-violet-700"
          : "bg-white border-gray-300 text-gray-600 hover:border-violet-400 hover:text-violet-600"
      }`}
    >
      <Hexagon size={16} />
    </button>
  )}

        <button
  onClick={onFileClick}
  className={`rounded-md w-10 h-10 flex items-center justify-center transition ${
    isPdfOpen ? "bg-indigo-100" : "bg-indigo-700 hover:bg-indigo-800"
  }`}
>
  <FileText size={24} className={isPdfOpen ? "text-indigo-600" : "text-white"} />
</button>

        {/* Total marks input */}
        <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2">
          <div className="min-w-0 flex-1">
            <p className="text-xs text-gray-400 font-medium leading-none mb-1 text-right">
              Total Marks
            </p>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={totalMax}
                step="0.01"
                value={total}
                onChange={(e) => onTotalChange(e.target.value)}
                onBlur={(e) => {
                  const v = Math.max(0, Number(e.target.value) || 0);
                  // Commit (persist the manual override) when provided; else just clamp.
                  if (onTotalCommit) onTotalCommit(v);
                  else onTotalChange(v);
                }}
                className={`w-14 h-8 text-center text-lg font-bold rounded-lg border outline-none transition focus:ring-2 ${
                  totalChanged
                    ? "bg-amber-50 border-amber-300 text-amber-800 focus:ring-amber-200"
                    : "bg-white border-gray-200 text-gray-900 focus:ring-indigo-100 focus:border-indigo-400"
                }`}
              />
              <span className="text-gray-400 font-medium text-base">
                / {totalMax}
              </span>
            </div>
          </div>

          {/* OCR total box — hidden from the header; totalChanged (below)
              still drives the amber highlight on the input itself. */}
          {/* {totalDiffersFromAuto && (
            <div className="text-xs text-amber-600 leading-tight ml-1 border-l border-amber-200 pl-2 flex flex-col items-center gap-1 font-medium">
              <p className="text-gray-400">OCR</p>
              <p className="font-semibold">{ocrTotal}</p>
            </div>
          )} */}

          {teacherError && onTeacherErrorChange && (
            <div className="min-w-0 border-l border-gray-200 pl-3 ml-1 flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-sm font-medium text-gray-700 whitespace-nowrap cursor-pointer">
                <input
                  type="checkbox"
                  checked={teacherError.flagged}
                  onChange={(e) =>
                    onTeacherErrorChange(
                      e.target.checked
                        ? { ...teacherError, flagged: true }
                        : { flagged: false, kind: null, note: "" },
                      true,
                    )
                  }
                  className="h-4 w-4 accent-indigo-600"
                />
                Teacher error
              </label>
              {teacherError.flagged && (
                <>
                  <select
                    value={teacherError.kind ?? ""}
                    onChange={(e) =>
                      onTeacherErrorChange({ ...teacherError, kind: e.target.value || null }, true)
                    }
                    className={`h-8 rounded-lg border px-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 ${
                      teacherError.kind ? "bg-white border-gray-200 text-gray-900" : "bg-amber-50 border-amber-300 text-amber-800"
                    }`}
                  >
                    <option value="" disabled>What went wrong?</option>
                    {TEACHER_ERROR_KINDS.map((k) => (
                      <option key={k.value} value={k.value}>{k.label}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={teacherError.note}
                    placeholder="Note (optional)"
                    onChange={(e) => onTeacherErrorChange({ ...teacherError, note: e.target.value }, false)}
                    onBlur={() => onTeacherErrorChange(teacherError, true)}
                    className="h-8 w-40 rounded-lg border border-gray-200 bg-white px-2 text-sm outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400"
                  />
                </>
              )}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default StudentHeader;