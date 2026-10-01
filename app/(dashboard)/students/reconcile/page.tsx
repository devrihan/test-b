"use client";

import { useState, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { keys } from "@/app/lib/queryKeys";
import { urlKeys, URL_OPTIONS } from "@/app/lib/urlKeys";
import { useRouter } from "next/navigation";
import { ArrowLeft, Upload, Loader2, X, CheckCircle, AlertTriangle, XCircle, Search, FileSpreadsheet, ChevronDown, ChevronUp } from "lucide-react";
import { getAuthToken as getToken } from "@/app/lib/auth";

const BASE = process.env.NEXT_PUBLIC_BEAVER_API_URL ?? "http://localhost:4000";


type NeedsOnboardingStudent = {
  student_id: string;
  student_name: string;
  roll_number: string;
  batch_id: string;
  batch_name: string;
  school_id: string;
  school_name: string;
  grade: string;
  section: string;
  admission_no: string | null;
  needs_onboarding: boolean;
  status: string;
};

type MatchResult = {
  student_id: string;
  student_name: string;
  roll_number: string;
  batch_id: string;
  grade: string;
  section: string;
  excel_name: string;
  excel_admission_no: string;
  excel_roll_number: string;
  excel_section: string;
  match_confidence: "high" | "low";
};

type UnmatchedStudent = {
  student_id: string;
  student_name: string;
  roll_number: string;
  batch_id: string;
  grade: string;
  section: string;
};

type UnmatchedExcelRow = {
  row_number: number;
  name: string;
  admission_no: string;
  section: string;
  roll_number: string;
};

type ReconcileResult = {
  matched: MatchResult[];
  unmatched_batch_students: UnmatchedStudent[];
  unmatched_excel_rows: UnmatchedExcelRow[];
};

type GroupKey = string;
type StudentGroup = {
  school_id: string;
  school_name: string;
  grade: string;
  section: string;
  students: NeedsOnboardingStudent[];
};

const NO_STUDENTS: NeedsOnboardingStudent[] = [];

export default function StudentReconcilePage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();
  const [actionError, setError] = useState<string | null>(null);

  const studentsQuery = useQuery({
    queryKey: keys.students.needsOnboarding(),
    queryFn: async (): Promise<NeedsOnboardingStudent[]> => {
      const token = getToken();
      const res = await fetch(`${BASE}/api/students/list`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to load students");
      const data = await res.json();
      return data.students ?? [];
    },
  });

  const students = studentsQuery.data ?? NO_STUDENTS;
  const loading = studentsQuery.isPending;
  const error =
    actionError ??
    (studentsQuery.error instanceof Error ? studentsQuery.error.message : null);

  const refreshStudents = () =>
    queryClient.invalidateQueries({ queryKey: keys.students.needsOnboarding() });

  // Reconciliation state per group
  const [activeGroup, setActiveGroup] = useState<GroupKey | null>(null);
  const [reconcileResult, setReconcileResult] = useState<ReconcileResult | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Track accepted/rejected matches
  const [acceptedMatches, setAcceptedMatches] = useState<Record<string, boolean>>({});

  // Manual admission_no inputs for unmatched students
  const [manualAssignments, setManualAssignments] = useState<Record<string, string>>({});

  // Manual name/roll edits
  const [nameEdits, setNameEdits] = useState<Record<string, string>>({});
  const [rollEdits, setRollEdits] = useState<Record<string, string>>({});

  // Manual assignment from unmatched excel rows to unmatched students
  const [excelToStudentMap, setExcelToStudentMap] = useState<Record<number, string>>({});

  // Collapsed groups
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  // Filter
  const [{ filter }, setReconcile] = useQueryStates(urlKeys.studentsReconcile, URL_OPTIONS);

  // Filter students
  const filteredStudents = students.filter(s => {
    if (filter === "needs_onboarding") return s.needs_onboarding === true;
    if (filter === "no_admission") return !s.admission_no;
    return true;
  });

  // Group students by school + grade + section
  const groups: Record<GroupKey, StudentGroup> = {};
  for (const s of filteredStudents) {
    const key = `${s.school_id}_${s.grade}_${s.section}`;
    if (!groups[key]) {
      groups[key] = {
        school_id: s.school_id,
        school_name: s.school_name,
        grade: s.grade,
        section: s.section,
        students: [],
      };
    }
    groups[key].students.push(s);
  }

  // Handle Excel upload for a group
  const handleReconcile = async (groupKey: GroupKey, file: File) => {
    const group = groups[groupKey];
    if (!group) return;

    try {
      setReconciling(true);
      setError(null);
      setReconcileResult(null);
      setActiveGroup(groupKey);
      setAcceptedMatches({});
      setManualAssignments({});
      setExcelToStudentMap({});

      const token = getToken();
      const fd = new FormData();
      fd.append("file", file);
      fd.append("school_id", group.school_id);
      fd.append("grade", group.grade);
      fd.append("section", group.section);

      const res = await fetch(`${BASE}/api/students/reconcile`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Reconcile failed: ${res.status}`);
      }

      const data: ReconcileResult = await res.json();
      setReconcileResult(data);

      // Auto-accept high confidence matches
      const autoAccepted: Record<string, boolean> = {};
      for (const m of data.matched) {
        autoAccepted[m.student_id] = m.match_confidence === "high";
      }
      setAcceptedMatches(autoAccepted);

    } catch (err) {
      setError(err instanceof Error ? err.message : "Reconciliation failed");
    } finally {
      setReconciling(false);
    }
  };

  // Confirm and save matches
  const handleConfirm = async () => {
    if (!reconcileResult) return;

    try {
      setConfirming(true);
      setError(null);

      const assignments: { student_id: string; batch_id: string; admission_no: string }[] = [];

      // Add accepted auto-matches
      for (const m of reconcileResult.matched) {
        if (acceptedMatches[m.student_id]) {
          assignments.push({
            student_id: m.student_id,
            batch_id: m.batch_id,
            admission_no: m.excel_admission_no,
          });
        }
      }

      // Add manual text input assignments
      for (const [studentId, admNo] of Object.entries(manualAssignments)) {
        if (admNo.trim()) {
          const student = reconcileResult.unmatched_batch_students.find(s => s.student_id === studentId);
          if (student) {
            assignments.push({
              student_id: studentId,
              batch_id: student.batch_id,
              admission_no: admNo.trim(),
            });
          }
        }
      }

      // Add excel-to-student drag assignments
      for (const [rowIdx, studentId] of Object.entries(excelToStudentMap)) {
        if (studentId) {
          const excelRow = reconcileResult.unmatched_excel_rows[Number(rowIdx)];
          const student = reconcileResult.unmatched_batch_students.find(s => s.student_id === studentId);
          if (excelRow && student) {
            assignments.push({
              student_id: studentId,
              batch_id: student.batch_id,
              admission_no: excelRow.admission_no,
            });
          }
        }
      }

      if (assignments.length === 0) {
        setError("No matches to confirm. Accept at least one match or assign manually.");
        return;
      }

      const token = getToken();
      const res = await fetch(`${BASE}/api/students/reconcile/confirm`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ assignments }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Confirm failed: ${res.status}`);
      }

      const data = await res.json();
      setSuccessMsg(`${data.updated} student(s) updated with admission numbers`);

      // Refresh the list
      setReconcileResult(null);
      setActiveGroup(null);

      await refreshStudents();

    } catch (err) {
      setError(err instanceof Error ? err.message : "Confirm failed");
    } finally {
      setConfirming(false);
    }
  };

  const toggleGroup = (key: string) => {
    setCollapsedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const acceptedCount = Object.values(acceptedMatches).filter(Boolean).length;
  const manualCount = Object.values(manualAssignments).filter(v => v.trim()).length;
  const excelMapCount = Object.values(excelToStudentMap).filter(Boolean).length;
  const totalToSave = acceptedCount + manualCount + excelMapCount;

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 size={24} className="animate-spin text-indigo-500" />
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-6">
      <div className="max-w-4xl mx-auto space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/students")}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium transition"
          >
            <ArrowLeft size={15} /> Back
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <h1 className="text-lg font-bold text-gray-900">Student Reconciliation</h1>
          <span className="ml-auto text-xs text-gray-400">
            {filteredStudents.length} of {students.length} students
          </span>
        </div>

        {/* Filters */}
        <div className="flex gap-2">
          {([
            { key: "all", label: "All Students" },
            { key: "needs_onboarding", label: "Needs Onboarding" },
            { key: "no_admission", label: "Missing Admission No" },
          ] as const).map(f => (
            <button
              key={f.key}
              onClick={() => setReconcile({ filter: f.key })}
              className={`h-8 px-3 text-xs font-medium rounded-lg border transition ${
                filter === f.key
                  ? "bg-indigo-600 text-white border-indigo-600"
                  : "bg-white text-gray-600 border-gray-200 hover:border-indigo-300"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Success message */}
        {successMsg && (
          <div className="flex items-center gap-2 p-3 bg-green-50 border border-green-200 rounded-xl">
            <CheckCircle size={16} className="text-green-500" />
            <p className="text-sm text-green-700 font-medium">{successMsg}</p>
            <button onClick={() => setSuccessMsg(null)} className="ml-auto text-green-400 hover:text-green-600">
              <X size={14} />
            </button>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
            <XCircle size={16} className="text-red-500" />
            <p className="text-sm text-red-600 font-medium">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">
              <X size={14} />
            </button>
          </div>
        )}

        {/* No students */}
        {students.length === 0 && !loading && (
          <div className="bg-white border border-gray-200 rounded-xl p-8 text-center">
            <CheckCircle size={32} className="mx-auto text-green-400 mb-3" />
            <p className="text-sm font-semibold text-gray-700">All students are onboarded</p>
            <p className="text-xs text-gray-400 mt-1">No students are missing admission numbers</p>
          </div>
        )}

        {/* Student groups */}
        {Object.entries(groups).map(([groupKey, group]) => (
          <div key={groupKey} className="bg-white border border-gray-200 rounded-xl overflow-hidden">

            {/* Group header */}
            <button
              onClick={() => toggleGroup(groupKey)}
              className="w-full flex items-center gap-3 px-5 py-3.5 hover:bg-gray-50 transition"
            >
              <div className="flex-1 text-left">
                <p className="text-sm font-bold text-gray-800">
                  {group.school_name} · Grade {group.grade} · Section {group.section}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {group.students.length} student{group.students.length !== 1 ? "s" : ""} missing admission number
                </p>
              </div>
              <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">
                {group.students.length}
              </span>
              {collapsedGroups[groupKey]
                ? <ChevronDown size={16} className="text-gray-400" />
                : <ChevronUp size={16} className="text-gray-400" />
              }
            </button>

            {/* Group content */}
            {!collapsedGroups[groupKey] && (
              <div className="px-5 pb-4 border-t border-gray-100">

                {/* Student list with manual admission input */}
                <div className="mt-3 space-y-1.5">
                  {group.students.map(s => (
                    <div
                      key={s.student_id}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-50"
                    >
                      <AlertTriangle size={13} className="text-amber-500 shrink-0" />
                      <input
                        type="text"
                        value={nameEdits[s.student_id] ?? s.student_name}
                        onChange={(e) => setNameEdits(prev => ({ ...prev, [s.student_id]: e.target.value }))}
                        className="h-7 px-2 text-xs font-medium border border-gray-200 rounded focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500/20 w-[130px]"
                      />
                      <input
                        type="text"
                        value={rollEdits[s.student_id] ?? s.roll_number}
                        onChange={(e) => setRollEdits(prev => ({ ...prev, [s.student_id]: e.target.value }))}
                        className="h-7 px-2 text-xs border border-gray-200 rounded focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500/20 w-[60px]"
                      />
                      <input
                        type="text"
                        placeholder="Admission no..."
                        value={manualAssignments[s.student_id] ?? s.admission_no ?? ""}
                        onChange={(e) => setManualAssignments(prev => ({ ...prev, [s.student_id]: e.target.value }))}
                        className="h-7 px-2 text-xs border border-gray-200 rounded focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500/20 w-[160px]"
                      />
                      <span className="ml-auto text-xs text-gray-400 truncate max-w-[150px]">
                        {s.batch_name || s.batch_id}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Save manual assignments button */}
                {group.students.some(s => (manualAssignments[s.student_id] ?? "").trim() || nameEdits[s.student_id] !== undefined || rollEdits[s.student_id] !== undefined) && (
                  <div className="mt-3">
                    <button
                      onClick={async () => {
                        const assignments = group.students
                          .filter(s => (manualAssignments[s.student_id] ?? "").trim() || nameEdits[s.student_id] !== undefined || rollEdits[s.student_id] !== undefined)
                          .map(s => ({
                            student_id: s.student_id,
                            batch_id: s.batch_id,
                             admission_no: (manualAssignments[s.student_id] ?? "").trim() || undefined,
                            student_name: nameEdits[s.student_id] !== undefined && nameEdits[s.student_id] !== s.student_name ? nameEdits[s.student_id].trim() : undefined,
                            roll_number: rollEdits[s.student_id] !== undefined && rollEdits[s.student_id] !== s.roll_number ? rollEdits[s.student_id].trim() : undefined,
                          }));
                        if (assignments.length === 0) return;

                        try {
                          setConfirming(true);
                          const token = getToken();
                          const res = await fetch(`${BASE}/api/students/reconcile/confirm`, {
                            method: "POST",
                            headers: {
                              "Content-Type": "application/json",
                              ...(token ? { Authorization: `Bearer ${token}` } : {}),
                            },
                            body: JSON.stringify({ assignments }),
                          });
                          if (!res.ok) throw new Error("Failed to save");
                          const data = await res.json();
                          setSuccessMsg(`${data.updated} student(s) updated`);
                          setManualAssignments({});
                          await refreshStudents();
                        } catch (err) {
                          setError(err instanceof Error ? err.message : "Save failed");
                        } finally {
                          setConfirming(false);
                        }
                      }}
                      disabled={confirming}
                      className="h-8 px-4 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-xs font-semibold rounded-lg transition flex items-center gap-1.5"
                    >
                      {confirming ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                      Save {group.students.filter(s => (manualAssignments[s.student_id] ?? "").trim() || nameEdits[s.student_id] !== undefined || rollEdits[s.student_id] !== undefined).length} Changes{group.students.filter(s => (manualAssignments[s.student_id] ?? "").trim()).length !== 1 ? "s" : ""}
                    </button>
                  </div>
                )}

                {/* Upload Excel button */}
                <div className="mt-4">
                  <button
                    onClick={() => {
                      setActiveGroup(groupKey);
                      fileRef.current?.click();
                    }}
                    disabled={reconciling}
                    className="h-9 px-4 bg-indigo-50 border border-indigo-200 hover:border-indigo-400 text-indigo-600 rounded-lg text-sm font-medium transition flex items-center gap-2"
                  >
                    {reconciling && activeGroup === groupKey ? (
                      <><Loader2 size={14} className="animate-spin" /> Matching...</>
                    ) : (
                      <><FileSpreadsheet size={14} /> Upload School Excel for this class</>
                    )}
                  </button>
                </div>

                {/* Reconciliation results for this group */}
                {activeGroup === groupKey && reconcileResult && (
                  <div className="mt-4 space-y-4">

                    {/* High confidence matches */}
                    {reconcileResult.matched.filter(m => m.match_confidence === "high").length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold text-green-700 mb-2 flex items-center gap-1.5">
                          <CheckCircle size={13} />
                          Auto-Matched ({reconcileResult.matched.filter(m => m.match_confidence === "high").length})
                        </h3>
                        <div className="border border-green-200 rounded-lg overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-green-50 text-left">
                                <th className="px-3 py-2 font-semibold text-green-700">Student</th>
                                <th className="px-3 py-2 font-semibold text-green-700">Excel Name</th>
                                <th className="px-3 py-2 font-semibold text-green-700">Admission No</th>
                                <th className="px-3 py-2 font-semibold text-green-700">Roll</th>
                                <th className="px-3 py-2 font-semibold text-green-700 text-center w-16">Accept</th>
                              </tr>
                            </thead>
                            <tbody>
                              {reconcileResult.matched
                                .filter(m => m.match_confidence === "high")
                                .map(m => (
                                  <tr key={m.student_id} className="border-t border-green-100">
                                    <td className="px-3 py-2 text-gray-900 font-medium">{m.student_name}</td>
                                    <td className="px-3 py-2 text-gray-600">{m.excel_name}</td>
                                    <td className="px-3 py-2 text-gray-700 font-mono">{m.excel_admission_no}</td>
                                    <td className="px-3 py-2 text-gray-500">{m.excel_roll_number}</td>
                                    <td className="px-3 py-2 text-center">
                                      <input
                                        type="checkbox"
                                        checked={acceptedMatches[m.student_id] ?? false}
                                        onChange={(e) => setAcceptedMatches(prev => ({
                                          ...prev,
                                          [m.student_id]: e.target.checked,
                                        }))}
                                        className="w-4 h-4 text-green-600 border-gray-300 rounded focus:ring-green-500"
                                      />
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Low confidence matches */}
                    {reconcileResult.matched.filter(m => m.match_confidence === "low").length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold text-amber-700 mb-2 flex items-center gap-1.5">
                          <AlertTriangle size={13} />
                          Needs Review ({reconcileResult.matched.filter(m => m.match_confidence === "low").length})
                        </h3>
                        <div className="border border-amber-200 rounded-lg overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-gray-200 text-left">
                                <th className="px-3 py-2 font-semibold text-amber-700">Student</th>
                                <th className="px-3 py-2 font-semibold text-amber-700">Excel Name</th>
                                <th className="px-3 py-2 font-semibold text-amber-700">Admission No</th>
                                <th className="px-3 py-2 font-semibold text-amber-700">Roll</th>
                                <th className="px-3 py-2 font-semibold text-amber-700 text-center w-16">Accept</th>
                              </tr>
                            </thead>
                            <tbody>
                              {reconcileResult.matched
                                .filter(m => m.match_confidence === "low")
                                .map(m => (
                                  <tr key={m.student_id} className="border-t border-amber-100">
                                    <td className="px-3 py-2 text-gray-900 font-medium">{m.student_name}</td>
                                    <td className="px-3 py-2 text-amber-700 font-medium">{m.excel_name}</td>
                                    <td className="px-3 py-2 text-gray-700 font-mono">{m.excel_admission_no}</td>
                                    <td className="px-3 py-2 text-gray-500">{m.excel_roll_number}</td>
                                    <td className="px-3 py-2 text-center">
                                      <input
                                        type="checkbox"
                                        checked={acceptedMatches[m.student_id] ?? false}
                                        onChange={(e) => setAcceptedMatches(prev => ({
                                          ...prev,
                                          [m.student_id]: e.target.checked,
                                        }))}
                                        className="w-4 h-4 text-amber-600 border-gray-300 rounded focus:ring-amber-500"
                                      />
                                    </td>
                                  </tr>
                                ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Unmatched batch students */}
                    {reconcileResult.unmatched_batch_students.length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold text-red-700 mb-2 flex items-center gap-1.5">
                          <XCircle size={13} />
                          Unmatched Students ({reconcileResult.unmatched_batch_students.length})
                        </h3>
                        <div className="border border-red-200 rounded-lg overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-red-50 text-left">
                                <th className="px-3 py-2 font-semibold text-red-700">Student</th>
                                <th className="px-3 py-2 font-semibold text-red-700">Roll No</th>
                                <th className="px-3 py-2 font-semibold text-red-700">Assign Admission No</th>
                              </tr>
                            </thead>
                            <tbody>
                              {reconcileResult.unmatched_batch_students.map(s => (
                                <tr key={s.student_id} className="border-t border-red-100">
                                  <td className="px-3 py-2 text-gray-900 font-medium">{s.student_name}</td>
                                  <td className="px-3 py-2 text-gray-500">{s.roll_number}</td>
                                  <td className="px-3 py-2">
                                    <input
                                      type="text"
                                      placeholder="Type admission no..."
                                      value={manualAssignments[s.student_id] ?? ""}
                                      onChange={(e) => setManualAssignments(prev => ({
                                        ...prev,
                                        [s.student_id]: e.target.value,
                                      }))}
                                      className="w-full h-7 px-2 text-xs border border-gray-200 rounded focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-500/20"
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Unmatched Excel rows */}
                    {reconcileResult.unmatched_excel_rows.length > 0 && (
                      <div>
                        <h3 className="text-xs font-bold text-gray-600 mb-2 flex items-center gap-1.5">
                          <FileSpreadsheet size={13} />
                          Unmatched Excel Rows ({reconcileResult.unmatched_excel_rows.length})
                        </h3>
                        <div className="border border-gray-200 rounded-lg overflow-hidden">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="bg-gray-50 text-left">
                                <th className="px-3 py-2 font-semibold text-gray-600">Name</th>
                                <th className="px-3 py-2 font-semibold text-gray-600">Admission No</th>
                                <th className="px-3 py-2 font-semibold text-gray-600">Roll No</th>
                                <th className="px-3 py-2 font-semibold text-gray-600">Assign to Student →</th>
                              </tr>
                            </thead>
                            <tbody>
                              {reconcileResult.unmatched_excel_rows.map((row, idx) => (
                                <tr key={idx} className="border-t border-gray-100">
                                  <td className="px-3 py-2 text-gray-900">{row.name}</td>
                                  <td className="px-3 py-2 text-gray-700 font-mono">{row.admission_no}</td>
                                  <td className="px-3 py-2 text-gray-500">{row.roll_number}</td>
                                  <td className="px-3 py-2">
                                    <select
                                      value={excelToStudentMap[idx] ?? ""}
                                      onChange={(e) => setExcelToStudentMap(prev => ({
                                        ...prev,
                                        [idx]: e.target.value,
                                      }))}
                                      className="w-full h-7 px-2 text-xs border border-gray-200 rounded focus:outline-none focus:border-indigo-400 bg-white"
                                    >
                                      <option value="">— Select student —</option>
                                      {reconcileResult.unmatched_batch_students
                                        .filter(s => !Object.values(excelToStudentMap).includes(s.student_id) || excelToStudentMap[idx] === s.student_id)
                                        .map(s => (
                                          <option key={s.student_id} value={s.student_id}>
                                            {s.student_name} (Roll {s.roll_number})
                                          </option>
                                        ))}
                                    </select>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )}

                    {/* Confirm button */}
                    <button
                      onClick={handleConfirm}
                      disabled={confirming || totalToSave === 0}
                      className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition flex items-center justify-center gap-2"
                    >
                      {confirming ? (
                        <><Loader2 size={15} className="animate-spin" /> Saving...</>
                      ) : (
                        <><CheckCircle size={15} /> Confirm & Save {totalToSave} Match{totalToSave !== 1 ? "es" : ""}</>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {/* Hidden file input */}
        <input
          ref={fileRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={e => {
            const f = e.target.files?.[0];
            if (f && activeGroup) {
              handleReconcile(activeGroup, f);
            }
            if (fileRef.current) fileRef.current.value = "";
          }}
        />
      </div>
    </div>
  );
}