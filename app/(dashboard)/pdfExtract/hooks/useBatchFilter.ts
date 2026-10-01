import { useState, useEffect, useMemo, useCallback } from "react";
import { useQueryStates } from "nuqs";
import { useQuery } from "@tanstack/react-query";
import { keys } from "@/app/lib/queryKeys";
import { useScope, matchesScope, type ScopeState } from "@/app/hooks/useScope";
import { urlKeys, URL_OPTIONS } from "@/app/lib/urlKeys";
import {
  getBatches, getBatch, getBatchStudents,
  Batch, BatchStudent,
} from "@/app/(dashboard)/pdfExtract/lib/beaverApi";

export type BatchFilterState = ScopeState;

export interface UseBatchFilterReturn {
  schoolOptions:     string[];
  gradeOptions:      string[];
  subjectOptions:    string[];
  sectionOptions:    string[];
  examOptions:       string[];
  allBatches:        Batch[];
  filters:           BatchFilterState;
  setSchool:         (v: string) => void;
  setGrade:          (v: string) => void;
  setSubject:        (v: string) => void;
  setSection:        (v: string) => void;
  setExam:           (v: string) => void;
  batchIdInput:      string;
  setBatchIdInput:   (v: string) => void;
  loadByBatchId:     () => Promise<void>;
  matchedBatch:      Batch | null;
  students:          BatchStudent[];
  selectedStudentId: string;
  setSelectedStudent:(id: string) => void;
  loadingBatches:    boolean;
  loadingStudents:   boolean;
  error:             string | null;
  isReady:           boolean;
  applyBatchAndStudent: (batchId: string, studentId: string) => Promise<boolean>;
  matchedBatches:    Batch[];
  setBatch:          (batchId: string) => void;
}

const NO_BATCHES: Batch[] = [];
const NO_STUDENTS: BatchStudent[] = [];

// Cleared with the cascade; module-level so the setters stay stable.
const SCOPE_DOWNSTREAM = ["batchId", "studentId"] as const;

