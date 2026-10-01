"use client";

import { useState, useEffect, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "@/app/lib/queryKeys";
import type { QuestionListItemDTO, PaperMeta, EditState, DiagramBBox } from "../lib/types";
import { API_BASE, authHeaders, resolvePdfUrl } from "../lib/api";
import {
  updateQuestion,
  addQuestion,
  deleteQuestion,
  reExtractEntirePaperFromUrl,
  cropQuestionDiagram,
} from "../../pdfExtract/lib/beaverApi";
import type { NormBBox } from "../DiagramEditor";

const NO_QUESTIONS: QuestionListItemDTO[] = [];

export function useViewPaper(paperId: string) {
  const queryClient = useQueryClient();
  const [actionError, setFetchError] = useState<string | null>(null);
  const [editState, setEditState] = useState<EditState>({ status: "idle" });
  const [deleteQuestionId, setDeleteQuestionId] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [reExtractQuestionId, setReExtractQuestionId] = useState<number | null>(null);
  const [isReExtractingPaper, setIsReExtractingPaper] = useState(false);
  const [showReExtractModal, setShowReExtractModal] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [editingDiagramId, setEditingDiagramId] = useState<number | null>(null);

  const paperQuery = useQuery({
    queryKey: keys.questionPaper.view(paperId),
    queryFn: async () => {
      const headers = authHeaders();
      const regRes = await fetch(`${API_BASE}/api/registry/batch-form-options`, { headers });
      if (!regRes.ok) throw new Error("Failed to load registry");
      const registry = await regRes.json();

      const exam = (registry.exams ?? []).find((e: any) => String(e.id) === paperId);
      if (!exam) throw new Error("Question paper not found");

      const school = (registry.schools ?? []).find((s: any) => s.id === exam.schoolId);
      const grade = (registry.grades ?? []).find((g: any) => g.id === exam.gradeId);
      const subject = (registry.subjects ?? []).find((s: any) => s.id === exam.subjectId);
      if (!school || !grade) throw new Error("Could not resolve school or grade for this paper");

      const paperMeta: PaperMeta = {
        ...exam,
        schoolName: school.name,
        gradeName: grade.name,
        subjectName: subject?.name ?? "",
      };

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

      return {
        paperMeta,
        questions: qData.sort((a, b) => a.questionNumber - b.questionNumber),
      };
    },
    enabled: !!paperId,
  });

  const questions = paperQuery.data?.questions ?? NO_QUESTIONS;
  const paperMeta = paperQuery.data?.paperMeta ?? null;
  const loading = paperQuery.isPending;
  const fetchError =
    actionError ??
    (paperQuery.error instanceof Error ? paperQuery.error.message : null);

  // Local list edits write straight into the cached paper, so every existing
  // `setQuestions(prev => …)` call site keeps working unchanged.
  const setQuestions = useCallback(
    (updater: (prev: QuestionListItemDTO[]) => QuestionListItemDTO[]) =>
      queryClient.setQueryData<{ paperMeta: PaperMeta; questions: QuestionListItemDTO[] }>(
        keys.questionPaper.view(paperId),
        prev => (prev ? { ...prev, questions: updater(prev.questions) } : prev),
      ),
    [queryClient, paperId]
  );

  const fetchPaperData = useCallback(
    () => queryClient.invalidateQueries({ queryKey: keys.questionPaper.view(paperId) }),
    [queryClient, paperId]
  );

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
    [questions, setQuestions],
  );

  // Idle debounce: auto-save 1.5s after the last keystroke
  useEffect(() => {
    if (editState.status !== "editing") return;
    const { questionId, form } = editState;
    const timer = setTimeout(() => { void autoSaveQuestion(questionId, form); }, 1500);
    return () => clearTimeout(timer);
  }, [editState, autoSaveQuestion]);

  // Click outside the active card commits it
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editState]);

  const handleEdit = async (q: QuestionListItemDTO) => {
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

  const handleCancel = () => {
    setSaveError(null);
    if (editState.status === "editing" || editState.status === "saving") {
      const qId = editState.questionId;
      setQuestions((prev) => prev.filter((q) => !(q.id === qId && q.isNew)));
    }
    setEditState({ status: "idle" });
  };

  const handleFormChange = (patch: Partial<QuestionListItemDTO>) => {
    setEditState((prev) => {
      if (prev.status !== "editing" && prev.status !== "saving") return prev;
      return { ...prev, form: { ...prev.form, ...patch } };
    });
  };

  const handleSave = async (questionId: number) => {
    if (editState.status !== "editing" || editState.questionId !== questionId) return;
    const { form } = editState;
    setSaveError(null);
    setEditState({ status: "saving", questionId, form });
    const qTarget = questions.find((q) => q.id === questionId);
    if (!qTarget) return;

    try {
      if (qTarget.isNew) {
        const res = await addQuestion({
          questionPaperId: parseInt(paperId),
          questionNumber: form.questionNumber ?? qTarget.questionNumber,
          questionText: form.questionText ?? "",
          maxMarks: form.maxMarks ?? 1,
          optionGroup: form.optionGroup ?? null,
          optionSet: form.optionSet ?? null,
          pickCount: form.pickCount ?? null,
          questionLabel: form.questionLabel ?? undefined,
          questionType: form.questionType || "VSA",
        });
        setQuestions((prev) =>
          prev
            .map((q) => q.id === questionId ? ({ ...q, ...form, id: res.questionId, isNew: false } as QuestionListItemDTO) : q)
            .sort((a, b) => a.questionNumber - b.questionNumber),
        );
      } else {
        await updateQuestion(questionId, form as any);
        setQuestions((prev) =>
          prev
            .map((q) => (q.id === questionId ? ({ ...q, ...form } as QuestionListItemDTO) : q))
            .sort((a, b) => a.questionNumber - b.questionNumber),
        );
      }
      setEditState((prev) => {
        if (prev.status !== "saving" || prev.questionId !== questionId) return prev;
        const editedDuringSave = (Object.keys(form) as (keyof typeof form)[]).some((k) => prev.form[k] !== form[k]);
        return editedDuringSave
          ? { status: "editing", questionId, form: prev.form }
          : { status: "idle" };
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to save changes";
      console.error("[ViewPaper] handleSave:", message);
      setEditState((prev) => {
        if (prev.status !== "saving" || prev.questionId !== questionId) return prev;
        setSaveError(message);
        return { status: "editing", questionId, form: prev.form };
      });
    }
  };

  const handleAddQuestion = async (afterNumber?: number) => {
    if (editState.status === "editing") {
      await autoSaveQuestion(editState.questionId, editState.form);
    }
    let nextNumber = 1;
    if (afterNumber !== undefined) {
      nextNumber = Math.floor(afterNumber) + 1;
    } else if (questions.length > 0) {
      nextNumber = Math.floor(Math.max(...questions.map((q) => q.questionNumber))) + 1;
    }
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
    setQuestions((prev) => [...prev, newDraft].sort((a, b) => a.questionNumber - b.questionNumber));
    setEditState({
      status: "editing",
      questionId: tempId,
      form: { questionText: "", maxMarks: 1, questionNumber: nextNumber, questionType: "", optionGroup: null, optionSet: null, pickCount: null, questionLabel: "" },
    });
    setTimeout(() => {
      document.getElementById(`q-card-${tempId}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
  };

  const handleDeleteQuestion = async () => {
    if (deleteQuestionId === null) return;
    const qTarget = questions.find((q) => q.id === deleteQuestionId);
    if (!qTarget) { setDeleteQuestionId(null); return; }
    try {
      if (!qTarget.isNew) await deleteQuestion(deleteQuestionId);
      setQuestions((prev) => prev.filter((q) => q.id !== deleteQuestionId));
    } catch (err: unknown) {
      console.error("[ViewPaper] handleDeleteQuestion:", err);
      setErrorMessage("Failed to delete question");
    } finally {
      setDeleteQuestionId(null);
    }
  };

  const executeReExtractEntirePaper = async () => {
    setShowReExtractModal(false);
    if (!questions.length) return;
    const pdfUrl = resolvePdfUrl(questions[0]?.fileName);
    if (!pdfUrl) { setErrorMessage("Could not resolve PDF URL for re-extraction."); return; }

    setIsReExtractingPaper(true);
    setFetchError(null);
    try {
      const res = await reExtractEntirePaperFromUrl(pdfUrl);
      const parsedQuestions = res.questions;
      if (!parsedQuestions || parsedQuestions.length === 0) throw new Error("AI returned no questions.");

      let updatedCount = 0;
      let addedCount = 0;
      for (const parsed of parsedQuestions) {
        const existing = questions.find((q) => String(q.questionNumber) === String(parsed.question_number));
        if (existing) {
          await updateQuestion(existing.id, {
            questionText: parsed.question_text, maxMarks: parsed.max_marks,
            // Bloom's/difficulty come only from the blueprint — preserve existing values, never overwrite from extraction.
            bloomTaxonomy: existing.bloomTaxonomy ?? null, difficultyLevel: existing.difficultyLevel ?? null,
            questionType: parsed.question_type, answerKey: parsed.answer_key,
            optionGroup: parsed.option_group, optionSet: parsed.option_set,
            pickCount: parsed.pick_count, questionLabel: parsed.question_label,
            diagramCropUrl: parsed.diagram_crop_url, hasDiagram: parsed.has_diagram,
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
            questionText: parsed.question_text, maxMarks: parsed.max_marks || 1,
            // New question from extraction — Bloom's/difficulty stay blank until the blueprint is uploaded.
            bloomTaxonomy: null, difficultyLevel: null,
            questionType: parsed.question_type, answerKey: parsed.answer_key,
            optionGroup: parsed.option_group, optionSet: parsed.option_set,
            pickCount: parsed.pick_count, questionLabel: parsed.question_label,
            diagramCropUrl: parsed.diagram_crop_url, hasDiagram: parsed.has_diagram,
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
      await fetchPaperData();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to re-extract paper";
      const fullError = typeof err === "object" && err !== null ? JSON.stringify(err, Object.getOwnPropertyNames(err), 2) : String(err);
      console.error("[ViewPaper] reExtractEntirePaper:", fullError);
      setErrorMessage(`Re-extraction failed:\n${message}\n\nDetails:\n${fullError}`);
    } finally {
      setIsReExtractingPaper(false);
    }
  };

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

  const handleFillOCR = useCallback((questionId: string, text: string) => {
    const q = questions.find((q) => String(q.id) === questionId);
    if (!q) return;
    setSaveError(null);
    setEditState({
      status: "editing",
      questionId: q.id,
      form: {
        questionNumber: q.questionNumber, questionText: text,
        questionType: q.questionType, maxMarks: q.maxMarks,
        answerKey: q.answerKey, aiAnswer: q.aiAnswer,
        difficultyLevel: q.difficultyLevel, bloomTaxonomy: q.bloomTaxonomy,
        optionGroup: q.optionGroup, optionSet: q.optionSet,
        pickCount: q.pickCount, questionLabel: q.questionLabel,
      },
    });
    setTimeout(() => {
      document.getElementById(`q-card-${q.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
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
      await updateQuestion(q.id, { diagramBbox: newDiagramBbox, diagramCropUrl: newCropUrl });
      setQuestions((prev) =>
        prev.map((qq) => qq.id === q.id ? { ...qq, diagramBbox: newDiagramBbox, diagramCropUrl: newCropUrl } : qq)
      );
      setSuccessMessage("Diagram cropped and updated successfully!");
    } catch (err: unknown) {
      console.error("[ViewPaper] handleCommitRecropDiagram:", err);
      setErrorMessage("Failed to save diagram box");
    }
  };

  const pdfUrl = resolvePdfUrl(questions[0]?.fileName);

  return {
    questions,
    paperMeta,
    loading,
    fetchError,
    editState,
    pdfUrl,
    deleteQuestionId,
    saveError,
    reExtractQuestionId,
    isReExtractingPaper,
    showReExtractModal,
    successMessage,
    errorMessage,
    editingDiagramId,
    setDeleteQuestionId,
    setShowReExtractModal,
    setSuccessMessage,
    setErrorMessage,
    setEditingDiagramId,
    setReExtractQuestionId,
    fetchPaperData,
    autoSaveQuestion,
    handleEdit,
    handleCancel,
    handleFormChange,
    handleSave,
    handleAddQuestion,
    handleDeleteQuestion,
    executeReExtractEntirePaper,
    handleRunOCR,
    handleFillOCR,
    handleCommitRecropDiagram,
  };
}
