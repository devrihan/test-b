"use client";

import { KeyboardEvent, useState } from "react";
import { Pencil, BookOpen, KeyRound } from "lucide-react";
import LatexPreview from "./LatexPreview";
import StructureRenderer from "./StructureRenderer";
import DetectedStructures from "./DetectedStructures";
import { stripMoleculeFences, toEditableMolecules } from "../lib/smiles";
import ExtractButton from "./ExtractButton";


export interface QuestionRowData {
  qNo: string;
  maxMarks: number;
  /** Full parent-question total (same on base + every subpart row). Shown so
   *  ops sees the whole question's marks even when a subpart's own max is blank. */
  wholeMarks?: number;
  ocrAnswer: string;
  ocrMarks: number;
  answer: string;
  marks: number;
  answerEditing: boolean;
  answerDraft: string;
  isOptional?: boolean;
  /** Published-flow only: ops-marked-verified flag. Ignored if showVerifiedCheckbox is false. */
  verified?: boolean;
  ocrVerified?: boolean;
  /** Public R2 URL of the per-question crop, written by riverWorkflow ocr_activity
   *  (or lazily reconstructed by beaver-api on first read for legacy bboxes).
   *  When present, the row renders the crop inline so the operator doesn't
   *  have to switch to the full PDF panel for context. */
  croppedImageUrl?: string | null;
  questionText?: string;
  answerKey?: string;
  /** From exam question-paper metadata — e.g. "MCQ". Drives MCQ-specific UI. */
  questionType?: string;
  /** Chemistry: recognized answer structure (SMILES) — rendered via RDKit.js. */
  structureSmiles?: string | null;
  /** Chemistry: operator flagged this answer as containing a drawn structure. */
  hasStructure?: boolean;
  /** Normalized MCQ choice letter extracted from OCR (A–E), or null. */
  mcqNormalized?: string | null;
  /** GLM-OCR extraction confidence (0–1), derived from token logprobs. Low
   *  values flag answers ops should prioritise checking; null when unknown
   *  (legacy rows / full-page flow). */
  ocrConfidence?: number | null;
  /** True when this sub-key has no direct bbox and inherited its data from the
   *  integer-base bbox. Both the OR-attempted half and shared non-OR sub-parts
   *  set this so totalMax/ocrTotal can dedup correctly. */
  sharedBaseBbox?: boolean;
  /** Source of the displayed answer text: "ai" = ai_ocr_corrections,
   *  "ocr" = answer_bboxes. Undefined on flows that don't load corrections. */
  textSource?: "ai" | "ocr";
}

interface QuestionRowProps {
  question: QuestionRowData;
  /** Ref callback so parent can manage focus/keyboard navigation */
  markInputRef?: (el: HTMLInputElement | null) => void;
  /** Clicking into marks or answer text is what starts the section's timing. */
  onActivity?: () => void;
  onChange: (patch: Partial<QuestionRowData>) => void;
  onSaveAnswer: () => void;
  onCancelAnswer: () => void;
  onReset: () => void;
  /** Called when Enter is pressed in the marks input */
  onMarkEnter?: () => void;
  onSaveMarks?: () => void;
  /** Called on blur of the editable Max field — persists the max_marks override. */
  onSaveMaxMarks?: () => void;
  latexPreview?: boolean;
  /** When true, render chemical structures detected in the answer text
   *  (non-vision) below the answer. Mirrors latexPreview. Pipeline editor only. */
  chemPreview?: boolean;

  /** Called when user clicks Extract — parent enters selection mode */
  onExtract?: (questionId: string) => void;
  /** The question ID currently in selection mode */
  activeExtractId?: string | null;
  /** Whether OCR is currently loading for this question */
  extractLoading?: boolean;

  /** Published-flow only: render a Verified checkbox bound to question.verified.
   *  Pipeline omits this prop → no checkbox renders → Pipeline unchanged. */
  showVerifiedCheckbox?: boolean;

