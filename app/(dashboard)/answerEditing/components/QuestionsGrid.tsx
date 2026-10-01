"use client";

import { useState } from "react";
import { RotateCcw, CheckCheck, LayoutGrid, Rows3 } from "lucide-react";
import type { QuestionRowData } from "../../../components/Questionrow";

// ─────────────────────────────────────────────────────────────────────────────

type ViewMode = "grid" | "list";

type Props = {
  questions:      QuestionRowData[];
  // Kept for call-site compatibility; the paper-style grid has no steppers
  // (stepping remains available in list view / per-question rows).
  onStep?:        (qNo: string, delta: number) => void;
  // Called on blur/Enter with the raw typed value; the parent clamps + saves.
  // (Per-keystroke clamping made multi-digit entry impossible: typing "22" on
  // a 3-mark question clamped to 3 at the first re-render.)
  onMarksCommitValue: (qNo: string, raw: string) => void;
  onActivity?: () => void;
  onApproveAll:   () => void;
  onResetAll:     () => void;
  // Authoritative paper total (question_papers.max_marks). Per-question sums
  // over-count internal-choice papers, so when present this wins the banner.
  paperMaxMarks?: number | null;
  viewMode:       ViewMode;
  onToggleView:   () => void;
};

function byQNo(a: QuestionRowData, b: QuestionRowData) {
  const na = parseFloat(a.qNo.replace(/[^0-9.]/g, ""));
  const nb = parseFloat(b.qNo.replace(/[^0-9.]/g, ""));
  if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
  return a.qNo.localeCompare(b.qNo);
}

// Questions per band — mirrors the printed cover grid (1–20 / 21–40).
const BAND_SIZE = 20;

// One editable Marks Obtained cell. Holds the raw text locally while the
// operator types (so "22" isn't clamped to max at the first keystroke) and
// hands the value to the parent only on blur/Enter. An emptied cell reverts
// instead of committing 0.
function MarkCell({
  label, row, onCommit, onActivity,
}: {
  label: string;
  row: QuestionRowData;
  onCommit: (qNo: string, raw: string) => void;
  onActivity?: () => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const changed = row.marks !== row.ocrMarks;
  return (
    <td className={`border border-gray-300 p-0 text-center ${changed ? "bg-amber-50" : "bg-white"}`}>
      <input
        type="number"
        min={0}
        step="0.5"
        value={draft ?? String(row.marks)}
        onFocus={e => { onActivity?.(); e.target.select(); }}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null && draft.trim() !== "") onCommit(row.qNo, draft);
          setDraft(null);
        }}
        onKeyDown={e => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
        aria-label={`Marks for question ${label}`}
        className={`w-full h-9 min-w-[44px] text-center text-lg font-bold outline-none bg-transparent focus:ring-2 focus:ring-inset [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
          changed
            ? "text-amber-800 focus:ring-amber-300"
            : "text-gray-800 focus:ring-indigo-300"
        }`}
      />
    </td>
  );
}

