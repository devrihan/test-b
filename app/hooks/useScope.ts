"use client";

import { useCallback, useMemo } from "react";
import { useQueryStates } from "nuqs";
import { URL_OPTIONS, urlKeys } from "@/app/lib/urlKeys";

export type ScopeState = {
  school: string;
  grade: string;
  subject: string;
  section: string;
  exam: string;
};

type ScopeGroup = typeof urlKeys.pdfExtract | typeof urlKeys.answerEditing;

export interface UseScopeReturn {
  scope: ScopeState;
  setSchool: (v: string) => void;
  setGrade: (v: string) => void;
  setSubject: (v: string) => void;
  setSection: (v: string) => void;
  setExam: (v: string) => void;
  setScope: (next: ScopeState) => void;
  clearScope: () => void;
  isComplete: boolean;
}

// Selection and cascade only; `downstream` params clear in the same write.
export function useScope(group: ScopeGroup, downstream: readonly string[] = []): UseScopeReturn {
  const [urlState, setUrlState] = useQueryStates(group, URL_OPTIONS);

  const clearDownstream = useMemo(
    () => Object.fromEntries(downstream.map((k) => [k, null])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [downstream.join(",")]
  );

  const scope = useMemo<ScopeState>(
    () => ({
      school: urlState.school,
      grade: urlState.grade,
      subject: urlState.subject,
      section: urlState.section,
      exam: urlState.exam,
    }),
    [urlState.school, urlState.grade, urlState.subject, urlState.section, urlState.exam]
  );

  // One call per setter — one URL write, one history entry.
  const setSchool = useCallback(
    (v: string) =>
      setUrlState({ school: v || null, grade: null, subject: null, section: null, exam: null, ...clearDownstream }),
    [setUrlState, clearDownstream]
  );

  const setGrade = useCallback(
    (v: string) => setUrlState({ grade: v || null, subject: null, section: null, exam: null, ...clearDownstream }),
    [setUrlState, clearDownstream]
  );

  const setSubject = useCallback(
    (v: string) => setUrlState({ subject: v || null, section: null, exam: null, ...clearDownstream }),
    [setUrlState, clearDownstream]
  );

  const setSection = useCallback(
    (v: string) => setUrlState({ section: v || null, exam: null, ...clearDownstream }),
    [setUrlState, clearDownstream]
  );

  const setExam = useCallback((v: string) => setUrlState({ exam: v || null, ...clearDownstream }), [setUrlState, clearDownstream]);

  // All five at once, no cascade — adopts the scope of an already-resolved batch.
  const setScope = useCallback(
    (next: ScopeState) =>
      setUrlState({
        school: next.school || null,
        grade: next.grade || null,
        subject: next.subject || null,
        section: next.section || null,
        exam: next.exam || null,
      }),
    [setUrlState]
  );

  const clearScope = useCallback(
    () =>
      setUrlState({ school: null, grade: null, subject: null, section: null, exam: null, ...clearDownstream }),
    [setUrlState, clearDownstream]
  );

  const isComplete = Boolean(
    scope.school && scope.grade && scope.subject && scope.section && scope.exam
  );

  return { scope, setSchool, setGrade, setSubject, setSection, setExam, setScope, clearScope, isComplete };
}

// An unset field matches everything, so a partial scope narrows rather than empties.
export function matchesScope(
  batch: { school_name?: string; grade?: string; subject?: string; section?: string; exam_type?: string },
  scope: ScopeState
): boolean {
  return (
    (!scope.school || batch.school_name === scope.school) &&
    (!scope.grade || batch.grade === scope.grade) &&
    (!scope.subject || batch.subject === scope.subject) &&
    (!scope.section || batch.section === scope.section) &&
    (!scope.exam || batch.exam_type === scope.exam)
  );
}
