"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ArrowLeft, Loader2, Pencil, Check, X,
  AlertCircle, Trash2, PlusCircle, Plus, ScanLine, WrapText,
} from "lucide-react";
import LatexPreview from "../../components/LatexPreview";
import StructureRenderer from "../../components/StructureRenderer";
import ConfirmModal from "../../components/ConfirmModal";
import OCRDrawer from "../../components/OCRDrawer";
import DiagramEditor, { NormBBox } from "./DiagramEditor";
import { OCRExtractionProvider, useOCRExtraction } from "../../context/Ocrextractioncontext";
import {
  updateQuestion,
  addQuestion,
  deleteQuestion,
  reExtractEntirePaperFromUrl,
  cropQuestionDiagram,
} from "../pdfExtract/lib/beaverApi";
import { getAuthToken } from "@/app/lib/auth";

// ─────────────────────────────────────────────────────────────────────────────
// Environment config
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_AGGREGATED_DATA_API_URL ?? "http://localhost:8082";
const R2_PUBLIC_BASE = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || process.env.R2_PUBLIC_URL || "";

// ─────────────────────────────────────────────────────────────────────────────
// Domain types  (mirror the aggregatedData service DTOs)
// ─────────────────────────────────────────────────────────────────────────────

interface QuestionListItemDTO {
  id: number;
  questionNumber: number;
  questionText: string;
  fileName?: string;
  unit: string | null;
  optionGroup?: string | null;
  optionSet?: string | null;
  pickCount?: number | null;
  questionLabel?: string | null;

  maxMarks: number;
  questionType: string | null;
  answerKey: string | null;
  aiAnswer: string | null;
  difficultyLevel?: string | null;
  bloomTaxonomy?: string | null;
  hasDiagram?: boolean | null;
  diagramBbox?: string | null;
  diagramCropUrl?: string | null;
  hasQuestionChemicalStructure?: boolean | null;
  hasAnswerChemicalStructure?: boolean | null;
  questionStructureSmiles?: string | null;
  questionStructureInchikey?: string | null;
  // Ephemeral flag — only present on questions drafted in the UI before the
  // server has assigned a real id.  Cleared on successful addQuestion() call.
  isNew?: boolean;
}

export interface DiagramBBox extends NormBBox {
  page: number;
  page_image_url: string;
}

interface PaperMeta {
  id: number;
  exam: string;
  schoolId: number;
  gradeId: number;
  subjectId: number;
  maxMarks?: number;
  setNumber?: string;
  setMode?: string;
  schoolName: string;
  gradeName: string;
  subjectName: string;
  difficultyLevel?: string;
  bloomTaxonomy?: string;
}

// Discriminated union that drives all inline-edit UI state.
// "saving" is a separate status so the card can disable its buttons while the
// API call is in-flight without losing the form values needed for a retry.
type EditState =
  | { status: "idle" }
  | { status: "editing"; questionId: number; form: Partial<QuestionListItemDTO> }
  | { status: "saving"; questionId: number; form: Partial<QuestionListItemDTO> };

// ─────────────────────────────────────────────────────────────────────────────
// Auth helpers
// ─────────────────────────────────────────────────────────────────────────────

function authHeaders(): HeadersInit {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─────────────────────────────────────────────────────────────────────────────
// PDF URL resolver
// ─────────────────────────────────────────────────────────────────────────────

// Turns whatever is stored in fileName into a fully-qualified URL:
//   • already absolute → return as-is
//   • has a slash      → treat as an R2 key
//   • no slash         → prepend the canonical question_papers/ prefix
function resolvePdfUrl(fileName: string | undefined): string | null {
  if (!fileName || fileName === "null") return null;
  if (fileName.startsWith("http")) return fileName;
  const key = fileName.includes("/") ? fileName : `question_papers/${fileName}`;
  return `${R2_PUBLIC_BASE}/${key}`;
}

interface ViewOrSet {
  set: string | null;
  items: QuestionListItemDTO[];
}

interface ViewBlock {
  type: "single" | "or";
  groupKey?: string;
  pickCount?: number | null;
  sets?: ViewOrSet[];
  items?: QuestionListItemDTO[];
}

// Shapes used by buildUiGroups to represent the structured sidebar tree
interface UiOrSet {
  set: string;
  items: { q: QuestionListItemDTO; idx: number }[];
}

interface UiBlock {
  type: "compulsory" | "or";
  groupKey?: string;
  pickCount?: number | null;
  sets?: UiOrSet[];
  items?: { q: QuestionListItemDTO; idx: number }[];
}

interface UiGroup {
  parent: string;
  blocks: UiBlock[];
}

// Transforms a flat question list into a nested structure suitable for the sidebar
function buildUiGroups(questions: QuestionListItemDTO[]): UiGroup[] {
  const result: UiGroup[] = [];

  questions.forEach((q, idx) => {
    const parent = String(q.questionNumber).split(".")[0];

    let group = result.find(g => g.parent === parent);
    if (!group) {
      group = { parent, blocks: [] };
      result.push(group);
    }

    const grp = q.optionGroup?.trim();
    if (!grp) {
      group.blocks.push({ type: "compulsory", items: [{ q, idx }] });
    } else {
      let block = group.blocks.find(
        b => b.type === "or" && b.groupKey === grp
      );

      if (!block) {
        block = {
          type: "or",
          groupKey: grp,
          pickCount: q.pickCount,
          sets: [],
        };
        group.blocks.push(block);
      }

      const setKey = q.optionSet?.trim() ?? "A";
      let set = block.sets!.find(s => s.set === setKey);
      if (!set) {
        set = { set: setKey, items: [] };
        block.sets!.push(set);
      }

      set.items.push({ q, idx });
    }
  });

  return result;
}

function buildViewBlocks(questions: QuestionListItemDTO[]): ViewBlock[] {
  const blocks: ViewBlock[] = [];

  questions.forEach((q) => {
    const grp = q.optionGroup?.trim();
    if (!grp) {
      blocks.push({ type: "single", items: [q] });
      return;
    }

    let block = blocks.find(
      (b) => b.type === "or" && b.groupKey === grp
    );

    if (!block) {
      block = {
        type: "or",
        groupKey: grp,
        pickCount: q.pickCount ?? null,
        sets: [],
      };
      blocks.push(block);
    }

    const setKey = q.optionSet?.trim() || null;
    let set = block.sets!.find((s) => s.set === setKey);
    if (!set) {
      set = { set: setKey, items: [] };
      block.sets!.push(set);
    }

    set.items.push(q);
  });

  return blocks;
}

// Shown in the PDF pane when the first question has no associated file.
function EmptyPdf() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8 text-center">
      <p>No PDF available for this question paper.</p>
    </div>
  );
}

