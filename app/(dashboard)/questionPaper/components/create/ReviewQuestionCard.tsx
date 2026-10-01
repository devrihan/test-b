"use client";

import { CheckCircle, Pencil, Plus, Trash2, WrapText } from "lucide-react";
import LatexPreview from "../../../../components/LatexPreview";
import DiagramEditor from "../../DiagramEditor";
import type { ParsedQuestion } from "../../lib/types";
import { TYPE_BADGE } from "../../lib/constants";
import type { NormBBox } from "../../DiagramEditor";

interface ReviewQuestionCardProps {
  q: ParsedQuestion;
  idx: number;
  editingKey: string | null;
  questionTextRef: (el: HTMLTextAreaElement | null) => void;
  onOpenEditor: (uiId: string) => void;
  onSave: () => void;
  onAddBelow: (idx: number) => void;
  onDelete: (idx: number) => void;
  onUpdate: <K extends keyof ParsedQuestion>(idx: number, field: K, value: ParsedQuestion[K]) => void;
  onApplyHangingIndent: (idx: number) => void;
  onToggleDiagram: (idx: number, on: boolean) => void;
  onToggleQuestionChemStructure: (idx: number, on: boolean) => void;
  onToggleAnswerChemStructure: (idx: number, on: boolean) => void;
  onRecropDiagram: (idx: number, bbox: NormBBox) => Promise<void>;
}