export default function QuestionsGrid({
  questions, onMarksCommitValue, onActivity, onApproveAll, onResetAll, viewMode, onToggleView, paperMaxMarks,
}: Props) {
  if (questions.length === 0) return null;

  const sorted = [...questions].sort(byQNo);

  // Group by integer base. Sub-part slots ("17.1"…) either mirror the integer
  // parent's marks or carry fractional placeholders, so the grid — like the
  // printed cover grid it mirrors — shows ONE cell per physical question:
  // the integer parent when present, else (legacy OR-only groups) the
  // attempted decimal row, labeled with its base number.
  const baseOf = (qNo: string) => {
    const n = parseFloat(qNo);
    return Number.isNaN(n) ? qNo : String(Math.floor(n));
  };
  const byBase = new Map<string, QuestionRowData[]>();
  for (const q of sorted) {
    const b = baseOf(q.qNo);
    const group = byBase.get(b);
    if (group) group.push(q); else byBase.set(b, [q]);
  }

  const entries: { label: string; row: QuestionRowData }[] = [];
  let correctedSum = 0;
  let maxSum = 0;
  for (const [base, group] of byBase) {
    const parent = group.find(q => !q.qNo.includes("."));
    const row = parent ?? group.reduce((a, b) => ((Number(b.marks) || 0) > (Number(a.marks) || 0) ? b : a));
    entries.push({ label: base, row });
    correctedSum += Number(row.marks) || 0;
    // Paper denominator: the parent question's full marks, once per base.
    const ref = parent ?? group[0];
    maxSum += Number(ref.wholeMarks) || Number(ref.maxMarks) || 0;
  }

  const bands: (typeof entries)[] = [];
  for (let i = 0; i < entries.length; i += BAND_SIZE) {
    bands.push(entries.slice(i, i + BAND_SIZE));
  }

  const editedCount = sorted.filter(q => q.marks !== q.ocrMarks).length;

  return (
    <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 bg-gray-50">
        <div>
          <p className="text-xs font-bold text-gray-700 uppercase tracking-wider">
            All Questions
          </p>
          <p className="text-[11px] text-gray-400">
            Questions {entries[0]?.label}–{entries[entries.length - 1]?.label}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-100">
            CORRECTED {correctedSum} / {paperMaxMarks || maxSum}
          </span>
          {/* Grid / List toggle — switch back to the normal per-question view
              (cropped image, full answer text, etc.) to double-check a row,
              then flip back to the compact grid for fast review. */}
          <div className="flex items-center rounded-lg border border-gray-200 overflow-hidden">
            <button
              onClick={() => viewMode !== "grid" && onToggleView()}
              title="Marks grid (mirrors the paper's cover grid)"
              className={`flex items-center gap-1 h-7 px-2 text-[11px] font-semibold transition ${
                viewMode === "grid"
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-500 hover:bg-gray-100"
              }`}
            >
              <LayoutGrid size={11} /> Grid
            </button>
            <button
              onClick={() => viewMode !== "list" && onToggleView()}
              title="Original per-question view"
              className={`flex items-center gap-1 h-7 px-2 text-[11px] font-semibold border-l border-gray-200 transition ${
                viewMode === "list"
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-gray-500 hover:bg-gray-100"
              }`}
            >
              <Rows3 size={11} /> List
            </button>
          </div>
        </div>
      </div>

      {viewMode === "grid" && (
        <>
          {/* Paper-style marks grid: one band of up to 20 questions per table,
              question numbers on top, editable Marks Obtained cells beneath —
              the same layout as the grid printed on the answer booklet cover,
              so ops can compare against the page-1 scan cell by cell. */}
          <div className="flex flex-col gap-4 p-4">
            {bands.map((band, bi) => (
              <div key={bi} className="overflow-x-auto">
                <table className="border-collapse w-full">
                  <tbody>
                    <tr>
                      <th className="border border-gray-300 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-600 text-left whitespace-nowrap w-32">
                        Question No.
                      </th>
                      {band.map(({ label, row }) => (
                        <th key={label} className="border border-gray-300 bg-gray-50 px-1 py-0.5 text-center min-w-[44px]">
                          <div className="text-xs font-bold text-gray-700 leading-tight">{label}</div>
                          <div className="text-[9px] font-normal text-gray-400 leading-tight">
                            {/* The question's own max_marks — NOT wholeMarks
                                (parent total), which over-states sub-part and
                                internal-choice questions. */}
                            / {Number(row.maxMarks) || Number(row.wholeMarks) || "–"}
                          </div>
                        </th>
                      ))}
                    </tr>
                    <tr>
                      <th className="border border-gray-300 bg-gray-50 px-2 py-1 text-[11px] font-semibold text-gray-600 text-left whitespace-nowrap">
                        Marks Obtained
                      </th>
                      {band.map(({ label, row }) => (
                        <MarkCell key={label} label={label} row={row} onCommit={onMarksCommitValue} onActivity={onActivity} />
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            ))}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100">
            <span className="text-[11px] text-gray-400">
              {editedCount === 0
                ? "No changes from OCR"
                : `${editedCount} question${editedCount === 1 ? "" : "s"} edited`}
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={onResetAll}
                disabled={editedCount === 0}
                className="flex items-center gap-1.5 h-7 px-2.5 text-[11px] font-semibold text-gray-500 hover:text-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition"
              >
                <RotateCcw size={11} /> Reset edits
              </button>
              <button
                onClick={onApproveAll}
                className="flex items-center gap-1.5 h-7 px-3 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition"
              >
                <CheckCheck size={11} /> Approve all
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
