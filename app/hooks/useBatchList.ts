"use client";

import { useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { keys } from "@/app/lib/queryKeys";
import { urlKeys, URL_OPTIONS } from "@/app/lib/urlKeys";
import { getBatches, Batch } from "@/app/(dashboard)/pdfExtract/lib/beaverApi";

const NO_BATCHES: Batch[] = [];

export interface UseBatchListReturn {
  batches: Batch[];
  filtered: Batch[];
  loading: boolean;
  error: string | null;
  filterGrade: string;
  filterSubject: string;
  filterSection: string;
  filterStatus: string;
  setFilterGrade: (v: string) => void;
  setFilterSubject: (v: string) => void;
  setFilterSection: (v: string) => void;
  setFilterStatus: (v: string) => void;
  clearFilters: () => void;
  refresh: () => void;
  grades: string[];
  subjects: string[];
  sections: string[];
  statuses: string[];
}

// No provider: filters live in the URL and everything else derives from the
// batches query, so two callers compute the same thing without sharing state.
export function useBatchList(): UseBatchListReturn {
  const queryClient = useQueryClient();

  const [{ grade, subject, section, status }, setFilters] = useQueryStates(
    urlKeys.batches,
    URL_OPTIONS
  );

  const batchesQuery = useQuery({
    queryKey: keys.batch.all(),
    queryFn: () => getBatches().then(res => res.batches ?? []),
  });

  const batches = batchesQuery.data ?? NO_BATCHES;

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey: keys.batch.all() }),
    [queryClient]
  );

  // Grade → Subject → Section narrows; status is orthogonal (a pipeline state,
  // not part of the org hierarchy), so picking one clears nothing.
  const setFilterGrade = useCallback(
    (v: string) => setFilters({ grade: v || null, subject: null, section: null }),
    [setFilters]
  );
  const setFilterSubject = useCallback(
    (v: string) => setFilters({ subject: v || null, section: null }),
    [setFilters]
  );
  const setFilterSection = useCallback(
    (v: string) => setFilters({ section: v || null }),
    [setFilters]
  );
  const setFilterStatus = useCallback(
    (v: string) => setFilters({ status: v || null }),
    [setFilters]
  );
  const clearFilters = useCallback(
    () => setFilters({ grade: null, subject: null, section: null, status: null }),
    [setFilters]
  );

  const grades = useMemo(
    () => [...new Set(batches.map(b => b.grade))].sort(),
    [batches]
  );

  const subjects = useMemo(
    () => [...new Set(batches.filter(b => !grade || b.grade === grade).map(b => b.subject))].sort(),
    [batches, grade]
  );

  const sections = useMemo(
    () =>
      [...new Set(
        batches
          .filter(b => (!grade || b.grade === grade) && (!subject || b.subject === subject))
          .map(b => b.section)
      )].sort(),
    [batches, grade, subject]
  );

  const statuses = useMemo(
    () => [...new Set(batches.map(b => b.status))].sort(),
    [batches]
  );

  const filtered = useMemo(
    () =>
      batches.filter(
        b =>
          (!grade || b.grade === grade) &&
          (!section || b.section === section) &&
          (!subject || b.subject === subject) &&
          (!status || b.status === status)
      ),
    [batches, grade, section, subject, status]
  );

  return {
    batches,
    filtered,
    loading: batchesQuery.isPending,
    error: batchesQuery.error instanceof Error ? batchesQuery.error.message : null,
    filterGrade: grade,
    filterSubject: subject,
    filterSection: section,
    filterStatus: status,
    setFilterGrade,
    setFilterSubject,
    setFilterSection,
    setFilterStatus,
    clearFilters,
    refresh,
    grades,
    subjects,
    sections,
    statuses,
  };
}
