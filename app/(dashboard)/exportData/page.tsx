"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { keys } from "@/app/lib/queryKeys";
import { urlKeys, URL_OPTIONS } from "@/app/lib/urlKeys";
import { Download, Loader2, ArrowLeft, AlertCircle, ShieldAlert, Table } from "lucide-react";
import { useRouter } from "next/navigation";
import { getUserRoles } from "@/app/lib/auth";
import { getAuthToken } from "@/app/lib/auth";

// ─────────────────────────────────────────────────────────────────────────────
// Config
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE = process.env.NEXT_PUBLIC_AGGREGATED_DATA_API_URL ?? "http://localhost:8082";
const BEAVER_BASE = process.env.NEXT_PUBLIC_BEAVER_API_URL ?? "http://localhost:4000";

// Sentinel for the "All …" choice in grade / subject / section. Distinct from
// "" (nothing chosen yet) so the cascade still forces an explicit pick.
const ALL = "__ALL__";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface RegistryItem {
  id:   number;
  name: string;
}

interface ExamOption {
  id:        number;
  exam:      string;
  schoolId:  number;
  gradeId:   number;
  subjectId: number;
}

interface BatchFormOptions {
  schools:  RegistryItem[];
  grades:   RegistryItem[];
  subjects: RegistryItem[];
  sections: string[];
  exams:    ExamOption[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth
// ─────────────────────────────────────────────────────────────────────────────

function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ─────────────────────────────────────────────────────────────────────────────
// Filename sanitiser
// ─────────────────────────────────────────────────────────────────────────────

function toSafeFilename(...parts: string[]): string {
  return parts
    .join("_")
    .replace(/[^a-zA-Z0-9_\-]/g, "_")
    .replace(/_+/g, "_");
}

// ─────────────────────────────────────────────────────────────────────────────
// Exam "kind" — exam names embed grade+subject as a prefix
// ("11_PHYSICS_ANNUALEXAMINATION_25-26"). The Exam dropdown offers the suffix
// ("ANNUALEXAMINATION_25-26") so one pick can span subjects/grades when "All"
// is selected; the marks-dump endpoint matches it as a suffix of exam_type.
// ─────────────────────────────────────────────────────────────────────────────

function stripPrefixCI(name: string, prefix: string): string | null {
  return name.length > prefix.length &&
    name.slice(0, prefix.length).toUpperCase() === prefix.toUpperCase()
    ? name.slice(prefix.length)
    : null;
}

function examKindOf(e: ExamOption, grades: RegistryItem[], subjects: RegistryItem[]): string {
  const gradeName   = grades.find((g) => g.id === e.gradeId)?.name ?? "";
  const subjectName = subjects.find((s) => s.id === e.subjectId)?.name ?? "";
  const afterGrade = stripPrefixCI(e.exam, `${gradeName}_`) ?? e.exam;
  // Subject may appear with spaces or underscores ("Applied Mathematics" vs
  // "APPLIED_MATHEMATICS") — try both spellings, case-insensitively.
  for (const cand of [subjectName, subjectName.replace(/\s+/g, "_"), subjectName.replace(/ /g, "_")]) {
    if (!cand) break;
    const rest = stripPrefixCI(afterGrade, `${cand}_`);
    if (rest) return rest;
  }
  // Couldn't recognise the prefix — use the full name; the suffix match then
  // simply hits exactly that one exam.
  return e.exam;
}

// ─────────────────────────────────────────────────────────────────────────────
// SelectField — shared select UI
// ─────────────────────────────────────────────────────────────────────────────

function SelectField({
  label,
  value,
  disabled,
  onChange,
  children,
}: {
  label:    string;
  value:    string;
  disabled?: boolean;
  onChange: (val: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
        {label}
      </label>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2.5 shadow-sm focus:border-blue-500 focus:ring-blue-500 disabled:opacity-50 disabled:bg-gray-100 disabled:cursor-not-allowed"
      >
        {children}
      </select>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function ExportDataPage() {
  const router = useRouter();

  // ADMIN only — mirrors the server-side requireRole gate on the endpoints.
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  useEffect(() => { setAuthorized(getUserRoles().includes("ADMIN")); }, []);

  const queryClient = useQueryClient();
  const [exportError, setExportError]       = useState<string | null>(null);
  const [isExporting, setIsExporting]       = useState(false);
  const [isExportingMarks, setIsExportingMarks] = useState(false);

  const [
    {
      schoolId: selectedSchoolId,
      gradeId: selectedGradeId,
      subjectId: selectedSubjectId,
      section: selectedSection,
      exam: selectedExam,
    },
    setExport,
  ] = useQueryStates(urlKeys.exportData, URL_OPTIONS);

  // ── Load registry ──────────────────────────────────────────────────────────

  const optionsQuery = useQuery({
    queryKey: keys.registry.batchFormOptions(),
    queryFn: async (): Promise<BatchFormOptions> => {
      const res = await fetch(`${API_BASE}/api/registry/batch-form-options`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error(`Registry load failed: ${res.status}`);
      return res.json();
    },
  });

  const options = optionsQuery.data ?? null;
  const loadingOptions = optionsQuery.isPending;
  const fetchError =
    optionsQuery.error instanceof Error
      ? optionsQuery.error.message
      : optionsQuery.error
        ? "Failed to load filter options"
        : null;

  const loadOptions = useCallback(
    () => queryClient.invalidateQueries({ queryKey: keys.registry.batchFormOptions() }),
    [queryClient]
  );

  // ── Cascading filter memos ─────────────────────────────────────────────────

  const examsForSchool = useMemo(() =>
    options && selectedSchoolId
      ? options.exams.filter((e) => String(e.schoolId) === selectedSchoolId)
      : [],
    [options, selectedSchoolId]
  );

  const validGrades = useMemo(() => {
    if (!options || !selectedSchoolId) return [];
    const ids = new Set(examsForSchool.map((e) => e.gradeId));
    return options.grades.filter((g) => ids.has(g.id));
  }, [options, selectedSchoolId, examsForSchool]);

  const validSubjects = useMemo(() => {
    if (!options || !selectedGradeId) return [];
    const ids = new Set(
      examsForSchool
        .filter((e) => selectedGradeId === ALL || String(e.gradeId) === selectedGradeId)
        .map((e) => e.subjectId)
    );
    return options.subjects.filter((s) => ids.has(s.id));
  }, [options, selectedGradeId, examsForSchool]);

  // Exam dropdown lists exam KINDS (name minus the grade/subject prefix),
  // deduped across whatever grade/subject scope is selected — so "All
  // subjects" + "ANNUALEXAMINATION_25-26" is one pick.
  const validExamKinds = useMemo(() => {
    if (!options || !selectedSubjectId) return [];
    const pool = examsForSchool.filter(
      (e) =>
        (selectedGradeId   === ALL || String(e.gradeId)   === selectedGradeId) &&
        (selectedSubjectId === ALL || String(e.subjectId) === selectedSubjectId)
    );
    return Array.from(new Set(pool.map((e) => examKindOf(e, options.grades, options.subjects))));
  }, [options, selectedGradeId, selectedSubjectId, examsForSchool]);

  const anyAll =
    selectedGradeId === ALL || selectedSubjectId === ALL || selectedSection === ALL;

  // Everything picked (All counts as picked) — enables the marks dump.
  const isFormComplete = Boolean(
    selectedSchoolId &&
    selectedGradeId  &&
    selectedSubjectId &&
    selectedSection  &&
    selectedExam
  );
  // The answers export needs one specific exam — no "All" anywhere.
  const isFormValid = isFormComplete && !anyAll;

  // ── Cascading change handlers ──────────────────────────────────────────────

  // Each is one call, so a reset clears its whole tail in a single URL write.
  const handleSchoolChange = (val: string) =>
    setExport({ schoolId: val || null, gradeId: null, subjectId: null, section: null, exam: null });

  const handleGradeChange = (val: string) =>
    setExport({ gradeId: val || null, subjectId: null, section: null, exam: null });

  const handleSubjectChange = (val: string) =>
    setExport({ subjectId: val || null, section: null, exam: null });

  const handleSectionChange = (val: string) =>
    setExport({ section: val || null, exam: null });

  const handleExamChange = (val: string) => setExport({ exam: val || null });

  // ── Export handler ─────────────────────────────────────────────────────────

  const downloadBlob = async (url: string, filename: string) => {
    let blobUrl: string | null = null;
    try {
      const res = await fetch(url, { headers: authHeaders() });
      if (!res.ok) throw new Error(`Export failed: ${res.status}`);
      const blob = await res.blob();
      blobUrl    = URL.createObjectURL(blob);
      const a    = document.createElement("a");
      a.href     = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      // Always revoke blob URL — even if the download threw
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    }
  };

  const handleExport = async () => {
    if (!isFormValid || !options) return;

    setIsExporting(true);
    setExportError(null);

    const gradeName   = options.grades.find(  (g) => String(g.id) === selectedGradeId)?.name   ?? "";
    const subjectName = options.subjects.find((s) => String(s.id) === selectedSubjectId)?.name ?? "";

    // The dropdown holds the exam KIND — resolve back to the one full exam
    // name for this (grade, subject), which is what the answers API expects.
    const fullExam = examsForSchool.find(
      (e) =>
        String(e.gradeId)   === selectedGradeId &&
        String(e.subjectId) === selectedSubjectId &&
        examKindOf(e, options.grades, options.subjects) === selectedExam
    )?.exam ?? selectedExam;

    const params = new URLSearchParams({
      schoolId: selectedSchoolId,
      exam:     fullExam,
      section:  selectedSection,
      subject:  subjectName,
      grade:    gradeName,
    });

    try {
      await downloadBlob(
        `${API_BASE}/api/data-quality/export-csv?${params}`,
        toSafeFilename(selectedSchoolId, fullExam, selectedSection, subjectName, gradeName) + ".csv"
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to export data";
      console.error("[ExportDataPage] Export error:", msg);
      setExportError(msg);
    } finally {
      setIsExporting(false);
    }
  };

  // Marks dump (question-level, from loam_ops via beaver-api). "All" choices
  // simply omit that filter; the exam kind is matched server-side as a suffix
  // of exam_type, so one kind spans all selected grades/subjects.
  const handleExportMarks = async () => {
    if (!isFormComplete || !options) return;

    setIsExportingMarks(true);
    setExportError(null);

    const gradeName   = options.grades.find(  (g) => String(g.id) === selectedGradeId)?.name   ?? "";
    const subjectName = options.subjects.find((s) => String(s.id) === selectedSubjectId)?.name ?? "";

    const params = new URLSearchParams();
    if (selectedGradeId   !== ALL) params.set("grade",   gradeName);
    if (selectedSubjectId !== ALL) params.set("subject", subjectName);
    if (selectedSection   !== ALL) params.set("section", selectedSection);
    params.set("examKind", selectedExam);

    try {
      await downloadBlob(
        `${BEAVER_BASE}/api/export/marks-dump?${params}`,
        toSafeFilename(
          "marks_dump",
          selectedGradeId   === ALL ? "all-grades"   : gradeName,
          selectedSubjectId === ALL ? "all-subjects" : subjectName,
          selectedSection   === ALL ? "all-sections" : selectedSection,
          selectedExam,
        ) + ".csv"
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to export marks dump";
      console.error("[ExportDataPage] Marks dump error:", msg);
      setExportError(msg);
    } finally {
      setIsExportingMarks(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  // ADMIN gate — nothing renders for other roles (server enforces it too).
  if (authorized === null) {
    return (
      <div className="p-8 flex justify-center items-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }
  if (!authorized) {
    return (
      <div className="p-8 max-w-4xl mx-auto">
        <div className="flex flex-col items-center gap-3 py-16 text-center bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <ShieldAlert className="text-amber-500" size={32} />
          <p className="text-sm font-semibold text-gray-700 dark:text-gray-200">Admins only</p>
          <p className="text-xs text-gray-500">Export Data requires the ADMIN role.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-4xl mx-auto">

      {/* Header */}
      <div className="mb-8 flex items-start gap-4">
        <button
          onClick={() => router.back()}
          className="mt-1 p-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-500 hover:text-indigo-600 hover:border-indigo-300 transition-colors shadow-sm"
          title="Go back"
        >
          <ArrowLeft size={20} />
        </button>
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Export Answer Data</h1>
          <p className="text-gray-500 dark:text-gray-400 mt-2">
            Download a CSV export of student OCR and answer data for review and correction.
          </p>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">

        {/* Registry loading */}
        {loadingOptions && (
          <div className="flex justify-center items-center h-32">
            <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
          </div>
        )}

        {/* Registry fetch error */}
        {!loadingOptions && fetchError && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <AlertCircle className="text-red-400" size={32} />
            <p className="text-sm text-red-500 font-medium">{fetchError}</p>
            <button
              onClick={loadOptions}
              className="text-sm text-blue-600 hover:underline font-medium"
            >
              Retry
            </button>
          </div>
        )}

        {/* Form */}
        {!loadingOptions && !fetchError && options && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

            <SelectField label="School" value={selectedSchoolId} onChange={handleSchoolChange}>
              <option value="">Select School…</option>
              {options.schools.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </SelectField>

            <SelectField label="Grade" value={selectedGradeId} disabled={!selectedSchoolId} onChange={handleGradeChange}>
              <option value="">Select Grade…</option>
              <option value={ALL}>All grades</option>
              {validGrades.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </SelectField>

            <SelectField label="Subject" value={selectedSubjectId} disabled={!selectedGradeId} onChange={handleSubjectChange}>
              <option value="">Select Subject…</option>
              <option value={ALL}>All subjects</option>
              {validSubjects.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </SelectField>

            <SelectField label="Section" value={selectedSection} disabled={!selectedSubjectId} onChange={handleSectionChange}>
              <option value="">Select Section…</option>
              <option value={ALL}>All sections</option>
              {options.sections.map((sec) => (
                <option key={sec} value={sec}>{sec}</option>
              ))}
            </SelectField>

            <SelectField label="Exam" value={selectedExam} disabled={!selectedSection} onChange={handleExamChange}>
              <option value="">Select Exam…</option>
              {validExamKinds.map((kind) => (
                <option key={kind} value={kind}>{kind}</option>
              ))}
            </SelectField>

            {/* Export error */}
            {exportError && (
              <div className="col-span-1 md:col-span-2 flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle size={15} className="shrink-0" />
                {exportError}
              </div>
            )}

            {/* Export buttons */}
            <div className="col-span-1 md:col-span-2 flex flex-wrap items-center justify-end gap-3">
              {/* Marks dump: question-level rows; works with "All" selections */}
              <button
                onClick={handleExportMarks}
                disabled={!isFormComplete || isExportingMarks}
                title="One row per question per answer paper (student, marks, totals). 'All' selections are supported."
                className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isExportingMarks ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Generating CSV…</>
                ) : (
                  <><Table className="w-5 h-5" /> Download Marks Dump</>
                )}
              </button>

              {/* Answers/OCR export: needs one specific exam (no "All") */}
              <button
                onClick={handleExport}
                disabled={!isFormValid || isExporting}
                title={anyAll
                  ? "The answers export needs specific Grade / Subject / Section (no 'All')."
                  : "Student OCR and answer data for review and correction."}
                className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:ring-4 focus:ring-blue-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isExporting ? (
                  <><Loader2 className="w-5 h-5 animate-spin" /> Generating CSV…</>
                ) : (
                  <><Download className="w-5 h-5" /> Download Answers CSV</>
                )}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}