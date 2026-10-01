"use client";
import { useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "@/app/lib/queryKeys";
import { API_BASE, BEAVER_BASE, authHeaders, resolvePdfUrl } from "../lib/api";
import { usePersistentState } from "../../../lib/usePersistentState";
import type { QuestionBloomRow, SaveStatus } from "../lib/types";

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

export type BloomSuggestion = { bloomTaxonomy: string | null; difficultyLevel: string | null };
export type BlueprintMeta = {
  extractedRows: number;
  matchedQuestions: number;
  totalQuestions: number;
  unmatchedBlueprintNumbers: string[];
};

export type PaperFilters = { academicYearId: string; schoolId: string; gradeId: string; subjectId: string; examType: string };
const EMPTY_FILTERS: PaperFilters = { academicYearId: "", schoolId: "", gradeId: "", subjectId: "", examType: "" };

type FacetOption = { value: string; label: string };

const NO_PAPERS: PaperOption[] = [];
const NO_QUESTIONS: QuestionBloomRow[] = [];

export function useBloomsMapping() {
  const queryClient = useQueryClient();
  const [paperId,    setPaperId]    = usePersistentState<number | "">("bm:paperId", "");
  const [filters,    setFilters]    = usePersistentState<PaperFilters>("bm:filters", EMPTY_FILTERS);

  const [error,      setError]      = useState<string | null>(null);
  const [saveStates, setSaveStates] = useState<Record<number, SaveStatus>>({});

  const [aiSuggestions, setAiSuggestions] = useState<Record<number, BloomSuggestion> | null>(null);
  const [blueprintMeta, setBlueprintMeta] = useState<BlueprintMeta | null>(null);
  const [aiRunning,     setAiRunning]     = useState(false);
  const [aiError,       setAiError]       = useState<string | null>(null);
  const [savingAll,     setSavingAll]     = useState(false);

  // Shares the registry cache used by /exportData and the batch-create pages;
  // `select` reshapes the cached payload into PaperOption[] for this screen
  // without storing a second copy.
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
    setBlueprintMeta(null);
    setAiError(null);
  }, [setFilters, setPaperId]);

  const mappingQuery = useQuery({
    queryKey: keys.questionPaper.bloomsMapping(Number(paperId)),
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/data-quality/blooms-mapping/paper/${paperId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load questions");
      const data = await res.json();
      return {
        questions: (data.questions || []) as QuestionBloomRow[],
        pdfUrl: resolvePdfUrl(data.paperFileName ?? undefined),
      };
    },
    enabled: !!paperId,
  });

  const questions = mappingQuery.data?.questions ?? NO_QUESTIONS;
  const pdfUrl = mappingQuery.data?.pdfUrl ?? null;
  const loading = !!paperId && mappingQuery.isPending;
  const loadError =
    mappingQuery.error instanceof Error ? mappingQuery.error.message : null;


  const selectPaper = useCallback((id: number | "") => {
    setPaperId(id);
    setError(null);
    setSaveStates({});
    setAiSuggestions(null);
    setBlueprintMeta(null);
    setAiError(null);
  }, [setPaperId]);

  const assignBlooms = useCallback(async (questionId: number, difficultyLevel: string | null, bloomTaxonomy: string | null) => {
    setSaveStates(s => ({ ...s, [questionId]: "saving" }));
    try {
      const res = await fetch(`${API_BASE}/api/data-quality/blooms-mapping/question/${questionId}`, {
        method:  "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body:    JSON.stringify({ difficultyLevel, bloomTaxonomy }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || "Save failed");
      }
      setSaveStates(s => ({ ...s, [questionId]: "saved" }));
      setTimeout(() => setSaveStates(s => ({ ...s, [questionId]: "idle" })), 1500);

      // The backend applies Bloom's/difficulty to the whole question group (all sub-parts + OR
      // options sharing the leading question number). Mirror that here so every sibling row updates,
      // not just the one that was edited.
      queryClient.setQueryData<{ questions: QuestionBloomRow[]; pdfUrl: string | null }>(
        keys.questionPaper.bloomsMapping(Number(paperId)),
        prev => {
          if (!prev) return prev;
          const target = prev.questions.find(q => q.id === questionId);
          const group  = target?.questionNumber != null ? Math.floor(target.questionNumber) : null;
          return {
            ...prev,
            questions: prev.questions.map(q =>
              q.id === questionId ||
              (group != null && q.questionNumber != null && Math.floor(q.questionNumber) === group)
                ? { ...q, difficultyLevel, bloomTaxonomy }
                : q
            ),
          };
        },
      );
    } catch {
      setSaveStates(s => ({ ...s, [questionId]: "error" }));
      setTimeout(() => setSaveStates(s => ({ ...s, [questionId]: "idle" })), 3000);
    }
  }, []);

  const uploadBlueprint = useCallback(async (file: File) => {
    if (!paperId) return;
    setAiRunning(true);
    setAiError(null);
    setAiSuggestions(null);
    setBlueprintMeta(null);
    try {
      const fd = new FormData();
      fd.append("blueprint", file);
      const res = await fetch(`${BEAVER_BASE}/api/question-papers/${paperId}/blooms-mapping/extract-blueprint`, {
        method: "POST", headers: authHeaders(), body: fd,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Blueprint extraction failed");
      const map: Record<number, BloomSuggestion> = {};
      for (const s of (body.suggestions || []) as { questionId: number; bloomTaxonomy: string | null; difficultyLevel: string | null }[]) {
        map[s.questionId] = { bloomTaxonomy: s.bloomTaxonomy, difficultyLevel: s.difficultyLevel };
      }
      setAiSuggestions(map);
      setBlueprintMeta({
        extractedRows:              body.extractedRows ?? 0,
        matchedQuestions:           body.matchedQuestions ?? 0,
        totalQuestions:             body.totalQuestions ?? 0,
        unmatchedBlueprintNumbers:  body.unmatchedBlueprintNumbers ?? [],
      });
    } catch (e) {
      setAiError(e instanceof Error ? e.message : "Blueprint extraction failed");
    } finally {
      setAiRunning(false);
    }
  }, [paperId]);

  const saveAllSuggestions = useCallback(async () => {
    if (!aiSuggestions) return;
    setSavingAll(true);
    const entries = Object.entries(aiSuggestions).map(([id, s]) => ({ questionId: Number(id), ...s }));
    await Promise.allSettled(entries.map(e => assignBlooms(e.questionId, e.difficultyLevel, e.bloomTaxonomy)));
    setSavingAll(false);
    setAiSuggestions(null);
    setBlueprintMeta(null);
  }, [aiSuggestions, assignBlooms]);

  const dismissSuggestions = useCallback(() => { setAiSuggestions(null); setBlueprintMeta(null); }, []);

  const clearSuggestion = useCallback((questionId: number) => {
    setAiSuggestions(prev => {
      if (!prev) return prev;
      const next = { ...prev };
      delete next[questionId];
      return Object.keys(next).length === 0 ? null : next;
    });
  }, []);

  const mapped = questions.filter(q => q.difficultyLevel != null && q.bloomTaxonomy != null).length;

  return {
    filteredPapers, facets, filters, setPaperFilter, resetFilters,
    paperId, selectPaper,
    questions, pdfUrl,
    loading, error: error ?? loadError,
    saveStates, assignBlooms,
    mapped, total: questions.length,
    aiSuggestions, blueprintMeta, aiRunning, aiError, savingAll,
    uploadBlueprint, saveAllSuggestions, dismissSuggestions, clearSuggestion,
  };
}
