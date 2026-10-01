"use client";

import { useState, useCallback, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "@/app/lib/queryKeys";
import { Loader2, Plus, Save, Pencil, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

const PAGE_SIZE = 10;
import type { SchoolOption, GradeOption, Subject, ExamType, Exam } from "../types";
import { API_BASE, authHeaders } from "../lib/api";
import { SmartSelect } from "./SmartSelect";
import { ErrorBanner } from "./ErrorBanner";

const NO_EXAMS: Exam[] = [];
const NO_SUBJECTS: Subject[] = [];
const NO_EXAM_TYPES: ExamType[] = [];

export function ExamsPanel({
  schools,
  grades,
}: {
  schools: SchoolOption[];
  grades: GradeOption[];
}) {
  const queryClient = useQueryClient();
  const [actionError, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterSchool, setFilterSchool] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [filterExamType, setFilterExamType] = useState("");
  const [page, setPage] = useState(1);
  const [editId, setEditId] = useState<number | null>(null);

  // Create-form state
  const [newSchool, setNewSchool] = useState("");
  const [newGrade, setNewGrade] = useState("");
  const [newSubject, setNewSubject] = useState("");
  const [newExamType, setNewExamType] = useState("");
  const [newName, setNewName] = useState("");
  const [newDate, setNewDate] = useState("");

  // Inline-edit state
  const [editSchool, setEditSchool] = useState("");
  const [editGrade, setEditGrade] = useState("");
  const [editSubject, setEditSubject] = useState("");
  const [editExamType, setEditExamType] = useState("");
  const [editName, setEditName] = useState("");
  const [editDate, setEditDate] = useState("");

  // filterSchool is in the key, so a slow reply for a previously-selected
  // school can no longer land on the current one — replaces the AbortController.
  const examsQuery = useQuery({
    queryKey: keys.config.panel("/api/data-quality/exams", { schoolId: filterSchool }),
    queryFn: async (): Promise<Exam[]> => {
      const params = new URLSearchParams();
      // only schoolId is supported server-side; grade/subject/type are filtered client-side below
      if (filterSchool) params.set("schoolId", filterSchool);
      const qs = params.toString();
      const res = await fetch(
        `${API_BASE}/api/data-quality/exams${qs ? `?${qs}` : ""}`,
        { headers: authHeaders() },
      );
      if (!res.ok) throw new Error(`Failed to load exams (${res.status})`);
      return res.json();
    },
  });

  // Same keys the Subjects / Exam Types config panels use, so these are shared.
  const subjectsQuery = useQuery({
    queryKey: keys.config.panel("/api/data-quality/subjects"),
    queryFn: async (): Promise<Subject[]> => {
      const res = await fetch(`${API_BASE}/api/data-quality/subjects`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load subjects");
      return res.json();
    },
  });

  const examTypesQuery = useQuery({
    queryKey: keys.config.panel("/api/data-quality/exam-types"),
    queryFn: async (): Promise<ExamType[]> => {
      const res = await fetch(`${API_BASE}/api/data-quality/exam-types`, { headers: authHeaders() });
      if (!res.ok) throw new Error("Failed to load exam types");
      return (await res.json()).examTypes || [];
    },
  });

  const exams = examsQuery.data ?? NO_EXAMS;
  const subjects = subjectsQuery.data ?? NO_SUBJECTS;
  const examTypes = examTypesQuery.data ?? NO_EXAM_TYPES;
  const loading = examsQuery.isPending;
  const depsLoading = subjectsQuery.isPending || examTypesQuery.isPending;
  const error =
    actionError ??
    (examsQuery.error instanceof Error ? examsQuery.error.message : null);

  // Derived option arrays
  const schoolOpts = schools.map((s) => ({ label: s.name, value: String(s.id) }));
  const gradeOpts = grades.map((g) => ({ label: g.name, value: String(g.id) }));
  const subjectOpts = subjects.map((s) => ({ label: s.name, value: String(s.id) }));
  const examTypeOpts = examTypes.map((e) => ({ label: e.name, value: String(e.id) }));

  // Display helpers for read-only table rows
  const schoolName = (id: number) => schools.find((s) => s.id === id)?.name ?? `#${id}`;
  const gradeName = (id: number) => grades.find((g) => g.id === id)?.name ?? `#${id}`;
  const subjectName = (id: number) => subjects.find((s) => s.id === id)?.name ?? `#${id}`;
  const examTypeName = (id: number) => examTypes.find((e) => e.id === id)?.name ?? `#${id}`;

  const load = useCallback(
    () => queryClient.invalidateQueries({
      queryKey: keys.config.panel("/api/data-quality/exams", { schoolId: filterSchool }),
    }),
    [queryClient, filterSchool],
  );

  // Page resets whenever the exam list changes identity (filter change or refetch).
  useEffect(() => { setPage(1); }, [exams]);

  const handleCreate = async () => {
    if (!newSchool || !newGrade || !newSubject || !newExamType || !newName.trim()) {
      setError("All fields except date are required");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const res = await fetch(`${API_BASE}/api/data-quality/exams`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          schoolId: Number(newSchool),
          gradeId: Number(newGrade),
          subjectId: Number(newSubject),
          examTypeId: Number(newExamType),
          name: newName.trim(),
          examDate: newDate || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Failed to create exam (${res.status})`);
      }
      setNewSchool("");
      setNewGrade("");
      setNewSubject("");
      setNewExamType("");
      setNewName("");
      setNewDate("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create exam");
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (e: Exam) => {
    setEditId(e.id);
    setEditSchool(String(e.schoolId));
    setEditGrade(String(e.gradeId));
    setEditSubject(String(e.subjectId));
    setEditExamType(String(e.examTypeId));
    setEditName(e.name);
    setEditDate(e.examDate || "");
    setError(null);
  };

  const cancelEdit = () => {
    setEditId(null);
    setError(null);
    setEditSchool("");
    setEditGrade("");
    setEditSubject("");
    setEditExamType("");
    setEditName("");
    setEditDate("");
  };

  const handleUpdate = async (id: number) => {
    if (!editSchool || !editGrade || !editSubject || !editExamType || !editName.trim()) {
      setError("All fields except date are required");
      return;
    }
    try {
      setSaving(true);
      setError(null);
      const res = await fetch(`${API_BASE}/api/data-quality/exams/${id}`, {
        method: "PUT",
        headers: authHeaders(true),
        body: JSON.stringify({
          schoolId: Number(editSchool),
          gradeId: Number(editGrade),
          subjectId: Number(editSubject),
          examTypeId: Number(editExamType),
          name: editName.trim(),
          examDate: editDate || null,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Failed to update exam (${res.status})`);
      }
      setEditId(null);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update exam");
    } finally {
      setSaving(false);
    }
  };

  // client-side pass: narrows the school-scoped list by grade, subject, examType
  const filteredExams = exams.filter(
    (e) =>
      (!filterGrade    || String(e.gradeId)   === filterGrade) &&
      (!filterSubject  || String(e.subjectId) === filterSubject) &&
      (!filterExamType || String(e.examTypeId) === filterExamType),
  );

  return (
    <div className="space-y-4">
      {/* Create form */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h2 className="text-base font-bold text-gray-900 mb-4">Add Exam</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-3">
          <SmartSelect
            label="School"
            required
            value={newSchool}
            options={schoolOpts}
            placeholder="Select school"
            onChange={setNewSchool}
          />
          <SmartSelect
            label="Grade"
            required
            value={newGrade}
            options={gradeOpts}
            placeholder="Select grade"
            onChange={setNewGrade}
          />
          <SmartSelect
            label="Subject"
            required
            value={newSubject}
            options={subjectOpts}
            placeholder="Select subject"
            onChange={setNewSubject}
            isLoading={depsLoading}
          />
          <SmartSelect
            label="Exam Type"
            required
            value={newExamType}
            options={examTypeOpts}
            placeholder="Select type"
            onChange={setNewExamType}
            isLoading={depsLoading}
          />
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Exam Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Annual Exam"
              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg
                         focus:outline-none focus:border-indigo-400
                         focus:ring-2 focus:ring-indigo-500/10 transition"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Date
            </label>
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg
                         focus:outline-none focus:border-indigo-400
                         focus:ring-2 focus:ring-indigo-500/10 transition"
            />
          </div>
        </div>
        <button
          onClick={handleCreate}
          disabled={saving}
          className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40
                     disabled:cursor-not-allowed text-white text-sm font-semibold
                     rounded-lg transition flex items-center justify-center gap-1.5"
        >
          {saving ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Plus size={14} />
          )}
          Add Exam
        </button>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* Exams list */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="text-base font-bold text-gray-900">
            Exams{" "}
            {!loading && (
              <span className="text-gray-400 font-medium">({filteredExams.length})</span>
            )}
          </h2>
          <div className="flex items-center gap-2 flex-wrap">
            {[
              { label: "All schools",    value: filterSchool,   onChange: (v: string) => { setFilterSchool(v);   setPage(1); }, opts: schoolOpts },
              { label: "All grades",     value: filterGrade,    onChange: (v: string) => { setFilterGrade(v);    setPage(1); }, opts: gradeOpts },
              { label: "All subjects",   value: filterSubject,  onChange: (v: string) => { setFilterSubject(v);  setPage(1); }, opts: subjectOpts },
              { label: "All exam types", value: filterExamType, onChange: (v: string) => { setFilterExamType(v); setPage(1); }, opts: examTypeOpts },
            ].map(({ label, value, onChange, opts }) => (
              <div key={label} className="relative">
                <select
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  className={`h-8 pl-3 pr-8 text-xs font-medium rounded-lg border appearance-none
                              cursor-pointer transition focus:outline-none focus:ring-2
                              focus:ring-indigo-500/20 focus:border-indigo-400
                              ${value
                      ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                      : "bg-white border-gray-200 text-gray-500"}`}
                >
                  <option value="">{label}</option>
                  {opts.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <ChevronDown
                  size={12}
                  className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400"
                />
              </div>
            ))}
            {(filterSchool || filterGrade || filterSubject || filterExamType) && (
              <button
                onClick={() => { setFilterSchool(""); setFilterGrade(""); setFilterSubject(""); setFilterExamType(""); setPage(1); }}
                className="h-8 px-3 text-xs font-medium text-red-500 hover:text-red-600
                           border border-red-200 hover:border-red-300 rounded-lg transition"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : filteredExams.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">
            No exams found.
          </p>
        ) : (() => {
          const totalPages = Math.ceil(filteredExams.length / PAGE_SIZE);
          const start = (page - 1) * PAGE_SIZE;
          const pageExams = filteredExams.slice(start, start + PAGE_SIZE);

          return (
            <>
              <div className="border border-gray-200 rounded-lg overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-left">
                      <th className="px-3 py-2 font-semibold text-gray-600">School</th>
                      <th className="px-3 py-2 font-semibold text-gray-600">Grade</th>
                      <th className="px-3 py-2 font-semibold text-gray-600">Subject</th>
                      <th className="px-3 py-2 font-semibold text-gray-600">Type</th>
                      <th className="px-3 py-2 font-semibold text-gray-600">Name</th>
                      <th className="px-3 py-2 font-semibold text-gray-600">Date</th>
                      <th className="px-3 py-2 font-semibold text-gray-600 w-px whitespace-nowrap">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pageExams.map((exam) =>
                      editId === exam.id ? (
                        <tr key={`${exam.id}-edit`}>
                          <td
                            colSpan={7}
                            className="p-5 bg-indigo-50/40 border-y border-indigo-100"
                          >
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                              <SmartSelect
                                label="School"
                                value={editSchool}
                                options={schoolOpts}
                                placeholder="School"
                                onChange={setEditSchool}
                                isLoading={depsLoading}
                              />
                              <SmartSelect
                                label="Grade"
                                value={editGrade}
                                options={gradeOpts}
                                placeholder="Grade"
                                onChange={setEditGrade}
                              />
                              <SmartSelect
                                label="Subject"
                                value={editSubject}
                                options={subjectOpts}
                                placeholder="Subject"
                                onChange={setEditSubject}
                                isLoading={depsLoading}
                              />
                              <SmartSelect
                                label="Exam Type"
                                value={editExamType}
                                options={examTypeOpts}
                                placeholder="Type"
                                onChange={setEditExamType}
                                isLoading={depsLoading}
                              />
                              <div className="sm:col-span-2">
                                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                                  Exam Name
                                </label>
                                <input
                                  type="text"
                                  value={editName}
                                  onChange={(ev) => setEditName(ev.target.value)}
                                  className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md
                                             focus:outline-none focus:border-indigo-400
                                             focus:ring-2 focus:ring-indigo-500/10 transition bg-white"
                                />
                              </div>
                              <div className="sm:col-span-2 lg:col-span-1">
                                <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                                  Date
                                </label>
                                <input
                                  type="date"
                                  value={editDate}
                                  onChange={(ev) => setEditDate(ev.target.value)}
                                  className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md
                                             focus:outline-none focus:border-indigo-400
                                             focus:ring-2 focus:ring-indigo-500/10 transition bg-white"
                                />
                              </div>
                            </div>
                            <div className="flex justify-end gap-2 mt-5 pt-4 border-t border-indigo-100/50">
                              <button
                                onClick={cancelEdit}
                                className="h-9 px-4 text-gray-600 hover:text-gray-800
                                           hover:bg-gray-100/50 text-sm font-semibold rounded-lg transition"
                              >
                                Cancel
                              </button>
                              <button
                                onClick={() => handleUpdate(exam.id)}
                                disabled={saving}
                                className="flex items-center gap-2 h-9 px-4 bg-indigo-600
                                           hover:bg-indigo-700 disabled:opacity-40 text-white
                                           text-sm font-semibold rounded-lg shadow-sm transition"
                              >
                                {saving ? (
                                  <Loader2 size={14} className="animate-spin" />
                                ) : (
                                  <Save size={14} />
                                )}
                                Save Changes
                              </button>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        <tr key={exam.id} className="border-t border-gray-100">
                          <td className="px-3 py-2 text-gray-900">
                            {schoolName(exam.schoolId)}
                          </td>
                          <td className="px-3 py-2 text-gray-500">
                            {gradeName(exam.gradeId)}
                          </td>
                          <td className="px-3 py-2 text-gray-500">
                            {subjectName(exam.subjectId)}
                          </td>
                          <td className="px-3 py-2 text-gray-500">
                            {examTypeName(exam.examTypeId)}
                          </td>
                          <td className="px-3 py-2 text-gray-900 font-medium">
                            {exam.name}
                          </td>
                          <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                            {exam.examDate || "—"}
                          </td>
                          <td className="px-3 py-2">
                            <button
                              onClick={() => startEdit(exam)}
                              className="flex items-center gap-1 h-8 px-2.5 text-gray-600
                                         hover:text-indigo-600 text-xs font-medium border
                                         border-gray-200 hover:border-indigo-300 rounded-md transition"
                            >
                              <Pencil size={12} /> Edit
                            </button>
                          </td>
                        </tr>
                      ),
                    )}
                  </tbody>
                </table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-4">
                  <span className="text-xs text-gray-500">
                    {start + 1}–{Math.min(start + PAGE_SIZE, exams.length)} of {exams.length}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200
                                 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    >
                      <ChevronLeft size={14} />
                    </button>
                    {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                      <button
                        key={p}
                        onClick={() => setPage(p)}
                        className={`flex items-center justify-center w-8 h-8 rounded-lg text-xs font-semibold transition ${
                          p === page
                            ? "bg-indigo-600 text-white"
                            : "border border-gray-200 text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                    <button
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="flex items-center justify-center w-8 h-8 rounded-lg border border-gray-200
                                 text-gray-500 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition"
                    >
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>
    </div>
  );
}
