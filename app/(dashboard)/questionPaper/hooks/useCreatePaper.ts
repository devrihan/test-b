"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { keys } from "@/app/lib/queryKeys";
import { useRouter } from "next/navigation";
import type {
  ParsedQuestion, OrEntry, Registry, RegistryItem, RegistryExamItem,
  FormState, SessionData, SectionItem,
} from "../lib/types";
import { API_BASE, BEAVER_BASE, authHeaders } from "../lib/api";
import { QP_STORAGE_KEY, EMPTY_FORM, EMPTY_QUESTION } from "../lib/constants";
import { loadSession, saveSession } from "../lib/session";
import { sortByQuestionNumber } from "../lib/questionGroups";
import type { NormBBox } from "../DiagramEditor";

interface DiagramBBox extends NormBBox {
  page: number;
  page_image_url: string;
}

const NO_SECTIONS: SectionItem[] = [];

export function useCreatePaper(onCancel?: () => void) {
  const router = useRouter();

  // Refs for textarea elements keyed by question index (for hanging-indent action)
  const questionTextRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map());
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"form" | "review">("form");
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [questions, setQuestions] = useState<ParsedQuestion[]>([]);
  const [orQuestions, setOrQuestions] = useState<Record<string, OrEntry>>({});
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [ocrStatus, setOcrStatus] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  // Rehydrate from sessionStorage on mount so page refresh doesn't lose work
  useEffect(() => {
    const session = loadSession();
    if (session) {
      setStep(session.step);
      setForm({ ...EMPTY_FORM, ...session.form });
      setQuestions(
        session.questions.map((q: any) => ({
          ...q,
          _ui_id: q._ui_id || Math.random().toString(36).slice(2),
        })),
      );
      setOrQuestions(session.orQuestions ?? {});
      setPdfUrl(session.pdfUrl ?? null);
    }
    setRestored(true);
  }, []);

  // Persist to sessionStorage after every relevant change (skip first render)
  useEffect(() => {
    if (!restored) return;
    saveSession({ step, form, questions, orQuestions, pdfUrl } as SessionData);
  }, [step, form, questions, orQuestions, pdfUrl, restored]);

  // Registry dropdowns. batch-form-options shares the app-wide cache; academic
  // years are their own key so both can be reused elsewhere.
  const optionsQuery = useQuery({
    queryKey: keys.registry.batchFormOptions(),
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/registry/batch-form-options`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load registry options");
      return res.json();
    },
  });

  const yearsQuery = useQuery({
    queryKey: keys.registry.academicYears(),
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/data-quality/academic-years`, { headers: authHeaders() });
      if (!res.ok) return { academicYears: [] };
      return res.json();
    },
  });

  const registry: Registry = useMemo(() => ({
    schools: optionsQuery.data?.schools ?? [],
    grades: optionsQuery.data?.grades ?? [],
    subjects: optionsQuery.data?.subjects ?? [],
    examNames: optionsQuery.data?.examNames ?? [],
    academicYears: yearsQuery.data?.academicYears ?? [],
  }), [optionsQuery.data, yearsQuery.data]);

  // Sections for the chosen school+grade. Both ids are in the key, so a slow
  // reply for a previous pair can no longer land on the current one — this
  // replaces the hand-written AbortController.
  const sectionsQuery = useQuery({
    queryKey: keys.registry.sections(form.school_id, form.grade_id),
    queryFn: async (): Promise<SectionItem[]> => {
      const res = await fetch(
        `${API_BASE}/api/data-quality/sections?schoolId=${form.school_id}&gradeId=${form.grade_id}`,
        { headers: authHeaders() },
      );
      if (!res.ok) throw new Error("Failed to load sections");
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    enabled: !!form.school_id && !!form.grade_id,
  });

  const sections = sectionsQuery.data ?? NO_SECTIONS;

  // Drop section IDs that no longer belong to the current school+grade
  useEffect(() => {
    setForm((prev) => {
      const validIds = new Set(sections.map((s) => s.id));
      const filtered = prev.sections_attended.filter((id) => validIds.has(id));
      return filtered.length === prev.sections_attended.length
        ? prev
        : { ...prev, sections_attended: filtered };
    });
  }, [sections]);

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

  const setField = useCallback(
    (key: keyof FormState) => (val: string) => {
      setForm((prev) => ({ ...prev, [key]: val }));
      setError(null);
      setSuccess(null);
    },
    [],
  );

  const navigate = useCallback(() => {
    if (onCancel) onCancel();
    else router.push("/questionPaper");
  }, [onCancel, router]);

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
      const hasSets = groupQs.some((q) => q.option_set);
      if (!hasSets) {
        const picks = Math.max(...groupQs.map((q) => Number(q.pick_count) || 1));
        const marks = groupQs.map((q) => Number(q.max_marks) || 0).sort((a, b) => b - a);
        groupSum += marks.slice(0, picks).reduce((a, b) => a + b, 0);
      } else {
        const setSums = new Map<string, number>();
        for (const q of groupQs) {
          const setName = q.option_set || "default";
          setSums.set(setName, (setSums.get(setName) || 0) + (Number(q.max_marks) || 0));
        }
        let maxSetSum = 0;
        for (const sum of setSums.values()) { if (sum > maxSetSum) maxSetSum = sum; }
        const picks = Math.max(...groupQs.map((q) => Number(q.pick_count) || 1));
        groupSum += maxSetSum * picks;
      }
    }
    return compulsorySum + groupSum;
  }, [questions]);

  const resolvedNames = useMemo(() => ({
    schoolName: registry.schools.find((s) => String(s.id) === form.school_id)?.name ?? "",
    gradeName: registry.grades.find((g) => String(g.id) === form.grade_id)?.name ?? "",
    subjectName: registry.subjects.find((s) => String(s.id) === form.subject_id)?.name ?? "",
  }), [registry, form.school_id, form.grade_id, form.subject_id]);

  const resolvedSectionNames = useMemo(
    () => sections.filter((s) => form.sections_attended.includes(s.id)).map((s) => s.name).join(", "),
    [sections, form.sections_attended],
  );

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
      setOrQuestions(data.or_questions && typeof data.or_questions === "object" ? data.or_questions : {});
      if (data.pdf_url) setPdfUrl(data.pdf_url);
      setStep("review");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to parse question paper");
    } finally {
      setSubmitting(false);
      setOcrStatus("");
    }
  };

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
        academic_year_id: form.academic_year_id ? Number(form.academic_year_id) : null,
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

      const paperId = resBody?.questionPaperId;
      if (paperId && Object.keys(orQuestions).length > 0) {
        const orRes = await fetch(
          `${API_BASE}/api/data-quality/question-papers/${paperId}/or-config`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json", ...authHeaders() },
            body: JSON.stringify(orQuestions),
          },
        );
        if (!orRes.ok) {
          const orBody = await orRes.json().catch(() => ({}));
          const detail = orBody?.error || orBody?.message || `HTTP ${orRes.status}`;
          console.error("[CreatePaper] OR config PUT failed:", detail);
          setError(
            `Paper saved, but OR-question config failed to persist (${detail}). ` +
            `Retry from the paper edit page.`,
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

  const updateQuestion = useCallback(
    <K extends keyof ParsedQuestion>(idx: number, field: K, value: ParsedQuestion[K]) => {
      setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, [field]: value } : q)));
    },
    [],
  );

  // Wraps selected text (or inserts empty markers) in **...** for hanging-indent rendering
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

  const deleteQuestionAt = useCallback((idx: number) => {
    setQuestions((prev) => prev.filter((_, i) => i !== idx));
    setEditingKey(null);
  }, []);

  const addQuestionAt = useCallback((insertIdx: number) => {
    const prevNum = insertIdx > 0
      ? (parseFloat(questions[insertIdx - 1]?.question_number) || 0) + 1
      : 1;
    const newUiId = Math.random().toString(36).slice(2);
    const newQ = { ...EMPTY_QUESTION, question_number: String(prevNum), _ui_id: newUiId };
    setQuestions((prev) => {
      const copy = [...prev];
      copy.splice(insertIdx, 0, newQ);
      return copy;
    });
    setEditingKey(newUiId);
    setTimeout(() => {
      document.getElementById(`q-card-${newUiId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }, [questions]);

  const addQuestionAtEnd = useCallback(() => {
    const maxNum = questions.length > 0
      ? Math.max(...questions.map((q) => parseFloat(q.question_number) || 0)) + 1
      : 1;
    const newUiId = Math.random().toString(36).slice(2);
    const newQ = { ...EMPTY_QUESTION, question_number: String(maxNum), _ui_id: newUiId };
    setQuestions((prev) => [...prev, newQ]);
    setEditingKey(newUiId);
    setTimeout(() => {
      document.getElementById(`q-card-${newUiId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  }, [questions]);

  const saveQuestion = useCallback(() => {
    setEditingKey(null);
    setQuestions((prev) => [...prev].sort(sortByQuestionNumber));
  }, []);

  const openEditor = useCallback((uiId: string) => {
    setEditingKey(uiId);
    setTimeout(() => {
      document.getElementById(`q-card-${uiId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }, []);

  const toggleDiagram = (idx: number, on: boolean) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, has_diagram: on } : q)));
  };

  const toggleQuestionChemStructure = (idx: number, on: boolean) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, has_question_chemical_structure: on } : q)));
  };

  const toggleAnswerChemStructure = (idx: number, on: boolean) => {
    setQuestions((prev) => prev.map((q, i) => (i === idx ? { ...q, has_answer_chemical_structure: on } : q)));
  };

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
      setQuestions((prev) =>
        prev.map((qq, i) =>
          i === idx
            ? { ...qq, diagram_bbox: { ...(qq.diagram_bbox as DiagramBBox), ...bbox }, diagram_crop_url: data.crop_url ?? qq.diagram_crop_url }
            : qq,
        ),
      );
    } catch (e) {
      console.error("[CreatePaper] re-crop failed:", e);
    }
  }, [questions]);

  return {
    // refs
    questionTextRefs,
    fileInputRef,
    // state
    step,
    form,
    registry,
    sections,
    pdfFile,
    pdfUrl,
    questions,
    orQuestions,
    editingKey,
    submitting,
    saving,
    ocrStatus,
    error,
    success,
    // derived
    totalMarks,
    resolvedNames,
    resolvedSectionNames,
    // setters (direct)
    setStep,
    setForm,
    setEditingKey,
    setPdfFile,
    setPdfUrl,
    setOrQuestions,
    setError,
    setSuccess,
    // handlers
    setField,
    clearSession,
    navigate,
    handleUploadAndParse,
    handleSaveToBackend,
    updateQuestion,
    applyHangingIndent,
    deleteQuestionAt,
    addQuestionAt,
    addQuestionAtEnd,
    saveQuestion,
    openEditor,
    toggleDiagram,
    toggleQuestionChemStructure,
    toggleAnswerChemStructure,
    recropDiagram,
  };
}
