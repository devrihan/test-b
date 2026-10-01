"use client";
import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "@/app/lib/queryKeys";
import { API_BASE, BEAVER_BASE, authHeaders, resolvePdfUrl } from "../lib/api";
import { usePersistentState } from "../../../lib/usePersistentState";
import type { ConceptOption, QuestionConceptRow, SaveStatus } from "../lib/types";

type PaperOption = {
  id: number;
  exam: string;
  schoolId: number | null;
  schoolName: string;
  gradeId: number | null;
  gradeName: string;
  subjectId: number | null;
  subjectName: string;
  examType: string | null;
  setNumber: string | null;
  academicYearId: number | null;
  academicYear: string | null;   // label, e.g. "2025-26"
};

export type AiSuggestion = { conceptId: number; confidence: "high" | "medium" | "low" };

export type PaperFilters = { academicYearId: string; schoolId: string; gradeId: string; subjectId: string; examType: string };
const EMPTY_FILTERS: PaperFilters = { academicYearId: "", schoolId: "", gradeId: "", subjectId: "", examType: "" };

type FacetOption = { value: string; label: string };

const NO_PAPERS: PaperOption[] = [];
const NO_QUESTIONS: QuestionConceptRow[] = [];
const NO_CONCEPTS: ConceptOption[] = [];