export default function ReviewQuestionCard({
  q, idx, editingKey,
  questionTextRef, onOpenEditor, onSave, onAddBelow, onDelete, onUpdate,
  onApplyHangingIndent, onToggleDiagram, onToggleQuestionChemStructure,
  onToggleAnswerChemStructure, onRecropDiagram,
}: ReviewQuestionCardProps) {
  const isEditing = editingKey === q._ui_id;
  const badgeClass = TYPE_BADGE[q.question_type] ?? "bg-gray-50 text-gray-600 border-gray-200";

  return (
    <div
      id={`q-card-${q._ui_id}`}
      className={`bg-white border rounded-xl transition-all shadow-sm ${
        isEditing ? "border-indigo-300 ring-2 ring-indigo-100" : "border-gray-200 hover:border-gray-300"
      }`}
    >
      {/* Card header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-b border-gray-100 bg-gray-50/50 rounded-t-xl">
        <div className="flex flex-wrap items-center gap-2.5">
          {isEditing ? (
            <input
              value={q.question_number}
              onChange={(e) => onUpdate(idx, "question_number", e.target.value)}
              className="w-24 h-7 px-2 text-xs font-bold border border-indigo-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-white text-center"
            />
          ) : (
            <span className="inline-flex items-center justify-center min-w-[28px] h-7 px-2 rounded-lg bg-indigo-600 text-white text-[11px] font-bold shadow-sm shrink-0">
              {q.question_number}
            </span>
          )}

          {isEditing ? (
            <select
              value={q.question_type}
              onChange={(e) => onUpdate(idx, "question_type", e.target.value)}
              className="h-7 px-2 text-xs border border-indigo-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-white"
            >
              <option value="MCQ">MCQ</option>
              <option value="VSA">Very Short Answer (VSA)</option>
              <option value="SA">Short Answer (SA)</option>
              <option value="LA">Long Answer (LA)</option>
              <option value="CASE_STUDY">Case Study</option>
            </select>
          ) : (
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badgeClass}`}>
              {q.question_type.replace(/_/g, " ").toUpperCase()}
            </span>
          )}

          {q.option_group && (
            <span
              className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600 border border-amber-200"
              title={`Group: ${q.option_group} | Set: ${q.option_set} | Pick: ${q.pick_count}`}
            >
              {q.option_set ? `Set ${q.option_set}` : "OR"}
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isEditing ? (
            <div className="flex items-center gap-1">
              <input
                type="number"
                value={q.max_marks}
                min={0}
                step="any"
                onChange={(e) => onUpdate(idx, "max_marks", parseFloat(e.target.value) || 0)}
                className="w-12 h-7 px-1 text-xs border border-indigo-200 rounded-lg text-center focus:outline-none focus:border-indigo-400 bg-white"
              />
              <span className="text-[10px] text-gray-400">M</span>
            </div>
          ) : (
            <span className="text-xs font-bold text-gray-600 bg-gray-100 px-2 py-0.5 rounded-md">
              {q.max_marks}M
            </span>
          )}

          <div className="w-px h-4 bg-gray-200" />

          {isEditing ? (
            <button
              onClick={onSave}
              className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition"
            >
              <CheckCircle size={11} /> Save
            </button>
          ) : (
            <button
              onClick={() => onOpenEditor(q._ui_id!)}
              className="p-1 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition"
              title="Edit question"
            >
              <Pencil size={12} />
            </button>
          )}

          <button
            onClick={() => onAddBelow(idx + 1)}
            className="p-1 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition"
            title="Insert question below"
          >
            <Plus size={12} />
          </button>

          <button
            onClick={() => onDelete(idx)}
            className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
            title="Delete question"
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {/* Card body */}
      <div className="px-4 py-2.5 space-y-2">
        {isEditing ? (
          <div className="space-y-2">
            <div className="flex justify-end">
              <button
                type="button"
                onClick={() => onApplyHangingIndent(idx)}
                title="Wrap the selected text as a hanging-indent label (e.g. Assertion (A):)"
                className="flex items-center gap-1 text-[10px] font-semibold text-gray-500 hover:text-indigo-600 px-2 py-1 rounded-md border border-gray-200 hover:border-indigo-300 transition"
              >
                <WrapText size={11} /> Hanging indent
              </button>
            </div>
            <textarea
              ref={questionTextRef}
              value={q.question_text}
              onChange={(e) => onUpdate(idx, "question_text", e.target.value)}
              rows={Math.max(3, q.question_text.split("\n").length)}
              className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-y leading-relaxed"
            />
            <input
              value={q.answer_key}
              onChange={(e) => onUpdate(idx, "answer_key", e.target.value)}
              placeholder="Answer Key (e.g. A, B, C, D)"
              className="w-full h-8 px-3 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-gray-50"
            />
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-gray-100">
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                  Grouping &amp; Choices
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Group (e.g. 21_opt)"
                    value={q.option_group ?? ""}
                    onChange={(e) => onUpdate(idx, "option_group", e.target.value || null)}
                    className="w-full max-w-[100px] h-8 px-2 text-xs border border-indigo-200 rounded-lg bg-white focus:outline-none focus:border-indigo-400"
                  />
                  <input
                    type="text"
                    placeholder="Set (A/B)"
                    value={q.option_set ?? ""}
                    onChange={(e) => onUpdate(idx, "option_set", e.target.value || null)}
                    className="w-full max-w-[80px] h-8 px-2 text-xs border border-indigo-200 rounded-lg bg-white focus:outline-none focus:border-indigo-400"
                  />
                  <input
                    type="number"
                    placeholder="Picks"
                    value={q.pick_count ?? ""}
                    onChange={(e) => onUpdate(idx, "pick_count", Number(e.target.value) || null)}
                    className="w-full max-w-[70px] h-8 px-2 text-xs border border-indigo-200 rounded-lg bg-white focus:outline-none focus:border-indigo-400"
                  />
                </div>
              </div>
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                  Metadata
                </label>
                <div className="flex items-center gap-2">
                  <select
                    value={q.difficulty_level ?? ""}
                    onChange={(e) => onUpdate(idx, "difficulty_level", e.target.value || undefined)}
                    className="h-8 px-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-white"
                  >
                    <option value="" disabled>Difficulty…</option>
                    <option value="Easy">Easy</option>
                    <option value="Moderate">Moderate</option>
                    <option value="Hard">Hard</option>
                  </select>
                  <select
                    value={q.bloom_taxonomy ?? ""}
                    onChange={(e) => onUpdate(idx, "bloom_taxonomy", e.target.value || undefined)}
                    className="h-8 px-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-white"
                  >
                    <option value="">Bloom&apos;s Taxonomy…</option>
                    <option value="Knowledge">Knowledge</option>
                    <option value="Understanding">Understanding</option>
                    <option value="Application">Application</option>
                    <option value="Skill">Skill</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <LatexPreview tex={q.question_text} />
          </div>
        )}

        {/* Read-mode metadata badges */}
        <div className="flex flex-wrap items-center gap-1.5">
          {(q.option_group || q.option_set || q.pick_count) && (
            <span className="text-[10px] text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100 font-medium">
              {q.option_group ? `Grp: ${q.option_group}` : ""}
              {q.option_set ? ` | Set: ${q.option_set}` : ""}
              {q.pick_count ? ` | Pick: ${q.pick_count}` : ""}
            </span>
          )}
          {q.answer_key && (
            <span className="text-[10px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100 font-medium">
              <span className="text-emerald-500 font-bold mr-1">Key:</span>{q.answer_key}
            </span>
          )}
        </div>

        {/* Diagram editor */}
        {q.diagram_bbox?.page_image_url && (
          <div className="pt-2 mt-1 border-t border-gray-100">
            <label className="flex items-center gap-1.5 text-[11px] font-medium text-gray-600 cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={Boolean(q.has_diagram)}
                onChange={(e) => onToggleDiagram(idx, e.target.checked)}
                className="rounded text-amber-600 w-3.5 h-3.5"
              />
              <span className="text-amber-600 font-bold">Has diagram</span>
              <span className="text-gray-400">— drag the box around the whole question to re-crop</span>
            </label>
            {q.has_diagram && (
              <DiagramEditor
                pageUrl={q.diagram_bbox.page_image_url}
                bbox={{ x1: q.diagram_bbox.x1, y1: q.diagram_bbox.y1, x2: q.diagram_bbox.x2, y2: q.diagram_bbox.y2 }}
                cropUrl={q.diagram_crop_url ?? null}
                onCommit={(b) => onRecropDiagram(idx, b)}
              />
            )}
          </div>
        )}

        {/* Chemical structure flags */}
        <div className="pt-2 mt-1 border-t border-gray-100 flex flex-wrap gap-x-4 gap-y-1">
          <label className="flex items-center gap-1.5 text-[11px] font-medium text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(q.has_question_chemical_structure)}
              onChange={(e) => onToggleQuestionChemStructure(idx, e.target.checked)}
              className="rounded text-violet-600 w-3.5 h-3.5"
            />
            <span className="text-violet-600 font-bold">Structure in question</span>
          </label>
          <label className="flex items-center gap-1.5 text-[11px] font-medium text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={Boolean(q.has_answer_chemical_structure)}
              onChange={(e) => onToggleAnswerChemStructure(idx, e.target.checked)}
              className="rounded text-violet-600 w-3.5 h-3.5"
            />
            <span className="text-violet-600 font-bold">Structure in answer</span>
          </label>
        </div>
      </div>
    </div>
  );
}
