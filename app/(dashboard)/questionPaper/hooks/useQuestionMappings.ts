"use client";
import { useState, useCallback, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { keys } from "@/app/lib/queryKeys";
import { API_BASE, BEAVER_BASE, authHeaders, resolvePdfUrl } from "../lib/api";
import { usePersistentState } from "../../../lib/usePersistentState";

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

export type PaperFilters = { academicYearId: string; schoolId: string; gradeId: string; subjectId: string; examType: string };
const EMPTY_FILTERS: PaperFilters = { academicYearId: "", schoolId: "", gradeId: "", subjectId: "", examType: "" };

type FacetOption = { value: string; label: string };

export type BlueprintRow = {
  baseQuestionNumber: number;
  questionNumberRaw:  string;
  chapter:             string;
  bloomTaxonomy:       string | null;
  difficultyLevel:     string | null;
};

export type BlueprintExtractMeta = {
  extractedRows:             number;
  matchedQuestions:          number;
  totalQuestions:            number;
  unmatchedBlueprintNumbers: string[];
};

export type RowResult = {
  baseQuestionNumber: number;
  questionRows:       number;
  chapterId:          number | null;
  chapterName:        string | null;
  chapterResolved:    boolean;
  bloomsValid:        boolean;
  difficultyValid:    boolean;
};

export type BulkSaveResult = {
  paperId:             number;
  dataInputId:         number;
  dryRun:              boolean;
  groupsMatched:       number;
  questionsUpdated:    number;
  rowResults:          RowResult[];
  unmatchedBaseNumbers: number[];
  unresolvedChapters:  string[];
  invalidValues:       string[];
};

export type ChapterOption = { id: number; name: string; unitName: string | null };

export type PaperQuestion = {
  id: number;
  questionNumber: number | null; questionText: string | null; maxMarks: number | null;
  difficultyLevel: string | null; bloomTaxonomy: string | null;
  chapterId: number | null; chapterName: string | null;
  optionGroup: string | null; optionSet: string | null; pickCount: number | null;
};

// Paper-max marks for one base question group. OR options must not all count:
// non-optional rows sum as-is; within an OR block only the top pick_count
// option-set totals count (e.g. "attempt any 1 of 3.1/3.2" is worth 5, not 10).
export function groupMaxMarks(rows: PaperQuestion[]): number {
  let total = 0;
  const orGroups = new Map<string, PaperQuestion[]>();
  for (const q of rows) {
    if (q.optionGroup) {
      const bucket = orGroups.get(q.optionGroup) ?? [];
      bucket.push(q);
      orGroups.set(q.optionGroup, bucket);
    } else {
      total += q.maxMarks ?? 0;
    }
  }
  for (const group of orGroups.values()) {
    const setTotals = new Map<string, number>();
    group.forEach((q, i) => {
      const key = q.optionSet ?? `#${i}`; // no set label -> each row is its own alternative
      setTotals.set(key, (setTotals.get(key) ?? 0) + (q.maxMarks ?? 0));
    });
    const sums = [...setTotals.values()].sort((a, b) => b - a);
    const picks = Math.min(group[0]?.pickCount ?? 1, sums.length);
    total += sums.slice(0, picks).reduce((a, b) => a + b, 0);
  }
  return total;
}
export type PreReviewRow = {
  key: string; base: number;
  optionGroup: string | null; optionSet: string | null; pickCount: number | null;
  info: QuestionInfo;
};

export type QuestionInfo = {
  questionText: string | null; totalMarks: number | null;
  difficultyLevel: string | null; bloomTaxonomy: string | null; rowCount: number;
  chapterId: number | null; chapterName: string | null;
  optionGroup: string | null; optionSet: string | null; pickCount: number | null;
};

// Static description of the blueprintRows shape — sent to the bulk-save endpoint as dataInput.payloadSchema
// so the saved data-input row is self-describing.
const BLUEPRINT_ROW_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: {
      baseQuestionNumber: { type: "number" },
      questionNumberRaw:  { type: "string" },
      chapter:             { type: "string" },
      bloomTaxonomy:       { type: ["string", "null"] },
      difficultyLevel:     { type: ["string", "null"] },
    },
    required: ["baseQuestionNumber", "questionNumberRaw", "chapter"],
  },
} as const;

