"use client";

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Upload, Loader2, X, ChevronDown,
  CheckCircle, Pencil, Trash2, Plus, Save, FileText, WrapText,
} from "lucide-react";
import LatexPreview from "../../components/LatexPreview";
import DiagramEditor, { NormBBox } from "./DiagramEditor";
import { getAuthToken } from "@/app/lib/auth";

// API base URLs pulled from environment variables with localhost fallbacks
const BEAVER_BASE = process.env.NEXT_PUBLIC_BEAVER_API_URL ?? "http://localhost:4000";
const API_BASE = process.env.NEXT_PUBLIC_AGGREGATED_DATA_API_URL ?? "http://localhost:8082";
const QP_STORAGE_KEY = "qp_session";
const MAX_PDF_SIZE_MB = 32;

// Normalized bounding box extended with page info for diagram cropping
interface DiagramBBox extends NormBBox {
  page: number;
  page_image_url: string;
}

// Represents a single question row as returned by the OCR parser
// chapter_name and concept_name are optional fields from AI enrichment
interface ParsedQuestion {
  question_number: string;
  question_text: string;
  question_type: string;
  max_marks: number;
  option_group: string | null;
  option_set: string | null;
  pick_count: number | null;
  question_label: string;
  answer_key: string;
  ai_answer: string;
  difficulty_level?: string;
  bloom_taxonomy?: string;
  chapter_name?: string;
  concept_name?: string;
  has_diagram?: boolean;
  diagram_bbox?: DiagramBBox | null;
  diagram_crop_url?: string | null;
  has_question_chemical_structure?: boolean;
  has_answer_chemical_structure?: boolean;
  question_structure_smiles?: string | null;
  question_structure_inchikey?: string | null;
  _ui_id?: string;
}


// Metadata for an OR pair stored separately from question rows
interface OrEntry {
  description_a: string;
  description_b: string;
  keywords_a: string[];
  keywords_b: string[];
}

// Registry lookup types from the shared batch-form-options endpoint
interface RegistryItem {
  id: number;
  name: string;
  subjectCode?: string;
}

interface RegistryExamItem {
  id: number;
  name: string;
  examDate?: string;
  schoolId?: number;
  gradeId?: number;
  examType?: string;
}

interface Registry {
  schools: RegistryItem[];
  grades: RegistryItem[];
  subjects: RegistryItem[];
  examNames: RegistryExamItem[];
}

// All fields shown in the upload form step
interface FormState {
  school_id: string;
  grade_id: string;
  subject_id: string;
  exam_id: string;
  exam_name: string;
  exam_date: string;
  set_number: string;
  set_mode: string;
  exam_type: string;
  display_name: string;
  max_marks: string;
  sections_attended: number[];
}

// Shape persisted to sessionStorage so the user can refresh without losing work
interface SessionData {
  step: "form" | "review";
  form: FormState;
  questions: ParsedQuestion[];
  orQuestions: Record<string, OrEntry>;
  pdfUrl: string | null;
}

interface SectionItem {
  id: number;
  schoolId: number;
  gradeId: number;
  name: string;
}

type SelectOption = { label: string; value: string };


// Returns Authorization header object if a token exists, empty object otherwise
function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Validates that a parsed object from sessionStorage has the expected shape
function isValidSessionData(data: unknown): data is SessionData {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    (d.step === "form" || d.step === "review") &&
    typeof d.form === "object" && d.form !== null &&
    Array.isArray(d.questions)
  );
}