// Red pill shown inside a question card when a save attempt fails.
function InlineError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs font-medium">
      <AlertCircle size={13} className="shrink-0" />
      {message}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QuestionCard
// ─────────────────────────────────────────────────────────────────────────────

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

// Renders a single question in either read-only or inline-edit mode.
// The card is in edit mode when editState targets this question's id.
// All mutation callbacks are lifted to the parent so state lives in one place.
function QuestionCard({
  q,
  editState,
  onEdit,
  onCancel,
  onSave,
  onDelete,
  onAddBelow,
  onFormChange,
  onReExtract,
  onEditDiagram,
  saveError,
}: QuestionCardProps) {
  const isEditing =
    (editState.status === "editing" || editState.status === "saving") &&
    editState.questionId === q.id;

  const isSaving = editState.status === "saving" && editState.questionId === q.id;

  // Safe to cast — we only read `form` when isEditing is true.
  const form = isEditing ? (editState as Extract<EditState, { status: "editing" | "saving" }>).form : {};

  // Manual hanging-indent trigger: wraps the current textarea selection (or
  // inserts empty markers at the caret) in **...** — LatexPreview already
  // renders a bold-marked "**Label:**" line as a hanging-indent paragraph,
  // so this gives the user an explicit way to invoke it for text that isn't
  // auto-detected, any time they want.
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
      className={`bg-white border ${isEditing ? "border-indigo-300 ring-2 ring-indigo-50" : "border-gray-200"
        } rounded-xl p-4 sm:p-5 shadow-sm transition-all overflow-hidden`}
    >
      {/* ── Card header: action buttons + metadata badges ── */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">

        {/* Left: Save/Cancel while editing, Edit/Add/Delete otherwise */}
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

        {/* Right: optional flag, question type chip, marks counter */}
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
                {q.optionGroup ? `Grp: ${q.optionGroup}` : ''}
                {q.optionSet ? ` | Set: ${q.optionSet}` : ''}
                {q.pickCount ? ` | Pick: ${q.pickCount}` : ''}
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

      {/* ── Question body: number badge + text / LaTeX preview ── */}
      <div className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4 mb-6">

        {/* Question number and label */}
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

          {/* Question Label */}
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

        {/* Question text — raw LaTeX textarea in edit mode, rendered preview otherwise */}
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

      {/* Diagram crop — shown for questions flagged with a diagram */}
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

      {/* Chemistry structure badges (Phase 3 renders the recognized structure here) */}
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

      {/* Recognized question structure (DECIMER + RDKit), rendered via RDKit.js */}
      {q.questionStructureSmiles && (
        <div className="mt-2">
          <div className="text-[10px] font-semibold text-violet-600 mb-1">
            Recognized structure <code className="text-gray-400 font-normal">{q.questionStructureSmiles}</code>
          </div>
          <StructureRenderer smiles={q.questionStructureSmiles} />
        </div>
      )}

      {/* Inline save-error banner, only visible while the edit form is open */}
      {isEditing && saveError && (
        <div className="mt-3">
          <InlineError message={saveError} />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ImageInputModal
// ─────────────────────────────────────────────────────────────────────────────

// Shown when the user clicks "Re-extract" on a question card.
// Accepts a screenshot of the question via paste or file upload, then
// hands it off to OCRExtractionContext so OCRDrawer can run OCR on it.
function ImageInputModal({
  questionId,
  onClose,
}: {
  questionId: string;
  onClose: () => void;
}) {
  const { startExtraction, addRegion } = useOCRExtraction();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    startExtraction(questionId);
  }, [questionId, startExtraction]);

  const handleImage = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        addRegion({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          pageIndex: 0,
          cropRect: { x1: 0, y1: 0, x2: 1, y2: 1, width: 1, height: 1, pageIndex: 0 },
          image: base64,
        });
        onClose();
      };
      reader.readAsDataURL(file);
    },
    [addRegion, onClose],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) =>
        i.type.startsWith("image/"),
      );
      if (!item) return;
      const file = item.getAsFile();
      if (file) handleImage(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handleImage]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-[420px] max-w-[90vw]">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold text-gray-900">Re-extract Question Text</h3>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <X size={14} />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Screenshot the question from the PDF on the left, then paste or upload the image here.
        </p>
        <div
          className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition"
          onClick={() => fileInputRef.current?.click()}
          onDrop={(e) => {
            e.preventDefault();
            const file = Array.from(e.dataTransfer.files).find((f) =>
              f.type.startsWith("image/"),
            );
            if (file) handleImage(file);
          }}
          onDragOver={(e) => e.preventDefault()}
        >
          <ScanLine size={24} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">Paste (Ctrl+V) or click to upload</p>
          <p className="text-xs text-gray-400 mt-1">Any image format</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImage(file);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// DiagramEditModal