export function useBatchFilter(): UseBatchFilterReturn {

  const batchesQuery = useQuery({
    queryKey: keys.batch.all(),
    queryFn: () => getBatches().then(res => res.batches ?? []),
  });
  const allBatches = batchesQuery.data ?? NO_BATCHES;

  const [loadingBatches, setLoadingBatches] = useState(false);
  const [error,          setError]          = useState<string | null>(null);

  const {
    scope: filters,
    setSchool: setScopeSchool,
    setGrade: setScopeGrade,
    setSubject: setScopeSubject,
    setSection: setScopeSection,
    setExam: setScopeExam,
    setScope: setFilters,
  } = useScope(urlKeys.pdfExtract, SCOPE_DOWNSTREAM);

  // The URL owns the batch and student too. Same param group as the scope, so
  // nuqs batches a scope change and its clears into one write.
  const [{ batchId: urlBatchId, studentId: urlStudentId }, setSelection] =
    useQueryStates(urlKeys.pdfExtract, URL_OPTIONS);

  const [batchIdInput, setBatchIdInput] = useState("");

  // Derived, not state: the batches a complete scope selects. Empty while the
  // scope is partial, so a half-filled cascade narrows nothing into view.
  const matchedBatches = useMemo(() => {
    const { grade, section, subject, exam } = filters;
    if (!grade || !section || !subject || !exam) return NO_BATCHES;
    return allBatches.filter(b => matchesScope(b, filters));
  }, [allBatches, filters]);

  // A batch named in the URL wins; otherwise a scope resolves only when it
  // narrows to exactly one. Two batches sharing a scope stay ambiguous on
  // purpose — auto-picking one dragged a stale student into a 404 (#199).
  const namedBatch = useMemo(
    () => (urlBatchId ? allBatches.find(b => b.batch_id === urlBatchId) ?? null : null),
    [urlBatchId, allBatches]
  );

  // Only when the URL names a batch the list doesn't carry.
  const namedBatchQuery = useQuery({
    queryKey: keys.batch.one(urlBatchId),
    queryFn: () => getBatch(urlBatchId).then(r => r.batch),
    enabled: Boolean(urlBatchId) && !namedBatch && allBatches.length > 0,
  });

  const matchedBatch: Batch | null = urlBatchId
    ? namedBatch ?? namedBatchQuery.data ?? null
    : matchedBatches.length === 1
      ? matchedBatches[0]
      : null;

  const studentsQuery = useQuery({
    queryKey: keys.batch.students(matchedBatch?.batch_id ?? ""),
    queryFn: () => getBatchStudents(matchedBatch!.batch_id).then(r => r.students ?? []),
    enabled: Boolean(matchedBatch?.batch_id),
  });

  const students = studentsQuery.data ?? NO_STUDENTS;
  const selectedStudentId = urlStudentId;
  const loadingStudents = studentsQuery.isFetching;

  // The batch-id box mirrors the resolved batch until the operator types.
  useEffect(() => {
    setBatchIdInput(matchedBatch ? matchedBatch.batch_id : "");
  }, [matchedBatch]);

  // A link may name a batch without its scope (the review queue builds one that
  // way). Adopt the batch's own scope so the dropdowns show what is open. Only
  // when the scope is entirely empty, so it can never overwrite a live cascade.
  const scopeIsEmpty =
    !filters.school && !filters.grade && !filters.subject && !filters.section && !filters.exam;
  useEffect(() => {
    if (!matchedBatch || !scopeIsEmpty) return;
    setFilters({
      school:  matchedBatch.school_name ?? "",
      grade:   matchedBatch.grade,
      section: matchedBatch.section,
      subject: matchedBatch.subject,
      exam:    matchedBatch.exam_type,
    });
  }, [matchedBatch, scopeIsEmpty, setFilters]);

  // ── Derive dropdown options ───────────────────────────────────
  const schoolOptions = useMemo(() =>
    [...new Set(allBatches.map(b => b.school_name).filter(Boolean))].sort(),
    [allBatches]
  );

  const gradeOptions = useMemo(() => {
    const base = filters.school
      ? allBatches.filter(b => b.school_name === filters.school)
      : allBatches;
    return [...new Set(base.map(b => b.grade).filter(Boolean))].sort();
  }, [allBatches, filters.school]);

  const subjectOptions = useMemo(() => {
    const base = allBatches.filter(b =>
      (!filters.school || b.school_name === filters.school) &&
      (!filters.grade  || b.grade       === filters.grade)
    );
    return [...new Set(base.map(b => b.subject).filter(Boolean))].sort();
  }, [allBatches, filters.school, filters.grade]);

  const sectionOptions = useMemo(() => {
    const base = allBatches.filter(b =>
      (!filters.school   || b.school_name === filters.school) &&
      (!filters.grade    || b.grade       === filters.grade)  &&
      (!filters.subject  || b.subject     === filters.subject)
    );
    return [...new Set(base.map(b => b.section).filter(Boolean))].sort();
  }, [allBatches, filters.school, filters.grade, filters.subject]);

  const examOptions = useMemo(() => {
    const base = allBatches.filter(b =>
      (!filters.school   || b.school_name === filters.school) &&
      (!filters.grade    || b.grade       === filters.grade)  &&
      (!filters.section  || b.section     === filters.section) &&
      (!filters.subject  || b.subject     === filters.subject)
    );
    return [...new Set(base.map(b => b.exam_type).filter(Boolean))].sort();
  }, [allBatches, filters.school, filters.grade, filters.section, filters.subject]);

  // ── Load by direct batch ID ───────────────────────────────────
  const loadByBatchId = useCallback(async () => {
    const id = batchIdInput.trim();
    if (!id) return;

    try {
      setLoadingBatches(true);
      setError(null);

      const res   = await getBatch(id);
      const batch = res.batch;

      setFilters({
        school:  batch.school_name ?? "",
        grade:   batch.grade,
        section: batch.section,
        subject: batch.subject,
        exam:    batch.exam_type,
      });
      setSelection({ batchId: batch.batch_id, studentId: null });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Batch not found");
      setSelection({ batchId: null, studentId: null });
    } finally {
      setLoadingBatches(false);
    }
  }, [batchIdInput, setFilters, setSelection]);

  // Selecting a batch+student is now just a URL write: the derivations above
  // resolve the batch and its roster from it. Async only so callers that await
  // the old fetching version keep working.
  const applyBatchAndStudent = useCallback(async (batchId: string, studentId: string): Promise<boolean> => {
    setSelection({ batchId, studentId: studentId || null });
    return true;
  }, [setSelection]);

  // The cascade is useScope's; nothing downstream needs clearing by hand.
  const setSchool = setScopeSchool;
  const setGrade = setScopeGrade;
  const setSubject = setScopeSubject;
  const setSection = setScopeSection;
  const setExam = setScopeExam;

  // Picking among several batches sharing a scope; the student must reset.
  const setBatch = useCallback(
    (batchId: string) => setSelection({ batchId: batchId || null, studentId: null }),
    [setSelection]
  );

  const setSelectedStudent = useCallback(
    (id: string) => setSelection({ studentId: id || null }),
    [setSelection]
  );

  const isReady = !!(matchedBatch && selectedStudentId);

  return useMemo(() => ({
    schoolOptions,
    gradeOptions,
    sectionOptions,
    subjectOptions,
    examOptions,
    allBatches,
    filters,
    setSchool,
    setGrade,
    setSection,
    setSubject,
    setExam,
    batchIdInput,
    setBatchIdInput,
    loadByBatchId,
    matchedBatch,
    students,
    selectedStudentId,
    setSelectedStudent,
    loadingBatches: loadingBatches || batchesQuery.isPending,
    loadingStudents,
    error:
      error ??
      (batchesQuery.error instanceof Error ? batchesQuery.error.message : null),
    isReady,
    applyBatchAndStudent,
    matchedBatches,
    setBatch,
  }), [
    schoolOptions, gradeOptions, sectionOptions, subjectOptions, examOptions,
    allBatches, filters, setSchool, setGrade, setSection, setSubject, setExam,
    batchIdInput, setBatchIdInput, loadByBatchId, matchedBatch, students,
    selectedStudentId, setSelectedStudent, loadingBatches, batchesQuery.isPending,
    loadingStudents, error, batchesQuery.error, isReady, applyBatchAndStudent,
    matchedBatches, setBatch,
  ]);
}