// Reads and validates the persisted session from sessionStorage
function loadSession(): SessionData | null {
  try {
    const raw = sessionStorage.getItem(QP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValidSessionData(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Writes the current session state to sessionStorage silently ignoring quota errors
function saveSession(data: SessionData): void {
  try {
    sessionStorage.setItem(QP_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // quota exceeded — non-fatal
  }
}

// Sorts question numbers correctly handling multi-level decimals like 21.1, 21.2, 21.10
function sortByQuestionNumber(a: ParsedQuestion, b: ParsedQuestion): number {
  const partsA = a.question_number.split(".").map(Number);
  const partsB = b.question_number.split(".").map(Number);
  for (let i = 0; i < Math.max(partsA.length, partsB.length); i++) {
    const diff = (partsA[i] ?? 0) - (partsB[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Dropdown with a chevron icon that disables itself when no options are available
function SmartSelect({
  label, required, value, options, placeholder, helperText, onChange,
}: {
  label: string;
  required?: boolean;
  value: string;
  options: SelectOption[];
  placeholder: string;
  helperText?: string;
  onChange: (v: string) => void;
}) {
  const disabled = options.length === 0;
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full h-9 px-3 pr-8 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition appearance-none bg-white cursor-pointer disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
        >
          <option value="" disabled>
            {disabled ? `No ${label.toLowerCase()} available` : placeholder}
          </option>
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      </div>
      {disabled && helperText && (
        <p className="mt-1 text-[11px] text-amber-600">{helperText}</p>
      )}
    </div>
  );
}

// Checkbox list that allows selecting multiple values from a list of options
function MultiSelect({
  label, required, values, options, emptyText, helperText, onChange,
}: {
  label: string;
  required?: boolean;
  values: number[];
  options: { label: string; value: number }[];
  emptyText: string;
  helperText?: string;
  onChange: (v: number[]) => void;
}) {
  const disabled = options.length === 0;
  const toggle = (val: number) => {
    onChange(values.includes(val) ? values.filter((v) => v !== val) : [...values, val]);
  };
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {disabled ? (
        <div className="w-full min-h-9 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-100 text-gray-400">
          {emptyText}
        </div>
      ) : (
        <div className="w-full max-h-36 overflow-y-auto px-3 py-2 border border-gray-200 rounded-lg bg-white flex flex-wrap gap-x-4 gap-y-1.5">
          {options.map((opt) => (
            <label key={opt.value} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={values.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                className="rounded text-indigo-600 w-3.5 h-3.5"
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
      {helperText && <p className="mt-1 text-[11px] text-gray-400">{helperText}</p>}
    </div>
  );
}

// Set number options: No Set plus A through E
const SET_NUMBER_OPTIONS: SelectOption[] = [
  { label: "No Set", value: "No Set" },
  ...Array.from({ length: 5 }, (_, i) => {
    const char = String.fromCharCode(65 + i);
    return { label: char, value: char };
  })
];

// Describes how multiple sets of the same paper relate to each other
const SET_MODE_OPTIONS: SelectOption[] = [
  { label: "Single (One set, one paper)", value: "SINGLE" },
  { label: "Independent (Multiple sets, completely different questions)", value: "INDEPENDENT" },
  { label: "Reordered (Multiple sets, same questions different order)", value: "REORDERED" },
  { label: "Partial Overlap (Multiple sets, some shared some unique)", value: "PARTIAL_OVERLAP" },
];

// Blank form used when starting a new paper or clearing the session
const EMPTY_FORM: FormState = {
  school_id: "", grade_id: "", subject_id: "", exam_id: "", exam_name: "",
  exam_date: "", max_marks: "", set_number: "", set_mode: "SINGLE",
  exam_type: "", display_name: "", sections_attended: [],
};

// Blank question used as a template when the user inserts a new row
const EMPTY_QUESTION: ParsedQuestion = {
  question_number: "", question_text: "", question_type: "SA",
  max_marks: 1, option_group: null, option_set: null, pick_count: null,
  question_label: "", answer_key: "", ai_answer: "",
};

// Tailwind colour classes for each question type badge
const TYPE_BADGE: Record<string, string> = {
  MCQ: "bg-violet-50 text-violet-700 border-violet-200",
  VSA: "bg-sky-50 text-sky-700 border-sky-200",
  SA: "bg-teal-50 text-teal-700 border-teal-200",
  LA: "bg-amber-50 text-amber-700 border-amber-200",
  CASE_STUDY: "bg-orange-50 text-orange-700 border-orange-200",
};

export default function CreatePaper({ onCancel }: { onCancel?: () => void }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Per-question textarea refs, keyed by index — lets the "Hanging indent"
  // button below act on whichever question card's textarea is open.
  const questionTextRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map());

  const [step, setStep] = useState<"form" | "review">("form");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [registry, setRegistry] = useState<Registry>({ schools: [], grades: [], subjects: [], examNames: [] });
  const [sections, setSections] = useState<SectionItem[]>([]);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ParsedQuestion[]>([]);
  const [orQuestions, setOrQuestions] = useState<Record<string, OrEntry>>({});

  // Tracks which question number string is currently open in the inline editor
  // Using question_number as the key keeps the active card stable across
  // insertions and deletions unlike an array index
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ocrStatus, setOcrStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  // Rehydrates state from sessionStorage on mount so a page refresh does not
  // lose the user's work
  useEffect(() => {
    const session = loadSession();
    if (session) {
      setStep(session.step);
      setForm(session.form);
      setQuestions(session.questions.map((q: any) => ({ ...q, _ui_id: q._ui_id || Math.random().toString(36).slice(2) })));
      setOrQuestions(session.orQuestions ?? {});
      setPdfUrl(session.pdfUrl ?? null);
    }
    setRestored(true);
  }, []);

  // Persists state to sessionStorage after every relevant change
  // Skips the first render to avoid overwriting a valid session with empty state
  useEffect(() => {
    if (!restored) return;
    saveSession({ step, form, questions, orQuestions, pdfUrl });
  }, [step, form, questions, orQuestions, pdfUrl, restored]);

  // Fetches all dropdown options (schools, grades, subjects, exam names) in one request
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/registry/batch-form-options`, {
          headers: authHeaders(),
        });
        if (!res.ok) throw new Error("Failed to load registry options");
        const data = await res.json();
        setRegistry({
          schools: data.schools ?? [],
          grades: data.grades ?? [],
          subjects: data.subjects ?? [],
          examNames: data.examNames ?? [],
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Failed to load registry";
        console.error("[CreatePaper] Registry load error:", msg);
        setError(msg);
      }
    };
    load();
  }, []);

  // Fetches sections filtered by the currently selected school and grade
  // Aborts the previous request when the selection changes to avoid race conditions
  useEffect(() => {
    if (!form.school_id || !form.grade_id) {
      setSections([]);
      return;
    }
    const controller = new AbortController();
    const load = async () => {
      try {
        const res = await fetch(
          `${API_BASE}/api/data-quality/sections?schoolId=${form.school_id}&gradeId=${form.grade_id}`,
          { headers: authHeaders(), signal: controller.signal }
        );
        if (!res.ok) throw new Error("Failed to load sections");
        const data = await res.json();
        setSections(Array.isArray(data) ? data : []);
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        console.error("[CreatePaper] Sections load error:", err);
        setSections([]);
      }
    };
    load();
    return () => controller.abort();
  }, [form.school_id, form.grade_id]);

  // Removes any previously selected section IDs that no longer belong to the
  // current school and grade combination
  useEffect(() => {
    setForm((prev) => {
      const validIds = new Set(sections.map((s) => s.id));
      const filtered = prev.sections_attended.filter((id) => validIds.has(id));
      return filtered.length === prev.sections_attended.length
        ? prev
        : { ...prev, sections_attended: filtered };
    });
  }, [sections]);

  // Resets all state and clears the sessionStorage entry
  const clearSession = useCallback(() => {
    sessionStorage.removeItem(QP_STORAGE_KEY);
    setStep("form");
    setForm(EMPTY_FORM);
    setQuestions([]);
    setOrQuestions({});
    setPdfFile(null);
    setPdfUrl(null);
    setEditingKey(null);
    setOcrStatus("");
    setError(null);
    setSuccess(null);
  }, []);

  // Returns a change handler that updates a single FormState field and clears alerts
  const setField = useCallback(
    (key: keyof FormState) => (val: string) => {
      setForm((prev) => ({ ...prev, [key]: val }));
      setError(null);
      setSuccess(null);
    },
    []
  );

  // Navigates away using the onCancel prop if provided, otherwise pushes to list page
  const navigate = useCallback(() => {
    if (onCancel) onCancel();
    else router.push("/questionPaper");
  }, [onCancel, router]);

  // Computes total marks by summing compulsory questions directly and counting
  // each OR group once using the highest marks value multiplied by its pick_count
  const totalMarks = useMemo(() => {
    const groups = new Map<string, ParsedQuestion[]>();
    let compulsorySum = 0;

    for (const q of questions) {
      if (q.option_group) {
        if (!groups.has(q.option_group)) groups.set(q.option_group, []);
        groups.get(q.option_group)!.push(q);
      } else {
        compulsorySum += Number(q.max_marks) || 0;
      }
    }

    let groupSum = 0;
    for (const groupQs of groups.values()) {
      const hasSets = groupQs.some(q => q.option_set);
      if (!hasSets) {
        // Pick-N block
        const picks = Math.max(...groupQs.map(q => Number(q.pick_count) || 1));
        const marks = groupQs.map(q => Number(q.max_marks) || 0).sort((a, b) => b - a);
        groupSum += marks.slice(0, picks).reduce((a, b) => a + b, 0);
      } else {
        // OR block with Option Sets
        const setSums = new Map<string, number>();
        for (const q of groupQs) {
          const setName = q.option_set || "default";
          setSums.set(setName, (setSums.get(setName) || 0) + (Number(q.max_marks) || 0));
        }
        let maxSetSum = 0;
        for (const sum of setSums.values()) {
          if (sum > maxSetSum) maxSetSum = sum;
        }
        // Multiply by pick_count (usually 1 for standard OR blocks)
        const picks = Math.max(...groupQs.map(q => Number(q.pick_count) || 1));
        groupSum += maxSetSum * picks;
      }
    }
    return compulsorySum + groupSum;
  }, [questions]);

  // Resolves human-readable school, grade, and subject names from their IDs
  const resolvedNames = useMemo(() => ({
    schoolName: registry.schools.find((s) => String(s.id) === form.school_id)?.name ?? "",
    gradeName: registry.grades.find((g) => String(g.id) === form.grade_id)?.name ?? "",
    subjectName: registry.subjects.find((s) => String(s.id) === form.subject_id)?.name ?? "",
  }), [registry, form.school_id, form.grade_id, form.subject_id]);

  // Produces a comma-separated string of the names of selected sections
  const resolvedSectionNames = useMemo(
    () =>
      sections
        .filter((s) => form.sections_attended.includes(s.id))
        .map((s) => s.name)
        .join(", "),
    [sections, form.sections_attended]
  );

  // Validates the form, uploads the PDF to the OCR service, and transitions to the review step
  const handleUploadAndParse = async () => {
    if (!form.school_id || !form.grade_id || !form.subject_id) {
      setError("School, Grade and Subject are required"); return;
    }
    if (!form.exam_name.trim()) { setError("Exam Name is required"); return; }
    if (!form.exam_date) { setError("Exam Date is required"); return; }
    if (!form.max_marks) { setError("Max Marks is required"); return; }
    if (!form.set_number) { setError("Set Number is required"); return; }
    if (!form.exam_type) { setError("Exam Type is required"); return; }
    if (!pdfFile) { setError("Please select a PDF question paper to upload"); return; }

    setSubmitting(true);
    setError(null);
    setOcrStatus("Extracting questions with AI (takes ~1–2 minutes)…");

    try {
      const fd = new FormData();
      fd.append("question_paper", pdfFile);

      const res = await fetch(`${BEAVER_BASE}/api/exams/0/parse-paper`, {
        method: "POST",
        headers: authHeaders(),
        body: fd,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `OCR failed: ${res.status}`);
      }

      const data = await res.json();

      // Maps raw OCR response fields to the typed ParsedQuestion shape
      const parsed: ParsedQuestion[] = (data.questions ?? []).map((q: Record<string, unknown>) => ({
        question_number: String(q.question_number ?? ""),
        question_text: String(q.question_text ?? ""),
        question_type: String(q.question_type ?? "SA"),
        max_marks: Number(q.max_marks) || 1,
        option_group: q.option_group ? String(q.option_group) : null,
        option_set: q.option_set ? String(q.option_set) : null,
        pick_count: q.pick_count ? Number(q.pick_count) : null,
        question_label: q.question_label ? String(q.question_label) : String(q.question_number ?? ""),
        answer_key: String(q.answer_key ?? ""),
        ai_answer: String(q.ai_answer ?? ""),
        difficulty_level: q.difficulty_level ? String(q.difficulty_level) : undefined,
        bloom_taxonomy: q.bloom_taxonomy ? String(q.bloom_taxonomy) : undefined,
        chapter_name: q.chapter_name ? String(q.chapter_name) : undefined,
        concept_name: q.concept_name ? String(q.concept_name) : undefined,
        has_diagram: Boolean(q.has_diagram),
        diagram_bbox: (q.diagram_bbox as DiagramBBox | null | undefined) ?? null,
        diagram_crop_url: q.diagram_crop_url ? String(q.diagram_crop_url) : null,
        has_question_chemical_structure: Boolean(q.has_question_chemical_structure),
        has_answer_chemical_structure: Boolean(q.has_answer_chemical_structure),
        question_structure_smiles: q.question_structure_smiles ? String(q.question_structure_smiles) : null,
        question_structure_inchikey: q.question_structure_inchikey ? String(q.question_structure_inchikey) : null,
      }));

      setQuestions(parsed.map((q: any) => ({ ...q, _ui_id: Math.random().toString(36).slice(2) })));
      setOrQuestions(
        data.or_questions && typeof data.or_questions === "object" ? data.or_questions : {}
      );
      if (data.pdf_url) setPdfUrl(data.pdf_url);
      setStep("review");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to parse question paper");
    } finally {
      setSubmitting(false);
      setOcrStatus("");
    }
  };

  // Builds and POSTs the full question paper payload then optionally PUTs the OR config
  const handleSaveToBackend = async () => {
    if (questions.length === 0) { setError("No questions to save"); return; }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const payload = {
        school_id: Number(form.school_id),
        grade_id: Number(form.grade_id),
        subject_id: Number(form.subject_id),
        exam_id: Number(form.exam_id),
        exam_name: form.exam_name.trim(),
        exam_date: form.exam_date || null,
        max_marks: form.max_marks ? Number(form.max_marks) : totalMarks,
        file_name: pdfUrl,
        question_paper_parser: "claude-ocr",
        set_number: form.set_number.trim() || null,
        set_mode: form.set_mode,
        exam_type: form.exam_type || null,
        display_name: form.display_name.trim() || null,
        sections_attended: form.sections_attended,
        questions: questions.map((q) => ({
          question_number: parseFloat(q.question_number) || 0,
          question_text: q.question_text,
          question_type: q.question_type,
          max_marks: q.max_marks,
          option_group: q.option_group,
          option_set: q.option_set,
          pick_count: q.pick_count,
          question_label: q.question_label,
          answer_key: q.answer_key,
          ai_answer: q.ai_answer,
          difficulty_level: q.difficulty_level,
          bloom_taxonomy: q.bloom_taxonomy,
          has_diagram: Boolean(q.has_diagram),
          diagram_bbox: q.has_diagram && q.diagram_bbox ? JSON.stringify(q.diagram_bbox) : null,
          diagram_crop_url: q.has_diagram ? (q.diagram_crop_url ?? null) : null,
          has_question_chemical_structure: Boolean(q.has_question_chemical_structure),
          has_answer_chemical_structure: Boolean(q.has_answer_chemical_structure),
          question_structure_smiles: q.question_structure_smiles ?? null,
          question_structure_inchikey: q.question_structure_inchikey ?? null,
        })),
      };

      const res = await fetch(`${API_BASE}/api/data-quality/question-papers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify(payload),
      });

      const resBody = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(resBody?.error || resBody?.message || `Save failed: ${res.status}`);
      }

      // Sends OR config separately if the paper has any OR groups
      const paperId = resBody?.questionPaperId;
      if (paperId && Object.keys(orQuestions).length > 0) {
        const orRes = await fetch(
          `${API_BASE}/api/data-quality/question-papers/${paperId}/or-config`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify(orQuestions),
          }
        );

        if (!orRes.ok) {
          const orBody = await orRes.json().catch(() => ({}));
          const detail = orBody?.error || orBody?.message || `HTTP ${orRes.status}`;
          console.error("[CreatePaper] OR config PUT failed:", detail);
          setError(
            `Paper saved, but OR-question config failed to persist (${detail}). ` +
            `Retry from the paper edit page.`
          );
          return;
        }
      }

      setSuccess("Question paper saved successfully!");
      clearSession();
      setTimeout(navigate, 1800);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save question paper");
    } finally {
      setSaving(false);
    }
  };

  // Updates a single field on the question at the given array index
  const updateQuestion = useCallback(
    <K extends keyof ParsedQuestion>(idx: number, field: K, value: ParsedQuestion[K]) => {
      setQuestions((prev) =>
        prev.map((q, i) => (i === idx ? { ...q, [field]: value } : q))
      );
    },
    []
  );

  // Manual hanging-indent trigger: wraps the current textarea selection (or
  // inserts empty markers at the caret) in **...** — LatexPreview already
  // renders a bold-marked "**Label:**" line as a hanging-indent paragraph,
  // so this gives the user an explicit way to invoke it for text that isn't
  // auto-detected, any time they want.
  const applyHangingIndent = useCallback((idx: number) => {
    const el = questionTextRefs.current.get(idx);
    if (!el) return;
    const { selectionStart, selectionEnd, value } = el;
    const selected = value.slice(selectionStart, selectionEnd);
    const inserted = `**${selected}**`;
    const newValue = value.slice(0, selectionStart) + inserted + value.slice(selectionEnd);
    updateQuestion(idx, "question_text", newValue);
    requestAnimationFrame(() => {
      el.focus();
      if (selected) {
        el.setSelectionRange(selectionStart, selectionStart + inserted.length);
      } else {
        const caret = selectionStart + 2;
        el.setSelectionRange(caret, caret);
      }
    });
  }, [updateQuestion]);

  // Removes the question at the given index and closes the editor if it was open
  const deleteQuestion = useCallback((idx: number) => {
    setQuestions((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next;
    });
    setEditingKey(null);
  }, []);

  // Inserts a new blank question at insertIdx and opens its editor
  // Uses _ui_id as the scroll anchor so the target card is always found
  const addQuestionAt = useCallback((insertIdx: number) => {
    const prevNum = insertIdx > 0
      ? (parseFloat(questions[insertIdx - 1]?.question_number) || 0) + 1
      : 1;
    const newQNumber = String(prevNum);
    const newUiId = Math.random().toString(36).slice(2);
    const newQ = { ...EMPTY_QUESTION, question_number: newQNumber, _ui_id: newUiId };
    setQuestions((prev) => {
      const copy = [...prev];
      copy.splice(insertIdx, 0, newQ);
      return copy;
    });
    setEditingKey(newUiId);
    setTimeout(() => {
      document.getElementById(`q-card-${newUiId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }, [questions]);

  // Appends a new blank question after the last existing one and opens its editor
  const addQuestionAtEnd = useCallback(() => {
    const maxNum = questions.length > 0
      ? Math.max(...questions.map((q) => parseFloat(q.question_number) || 0)) + 1
      : 1;
    const newQNumber = String(maxNum);
    const newUiId = Math.random().toString(36).slice(2);
    const newQ = { ...EMPTY_QUESTION, question_number: newQNumber, _ui_id: newUiId };
    setQuestions((prev) => [...prev, newQ]);
    setEditingKey(newUiId);
    setTimeout(() => {
      document.getElementById(`q-card-${newUiId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }, [questions]);

  // Closes the editor and re-sorts questions using multi-level numeric comparison
  const saveQuestion = useCallback(() => {
    setEditingKey(null);
    setQuestions((prev) => [...prev].sort(sortByQuestionNumber));
  }, []);

  // Toggles the has_diagram flag on a question by array index
  const toggleDiagram = (idx: number, on: boolean) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, has_diagram: on } : q)));
  };

  // Toggles whether the question text contains a chemical structure
  const toggleQuestionChemStructure = (idx: number, on: boolean) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, has_question_chemical_structure: on } : q)));
  };

  // Toggles whether the answer contains a chemical structure
  const toggleAnswerChemStructure = (idx: number, on: boolean) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, has_answer_chemical_structure: on } : q)));
  };

  // Sends the adjusted bounding box to the crop endpoint and updates the crop URL
  const recropDiagram = useCallback(async (idx: number, bbox: NormBBox) => {
    const q = questions[idx];
    const pageUrl = q?.diagram_bbox?.page_image_url;
    if (!pageUrl) return;
    try {
      const res = await fetch(`${BEAVER_BASE}/api/exams/crop-question`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders() },
        body: JSON.stringify({ page_image_url: pageUrl, bbox, question_number: q.question_number }),
      });
      if (!res.ok) return;
      const data = await res.json();
      setQuestions((prev) => prev.map((qq, i) =>
        i === idx
          ? {
            ...qq,
            diagram_bbox: { ...(qq.diagram_bbox as DiagramBBox), ...bbox },
            diagram_crop_url: data.crop_url ?? qq.diagram_crop_url,
          }
          : qq,
      ));
    } catch (e) {
      console.error("[CreatePaper] re-crop failed:", e);
    }
  }, [questions]);

  // Scrolls to a card and opens its editor using _ui_id as the stable key
  const openEditor = useCallback((uiId: string) => {
    setEditingKey(uiId);
    setTimeout(() => {
      document.getElementById(`q-card-${uiId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }, []);

  if (step === "review") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100/50 px-4 py-6">
        <div className="max-w-[1600px] mx-auto">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
            <div className="flex items-center gap-3">
              <button onClick={navigate} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium transition">
                <ArrowLeft size={15} /> Back
              </button>
              <div className="w-px h-5 bg-gray-200" />
              <button onClick={() => setStep("form")} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium transition">
                <ArrowLeft size={15} /> Edit Details
              </button>
              <div className="w-px h-5 bg-gray-200" />
              <h1 className="text-lg font-bold text-gray-900">Review Extracted Questions</h1>
            </div>
            <button
              onClick={clearSession}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 font-medium transition px-3 py-1.5 rounded-lg hover:bg-red-50 border border-transparent hover:border-red-200"
            >
              <X size={13} /> New Paper
            </button>
          </div>

          <div className="flex flex-col lg:flex-row gap-4 h-auto lg:h-[calc(100vh-120px)] min-h-[400px]">

            {/* PDF preview panel */}
            <div className="w-full lg:w-[40%] xl:w-[45%] shrink-0 bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm flex flex-col h-[50vh] min-h-[300px] lg:h-auto">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50/80">
                <FileText size={14} className="text-indigo-500" />
                <span className="text-xs font-semibold text-gray-600">Question Paper Preview</span>
              </div>
              {pdfUrl ? (
                <iframe src={pdfUrl} className="flex-1 w-full" title="Question Paper PDF" />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-300 gap-2">
                  <FileText size={48} strokeWidth={1} />
                  <p className="text-xs text-gray-400">PDF preview not available after refresh</p>
                  <p className="text-[10px] text-gray-300">Re-upload the PDF to restore the preview</p>
                </div>
              )}
            </div>

            {/* Questions panel: summary bar + sidebar tree + card list */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

              {/* Paper metadata summary row */}
              <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4 shadow-sm shrink-0 overflow-x-auto">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
                    {[
                      ["School", resolvedNames.schoolName],
                      ["Grade", resolvedNames.gradeName],
                      ["Subject", resolvedNames.subjectName],
                      ["Subject Code", registry.subjects.find((s) => String(s.id) === form.subject_id)?.subjectCode || "-"],
                      ["Exam", form.exam_name],
                      ["Set", form.set_number],
                      ["Type", form.exam_type],
                      ["Sections", resolvedSectionNames],
                      ["Max Marks", form.max_marks],
                    ]
                      .filter(([, value]) => value)
                      .map(([label, value]) => (
                        <div key={label}>
                          <span className="text-gray-400 text-[10px] uppercase tracking-wider font-semibold">{label}</span>
                          <p className="font-semibold text-gray-800 text-xs mt-0.5">{value}</p>
                        </div>
                      ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center">
                        <span className="text-xs font-bold text-indigo-600">{questions.length}</span>
                      </div>
                      <span className="text-[10px] text-gray-400 font-medium">Qs</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                        <span className="text-xs font-bold text-emerald-600">{totalMarks}</span>
                      </div>
                      <span className="text-[10px] text-gray-400 font-medium">Marks</span>
                    </div>
                    <button
                      onClick={addQuestionAtEnd}
                      className="ml-2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors shadow-sm border border-indigo-100"
                    >
                      <Plus size={14} /> Add Q
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-1 min-h-0 gap-2">

                {/* Sidebar: tree of question numbers grouped by base and OR blocks */}
                <div className="w-40 shrink-0 overflow-y-auto py-4 space-y-2 font-mono text-[11px] pr-2 hidden sm:block">
                  {buildUiGroups(questions).map(group => (
                    <div key={group.parent} className="border border-gray-100 rounded-md p-1.5 bg-gray-50/30">
                      <div className="font-bold mb-2 text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                        Q{group.parent}
                      </div>

                      {group.blocks.map((block, i) => {
                        if (block.type === "compulsory") {
                          return (
                            <div key={i} className="space-y-0.5 mb-2 px-1">
                              {block.items!.map(({ q }) => {
                                const isActive = editingKey === q.question_number;
                                return (
                                  <button
                                    key={q._ui_id || q.question_number}
                                    onClick={() => openEditor(q.question_number)}
                                    className={`w-full text-left px-2 py-1 rounded transition-colors ${isActive
                                      ? "bg-indigo-100 text-indigo-700 font-bold"
                                      : "text-gray-600 hover:bg-gray-200"
                                      }`}
                                  >
                                    {q.question_number}
                                  </button>
                                );
                              })}
                            </div>
                          );
                        }

                        if (block.type === "or") {
                          // Pick-N block: shows a checkbox-style list with the required count
                          if (block.pickCount && block.pickCount > 1) {
                            return (
                              <div key={i} className="mb-2 p-1 border border-amber-200/50 bg-amber-50/30 rounded">
                                <div className="text-amber-600 font-semibold mb-1 text-[10px] uppercase tracking-wide">
                                  Choose any {block.pickCount}:
                                </div>
                                <div className="space-y-0.5">
                                  {block.sets!.flatMap(s => s.items).map(({ q }) => {
                                    const isActive = editingKey === q.question_number;
                                    return (
                                      <button
                                        key={q._ui_id || q.question_number}
                                        onClick={() => openEditor(q.question_number)}
                                        className={`w-full text-left px-2 py-1 rounded transition-colors flex items-center gap-1.5 ${isActive
                                          ? "bg-indigo-100 text-indigo-700 font-bold"
                                          : "text-gray-600 hover:bg-amber-100/50"
                                          }`}
                                      >
                                        <span className="text-gray-400">☐</span> {q.question_number}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            );
                          }

                          // Standard OR block: shows each set separated by an OR label
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
                                    {set.items.map(({ q }) => {
                                      const isActive = editingKey === q._ui_id;
                                      return (
                                        <button
                                          key={q._ui_id || q.question_number}
                                          onClick={() => openEditor(q._ui_id!)}
                                          className={`w-full text-left px-2 py-1 rounded transition-colors ${isActive
                                            ? "bg-indigo-100 text-indigo-700 font-bold"
                                            : "text-gray-600 hover:bg-amber-100/50"
                                            }`}
                                        >
                                          {q.question_number}
                                        </button>
                                      );
                                    })}
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

                {/* Scrollable list of question cards */}
                <div className="flex-1 overflow-y-auto pr-1 space-y-3 pb-4">
                  {questions.map((q, idx) => {
                    const isEditing = editingKey === q._ui_id;
                    const badgeClass = TYPE_BADGE[q.question_type] ?? "bg-gray-50 text-gray-600 border-gray-200";

                    return (
                      <div
                        key={q._ui_id || q.question_number}
                        id={`q-card-${q._ui_id}`}
                        className={`bg-white border rounded-xl transition-all shadow-sm ${isEditing
                          ? "border-indigo-300 ring-2 ring-indigo-100"
                          : "border-gray-200 hover:border-gray-300"
                          }`}
                      >
                        {/* Card header: question number, type badge, OR tag, marks, and action buttons */}
                        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-b border-gray-100 bg-gray-50/50 rounded-t-xl">
                          <div className="flex flex-wrap items-center gap-2.5">
                            {isEditing ? (
                              <input
                                value={q.question_number}
                                onChange={(e) => updateQuestion(idx, "question_number", e.target.value)}
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
                                onChange={(e) => updateQuestion(idx, "question_type", e.target.value)}
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
                                  onChange={(e) => updateQuestion(idx, "max_marks", parseFloat(e.target.value) || 0)}
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
                                onClick={saveQuestion}
                                className="flex items-center gap-1 px-2 py-1 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition"
                              >
                                <CheckCircle size={11} /> Save
                              </button>
                            ) : (
                              <button
                                onClick={() => openEditor(q._ui_id!)}
                                className="p-1 rounded-lg text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition"
                                title="Edit question"
                              >
                                <Pencil size={12} />
                              </button>
                            )}

                            <button
                              onClick={() => addQuestionAt(idx + 1)}
                              className="p-1 rounded-lg text-gray-400 hover:text-emerald-600 hover:bg-emerald-50 transition"
                              title="Insert question below"
                            >
                              <Plus size={12} />
                            </button>

                            <button
                              onClick={() => deleteQuestion(idx)}
                              className="p-1 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 transition"
                              title="Delete question"
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>

                        {/* Card body: question text editor or LaTeX preview plus metadata badges */}
                        <div className="px-4 py-2.5 space-y-2">
                          {isEditing ? (
                            <div className="space-y-2">
                              <div className="flex justify-end">
                                <button
                                  type="button"
                                  onClick={() => applyHangingIndent(idx)}
                                  title="Wrap the selected text as a hanging-indent label (e.g. Assertion (A):)"
                                  className="flex items-center gap-1 text-[10px] font-semibold text-gray-500 hover:text-indigo-600 px-2 py-1 rounded-md border border-gray-200 hover:border-indigo-300 transition"
                                >
                                  <WrapText size={11} /> Hanging indent
                                </button>
                              </div>
                              <textarea
                                ref={(el) => {
                                  if (el) questionTextRefs.current.set(idx, el);
                                  else questionTextRefs.current.delete(idx);
                                }}
                                value={q.question_text}
                                onChange={(e) => updateQuestion(idx, "question_text", e.target.value)}
                                rows={Math.max(3, q.question_text.split("\n").length)}
                                className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 resize-y leading-relaxed"
                              />
                              <input
                                value={q.answer_key}
                                onChange={(e) => updateQuestion(idx, "answer_key", e.target.value)}
                                placeholder="Answer Key (e.g. A, B, C, D)"
                                className="w-full h-8 px-3 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-gray-50"
                              />
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-gray-100">
                                <div className="space-y-1.5">
                                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                                    Grouping & Choices
                                  </label>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="text"
                                      placeholder="Group (e.g. 21_opt)"
                                      value={q.option_group ?? ""}
                                      onChange={(e) => updateQuestion(idx, "option_group", e.target.value || null)}
                                      className="w-full max-w-[100px] h-8 px-2 text-xs border border-indigo-200 rounded-lg bg-white focus:outline-none focus:border-indigo-400"
                                    />
                                    <input
                                      type="text"
                                      placeholder="Set (A/B)"
                                      value={q.option_set ?? ""}
                                      onChange={(e) => updateQuestion(idx, "option_set", e.target.value || null)}
                                      className="w-full max-w-[80px] h-8 px-2 text-xs border border-indigo-200 rounded-lg bg-white focus:outline-none focus:border-indigo-400"
                                    />
                                    <input
                                      type="number"
                                      placeholder="Picks"
                                      value={q.pick_count ?? ""}
                                      onChange={(e) => updateQuestion(idx, "pick_count", Number(e.target.value) || null)}
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
                                      onChange={(e) => updateQuestion(idx, "difficulty_level", e.target.value || undefined)}
                                      className="h-8 px-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-white"
                                    >
                                      <option value="" disabled>Difficulty…</option>
                                      <option value="Easy">Easy</option>
                                      <option value="Moderate">Moderate</option>
                                      <option value="Hard">Hard</option>
                                    </select>
                                    <select
                                      value={q.bloom_taxonomy ?? ""}
                                      onChange={(e) => updateQuestion(idx, "bloom_taxonomy", e.target.value || undefined)}
                                      className="h-8 px-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 bg-white"
                                    >
                                      <option value="">Bloom's Taxonomy…</option>
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

                          {/* Metadata badges shown in read mode */}
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

                          {/* Diagram editor shown when the OCR detected a bounding box for this question */}
                          {q.diagram_bbox?.page_image_url && (
                            <div className="pt-2 mt-1 border-t border-gray-100">
                              <label className="flex items-center gap-1.5 text-[11px] font-medium text-gray-600 cursor-pointer mb-2">
                                <input
                                  type="checkbox"
                                  checked={Boolean(q.has_diagram)}
                                  onChange={(e) => toggleDiagram(idx, e.target.checked)}
                                  className="rounded text-amber-600 w-3.5 h-3.5"
                                />
                                <span className="text-amber-600 font-bold">Has diagram</span>
                                <span className="text-gray-400">— drag the box around the whole question to re-crop</span>
                              </label>
                              {q.has_diagram && (
                                <DiagramEditor
                                  pageUrl={q.diagram_bbox.page_image_url}
                                  bbox={{
                                    x1: q.diagram_bbox.x1,
                                    y1: q.diagram_bbox.y1,
                                    x2: q.diagram_bbox.x2,
                                    y2: q.diagram_bbox.y2,
                                  }}
                                  cropUrl={q.diagram_crop_url ?? null}
                                  onCommit={(b) => recropDiagram(idx, b)}
                                />
                              )}
                            </div>
                          )}

                          {/* Chemical structure presence flags that can be overridden by the operator */}
                          <div className="pt-2 mt-1 border-t border-gray-100 flex flex-wrap gap-x-4 gap-y-1">
                            <label className="flex items-center gap-1.5 text-[11px] font-medium text-gray-600 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(q.has_question_chemical_structure)}
                                onChange={(e) => toggleQuestionChemStructure(idx, e.target.checked)}
                                className="rounded text-violet-600 w-3.5 h-3.5"
                              />
                              <span className="text-violet-600 font-bold">Structure in question</span>
                            </label>
                            <label className="flex items-center gap-1.5 text-[11px] font-medium text-gray-600 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={Boolean(q.has_answer_chemical_structure)}
                                onChange={(e) => toggleAnswerChemStructure(idx, e.target.checked)}
                                className="rounded text-violet-600 w-3.5 h-3.5"
                              />
                              <span className="text-violet-600 font-bold">Structure in answer</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  <button
                    onClick={addQuestionAtEnd}
                    className="w-full h-9 border-2 border-dashed border-gray-300 hover:border-indigo-400 rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-indigo-600 transition"
                  >
                    <Plus size={13} /> Add Question
                  </button>
                </div>
              </div>

              {/* Save bar with error and success feedback */}
              <div className="shrink-0 pt-3 border-t border-gray-200 mt-2">
                {error && <p className="text-xs text-red-500 font-medium mb-2">{error}</p>}
                {success && (
                  <div className="flex items-center gap-2 text-xs text-emerald-600 font-medium bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 mb-2">
                    <CheckCircle size={13} className="text-emerald-500 shrink-0" />
                    <span>{success}</span>
                  </div>
                )}
                <button
                  onClick={handleSaveToBackend}
                  disabled={saving || questions.length === 0}
                  className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2 shadow-sm shadow-indigo-200"
                >
                  {saving ? (
                    <><Loader2 size={14} className="animate-spin" /> Saving…</>
                  ) : (
                    <><Save size={14} /> Save ({questions.length} questions, {totalMarks} marks)</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Upload form step shown before OCR parsing
  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="max-w-xl mx-auto">

        <div className="flex items-center gap-3 mb-8">
          <button onClick={navigate} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium transition">
            <ArrowLeft size={15} /> Back
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <h1 className="text-lg font-bold text-gray-900">Upload Question Paper</h1>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">

          <SmartSelect label="School Name" required value={form.school_id}
            options={registry.schools.map((s) => ({ label: s.name, value: String(s.id) }))}
            placeholder="Select school" onChange={setField("school_id")} />

          <div className="grid grid-cols-2 gap-4">
            <SmartSelect label="Grade" required value={form.grade_id}
              options={registry.grades.map((g) => ({ label: g.name, value: String(g.id) }))}
              placeholder="Select grade" onChange={setField("grade_id")} />
            <SmartSelect label="Subject Name" required value={form.subject_id}
              options={registry.subjects.map((s) => ({ label: s.name, value: String(s.id) }))}
              placeholder="Select subject" onChange={setField("subject_id")} />
          </div>

          <div>
            <SmartSelect
              label="Exam Name" required value={form.exam_name}
              options={registry.examNames
                .filter(e =>
                  (!form.school_id || String(e.schoolId) === form.school_id) &&
                  (!form.grade_id || String(e.gradeId) === form.grade_id)
                )
                .map((e) => ({ label: e.name, value: e.name }))}
              placeholder="Select exam name"
              onChange={(val) => {
                setField("exam_name")(val);
                const examObj = registry.examNames.find((e) => e.name === val);
                if (examObj) {
                  setField("exam_id")(String(examObj.id));
                  if (examObj.examDate) {
                    const d = new Date(examObj.examDate);
                    if (!isNaN(d.getTime())) {
                      setField("exam_date")(d.toISOString().split("T")[0]);
                    }
                  }
                  if (examObj.examType) setField("exam_type")(examObj.examType);
                }
              }}
            />
            <p className="mt-1 text-[11px] text-gray-400">
              A new question paper record will be created with this name.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Exam Date</label>
              <input
                type="text" readOnly
                value={form.exam_date || "Auto-filled on selection"}
                className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed focus:outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Max Marks <span className="text-red-400">*</span>
              </label>
              <input
                type="number" min="1" step="any"
                value={form.max_marks || ""}
                onChange={(e) => setField("max_marks")(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="e.g. 80"
                className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Subject Code</label>
              <input
                type="text" readOnly
                value={registry.subjects.find((s) => String(s.id) === form.subject_id)?.subjectCode || ""}
                placeholder="Autofills from subject..."
                className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed focus:outline-none transition"
              />
            </div>
            <SmartSelect label="Set Number" required value={form.set_number}
              options={SET_NUMBER_OPTIONS}
              placeholder="Select set" onChange={setField("set_number")} />
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Exam Type</label>
              <input
                type="text" readOnly
                value={form.exam_type || ""}
                placeholder="Autofills from exam..."
                className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed focus:outline-none transition"
              />
            </div>
            <SmartSelect label="Set Mode" required value={form.set_mode}
              options={SET_MODE_OPTIONS}
              placeholder="Select set mode" onChange={setField("set_mode")} />
          </div>

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">Display Name</label>
            <input
              type="text"
              value={form.display_name}
              onChange={(e) => setField("display_name")(e.target.value)}
              placeholder="Friendly name shown in the paper list"
              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition"
            />
          </div>

          <MultiSelect
            label="Sections Attended"
            values={form.sections_attended}
            options={sections.map((s) => ({ label: s.name, value: s.id }))}
            emptyText={
              !form.school_id || !form.grade_id
                ? "Select a school and grade first"
                : "No sections configured for this school + grade"
            }
            helperText="The sections that sat this paper."
            onChange={(ids) => setForm((prev) => ({ ...prev, sections_attended: ids }))}
          />

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Upload Question Paper (PDF) <span className="text-red-400">*</span>
            </label>
            <p className="text-xs text-gray-400 mb-2">
              PDF file containing the questions. OCR will extract and structure them automatically. Max {MAX_PDF_SIZE_MB} MB.
            </p>
            <div className="space-y-2">
              {pdfFile ? (
                <div className="flex items-center gap-3 h-9 px-3 bg-green-50 border border-green-200 rounded-lg">
                  <span className="text-xs font-medium text-green-700 flex-1 truncate">{pdfFile.name}</span>
                  <span className="text-xs text-green-500">{(pdfFile.size / 1024 / 1024).toFixed(1)} MB</span>
                  <button
                    onClick={() => { setPdfFile(null); setError(null); setSuccess(null); }}
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
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
                  setError("Please select a valid PDF file."); return;
                }
                if (file.size > MAX_PDF_SIZE_MB * 1024 * 1024) {
                  setError(`PDF exceeds the ${MAX_PDF_SIZE_MB} MB limit.`); return;
                }
                setPdfFile(file);
                setError(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            />
          </div>

          {ocrStatus && (
            <div className="flex items-center gap-2 text-xs text-indigo-600 font-medium bg-indigo-50 border border-indigo-200 rounded-lg p-3">
              <Loader2 size={14} className="animate-spin shrink-0" />
              <span>{ocrStatus}</span>
            </div>
          )}

          {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
          {success && (
            <div className="flex items-center gap-2 text-xs text-emerald-600 font-medium bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <CheckCircle size={14} className="text-emerald-500 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <button
            onClick={handleUploadAndParse}
            disabled={submitting}
            className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2"
          >
            {submitting ? (
              <><Loader2 size={15} className="animate-spin" /> Uploading & Parsing…</>
            ) : (
              "Upload and Parse"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

// Shapes used by buildUiGroups to represent the structured sidebar tree
interface OrSet {
  set: string;
  items: { q: ParsedQuestion; idx: number }[];
}

interface UiBlock {
  type: "compulsory" | "or";
  groupKey?: string;
  pickCount?: number | null;
  sets?: OrSet[];
  items?: { q: ParsedQuestion; idx: number }[];
}

interface UiGroup {
  parent: string;
  blocks: UiBlock[];
}

// Transforms a flat question list into a nested structure suitable for the sidebar
// Groups questions by their top-level number (parent) then separates compulsory
// questions from OR blocks within each parent group
// Each compulsory question gets its own block to preserve document order when
// compulsory and optional questions are interleaved
// OR blocks are further split by option_set so the sidebar can render OR labels
function buildUiGroups(questions: ParsedQuestion[]): UiGroup[] {
  const result: UiGroup[] = [];

  questions.forEach((q, idx) => {
    const parent = q.question_number.split(".")[0];

    let group = result.find(g => g.parent === parent);
    if (!group) {
      group = { parent, blocks: [] };
      result.push(group);
    }

    if (!q.option_group) {
      group.blocks.push({ type: "compulsory", items: [{ q, idx }] });
    } else {
      let block = group.blocks.find(
        b => b.type === "or" && b.groupKey === q.option_group
      );

      if (!block) {
        block = {
          type: "or",
          groupKey: q.option_group,
          pickCount: q.pick_count,
          sets: [],
        };
        group.blocks.push(block);
      }

      const setKey = q.option_set ?? "A";
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