export function useConceptMapping() {
  const [paperId,    setPaperId]    = usePersistentState<number | "">("cm:paperId", "");
  const [filters,    setFilters]    = usePersistentState<PaperFilters>("cm:filters", EMPTY_FILTERS);

  const queryClient = useQueryClient();
  const [error,      setError]      = useState<string | null>(null);
  const [saveStates, setSaveStates] = useState<Record<number, SaveStatus>>({});

  const [aiSuggestions,     setAiSuggestions]     = useState<Record<number, AiSuggestion> | null>(null);
  const [aiMissingIds,      setAiMissingIds]      = useState<number[]>([]);
  const [aiRunning,         setAiRunning]         = useState(false);
  const [aiError,           setAiError]           = useState<string | null>(null);
  const [savingAll,         setSavingAll]         = useState(false);

  // Shares the registry cache; `select` reshapes it into PaperOption[] here.
  const papersQuery = useQuery({
    queryKey: keys.registry.batchFormOptions(),
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/api/registry/batch-form-options`, {
        headers: authHeaders(),
      });
      if (!r.ok) throw new Error("Failed to load registry");
      return r.json();
    },
    select: (data): PaperOption[] => {
      const gradeMap   = new Map<number, string>((data.grades   || []).map((g: { id: number; name: string }) => [g.id, g.name]));
      const subjectMap = new Map<number, string>((data.subjects || []).map((s: { id: number; name: string }) => [s.id, s.name]));
      const schoolMap  = new Map<number, string>((data.schools  || []).map((s: { id: number; name: string }) => [s.id, s.name]));
      return (data.exams || []).map((e: { id: number; exam: string; schoolId: number; gradeId: number; subjectId: number; examType: string | null; setNumber: string | null; academicYearId: number | null; academicYear: string | null }) => ({
        id:             e.id,
        exam:           e.exam,
        schoolId:       e.schoolId ?? null,
        schoolName:     schoolMap.get(e.schoolId)   ?? "",
        gradeId:        e.gradeId ?? null,
        gradeName:      gradeMap.get(e.gradeId)     ?? "",
        subjectId:      e.subjectId ?? null,
        subjectName:    subjectMap.get(e.subjectId) ?? "",
        examType:       e.examType ?? null,
        setNumber:      e.setNumber ?? null,
        academicYearId: e.academicYearId ?? null,
        academicYear:   e.academicYear ?? null,
      }));
    },
  });

  const papers = papersQuery.data ?? NO_PAPERS;

  // each facet's options are derived from papers matching all OTHER active filters
  const matchExcept = useCallback((except: keyof PaperFilters) => (p: PaperOption) => {
    if (except !== "academicYearId" && filters.academicYearId && String(p.academicYearId) !== filters.academicYearId) return false;
    if (except !== "schoolId"  && filters.schoolId  && String(p.schoolId)  !== filters.schoolId)  return false;
    if (except !== "gradeId"   && filters.gradeId   && String(p.gradeId)   !== filters.gradeId)   return false;
    if (except !== "subjectId" && filters.subjectId && String(p.subjectId) !== filters.subjectId) return false;
    if (except !== "examType"  && filters.examType  && String(p.examType)  !== filters.examType)  return false;
    return true;
  }, [filters]);

  const facets = useMemo(() => {
    const distinct = (except: keyof PaperFilters, key: (p: PaperOption) => { value: string | null; label: string } | null): FacetOption[] => {
      const seen = new Map<string, string>();
      for (const p of papers.filter(matchExcept(except))) {
        const kv = key(p);
        if (!kv || kv.value == null || kv.value === "") continue;
        if (!seen.has(kv.value)) seen.set(kv.value, kv.label);
      }
      return [...seen.entries()].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label));
    };
    return {
      academicYears: distinct("academicYearId", p => p.academicYearId != null ? { value: String(p.academicYearId), label: p.academicYear || `Year ${p.academicYearId}` } : null),
      schools:   distinct("schoolId",  p => p.schoolId  != null ? { value: String(p.schoolId),  label: p.schoolName  || `School ${p.schoolId}` } : null),
      grades:    distinct("gradeId",   p => p.gradeId   != null ? { value: String(p.gradeId),   label: p.gradeName   || `Grade ${p.gradeId}` } : null),
      subjects:  distinct("subjectId", p => p.subjectId != null ? { value: String(p.subjectId), label: p.subjectName || `Subject ${p.subjectId}` } : null),
      examTypes: distinct("examType",  p => p.examType  ? { value: p.examType, label: p.examType } : null),
    };
  }, [papers, matchExcept]);

  const filteredPapers = useMemo(() =>
    papers.filter(p =>
      (!filters.academicYearId || String(p.academicYearId) === filters.academicYearId) &&
      (!filters.schoolId  || String(p.schoolId)  === filters.schoolId) &&
      (!filters.gradeId   || String(p.gradeId)   === filters.gradeId) &&
      (!filters.subjectId || String(p.subjectId) === filters.subjectId) &&
      (!filters.examType  || String(p.examType)  === filters.examType)
    ), [papers, filters]);

  const setPaperFilter = useCallback((key: keyof PaperFilters, value: string) => {
    setFilters(f => ({ ...f, [key]: value }));
  }, []);
  const resetFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPaperId("");
    setError(null);
    setSaveStates({});
    setAiSuggestions(null);
    setAiError(null);
  }, [setFilters, setPaperId]);

  const mappingQuery = useQuery({
    queryKey: keys.questionPaper.conceptMapping(Number(paperId)),
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/data-quality/concept-mapping/paper/${paperId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load questions");
      const data = await res.json();
      return {
        questions: (data.questions || []) as QuestionConceptRow[],
        concepts: (data.concepts || []) as ConceptOption[],
        pdfUrl: resolvePdfUrl(data.paperFileName ?? undefined),
      };
    },
    enabled: !!paperId,
  });

  const questions = mappingQuery.data?.questions ?? NO_QUESTIONS;
  const concepts = mappingQuery.data?.concepts ?? NO_CONCEPTS;
  const pdfUrl = mappingQuery.data?.pdfUrl ?? null;
  const loading = !!paperId && mappingQuery.isPending;
  const loadError =
    mappingQuery.error instanceof Error ? mappingQuery.error.message : null;

  const selectPaper = useCallback((id: number | "") => {
    setPaperId(id);
    setError(null);
    setSaveStates({});
    setAiSuggestions(null);
    setAiError(null);
  }, [setPaperId]);

  // takes the full ConceptOption, not just an id — re-finding it in `concepts` could miss and silently leave the row looking unmapped
  const assignConcept = useCallback(async (questionId: number, concept: ConceptOption | null) => {
    setSaveStates(s => ({ ...s, [questionId]: "saving" }));
    try {
      const res = await fetch(`${API_BASE}/api/data-quality/concept-mapping/question/${questionId}`, {
        method:  "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body:    JSON.stringify({ conceptId: concept?.conceptId ?? null }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || "Save failed");
      }
      setSaveStates(s => ({ ...s, [questionId]: "saved" }));
      setTimeout(() => setSaveStates(s => ({ ...s, [questionId]: "idle" })), 1500);

      queryClient.setQueryData<{ questions: QuestionConceptRow[]; concepts: ConceptOption[]; pdfUrl: string | null }>(
        keys.questionPaper.conceptMapping(Number(paperId)),
        prev => prev ? {
          ...prev,
          questions: prev.questions.map(q => {
            if (q.id !== questionId) return q;
            if (!concept) return { ...q, conceptId: null, conceptName: null, chapterId: null, chapterName: null, unitId: null, unitName: null };
            return { ...q, conceptId: concept.conceptId, conceptName: concept.conceptName, chapterId: concept.chapterId, chapterName: concept.chapterName, unitId: concept.unitId, unitName: concept.unitName };
          }),
        } : prev,
      );
    } catch {
      setSaveStates(s => ({ ...s, [questionId]: "error" }));
      setTimeout(() => setSaveStates(s => ({ ...s, [questionId]: "idle" })), 3000);
    }
  }, []);

  const triggerAiMap = useCallback(async () => {
    if (!paperId) return;
    setAiRunning(true);
    setAiError(null);
    setAiSuggestions(null);
    setAiMissingIds([]);
    try {
      const res = await fetch(`${BEAVER_BASE}/api/question-papers/${paperId}/concept-mapping/ai-suggest`, {
        method: "POST", headers: authHeaders(),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "AI mapping failed");
      const map: Record<number, AiSuggestion> = {};
      for (const s of (body.suggestions || []) as { questionId: number; conceptId: number; confidence: string }[]) {
        map[s.questionId] = { conceptId: s.conceptId, confidence: s.confidence as AiSuggestion["confidence"] };
      }
      setAiSuggestions(map);
      setAiMissingIds((body.missing || []) as number[]);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "AI mapping failed");
    } finally {
      setAiRunning(false);
    }
  }, [paperId]);

  const saveAllSuggestions = useCallback(async () => {
    if (!aiSuggestions) return;
    setSavingAll(true);
    const entries = Object.entries(aiSuggestions)
      .map(([id, s]) => ({ questionId: Number(id), concept: concepts.find(c => c.conceptId === s.conceptId) ?? null }))
      .filter((e): e is { questionId: number; concept: ConceptOption } => e.concept != null);
    await Promise.allSettled(entries.map(e => assignConcept(e.questionId, e.concept)));
    setSavingAll(false);
    setAiSuggestions(null);
    setAiMissingIds([]);
  }, [aiSuggestions, assignConcept, concepts]);

  const dismissSuggestions = useCallback(() => { setAiSuggestions(null); setAiMissingIds([]); }, []);

  const clearSuggestion = useCallback((questionId: number) => {
    setAiSuggestions(prev => {
      if (!prev) return prev;
      const next = { ...prev };
      delete next[questionId];
      return Object.keys(next).length === 0 ? null : next;
    });
  }, []);

  const mapped = questions.filter(q => q.conceptId != null).length;

  return {
    papers, filteredPapers, facets, filters, setPaperFilter, resetFilters,
    paperId, selectPaper,
    questions, concepts, pdfUrl,
    loading, error: error ?? loadError,
    saveStates, assignConcept,
    mapped, total: questions.length,
    aiSuggestions, aiMissingIds, aiRunning, aiError, savingAll,
    triggerAiMap, saveAllSuggestions, dismissSuggestions, clearSuggestion,
  };
}
