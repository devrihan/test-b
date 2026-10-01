"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { keys } from "@/app/lib/queryKeys";
import { urlKeys, URL_OPTIONS, QP_MODES, QP_SUB_VIEWS } from "@/app/lib/urlKeys";
import { getAuthToken as getToken } from "@/app/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_AGGREGATED_DATA_API_URL ?? "http://localhost:8082";


export type QpSubView = (typeof QP_SUB_VIEWS)[number];
export type QpMode = (typeof QP_MODES)[number];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Paper = any;

const NO_PAPERS: Paper[] = [];

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function toPapers(data: any): Paper[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data?.exams ?? []).map((exam: any) => ({
    ...exam,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    schoolName: data.schools?.find((s: any) => s.id === exam.schoolId)?.name ?? `School ID ${exam.schoolId}`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    gradeName: data.grades?.find((g: any) => g.id === exam.gradeId)?.name ?? `Grade ${exam.gradeId}`,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subjectName: data.subjects?.find((s: any) => s.id === exam.subjectId)?.name ?? `Subject ${exam.subjectId}`,
  }));
}

const uniqueSorted = (papers: Paper[], field: string): string[] =>
  [...new Set(papers.map(p => p[field]))].filter(Boolean).sort() as string[];

// No provider: screen and filters live in the URL, papers come from the shared
// registry cache, and everything else derives from the two.
export function useQuestionPaperList() {
  const queryClient = useQueryClient();

  const [
    { mode, subView, paperId, school, academicYear, grade, subject, examType },
    setQp,
  ] = useQueryStates(urlKeys.questionPaper, URL_OPTIONS);

  // Same cache entry as /config and /exportData — one request, reshaped here.
  const papersQuery = useQuery({
    queryKey: keys.registry.batchFormOptions(),
    queryFn: async () => {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/registry/batch-form-options`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to load question papers");
      return res.json();
    },
    select: toPapers,
  });

  const papers = papersQuery.data ?? NO_PAPERS;

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: keys.registry.batchFormOptions() }),
    [queryClient]
  );

  const setMode = useCallback((v: QpMode) => setQp({ mode: v }), [setQp]);
  const setSubView = useCallback((v: QpSubView) => setQp({ subView: v }), [setQp]);
  const setSelectedPaperId = useCallback(
    (id: string | null) => setQp({ paperId: id || null }),
    [setQp]
  );

  // Independent filters — picking one narrows the list, it does not clear others.
  const setFilterSchool = useCallback((v: string) => setQp({ school: v || null }), [setQp]);
  const setFilterAcademicYear = useCallback((v: string) => setQp({ academicYear: v || null }), [setQp]);
  const setFilterGrade = useCallback((v: string) => setQp({ grade: v || null }), [setQp]);
  const setFilterSubject = useCallback((v: string) => setQp({ subject: v || null }), [setQp]);
  const setFilterExamType = useCallback((v: string) => setQp({ examType: v || null }), [setQp]);

  const clearFilters = useCallback(
    () => setQp({ school: null, academicYear: null, grade: null, subject: null, examType: null }),
    [setQp]
  );

  const grades = useMemo(() => uniqueSorted(papers, "gradeName"), [papers]);
  const subjects = useMemo(() => uniqueSorted(papers, "subjectName"), [papers]);
  const schools = useMemo(() => uniqueSorted(papers, "schoolName"), [papers]);
  const academicYears = useMemo(() => uniqueSorted(papers, "academicYear"), [papers]);
  const examTypes = useMemo(() => uniqueSorted(papers, "examType"), [papers]);

  const filtered = useMemo(
    () =>
      papers.filter(p =>
        (!grade || String(p.gradeName) === grade) &&
        (!subject || String(p.subjectName) === subject) &&
        (!school || String(p.schoolName) === school) &&
        (!academicYear || String(p.academicYear) === academicYear) &&
        (!examType || String(p.examType) === examType)
      ),
    [papers, grade, subject, school, academicYear, examType]
  );

  return {
    mode, setMode,
    subView, setSubView,
    selectedPaperId: paperId || null,
    setSelectedPaperId,
    papers,
    filtered,
    loading: papersQuery.isPending,
    error: papersQuery.error instanceof Error ? papersQuery.error.message : null,
    filterGrade: grade,
    filterSubject: subject,
    filterSchool: school,
    filterAcademicYear: academicYear,
    filterExamType: examType,
    setFilterGrade,
    setFilterSubject,
    setFilterSchool,
    setFilterAcademicYear,
    setFilterExamType,
    clearFilters,
    refresh,
    grades, subjects, schools, academicYears, examTypes,
  };
}