// ─────────────────────────────────────────────────────────────────────────────

function DiagramEditModal({
  question,
  onClose,
  onCommit,
}: {
  question: QuestionListItemDTO;
  onClose: () => void;
  onCommit: (bbox: NormBBox) => Promise<void>;
}) {
  if (!question.diagramBbox) return null;
  let parsed: DiagramBBox | null = null;
  try {
    parsed = JSON.parse(question.diagramBbox);
  } catch (e) {
    console.error("Failed to parse diagramBbox", e);
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl shadow-2xl p-6 w-[420px] max-w-[90vw]">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-gray-900">Fix Diagram Bounding Box</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-200">
            Invalid diagram data. Please re-extract.
          </p>
        </div>
      </div>
    );
  }
  if (!parsed || !parsed.page_image_url) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl shadow-2xl p-6 w-[420px] max-w-[90vw]">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-gray-900">Fix Diagram Bounding Box</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-200">
            Cannot edit this diagram because its original page image is missing.
            Please use "Re-extract" if the entire question needs fixing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-[800px] max-w-[95vw] max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900">Fix Diagram Bounding Box</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Adjust the crop box below to capture the entire diagram. Click "Save Crop" when you are done.
        </p>
        <div className="border border-gray-200 rounded-lg p-2 bg-gray-50 relative min-h-[400px]">
          <DiagramEditor
            pageUrl={parsed.page_image_url}
            bbox={{
              x1: parsed.x1,
              y1: parsed.y1,
              x2: parsed.x2,
              y2: parsed.y2,
            }}
            cropUrl={question.diagramCropUrl ?? null}
            onCommit={async (box) => {
              await onCommit(box);
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ViewPaper — main page component
// ─────────────────────────────────────────────────────────────────────────────

// Split-pane view: PDF on the left, question list on the right.
// Accepts a paperId (= exam id from the registry) and an onBack callback.
export default function ViewPaper({
  paperId,
  onBack,
}: {
  paperId: string;
  onBack: () => void;
}) {
  const [questions, setQuestions] = useState<QuestionListItemDTO[]>([]);
  const [paperMeta, setPaperMeta] = useState<PaperMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ status: "idle" });
  const [deleteQuestionId, setDeleteQuestionId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reExtractQuestionId, setReExtractQuestionId] = useState<number | null>(null);
  const [isReExtractingPaper, setIsReExtractingPaper] = useState(false);
  const [showReExtractModal, setShowReExtractModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingDiagramId, setEditingDiagramId] = useState<number | null>(null);

  // ── Data fetching ──────────────────────────────────────────────────────────

  // Loads paper metadata from the registry then fetches all questions.
  // Two sequential calls are needed because the question endpoint requires
  // the human-readable grade name and exam name from the registry.
  const fetchPaperData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    try {
      const headers = authHeaders();

      // Step 1: pull the shared registry so we can resolve FK ids to names.
      const regRes = await fetch(`${API_BASE}/api/registry/batch-form-options`, { headers });
      if (!regRes.ok) throw new Error("Failed to load registry");
      const registry = await regRes.json();

      const exam = (registry.exams ?? []).find((e: any) => String(e.id) === paperId);
      if (!exam) throw new Error("Question paper not found");

      const school = (registry.schools ?? []).find((s: any) => s.id === exam.schoolId);
      const grade = (registry.grades ?? []).find((g: any) => g.id === exam.gradeId);
      const subject = (registry.subjects ?? []).find((s: any) => s.id === exam.subjectId);

      if (!school || !grade) throw new Error("Could not resolve school or grade for this paper");

      setPaperMeta({
        ...exam,
        schoolName: school.name,
        gradeName: grade.name,
        subjectName: subject?.name ?? "",
      });

      // Step 2: fetch questions for this specific paper.
      const qRes = await fetch(
        `${API_BASE}/api/data-quality/questions` +
        `?schoolId=${exam.schoolId}` +
        `&grade=${encodeURIComponent(grade.name)}` +
        `&exam=${encodeURIComponent(exam.exam)}` +
        `&questionPaperId=${paperId}`,
        { headers },
      );
      if (!qRes.ok) throw new Error("Failed to fetch questions");

      const qData: QuestionListItemDTO[] = await qRes.json();
      // Keep questions sorted by number so the list always reflects document order.
      setQuestions(qData.sort((a, b) => a.questionNumber - b.questionNumber));
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load question paper";
      console.error("[ViewPaper] fetchPaperData:", message);
      setFetchError(message);
    } finally {
      setLoading(false);
    }
  }, [paperId]);

  useEffect(() => {
    if (paperId) fetchPaperData();
  }, [paperId, fetchPaperData]);

  // ── Action Handlers ────────────────────────────────────────────────────────

  const executeReExtractEntirePaper = async () => {
    setShowReExtractModal(false);
    if (!questions.length) return;
    const pdfUrl = resolvePdfUrl(questions[0]?.fileName);
    if (!pdfUrl) {
      setErrorMessage("Could not resolve PDF URL for re-extraction.");
      return;
    }

    setIsReExtractingPaper(true);
    setFetchError(null);

    try {
      const res = await reExtractEntirePaperFromUrl(pdfUrl);
      const parsedQuestions = res.questions;

      if (!parsedQuestions || parsedQuestions.length === 0) {
        throw new Error("AI returned no questions.");
      }

      // We update existing questions by matching question_number. If no match is found, we add it as a new question.
      let updatedCount = 0;
      let addedCount = 0;
      for (const parsed of parsedQuestions) {
        const existing = questions.find(q => String(q.questionNumber) === String(parsed.question_number));
        if (existing) {
          await updateQuestion(existing.id, {
            questionText: parsed.question_text,
            maxMarks: parsed.max_marks,
            // Bloom's/difficulty come only from the blueprint — never from extraction.
            // Preserve any existing (blueprint-sourced) values instead of overwriting them on re-extract.
            bloomTaxonomy: existing.bloomTaxonomy ?? null,
            difficultyLevel: existing.difficultyLevel ?? null,
            questionType: parsed.question_type,
            answerKey: parsed.answer_key,
            optionGroup: parsed.option_group,
            optionSet: parsed.option_set,
            pickCount: parsed.pick_count,
            questionLabel: parsed.question_label,
            diagramCropUrl: parsed.diagram_crop_url,
            hasDiagram: parsed.has_diagram,
            diagramBbox: parsed.diagram_bbox ? JSON.stringify(parsed.diagram_bbox) : null,
            hasQuestionChemicalStructure: parsed.has_question_chemical_structure,
            hasAnswerChemicalStructure: parsed.has_answer_chemical_structure,
            questionStructureSmiles: parsed.question_structure_smiles,
            questionStructureInchikey: parsed.question_structure_inchikey,
          } as any);
          updatedCount++;
        } else {
          await addQuestion({
            questionPaperId: parseInt(paperId),
            questionNumber: parseFloat(parsed.question_number) || 0,
            questionText: parsed.question_text,
            maxMarks: parsed.max_marks || 1,
            // New question from extraction — Bloom's/difficulty stay blank until the blueprint is uploaded.
            bloomTaxonomy: null,
            difficultyLevel: null,
            questionType: parsed.question_type,
            answerKey: parsed.answer_key,
            optionGroup: parsed.option_group,
            optionSet: parsed.option_set,
            pickCount: parsed.pick_count,
            questionLabel: parsed.question_label,
            diagramCropUrl: parsed.diagram_crop_url,
            hasDiagram: parsed.has_diagram,
            diagramBbox: parsed.diagram_bbox ? JSON.stringify(parsed.diagram_bbox) : null,
            hasQuestionChemicalStructure: parsed.has_question_chemical_structure,
            hasAnswerChemicalStructure: parsed.has_answer_chemical_structure,
            questionStructureSmiles: parsed.question_structure_smiles,
            questionStructureInchikey: parsed.question_structure_inchikey,
          } as any);
          addedCount++;
        }
      }

      setSuccessMessage(`Successfully re-extracted! Updated ${updatedCount} existing questions and added ${addedCount} new ones.`);
      await fetchPaperData(); // Refresh list
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to re-extract paper";
      const fullError = typeof err === 'object' && err !== null ? JSON.stringify(err, Object.getOwnPropertyNames(err), 2) : String(err);
      console.error("[ViewPaper] reExtractEntirePaper:", fullError);
      
      // The user wants detailed errors in the modal view.
      setErrorMessage(`Re-extraction failed:\n${message}\n\nDetails:\n${fullError}`);
    } finally {
      setIsReExtractingPaper(false);
    }
  };

  // ── Edit handlers ──────────────────────────────────────────────────────────

  // Open the inline editor for a question, pre-populating the form with
  // the current values so the user edits a copy, not the live data.
  const handleEdit = async (q: QuestionListItemDTO) => {
    // Flush a pending edit on a different question before switching.
    if (editState.status === "editing" && editState.questionId !== q.id) {
      await autoSaveQuestion(editState.questionId, editState.form);
    }
    setSaveError(null);
    setEditState({
      status: "editing",
      questionId: q.id,
      form: {
        questionNumber: q.questionNumber,
        questionText: q.questionText,
        maxMarks: q.maxMarks,
        answerKey: q.answerKey,
        aiAnswer: q.aiAnswer,

        difficultyLevel: q.difficultyLevel,
        bloomTaxonomy: q.bloomTaxonomy,
        optionGroup: q.optionGroup,
        optionSet: q.optionSet,
        pickCount: q.pickCount,
        questionLabel: q.questionLabel,
        questionType: q.questionType,
      },
    });
  };

  // Discard the current edit.  If the question being cancelled was a brand-new
  // unsaved draft (isNew), remove it from the list entirely so it doesn't
  // linger as an orphan row.
  const handleCancel = () => {
    setSaveError(null);
    if (editState.status === "editing" || editState.status === "saving") {
      const qId = editState.questionId;
      setQuestions((prev) => prev.filter((q) => !(q.id === qId && q.isNew)));
    }
    setEditState({ status: "idle" });
  };

  // Merge a partial patch into the current edit form. Applies during
  // "saving" too, so keystrokes aren't dropped while a save is in flight.
  const handleFormChange = (patch: Partial<QuestionListItemDTO>) => {
    setEditState((prev) => {
      if (prev.status !== "editing" && prev.status !== "saving") return prev;
      return { ...prev, form: { ...prev.form, ...patch } };
    });
  };

  // Persist the edited form to the server.
  // New questions go through addQuestion(); existing ones through updateQuestion().
  // On success the local list is updated in-place and sorted.
  // On failure the UI reverts to "editing" so the user can retry without losing work.
  const handleSave = async (questionId: number) => {
    if (editState.status !== "editing" || editState.questionId !== questionId) return;
    const { form } = editState;

    setSaveError(null);
    setEditState({ status: "saving", questionId, form });

    const qTarget = questions.find((q) => q.id === questionId);
    if (!qTarget) return;

    try {
      if (qTarget.isNew) {
        // Brand-new question: server assigns the real id; swap the temp id out.
        const res = await addQuestion({
          questionPaperId: parseInt(paperId),
          questionNumber: form.questionNumber ?? qTarget.questionNumber,
          questionText: form.questionText ?? "",
          maxMarks: form.maxMarks ?? 1,
          optionGroup: form.optionGroup ?? null,
          optionSet: form.optionSet ?? null,
          pickCount: form.pickCount ?? null,
          questionLabel: form.questionLabel ?? undefined,
          questionType: form.questionType || "VSA", // fallback if somehow missing
        });

        setQuestions((prev) =>
          prev
            .map((q) =>
              q.id === questionId
                ? ({ ...q, ...form, id: res.questionId, isNew: false } as QuestionListItemDTO)
                : q,
            )
            .sort((a, b) => a.questionNumber - b.questionNumber),
        );
      } else {
        // Existing question: PATCH in place.
        await updateQuestion(questionId, form as any);
        setQuestions((prev) =>
          prev
            .map((q) => (q.id === questionId ? ({ ...q, ...form } as QuestionListItemDTO) : q))
            .sort((a, b) => a.questionNumber - b.questionNumber),
        );
      }

      // Guard against a superseded save, and keep any edits made mid-flight.
      setEditState((prev) => {
        if (prev.status !== "saving" || prev.questionId !== questionId) return prev;
        const editedDuringSave = (Object.keys(form) as (keyof typeof form)[]).some(
          (k) => prev.form[k] !== form[k],
        );
        return editedDuringSave
          ? { status: "editing", questionId, form: prev.form }
          : { status: "idle" };
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save changes";
      console.error("[ViewPaper] handleSave:", message);
      // Same guard, so a stale failure can't paint an error on another card.
      setEditState((prev) => {
        if (prev.status !== "saving" || prev.questionId !== questionId) return prev;
        setSaveError(message);
        return { status: "editing", questionId, form: prev.form };
      });
    }
  };

  // Persists a question's form without closing its editor. Skips new
  // (unsaved) rows and unchanged forms. Errors are swallowed — Save button
  // owns the failure banner.
  const autoSaveQuestion = useCallback(
    async (questionId: number, form: Partial<QuestionListItemDTO>) => {
      const qTarget = questions.find((q) => q.id === questionId);
      if (!qTarget || qTarget.isNew) return;
      const unchanged = (Object.keys(form) as (keyof typeof form)[]).every(
        (k) => form[k] === (qTarget as any)[k],
      );
      if (unchanged) return;
      try {
        await updateQuestion(questionId, form as any);
        setQuestions((prev) =>
          prev.map((q) => (q.id === questionId ? ({ ...q, ...form } as QuestionListItemDTO) : q)),
        );
      } catch (err) {
        console.error("[ViewPaper] autoSave:", err);
      }
    },
    [questions],
  );

  // Idle debounce: save 1.5s after the last change.
  useEffect(() => {
    if (editState.status !== "editing") return;
    const { questionId, form } = editState;
    const timer = setTimeout(() => {
      void autoSaveQuestion(questionId, form);
    }, 1500);
    return () => clearTimeout(timer);
  }, [editState, autoSaveQuestion]);

  // Clicking outside the active card commits it, like pressing Save.
  useEffect(() => {
    if (editState.status !== "editing") return;
    const { questionId } = editState;

    const handleClickOutside = (e: MouseEvent) => {
      const card = document.getElementById(`q-card-${questionId}`);
      if (card && !card.contains(e.target as Node)) {
        void handleSave(questionId);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [editState]);

  // Insert a new draft question into the local list and immediately open its
  // inline editor.  The question number is set to (floor(afterNumber) + 1) so
  // it slots in just after the clicked row; clicking the top-level "Add
  // Question" button appends after the highest existing number.
  const handleAddQuestion = async (afterNumber?: number) => {
    // Auto-save: persist any question mid-edit before opening a blank draft.
    if (editState.status === "editing") {
      await autoSaveQuestion(editState.questionId, editState.form);
    }
    let nextNumber = 1;
    if (afterNumber !== undefined) {
      nextNumber = Math.floor(afterNumber) + 1;
    } else if (questions.length > 0) {
      nextNumber = Math.floor(Math.max(...questions.map((q) => q.questionNumber))) + 1;
    }

    // Use a large negative temp id so it never collides with a real server id.
    const tempId = -Math.floor(Math.random() * 1_000_000);

    const newDraft: QuestionListItemDTO = {
      id: tempId,
      questionNumber: nextNumber,
      questionText: "",
      maxMarks: 1,
      unit: null,
      optionGroup: null,
      optionSet: null,
      pickCount: null,
      questionLabel: null,
      questionType: null,
      answerKey: null,
      aiAnswer: null,
      isNew: true,
    };

    setQuestions((prev) =>
      [...prev, newDraft].sort((a, b) => a.questionNumber - b.questionNumber),
    );

    setEditState({
      status: "editing",
      questionId: tempId,
      form: {
        questionText: "",
        maxMarks: 1,
        questionNumber: nextNumber,
        questionType: "",
        optionGroup: null,
        optionSet: null,
        pickCount: null,
        questionLabel: "",
      },
    });

    // Scroll the new card into view after React has had one tick to render it.
    setTimeout(() => {
      document
        .getElementById(`q-card-${tempId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  // Called after the ConfirmModal is accepted.  Skips the API call for
  // unsaved drafts (isNew) since they never reached the server.
  const handleDeleteQuestion = async () => {
    if (deleteQuestionId === null) return;

    const qTarget = questions.find((q) => q.id === deleteQuestionId);
    if (!qTarget) {
      setDeleteQuestionId(null);
      return;
    }

    try {
      if (!qTarget.isNew) {
        await deleteQuestion(deleteQuestionId);
      }
      setQuestions((prev) => prev.filter((q) => q.id !== deleteQuestionId));
    } catch (err: unknown) {
      console.error("[ViewPaper] handleDeleteQuestion:", err);
      setErrorMessage("Failed to delete question");
    } finally {
      setDeleteQuestionId(null);
    }
  };


  // ── OCR re-extraction ──────────────────────────────────────────────────────

  const handleRunOCR = useCallback(async (image: string, model: string): Promise<string> => {
    const res = await fetch("/api/ocr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image, model }),
    });
    if (!res.ok) throw new Error("OCR failed");
    const data = await res.json();
    return data.text ?? "";
  }, []);

  // Called when the user clicks "Fill OCR" in the drawer.
  // Opens the inline edit form for the target question with the OCR text pre-filled
  // so the user can review and save manually — consistent with the normal edit flow.
  const handleFillOCR = useCallback((questionId: string, text: string) => {
    const q = questions.find((q) => String(q.id) === questionId);
    if (!q) return;
    setSaveError(null);
    setEditState({
      status: "editing",
      questionId: q.id,
      form: {
        questionNumber: q.questionNumber,
        questionText: text,
        questionType: q.questionType,
        maxMarks: q.maxMarks,
        answerKey: q.answerKey,
        aiAnswer: q.aiAnswer,
        difficultyLevel: q.difficultyLevel,
        bloomTaxonomy: q.bloomTaxonomy,
        optionGroup: q.optionGroup,
        optionSet: q.optionSet,
        pickCount: q.pickCount,
        questionLabel: q.questionLabel,
      },
    });
    setTimeout(() => {
      document
        .getElementById(`q-card-${q.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }, [questions]);

  const handleCommitRecropDiagram = async (bbox: NormBBox) => {
    if (editingDiagramId === null) return;
    const q = questions.find((q) => q.id === editingDiagramId);
    if (!q || !q.diagramBbox) return;

    try {
      const parsed = JSON.parse(q.diagramBbox) as DiagramBBox;
      if (!parsed.page_image_url) return;

      const res = await cropQuestionDiagram(parsed.page_image_url, bbox, String(q.questionNumber));

      const newDiagramBbox = JSON.stringify({ ...parsed, ...bbox });
      const newCropUrl = res.crop_url;

      await updateQuestion(q.id, {
        diagramBbox: newDiagramBbox,
        diagramCropUrl: newCropUrl,
      });

      setQuestions((prev) =>
        prev.map((qq) =>
          qq.id === q.id
            ? { ...qq, diagramBbox: newDiagramBbox, diagramCropUrl: newCropUrl }
            : qq
        )
      );

      setSuccessMessage("Diagram cropped and updated successfully!");
    } catch (err: unknown) {
      console.error("[ViewPaper] handleCommitRecropDiagram:", err);
      setErrorMessage("Failed to save diagram box");
    }
  };

  // ── Derived values ─────────────────────────────────────────────────────────

  // All questions in a paper share the same PDF file so we only need the
  // first question's fileName to drive the iframe src.
  const pdfUrl = resolvePdfUrl(questions[0]?.fileName);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <OCRExtractionProvider onFillOCR={handleFillOCR} onRunOCR={handleRunOCR}>
      <div className="min-h-screen lg:h-screen flex flex-col bg-gray-50">

        {/* ── Page header: back button + paper metadata chips ── */}
        <header className="flex-none px-4 lg:px-6 py-4 border-b border-gray-200 bg-white">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={async () => {
                if (editState.status === "editing") {
                  await autoSaveQuestion(editState.questionId, editState.form);
                }
                onBack();
              }}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium transition shrink-0"
            >
              <ArrowLeft size={15} /> Back
            </button>

            {paperMeta && (
              <>
                <div className="w-px h-5 bg-gray-200 hidden sm:block" />
                <h1 className="text-base lg:text-lg font-bold text-gray-900 shrink-0">
                  {paperMeta.exam}
                </h1>
                <div className="flex flex-wrap gap-2 text-xs lg:text-sm text-gray-600 sm:ml-2">
                  <span className="bg-gray-100 px-2 py-0.5 rounded-md font-medium">{paperMeta.schoolName}</span>
                  <span className="bg-gray-100 px-2 py-0.5 rounded-md font-medium">{paperMeta.gradeName}</span>
                  <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md font-medium">{paperMeta.subjectName}</span>
                  {paperMeta.maxMarks != null && (
                    <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-md font-medium shrink-0">
                      Max Marks: {paperMeta.maxMarks}
                    </span>
                  )}
                  {paperMeta.setNumber && (
                    <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md font-medium shrink-0">
                      Set: {paperMeta.setNumber}
                    </span>
                  )}
                  {paperMeta.setMode && (
                    <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded-md font-medium shrink-0">
                      Mode: {paperMeta.setMode}
                    </span>
                  )}
                </div>
                <div className="flex-1" />
              </>
            )}
          </div>
        </header>

        {/* ── Split pane body ── */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

          {/* Left pane: PDF viewer.  Hidden until loading completes so we don't
            flash an empty iframe while fetch is in-flight. */}
          <aside className="w-full lg:w-1/2 h-[50vh] lg:h-full flex flex-col border-b lg:border-b-0 lg:border-r border-gray-200 bg-gray-100 shrink-0 lg:shrink">
            {!loading && (
              pdfUrl
                ? <iframe src={pdfUrl} className="w-full h-full border-none" title="Question Paper PDF" />
                : <EmptyPdf />
            )}
          </aside>

          {/* Right pane: sidebar + scrollable question list */}
          <main className="w-full lg:w-1/2 flex flex-1 min-h-0 overflow-hidden bg-white">

            {/* Sidebar: tree of question numbers grouped by base and OR blocks */}
            {!loading && !fetchError && questions.length > 0 && (
              <div className="w-32 lg:w-40 shrink-0 overflow-y-auto p-4 border-r border-gray-100 bg-gray-50/30 space-y-2 font-mono text-[11px] hidden sm:block">
                {buildUiGroups(questions).map(group => (
                  <div key={group.parent} className="border border-gray-100 rounded-md p-1.5 bg-white shadow-sm mb-2">
                    <div className="font-bold mb-2 text-gray-600 bg-gray-50 px-2 py-0.5 rounded">
                      Q{group.parent}
                    </div>

                    {group.blocks.map((block, i) => {
                      if (block.type === "compulsory") {
                        return (
                          <div key={i} className="space-y-0.5 mb-2 px-1">
                            {block.items!.map(({ q }) => (
                              <button
                                key={q.id}
                                onClick={() => {
                                  document.getElementById(`q-card-${q.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                                }}
                                className="w-full text-left px-2 py-1 rounded transition-colors text-gray-600 hover:bg-indigo-50 hover:text-indigo-700"
                              >
                                {q.questionNumber}
                              </button>
                            ))}
                          </div>
                        );
                      }

                      if (block.type === "or") {
                        if (block.pickCount && block.pickCount > 1) {
                          return (
                            <div key={i} className="mb-2 p-1 border border-amber-200/50 bg-amber-50/30 rounded">
                              <div className="text-amber-600 font-semibold mb-1 text-[10px] uppercase tracking-wide">
                                Choose any {block.pickCount}:
                              </div>
                              <div className="space-y-0.5">
                                {block.sets!.flatMap(s => s.items).map(({ q }) => (
                                  <button
                                    key={q.id}
                                    onClick={() => {
                                      document.getElementById(`q-card-${q.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                                    }}
                                    className="w-full text-left px-2 py-1 rounded transition-colors flex items-center gap-1.5 text-gray-600 hover:bg-amber-100/50 hover:text-amber-700"
                                  >
                                    <span className="text-gray-400">☐</span> {q.questionNumber}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        }

                        return (
                          <div key={i} className="mb-2 p-1 border border-amber-200/50 bg-amber-50/30 rounded">
                            <div className="text-amber-600 font-semibold mb-1 text-[10px] uppercase tracking-wide">
                              Choose one:
                            </div>
                            {block.sets!.map((set, si) => (
                              <div key={si}>
                                {si > 0 && (
                                  <div className="text-center text-[9px] text-amber-400 font-bold my-1">OR</div>
                                )}
                                <div className="space-y-0.5">
                                  {set.items.map(({ q }) => (
                                    <button
                                      key={q.id}
                                      onClick={() => {
                                        document.getElementById(`q-card-${q.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
                                      }}
                                      className="w-full text-left px-2 py-1 rounded transition-colors text-gray-600 hover:bg-amber-100/50 hover:text-amber-700"
                                    >
                                      {q.questionNumber}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                ))}
              </div>
            )}

            {/* Questions list area */}
            <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-6 lg:py-8">
              <div className="max-w-3xl mx-auto">

                {/* Loading spinner */}
                {loading && (
                  <div className="flex flex-col items-center justify-center py-20 text-indigo-600">
                    <Loader2 size={32} className="animate-spin mb-4" />
                    <p className="text-sm font-medium">Loading question paper...</p>
                  </div>
                )}

                {/* Fetch error with retry + back escape hatch */}
                {fetchError && (
                  <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
                    <p className="text-red-500 font-medium mb-4">{fetchError}</p>
                    <button
                      onClick={fetchPaperData}
                      className="text-indigo-600 hover:underline text-sm font-semibold mr-4"
                    >
                      Retry
                    </button>
                    <button onClick={onBack} className="text-gray-500 hover:underline text-sm">
                      Go back
                    </button>
                  </div>
                )}

                {/* Question list — only rendered once data is ready */}
                {!loading && !fetchError && paperMeta && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-end mb-4">
                      <h2 className="text-base font-bold text-gray-800">
                        Questions ({questions.length})
                      </h2>
                      <button
                        onClick={() => setShowReExtractModal(true)}
                        disabled={isReExtractingPaper}
                        className="flex items-center gap-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-semibold transition shadow-sm"
                      >
                        {isReExtractingPaper ? (
                          <><Loader2 size={16} className="animate-spin" /> Re-extracting...</>
                        ) : (
                          <><ScanLine size={16} /> Re-extract Entire Paper</>
                        )}
                      </button>
                    </div>

                    {isReExtractingPaper && (
                      <div className="flex items-center justify-center gap-3 text-sm text-indigo-700 font-medium bg-indigo-50/80 border border-indigo-200/60 rounded-xl p-4 shadow-sm animate-pulse">
                        <Loader2 size={18} className="animate-spin text-indigo-600" />
                        <span>Extracting questions with AI (takes ~1-2 minutes). Please don't close this page...</span>
                      </div>
                    )}

                    {questions.length === 0 ? (
                      <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center text-gray-500 text-sm shadow-sm">
                        This question paper hasn't been parsed yet or has no questions.
                      </div>
                    ) : (
                      buildViewBlocks(questions).map((block, index) => {
                        if (block.type === "single") {
                          return block.items!.map((q) => (
                            <QuestionCard
                              key={q.id}
                              q={q}
                              editState={editState}
                              onEdit={handleEdit}
                              onCancel={handleCancel}
                              onSave={handleSave}
                              onDelete={(id) => setDeleteQuestionId(id)}
                              onAddBelow={handleAddQuestion}
                              onFormChange={handleFormChange}
                              onReExtract={(q) => setReExtractQuestionId(q.id)}
                              onEditDiagram={(q) => setEditingDiagramId(q.id)}
                              saveError={saveError}
                            />
                          ));
                        }

                        if (block.type === "or") {
                          return (
                            <div key={`or-${index}`} className="border-2 border-amber-200 rounded-xl p-4 bg-amber-50/50 shadow-sm relative overflow-hidden">
                              {/* Accent bar for grouping context */}
                              <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-400"></div>

                              <div className="text-xs font-black text-amber-700 mb-4 uppercase tracking-wide flex items-center gap-2">
                                {block.pickCount && block.pickCount > 1
                                  ? `Choose any ${block.pickCount}`
                                  : "Choose one"}
                              </div>

                              <div className="space-y-4">
                                {block.sets!.map((set, setIndex) => (
                                  <div key={setIndex}>
                                    {setIndex > 0 && (
                                      <div className="flex items-center justify-center my-6 relative">
                                        <div className="absolute inset-0 flex items-center">
                                          <div className="w-full border-t-2 border-dashed border-amber-300" />
                                        </div>
                                        <span className="relative bg-amber-50 px-4 text-[11px] font-black tracking-widest text-amber-500 rounded-full border-2 border-amber-200">
                                          OR
                                        </span>
                                      </div>
                                    )}
                                    <div className="space-y-4">
                                      {set.items.map((q) => (
                                        <QuestionCard
                                          key={q.id}
                                          q={q}
                                          editState={editState}
                                          onEdit={handleEdit}
                                          onCancel={handleCancel}
                                          onSave={handleSave}
                                          onDelete={(id) => setDeleteQuestionId(id)}
                                          onAddBelow={handleAddQuestion}
                                          onFormChange={handleFormChange}
                                          onReExtract={(q) => setReExtractQuestionId(q.id)}
                                          onEditDiagram={(q) => setEditingDiagramId(q.id)}
                                          saveError={saveError}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        }
                        return null;
                      })
                    )}

                    {/* Append-to-bottom button for adding a new question without
                    targeting a specific position in the list */}
                    <div className="pt-4 border-t border-gray-200 mt-6 flex justify-center">
                      <button
                        onClick={() => handleAddQuestion()}
                        className="flex items-center gap-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-4 py-2 rounded-lg text-sm font-semibold transition shadow-sm"
                      >
                        <PlusCircle size={16} /> Add Question
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>

        {/* Confirmation dialog shown when the user clicks Delete on a question row */}
        <ConfirmModal
          isOpen={deleteQuestionId !== null}
          title="Delete Question"
          message="Are you sure you want to delete this question? This action cannot be undone."
          confirmText="Delete"
          onConfirm={handleDeleteQuestion}
          onCancel={() => setDeleteQuestionId(null)}
        />

        <ConfirmModal
          isOpen={showReExtractModal}
          title="Re-extract Entire Question Paper"
          message="This action will re-process the entire question paper document to extract text, options, and marks. It will update the existing questions with the newly extracted data. This process may take a minute or two to complete. Are you sure you want to proceed?"
          confirmText="Proceed"
          onConfirm={executeReExtractEntirePaper}
          onCancel={() => setShowReExtractModal(false)}
        />

        <ConfirmModal
          isOpen={successMessage !== null}
          title="Success"
          message={successMessage || ""}
          confirmText="Done"
          iconType="success"
          onConfirm={() => setSuccessMessage(null)}
          onCancel={() => setSuccessMessage(null)}
        />

        <ConfirmModal
          isOpen={errorMessage !== null}
          title="Error"
          message={errorMessage || ""}
          confirmText="Dismiss"
          iconType="warning"
          onConfirm={() => setErrorMessage(null)}
          onCancel={() => setErrorMessage(null)}
        />
      </div>

      {editingDiagramId !== null && questions.find(q => q.id === editingDiagramId) && (
        <DiagramEditModal
          question={questions.find(q => q.id === editingDiagramId)!}
          onClose={() => setEditingDiagramId(null)}
          onCommit={handleCommitRecropDiagram}
        />
      )}

      {reExtractQuestionId !== null && (
        <ImageInputModal
          questionId={String(reExtractQuestionId)}
          onClose={() => setReExtractQuestionId(null)}
        />
      )}
      <OCRDrawer latexPreview={true} />
    </OCRExtractionProvider>
  );
}