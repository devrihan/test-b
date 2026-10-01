"use client";

import { useRef } from "react";
import {
  Loader2, Pencil, Check, X, AlertCircle, Trash2, Plus, ScanLine, WrapText,
} from "lucide-react";
import LatexPreview from "../../../../components/LatexPreview";
import StructureRenderer from "../../../../components/StructureRenderer";
import type { QuestionListItemDTO, EditState } from "../../lib/types";

interface QuestionCardProps {
  q: QuestionListItemDTO;
  editState: EditState;
  onEdit: (q: QuestionListItemDTO) => void;
  onCancel: () => void;
  onSave: (id: number) => void;
  onDelete: (id: number) => void;
  onAddBelow: (qNumber: number) => void;
  onFormChange: (patch: Partial<QuestionListItemDTO>) => void;
  onReExtract: (q: QuestionListItemDTO) => void;
  onEditDiagram: (q: QuestionListItemDTO) => void;
  saveError: string | null;
}

function InlineError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs font-medium">
      <AlertCircle size={13} className="shrink-0" />
      {message}
    </div>
  );
}

export default function QuestionCard({
  q, editState, onEdit, onCancel, onSave, onDelete, onAddBelow,
  onFormChange, onReExtract, onEditDiagram, saveError,
}: QuestionCardProps) {
  const isEditing =
    (editState.status === "editing" || editState.status === "saving") &&
    editState.questionId === q.id;
  const isSaving = editState.status === "saving" && editState.questionId === q.id;
  const form = isEditing ? (editState as Extract<EditState, { status: "editing" | "saving" }>).form : {};

  const questionTextRef = useRef<HTMLTextAreaElement>(null);
  const applyHangingIndent = () => {
    const el = questionTextRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd, value } = el;
    const selected = value.slice(selectionStart, selectionEnd);
    const inserted = `**${selected}**`;
    const newValue = value.slice(0, selectionStart) + inserted + value.slice(selectionEnd);
    onFormChange({ questionText: newValue });
    requestAnimationFrame(() => {
      el.focus();
      if (selected) {
        el.setSelectionRange(selectionStart, selectionStart + inserted.length);
      } else {
        const caret = selectionStart + 2;
        el.setSelectionRange(caret, caret);
      }
    });
  };

  return (
    <div
      id={`q-card-${q.id}`}
      className={`bg-white border ${isEditing ? "border-indigo-300 ring-2 ring-indigo-50" : "border-gray-200"} rounded-xl p-4 sm:p-5 shadow-sm transition-all overflow-hidden`}
    >
      {/* Card header: action buttons + metadata badges */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <div className="flex flex-wrap items-center gap-2">
          {isEditing ? (
            <>
              <button
                onClick={() => onSave(q.id)}
                disabled={isSaving}
                className="flex items-center gap-1 bg-indigo-600 text-white px-3 py-1 rounded-md text-xs font-medium hover:bg-indigo-700 disabled:opacity-50"
              >
                {isSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                Save
              </button>
              <button
                onClick={onCancel}
                disabled={isSaving}
                className="flex items-center gap-1 bg-gray-200 text-gray-700 px-3 py-1 rounded-md text-xs font-medium hover:bg-gray-300 disabled:opacity-50"
              >
                <X size={12} /> Cancel
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => onEdit(q)}
                className="flex items-center gap-1 text-gray-500 hover:text-indigo-600 px-2 py-1 rounded-md text-xs font-medium transition"
              >
                <Pencil size={12} /> Edit
              </button>
              <button
                onClick={() => onReExtract(q)}
                title="Re-extract this question's text via OCR"
                className="flex items-center gap-1 text-gray-500 hover:text-violet-600 px-2 py-1 rounded-md text-xs font-medium transition"
              >
                <ScanLine size={12} /> Re-extract
              </button>
              {q.diagramBbox && (
                <button
                  onClick={() => onEditDiagram(q)}
                  title="Fix diagram bounding box"
                  className="flex items-center gap-1 text-gray-500 hover:text-amber-600 px-2 py-1 rounded-md text-xs font-medium transition"
                >
                  <ScanLine size={12} /> Fix Diagram
                </button>
              )}
              <button
                onClick={() => onAddBelow(q.questionNumber)}
                title="Add question below this one"
                className="flex items-center gap-1 text-gray-500 hover:text-emerald-600 px-2 py-1 rounded-md text-xs font-medium transition"
              >
                <Plus size={12} /> Add
              </button>
              <button
                onClick={() => onDelete(q.id)}
                className="flex items-center gap-1 text-gray-500 hover:text-red-600 px-2 py-1 rounded-md text-xs font-medium transition"
              >
                <Trash2 size={12} /> Delete
              </button>
            </>
          )}
        </div>

        <div className="flex flex-wrap gap-2 text-xs font-semibold text-gray-500 items-center">
          {isEditing ? (
            <div className="flex items-center gap-1">
              <input
                type="text"
                placeholder="Group"
                value={form.optionGroup ?? ""}
                onChange={(e) => onFormChange({ optionGroup: e.target.value || null })}
                className="w-16 px-2 py-1 border border-indigo-200 rounded-md text-xs font-mono"
                title="Option Group"
              />
              <input
                type="text"
                placeholder="Set"
                value={form.optionSet ?? ""}
                onChange={(e) => onFormChange({ optionSet: e.target.value || null })}
                className="w-12 px-2 py-1 border border-indigo-200 rounded-md text-xs font-mono"
                title="Option Set"
              />
              <input
                type="number"
                placeholder="Picks"
                value={form.pickCount ?? ""}
                onChange={(e) => onFormChange({ pickCount: Number(e.target.value) || null })}
                className="w-14 px-2 py-1 border border-indigo-200 rounded-md text-xs font-mono"
                title="Pick Count"
              />
            </div>
          ) : (
            (q.optionGroup || q.optionSet || q.pickCount) && (
              <span className="bg-indigo-50 text-indigo-700 border border-indigo-200 px-2 py-1 rounded-md text-[10px]">
                {q.optionGroup ? `Grp: ${q.optionGroup}` : ""}
                {q.optionSet ? ` | Set: ${q.optionSet}` : ""}
                {q.pickCount ? ` | Pick: ${q.pickCount}` : ""}
              </span>
            )
          )}

          {isEditing ? (
            <select
              value={form.questionType ?? ""}
              onChange={(e) => onFormChange({ questionType: e.target.value })}
              className="px-2 py-1 border border-gray-300 rounded-md text-xs font-semibold text-gray-700 bg-white"
            >
              <option value="" disabled>Select Type</option>
              <option value="MCQ">MCQ</option>
              <option value="VSA">VSA</option>
              <option value="SA">SA</option>
              <option value="LA">LA</option>
              <option value="CASE_STUDY">CASE_STUDY</option>
            </select>
          ) : (
            q.questionType && (
              <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded-md">{q.questionType}</span>
            )
          )}

          {isEditing ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                step="any"
                value={form.maxMarks ?? ""}
                onChange={(e) => onFormChange({ maxMarks: parseFloat(e.target.value) || 0 })}
                className="w-16 px-2 py-1 border border-gray-300 rounded-md text-xs font-mono"
              />
              <span>Marks</span>
            </div>
          ) : (
            <span className="bg-gray-100 px-2 py-1 rounded-md">{q.maxMarks} Marks</span>
          )}

          {isEditing ? (
            <select
              value={form.bloomTaxonomy ?? ""}
              onChange={(e) => onFormChange({ bloomTaxonomy: e.target.value || null })}
              className="px-2 py-1 border border-gray-300 rounded-md text-xs font-semibold text-gray-700 bg-white"
            >
              <option value="">Bloom&apos;s Taxonomy…</option>
              <option value="Knowledge">Knowledge</option>
              <option value="Understanding">Understanding</option>
              <option value="Application">Application</option>
              <option value="Skill">Skill</option>
            </select>
          ) : (
            q.bloomTaxonomy && (
              <span className="bg-pink-50 text-pink-600 px-2 py-1 rounded-md">{q.bloomTaxonomy}</span>
            )
          )}

          {isEditing ? (
            <select
              value={form.difficultyLevel ?? ""}
              onChange={(e) => onFormChange({ difficultyLevel: e.target.value || null })}
              className="px-2 py-1 border border-gray-300 rounded-md text-xs font-semibold text-gray-700 bg-white"
            >
              <option value="" disabled>Difficulty…</option>
              <option value="Easy">Easy</option>
              <option value="Moderate">Moderate</option>
              <option value="Hard">Hard</option>
            </select>
          ) : (
            q.difficultyLevel && (
              <span className="bg-amber-50 text-amber-600 px-2 py-1 rounded-md">{q.difficultyLevel}</span>
            )
          )}
        </div>
      </div>

      {/* Question body: number badge + text / LaTeX preview */}
      <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4 mb-6">
        <div className="flex flex-col items-center gap-1 shrink-0 mt-1">
          {isEditing ? (
            <input
              type="number"
              step="any"
              value={form.questionNumber ?? ""}
              onChange={(e) => onFormChange({ questionNumber: e.target.value === "" ? undefined : parseFloat(e.target.value) })}
              className="inline-flex items-center justify-center w-14 h-8 rounded-full bg-indigo-50 text-indigo-700 font-bold text-sm border border-indigo-200 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-center"
            />
          ) : (
            <span className="inline-flex items-center justify-center min-w-8 px-2 h-8 rounded-full bg-indigo-50 text-indigo-700 font-bold text-sm">
              {q.questionNumber}
            </span>
          )}

          {q.questionLabel && !isEditing && (
            <div className="bg-white text-gray-600 text-[11px] font-extrabold px-2 py-0.5 rounded shadow-sm border border-gray-200 mt-1 min-w-[32px] text-center whitespace-nowrap">
              {q.questionLabel}
            </div>
          )}
          {isEditing && (
            <div className="mt-1 flex flex-col items-center">
              <span className="text-[8px] font-bold text-gray-400 uppercase tracking-widest mb-0.5">Label</span>
              <input
                type="text"
                placeholder="Ex: 2(a)"
                value={form.questionLabel ?? ""}
                onChange={(e) => onFormChange({ questionLabel: e.target.value || null })}
                className="w-16 px-1.5 py-1 text-[11px] font-bold text-center border border-indigo-200 rounded-md text-gray-700 focus:outline-none focus:border-indigo-400 shadow-sm"
              />
            </div>
          )}
        </div>

        <div className="flex-1 w-full text-sm text-gray-800 bg-gray-50 p-3 sm:p-4 rounded-lg border border-gray-100 overflow-x-auto">
          {isEditing ? (
            <div>
              <div className="flex justify-end mb-1">
                <button
                  type="button"
                  onClick={applyHangingIndent}
                  title="Wrap the selected text as a hanging-indent label (e.g. Assertion (A):)"
                  className="flex items-center gap-1 text-[10px] font-semibold text-gray-500 hover:text-indigo-600 px-2 py-1 rounded-md border border-gray-200 hover:border-indigo-300 transition"
                >
                  <WrapText size={11} /> Hanging indent
                </button>
              </div>
              <textarea
                ref={questionTextRef}
                value={form.questionText ?? ""}
                onChange={(e) => onFormChange({ questionText: e.target.value })}
                className="w-full h-40 p-3 text-xs font-mono border border-indigo-300 rounded-md focus:ring-2 focus:ring-indigo-500 focus:outline-none bg-white"
                placeholder="LaTeX question text"
              />
            </div>
          ) : (
            <LatexPreview tex={q.questionText} />
          )}
        </div>
      </div>

      {q.hasDiagram && q.diagramCropUrl && (
        <div className="mt-3">
          <span className="inline-block text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 mb-1.5">
            Has diagram
          </span>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={q.diagramCropUrl}
            alt="Question diagram"
            className="max-h-64 rounded-lg border border-gray-200 object-contain"
          />
        </div>
      )}

      {(q.hasQuestionChemicalStructure || q.hasAnswerChemicalStructure) && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {q.hasQuestionChemicalStructure && (
            <span className="inline-block text-[10px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-200">
              Structure in question
            </span>
          )}
          {q.hasAnswerChemicalStructure && (
            <span className="inline-block text-[10px] font-bold text-violet-600 bg-violet-50 px-2 py-0.5 rounded-full border border-violet-200">
              Structure in answer
            </span>
          )}
        </div>
      )}

      {q.questionStructureSmiles && (
        <div className="mt-2">
          <div className="text-[10px] font-semibold text-violet-600 mb-1">
            Recognized structure <code className="text-gray-400 font-normal">{q.questionStructureSmiles}</code>
          </div>
          <StructureRenderer smiles={q.questionStructureSmiles} />
        </div>
      )}

      {isEditing && saveError && (
        <div className="mt-3">
          <InlineError message={saveError} />
        </div>
      )}
    </div>
  );
}