  /** Chemistry: enable the per-answer "Has chemical structure" control.
   *  When provided, ticking it calls onRecognizeStructure (DECIMER on the crop). */
  showStructureControl?: boolean;
  onRecognizeStructure?: () => void;
  /** Whether DECIMER recognition is currently running for this answer. */
  recognizeLoading?: boolean;
  /** Called when the operator picks a different MCQ choice from the dropdown. */
  onMcqChange?: (value: string | null) => void;
}


const isDirty = (q: QuestionRowData) =>
  q.marks !== q.ocrMarks || q.answer !== q.ocrAnswer;



export default function QuestionRow({
  question: q,
  markInputRef,
  onActivity,
  onChange,
  onSaveAnswer,
  onCancelAnswer,
  onReset,
  onMarkEnter,
  onSaveMarks,
  onSaveMaxMarks,
  latexPreview,
  chemPreview,
  onExtract,
  activeExtractId,
  extractLoading,
  showVerifiedCheckbox,
  showStructureControl,
  onRecognizeStructure,
  recognizeLoading,
  onMcqChange,
}: QuestionRowProps) {
  const dirty = isDirty(q);
  const markWrong = q.marks !== q.ocrMarks;
  const ansWrong = q.answer !== q.ocrAnswer;

  const isThisActive = activeExtractId === q.qNo;
  const isThisLoading = isThisActive && !!extractLoading;

  const [showQuestion, setShowQuestion] = useState(false);
  const [showAnswerKey, setShowAnswerKey] = useState(false);

  const displayAnswer = stripMoleculeFences(q.answer);

  const handleMarkKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      onMarkEnter?.();
    }
  };

  return (
    <div
      className={`rounded-xl border transition overflow-hidden ${dirty
        ? "border-amber-200 bg-amber-50/40"
        : "border-gray-100 bg-white hover:border-gray-200"
        }`}
    >
      {/* Source of the answer text below: AI = ai_ocr_corrections, OCR = answer_bboxes */}
      {q.textSource != null && (
        <div className="px-4 pt-3">
          <span
            title={
              q.textSource === "ai"
                ? "This answer text comes from the AI verification run (ai_ocr_corrections), which re-read the crop."
                : "This answer text is the original pipeline OCR output (answer_bboxes). No AI correction exists for this question."
            }
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-sm font-semibold ${
              q.textSource === "ai"
                ? "bg-purple-100 text-purple-700"
                : "bg-gray-100 text-gray-500"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                q.textSource === "ai" ? "bg-purple-500" : "bg-gray-400"
              }`}
            />
            {q.textSource === "ai" ? "AI corrected" : "OCR"}
          </span>
        </div>
      )}

      <div className="flex items-start gap-4 px-4 py-3">

        {/* Q number badge */}
        <div className="flex flex-col items-center gap-1 shrink-0 mt-0.5">
          <div
            className={`w-12 h-12 rounded-lg flex items-center justify-center text-base font-bold ${dirty ? "bg-amber-100 text-amber-700" : "bg-gray-100 text-gray-500"
              }`}
          >
            Q{q.qNo.replace(/^q/i, "").split("_OR_")[0]}
          </div>
        </div>

        {/* ── Answer block ── */}
        <div className="flex-1 min-w-0">
          {q.answerEditing ? (

            /* Edit state */
            <div className="flex flex-col gap-2 ">
              <textarea
                autoFocus
                onFocus={onActivity}
                value={q.answerDraft}
                onChange={e => onChange({ answerDraft: e.target.value })}
                rows={5}
                className="w-full h-[calc(100vh-220px)] text-xl text-gray-800 border border-indigo-300 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-100 resize-y bg-white leading-relaxed"
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={onSaveAnswer}
                  className="h-10 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-base font-semibold rounded-lg transition"
                >
                  Save Answer
                </button>
                <button
                  onClick={onCancelAnswer}
                  className="h-10 px-3 bg-gray-100 hover:bg-gray-200 text-gray-600 text-base font-semibold rounded-lg transition"
                >
                  Cancel
                </button>
              </div>
            </div>

          ) : (

            /* View state */
            <div className="flex items-start gap-2 group cursor-pointer min-h-[300px]" onDoubleClick={() => onChange({ answerEditing: true, answerDraft: toEditableMolecules(q.answer) })}>
              {/* ── This is the only part that changes ── */}
              {latexPreview ? (
                <div className={`flex-1 min-w-0 whitespace-pre-wrap leading-relaxed ${ansWrong ? "text-amber-800" : "text-gray-700"}`}>
                  {displayAnswer.trim() ? <LatexPreview text={displayAnswer} /> : <span className="text-gray-300 italic font-medium">N/A</span>}
                  {ansWrong && (
                    <span className="ml-2 text-base font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
                      edited
                    </span>
                  )}
                </div>
              ) : (
                <p className={`text-xl font-semibold flex-1 leading-relaxed ${ansWrong ? "text-amber-800" : "text-gray-700"}`}>
                  {displayAnswer.trim() ? displayAnswer : <span className="text-gray-300 italic font-medium">N/A</span>}
                  {ansWrong && (
                    <span className="ml-2 text-base font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">
                      edited
                    </span>
                  )}
                </p>
              )}
              <button
                onClick={() => onChange({ answerEditing: true, answerDraft: toEditableMolecules(q.answer) })}
                className="opacity-0 group-hover:opacity-100 transition text-gray-400 hover:text-indigo-600 shrink-0 mt-0.5"
                title="Edit answer"
              >
                <Pencil size={18} />
              </button>
            </div>

          )}

          {/* Chemical structures detected in the answer text (non-vision).
              Gated by the header chem toggle; renders nothing when none found.
              Names are corrected by editing the answer text's "Molecules:" line. */}
          {chemPreview && !q.answerEditing && <DetectedStructures text={q.answer} />}

          {/* Original OCR answer shown as strikethrough when changed */}
          {ansWrong && !q.answerEditing && (
            <p className="text-xs text-gray-400 mt-1 line-through">{q.ocrAnswer}</p>
          )}

          {/* MCQ normalized choice — shown for MCQ questions */}
          {q.questionType?.toUpperCase() === "MCQ" && !q.answerEditing && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs font-medium text-gray-400">MCQ Choice</span>
              <div className="flex gap-1">
                {["A", "B", "C", "D", "E"].map(letter => (
                  <button
                    key={letter}
                    onClick={() => onMcqChange?.(q.mcqNormalized === letter ? null : letter)}
                    className={`w-8 h-8 rounded-lg text-sm font-bold border transition ${q.mcqNormalized === letter
                      ? "bg-indigo-600 border-indigo-600 text-white"
                      : "bg-white border-gray-200 text-gray-500 hover:border-indigo-400 hover:text-indigo-600"
                      }`}
                  >
                    {letter}
                  </button>
                ))}
                <button
                  onClick={() => onMcqChange?.(null)}
                  className={`px-2 h-8 rounded-lg text-xs font-bold border transition ${q.mcqNormalized === null || q.mcqNormalized === undefined
                    ? "bg-gray-200 border-gray-300 text-gray-600"
                    : "bg-white border-gray-200 text-gray-400 hover:border-red-300 hover:text-red-500"
                    }`}
                >
                  N/A
                </button>
              </div>
            </div>
          )}
        </div>

        {/* ── Marks block ── */}
        <div className="flex flex-col items-center gap-2 shrink-0">

          {/* OCR value — hidden from the card; comparisons against it
              (markWrong, auto-save trigger, etc.) are unchanged. */}
          {/* <div className="text-center">
            <p className="text-base font-medium text-gray-400 mb-1">OCR</p>
            <span
              className={`text-base font-mono font-semibold ${markWrong ? "line-through text-red-400" : "text-gray-600"
                }`}
            >
              {q.ocrMarks}
            </span>
          </div> */}

          {/* Editable marks */}
          <div className="text-center">
            <p className="text-base font-medium text-gray-400 mb-1">Marks</p>
            <input
              ref={markInputRef}
              onFocus={onActivity}
              type="number"
              min={0}
              max={q.maxMarks}
              value={q.marks}
              onChange={e => {
                // #S12: callers coalesce maxMarks to 0 when it's actually
                // unknown (see PipelineEditor's maxMarks derivation and
                // PublishedEditor's `a.maxMarks ?? 0`), so Math.min(0, x)
                // silently clamped every typed mark to 0 on those rows.
                // Clamp against wholeMarks (the same fallback ceiling already
                // used for the Max field/display below) when maxMarks isn't
                // meaningfully known, and don't clamp at all if neither is set.
                const ceiling = q.maxMarks || q.wholeMarks || Infinity;
                onChange({
                  marks: Math.min(ceiling, Math.max(0, Number(e.target.value) || 0)),
                });
              }}
              onKeyDown={handleMarkKey}
              onBlur={() => {
                if (q.marks !== q.ocrMarks) onSaveMarks?.();
              }}
              className={`w-12 h-9 text-center text-base font-bold rounded-lg border outline-none transition focus:ring-2 ${markWrong
                ? "bg-amber-100 border-amber-300 text-amber-800 focus:ring-amber-200 focus:border-amber-400"
                : "bg-gray-50 border-gray-200 text-gray-800 focus:ring-indigo-100 focus:border-indigo-400"
                }`}
            />
          </div>

          {/* Editable when a save handler is wired; read-only otherwise. */}
          <div className="text-center">
            <p className="text-base font-medium text-gray-400 mb-1">Max</p>
            {onSaveMaxMarks ? (
              <input
                type="number"
                min={0}
                value={q.maxMarks || q.wholeMarks || 0}
                onChange={e =>
                  onChange({ maxMarks: Math.max(0, Number(e.target.value) || 0) })
                }
                onBlur={() => onSaveMaxMarks()}
                title="Edit the maximum marks for this question"
                className="w-12 h-9 text-center text-base font-semibold font-mono rounded-lg border border-gray-200 bg-gray-50 text-gray-500 outline-none transition focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 focus:text-gray-800"
              />
            ) : (
              <span className="text-base font-semibold font-mono text-gray-400">
                {q.maxMarks || q.wholeMarks || 0}
              </span>
            )}
          </div>

          {q.wholeMarks != null && q.wholeMarks > 0 && (
            <div className="text-center">
              <p className="text-base font-medium text-blue-400 mb-1">Whole</p>
              <span className="text-base font-semibold font-mono text-blue-400">{q.wholeMarks}</span>
            </div>
          )}

          {/* OCR confidence (from GLM-OCR token logprobs). Green = safe to skip,
              red = prioritise checking. Hidden when unknown (legacy rows). */}
          {q.ocrConfidence != null && (
            <div
              className="text-center"
              title="OCR extraction confidence from GLM-OCR token logprobs — low values are the ones worth checking."
            >
              <p className="text-base font-medium text-gray-400 mb-1">Conf</p>
              <span
                className={`text-base font-semibold font-mono ${
                  q.ocrConfidence >= 0.95
                    ? "text-green-500"
                    : q.ocrConfidence >= 0.8
                      ? "text-amber-500"
                      : "text-red-500"
                }`}
              >
                {Math.round(q.ocrConfidence * 100)}%
              </span>
            </div>
          )}


          {/* Verified checkbox (Published flow only) — upstream is the
              "OCR ✓" variant bound to ocrVerified, retained from main. */}
          {showVerifiedCheckbox && (
            <label className="flex flex-col items-center text-center cursor-pointer select-none">
              <span className="text-base font-medium text-gray-400 mb-1">OCR ✓</span>
              <input
                type="checkbox"
                checked={!!q.ocrVerified}
                onChange={e => onChange({ ocrVerified: e.target.checked })}
                className="w-5 h-5 accent-indigo-600 cursor-pointer"
              />
            </label>
          )}
        </div>
      </div>

      {/* ── Inline crop preview — only when the bbox has a stored crop URL. ──
           Removes the need to open the PDF panel for routine review; the
           operator sees exactly what model gets fed when they click Extract. */}
      {q.croppedImageUrl && (
        <div className="flex gap-2 px-4 pb-2 pt-0">
          <div className="w-12 shrink-0" />
          <div className="flex-1 min-w-0 rounded-lg border border-gray-100 bg-gray-50 overflow-x-auto">
            {/* native <img> — these crops are small (50-200 KB) and the URL is on a
                separate R2 origin so Next/Image optimisation would force same-origin
                proxying for no win. Render at intrinsic pixel size; container
                scrolls horizontally when a crop is wider than the row. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={q.croppedImageUrl}
              alt={`Cropped answer for Q${q.qNo}`}
              className="block bg-white"
              loading="lazy"
            />
          </div>
        </div>
      )}

      {/* ── Chemistry: recognized structure (RDKit.js), shown under the crop ── */}
      {q.structureSmiles && (
        <div className="flex gap-2 px-4 pb-2 pt-0">
          <div className="w-12 shrink-0" />
          <div>
            <div className="text-[10px] font-semibold text-violet-600 mb-1">Recognized structure</div>
            <StructureRenderer smiles={q.structureSmiles} />
          </div>
        </div>
      )}

      {/* ── Action row ── */}
      <div className="flex flex-col px-4 pb-3 pt-0">
        <div className="flex items-center gap-4 border-t border-gray-100 pt-3 mt-1">
          <div className="w-12 shrink-0" /> {/* spacer aligned with Q badge */}

          <div className="flex items-center gap-3 flex-1">
            {onExtract && (
              <ExtractButton
                questionId={q.qNo}
                isActive={isThisActive}
                isLoading={isThisLoading}
                onExtract={onExtract}
              />
            )}

            {/* Chemistry: per-answer structure flag → on-demand DECIMER recognition */}
            {showStructureControl && (
              <label className="flex items-center gap-1.5 text-xs font-medium text-violet-700 cursor-pointer whitespace-nowrap">
                <input
                  type="checkbox"
                  checked={Boolean(q.hasStructure)}
                  disabled={recognizeLoading}
                  onChange={(e) => {
                    onChange({ hasStructure: e.target.checked });
                    if (e.target.checked) onRecognizeStructure?.();
                  }}
                  className="w-4 h-4 accent-violet-600"
                />
                {recognizeLoading ? "Recognizing structure…" : "Has chemical structure"}
              </label>
            )}

            <button
              onClick={() => q.questionText && setShowQuestion(!showQuestion)}
              disabled={!q.questionText}
              title={!q.questionText ? "No question text available" : undefined}
              className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md transition
                ${!q.questionText
                  ? "text-gray-300 cursor-not-allowed"
                  : showQuestion
                    ? "bg-indigo-50 text-indigo-700"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                }`}
            >
              <BookOpen size={14} />
              {showQuestion ? "Hide Question" : "View Question"}
            </button>

            <button
              onClick={() => q.answerKey && setShowAnswerKey(!showAnswerKey)}
              disabled={!q.answerKey}
              title={!q.answerKey ? "No answer key available" : undefined}
              className={`flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-md transition
                ${!q.answerKey
                  ? "text-gray-300 cursor-not-allowed"
                  : showAnswerKey
                    ? "bg-emerald-50 text-emerald-700"
                    : "text-gray-500 hover:bg-gray-50 hover:text-gray-700"
                }`}
            >
              <KeyRound size={14} />
              {showAnswerKey ? "Hide Answer Key" : "View Answer Key"}
            </button>
          </div>
        </div>

        {/* ── Expanded Question/Answer Key Views ── */}
        {(showQuestion || showAnswerKey) && (
          <div className="flex gap-4 mt-3 pl-[4rem]">
            {showQuestion && q.questionText && (
              <div className="flex-1 bg-indigo-50/50 border border-indigo-100 rounded-lg p-4">
                <p className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2">Question Text</p>
                <div className="text-sm text-gray-700 leading-relaxed overflow-x-auto">
                  <LatexPreview text={q.questionText} />
                </div>
              </div>
            )}

            {showAnswerKey && q.answerKey && (
              <div className="flex-1 bg-emerald-50/50 border border-emerald-100 rounded-lg p-4">
                <p className="text-xs font-bold text-emerald-500 uppercase tracking-wider mb-2">Answer Key</p>
                <div className="text-sm text-gray-700 leading-relaxed overflow-x-auto">
                  <LatexPreview text={q.answerKey} />
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}