const NO_PAPERS: PaperOption[] = [];
const NO_QUESTIONS: PaperQuestion[] = [];
const NO_CHAPTERS: ChapterOption[] = [];

export function useQuestionMappings() {
  const [paperId, setPaperId] = usePersistentState<number | "">("qm:paperId", "");
  const [filters, setFilters] = usePersistentState<PaperFilters>("qm:filters", EMPTY_FILTERS);

  const [error,   setError]   = useState<string | null>(null);

  const [blueprintRows,     setBlueprintRows]     = useState<BlueprintRow[] | null>(null);
  const [blueprintFileName, setBlueprintFileName] = useState<string | null>(null);
  const [extractMeta,  setExtractMeta]  = useState<BlueprintExtractMeta | null>(null);
  const [extracting,   setExtracting]   = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);

  // baseQuestionNumber -> manually-picked chapterId override
  const [overrides, setOverrides] = useState<Record<number, number>>({});

  const [dryResult,  setDryResult]  = useState<BulkSaveResult | null>(null);
  const [dryRunning, setDryRunning] = useState(false);
  const [dryError,   setDryError]   = useState<string | null>(null);

  const [saving,      setSaving]      = useState(false);
  const [saveError,   setSaveError]   = useState<string | null>(null);
  const [savedResult, setSavedResult] = useState<{ questionsUpdated: number; dataInputId: number } | null>(null);
  const [dirty,        setDirty]      = useState(false);

  const [pushing,    setPushing]    = useState(false);
  const [pushError,  setPushError]  = useState<string | null>(null);
  const [pushResult, setPushResult] = useState<{ questionsUpdated: number } | null>(null);

  // Shares the registry cache; `select` reshapes it into PaperOption[] here.
  const papersQuery = useQuery({
    queryKey: keys.registry.batchFormOptions(),
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/api/registry/batch-form-options`, { headers: authHeaders() });
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

  // clears everything downstream of "which blueprint is loaded" — used on paper switch and re-upload
  const resetReview = useCallback(() => {
    setBlueprintRows(null);
    setBlueprintFileName(null);
    setExtractMeta(null);
    setExtractError(null);
    setOverrides({});
    setDryResult(null);
    setDryError(null);
    setSaveError(null);
    setSavedResult(null);
    setDirty(false);
    setPushError(null);
    setPushResult(null);
  }, []);

  const resetFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPaperId("");
    setError(null);
    resetReview();
  }, [resetReview, setFilters, setPaperId]);

  const selectedPaper = useMemo(() => papers.find(p => p.id === paperId) ?? null, [papers, paperId]);

  const paperQuery = useQuery({
    queryKey: keys.questionPaper.questionMappings(Number(paperId)),
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/data-quality/blooms-mapping/paper/${paperId}`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load questions");
      const data = await res.json();
      return {
        questions: (data.questions || []) as PaperQuestion[],
        pdfUrl: resolvePdfUrl(data.paperFileName ?? undefined),
      };
    },
    enabled: !!paperId,
  });

  const paperQuestions = paperQuery.data?.questions ?? NO_QUESTIONS;
  const totalQuestions = paperQuestions.length;
  const pdfUrl = paperQuery.data?.pdfUrl ?? null;
  const loading = !!paperId && paperQuery.isPending;
  const loadError =
    paperQuery.error instanceof Error ? paperQuery.error.message : null;

  // Curriculum chapters for manual chapter picking, scoped to the selected
  // paper's grade/subject — both are in the key, so switching papers can't let
  // a slow reply land on the wrong one.
  const curriculumQuery = useQuery({
    queryKey: keys.questionPaper.curriculum(
      selectedPaper?.gradeId ?? null,
      selectedPaper?.subjectId ?? null,
    ),
    queryFn: async (): Promise<ChapterOption[]> => {
      const r = await fetch(
        `${API_BASE}/api/data-quality/curriculum?gradeId=${selectedPaper!.gradeId}&subjectId=${selectedPaper!.subjectId}`,
        { headers: authHeaders() },
      );
      if (!r.ok) throw new Error("Failed to load curriculum");
      const data: { units?: { name: string; chapters: { id: number; name: string }[] }[]; chaptersWithoutUnit?: { id: number; name: string }[] } = await r.json();
      const options: ChapterOption[] = [];
      for (const u of data.units || []) {
        for (const ch of u.chapters) options.push({ id: ch.id, name: ch.name, unitName: u.name });
      }
      for (const ch of data.chaptersWithoutUnit || []) options.push({ id: ch.id, name: ch.name, unitName: null });
      return options;
    },
    enabled: !!selectedPaper?.gradeId && !!selectedPaper?.subjectId,
  });

  const chapterOptions = curriculumQuery.data ?? NO_CHAPTERS;

  const selectPaper = useCallback((id: number | "") => {
    setPaperId(id);
    setError(null);
    resetReview();
  }, [resetReview, setPaperId]);

  // base question number -> display text + paper-max marks + current tags for that
  // group (sub-parts collapsed; OR options counted pick_count-aware, not summed)
  const questionInfoByBase = useMemo(() => {
    const rowsByBase = new Map<number, PaperQuestion[]>();
    for (const q of paperQuestions) {
      if (q.questionNumber == null) continue;
      const base = Math.floor(q.questionNumber);
      const bucket = rowsByBase.get(base) ?? [];
      bucket.push(q);
      rowsByBase.set(base, bucket);
    }

    // optionGroup can span multiple base numbers — merge those into one entry.
    const homeBaseByGroup = new Map<string, number>();
    for (const [base, rows] of rowsByBase) {
      const grp = rows.find((q) => q.optionGroup)?.optionGroup?.trim();
      if (grp && !homeBaseByGroup.has(grp)) homeBaseByGroup.set(grp, base);
    }
    const mergedRowsByBase = new Map<number, PaperQuestion[]>();
    for (const [base, rows] of rowsByBase) {
      const grp = rows.find((q) => q.optionGroup)?.optionGroup?.trim();
      const targetBase = grp ? homeBaseByGroup.get(grp)! : base;
      const bucket = mergedRowsByBase.get(targetBase) ?? [];
      bucket.push(...rows);
      mergedRowsByBase.set(targetBase, bucket);
    }

    const map = new Map<number, QuestionInfo>();
    for (const [base, rows] of mergedRowsByBase) {
      const first = <T,>(pick: (q: PaperQuestion) => T | null): T | null => {
        for (const q of rows) { const v = pick(q); if (v != null) return v; }
        return null;
      };
      map.set(base, {
        questionText:     first(q => q.questionText),
        totalMarks:       groupMaxMarks(rows),
        difficultyLevel:  first(q => q.difficultyLevel),
        bloomTaxonomy:    first(q => q.bloomTaxonomy),
        chapterId:        first(q => q.chapterId),
        chapterName:      first(q => q.chapterName),
        rowCount:         rows.length,
        optionGroup:      first(q => q.optionGroup),
        optionSet:        first(q => q.optionSet),
        pickCount:        first(q => q.pickCount),
      });
    }
    return map;
  }, [paperQuestions]);

  // ascending base question numbers, for rendering the paper's own questions before any blueprint is uploaded
  const paperBaseNumbers = useMemo(() =>
    Array.from(questionInfoByBase.keys()).sort((a, b) => a - b), [questionInfoByBase]);

  // Like questionInfoByBase, but keeps OR-alternatives that share a base number as
  // separate rows instead of collapsing them into one. Used for CSV export.
  const preReviewRows = useMemo(() => {
    const byBase = new Map<number, PaperQuestion[]>();
    for (const q of paperQuestions) {
      if (q.questionNumber == null) continue;
      const base = Math.floor(q.questionNumber);
      const bucket = byBase.get(base) ?? [];
      bucket.push(q);
      byBase.set(base, bucket);
    }

    const rows: PreReviewRow[] = [];
    for (const [base, allRows] of byBase) {
      // group by (optionGroup, optionSet) so alternatives sharing a base number split apart
      const buckets = new Map<string, PaperQuestion[]>();
      for (const q of allRows) {
        const grp = q.optionGroup?.trim();
        const bucketKey = grp ? `${grp}::${q.optionSet?.trim() ?? "A"}` : "__compulsory__";
        const bucket = buckets.get(bucketKey) ?? [];
        bucket.push(q);
        buckets.set(bucketKey, bucket);
      }
      let altIndex = 0;
      for (const bucketRows of buckets.values()) {
        const first = <T,>(pick: (q: PaperQuestion) => T | null): T | null => {
          for (const q of bucketRows) { const v = pick(q); if (v != null) return v; }
          return null;
        };
        rows.push({
          key: buckets.size > 1 ? `${base}#${altIndex}` : String(base),
          base,
          optionGroup: first(q => q.optionGroup),
          optionSet:   first(q => q.optionSet),
          pickCount:   first(q => q.pickCount),
          info: {
            questionText:    first(q => q.questionText),
            totalMarks:      groupMaxMarks(bucketRows),
            difficultyLevel: first(q => q.difficultyLevel),
            bloomTaxonomy:   first(q => q.bloomTaxonomy),
            chapterId:       first(q => q.chapterId),
            chapterName:     first(q => q.chapterName),
            rowCount:        bucketRows.length,
            optionGroup:     first(q => q.optionGroup),
            optionSet:       first(q => q.optionSet),
            pickCount:       first(q => q.pickCount),
          },
        });
        altIndex++;
      }
    }
    return rows.sort((a, b) => a.base - b.base || a.key.localeCompare(b.key));
  }, [paperQuestions]);

  const buildRowsPayload = useCallback((rows: BlueprintRow[], ov: Record<number, number>) =>
    rows.map(r => ({
      baseQuestionNumber: r.baseQuestionNumber,
      chapterName:        r.chapter,
      ...(ov[r.baseQuestionNumber] != null ? { chapterId: ov[r.baseQuestionNumber] } : {}),
      bloomsType:         r.bloomTaxonomy,
      difficultyLevel:    r.difficultyLevel,
    })), []);

  const buildPayload = useCallback((rows: BlueprintRow[], ov: Record<number, number>, fileName: string) => ({
    paper: { paperId: Number(paperId) },
    dataInput: {
      kind:          "dps_blueprint",
      label:         fileName,
      fileRef:       fileName,
      payload:       rows,
      payloadSchema: BLUEPRINT_ROW_SCHEMA,
      receivedAt:    null,
      notes:         null,
    },
    rows: buildRowsPayload(rows, ov),
  }), [paperId, buildRowsPayload]);

  const runDryRun = useCallback(async (rows: BlueprintRow[], ov: Record<number, number>, fileName: string) => {
    setDryRunning(true);
    setDryError(null);
    try {
      const res = await fetch(`${API_BASE}/api/data-quality/question-mappings/bulk?origin=school&dryRun=true`, {
        method:  "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body:    JSON.stringify(buildPayload(rows, ov, fileName)),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Dry run failed");
      setDryResult(body as BulkSaveResult);
    } catch (e) {
      setDryError(e instanceof Error ? e.message : "Dry run failed");
      setDryResult(null);
    } finally {
      setDryRunning(false);
    }
  }, [buildPayload]);

  const uploadBlueprint = useCallback(async (file: File) => {
    if (!paperId) return;
    setExtracting(true);
    resetReview();
    try {
      const fd = new FormData();
      fd.append("blueprint", file);
      const res = await fetch(`${BEAVER_BASE}/api/question-papers/${paperId}/blooms-mapping/extract-blueprint`, {
        method: "POST", headers: authHeaders(), body: fd,
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Blueprint extraction failed");
      const rows: BlueprintRow[] = body.blueprintRows || [];
      setBlueprintRows(rows);
      setBlueprintFileName(file.name);
      setExtractMeta({
        extractedRows:             body.extractedRows ?? 0,
        matchedQuestions:          body.matchedQuestions ?? 0,
        totalQuestions:            body.totalQuestions ?? 0,
        unmatchedBlueprintNumbers: body.unmatchedBlueprintNumbers ?? [],
      });
      if (rows.length > 0) await runDryRun(rows, {}, file.name);
    } catch (e) {
      setExtractError(e instanceof Error ? e.message : "Blueprint extraction failed");
    } finally {
      setExtracting(false);
    }
  }, [paperId, resetReview, runDryRun]);

  const setChapterOverride = useCallback((baseQuestionNumber: number, chapterId: number) => {
    if (!blueprintRows || !blueprintFileName) return;
    const next = { ...overrides, [baseQuestionNumber]: chapterId };
    setOverrides(next);
    setDirty(true);
    setSavedResult(null);
    runDryRun(blueprintRows, next, blueprintFileName);
  }, [blueprintRows, blueprintFileName, overrides, runDryRun]);

  const saveAll = useCallback(async () => {
    if (!blueprintRows || !blueprintFileName) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`${API_BASE}/api/data-quality/question-mappings/bulk?origin=school&dryRun=false`, {
        method:  "PUT",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body:    JSON.stringify(buildPayload(blueprintRows, overrides, blueprintFileName)),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error || "Save failed");
      setDryResult(body as BulkSaveResult);
      setSavedResult({ questionsUpdated: body.questionsUpdated ?? 0, dataInputId: body.dataInputId });
      setDirty(false);
      setPushResult(null);
      setPushError(null);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }, [blueprintRows, blueprintFileName, overrides, buildPayload]);

  const pushToProd = useCallback(async () => {
    if (!blueprintRows || !blueprintFileName) return;
    setPushing(true);
    setPushError(null);
    setPushResult(null);
    try {
      const res = await fetch(`${BEAVER_BASE}/api/question-mappings/push-to-prod`, {
        method:  "POST",
        headers: { ...authHeaders(), "Content-Type": "application/json" },
        body:    JSON.stringify(buildPayload(blueprintRows, overrides, blueprintFileName)),
      });
      const body = await res.json().catch(() => ({} as Record<string, unknown>));
      if (!res.ok) throw new Error(String(body.error ?? `Push failed (${res.status})`));
      setPushResult({ questionsUpdated: Number(body.questionsUpdated ?? 0) });
    } catch (e) {
      setPushError(e instanceof Error ? e.message : "Push failed");
    } finally {
      setPushing(false);
    }
  }, [blueprintRows, blueprintFileName, overrides, buildPayload]);

  return {
    filteredPapers, facets, filters, setPaperFilter, resetFilters,
    paperId, selectPaper, selectedPaper,
    totalQuestions, pdfUrl,
    questionInfoByBase, paperBaseNumbers, preReviewRows, paperQuestions,
    loading, error: error ?? loadError,
    chapterOptions,
    blueprintRows, blueprintFileName, extractMeta, extracting, extractError,
    overrides, setChapterOverride,
    dryResult, dryRunning, dryError,
    saving, saveError, savedResult, dirty,
    pushing, pushError, pushResult,
    uploadBlueprint, saveAll, pushToProd,
  };
}
