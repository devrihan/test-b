"use client";

import { useCallback, useState, useRef, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { useQueryStates } from "nuqs";
import { urlKeys, URL_OPTIONS } from "@/app/lib/urlKeys";
import { ArrowLeft, Upload, Loader2, X, ChevronDown, CheckCircle, AlertCircle, Download, Search, UserCheck, ClipboardList, ArrowRightLeft } from "lucide-react";
import { getAuthToken as getToken } from "@/app/lib/auth";

const API_BASE = process.env.NEXT_PUBLIC_AGGREGATED_DATA_API_URL ?? "http://localhost:8082";

// One class selection shared by all three panels — only one is visible at a
// time, and they all mean the same thing, so switching tabs keeps your place.
function useOnboardScope() {
  const [{ schoolId, grade, section }, set] = useQueryStates(
    urlKeys.studentsOnboard,
    URL_OPTIONS
  );
  const setSchoolId = useCallback((v: string) => set({ schoolId: v || null }), [set]);
  const setGrade = useCallback((v: string) => set({ grade: v || null }), [set]);
  const setSection = useCallback((v: string) => set({ section: v || null }), [set]);
  return { schoolId, grade, section, setSchoolId, setGrade, setSection };
}


/* ── Smart Select ─────────────────────────────────────────── */
type SelectOption = { label: string; value: string };

function SmartSelect({
  label, required, value, options, placeholder, helperText, onChange,
}: {
  label: string; required?: boolean; value: string;
  options: SelectOption[]; placeholder: string;
  helperText?: string; onChange: (v: string) => void;
}) {
  const disabled = options.length === 0;
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-full h-9 px-3 pr-8 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition appearance-none bg-white cursor-pointer disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
        >
          <option value="" disabled>
            {disabled ? `No ${label.toLowerCase()} available` : placeholder}
          </option>
          {options.map(opt => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      </div>
      {disabled && helperText && (
        <p className="mt-1 text-[11px] text-amber-600">{helperText}</p>
      )}
    </div>
  );
}

/* ── Verify Students Panel ───────────────────────────────────
   Lets anyone check who's currently on record for a given
   School + Grade + Section, independent of any upload action.
   Hits the existing GET /api/student-lookup/list endpoint.
-------------------------------------------------------------- */
type StudentListItem = {
  id?: string | number;
  name: string;
  admissionNo?: string;
  rollNumber?: string;
  grade?: string;
  section?: string;
  schoolName?: string;
};

function VerifyStudentsPanel({ registry }: { registry: { schools: any[]; grades: any[]; sections: string[] } }) {
  const { schoolId, grade, section, setSchoolId, setGrade, setSection } = useOnboardScope();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [students, setStudents] = useState<StudentListItem[] | null>(null);
  const [searched, setSearched] = useState(false);
  // Inline roll-number editing: per-row save status + which rows changed since last save.
  const [rollStatus, setRollStatus] = useState<Record<string, "saving" | "saved" | "error">>({});
  const dirtyRollRef = useRef<Set<string>>(new Set());

  const updateRollLocal = (id: string, value: string) => {
    dirtyRollRef.current.add(id);
    setRollStatus(p => { const n = { ...p }; delete n[id]; return n; });
    setStudents(prev => prev ? prev.map(s => String(s.id) === id ? { ...s, rollNumber: value } : s) : prev);
  };

  // Auto-save a row's roll number on blur (only if it changed and is a valid number).
  const saveRoll = async (s: StudentListItem) => {
    if (s.id == null) return;
    const id = String(s.id);
    if (!dirtyRollRef.current.has(id)) return;
    dirtyRollRef.current.delete(id);
    const raw = (s.rollNumber ?? "").toString().trim();
    if (raw === "" || !/^\d+$/.test(raw)) {
      setRollStatus(p => ({ ...p, [id]: "error" }));
      return;
    }
    setRollStatus(p => ({ ...p, [id]: "saving" }));
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/student-lookup/students/${id}/roll`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ rollNumber: Number(raw) }),
      });
      if (!res.ok) throw new Error();
      setRollStatus(p => ({ ...p, [id]: "saved" }));
      setTimeout(() => setRollStatus(p => { const n = { ...p }; delete n[id]; return n; }), 1500);
    } catch {
      setRollStatus(p => ({ ...p, [id]: "error" }));
    }
  };

  const handleVerify = async () => {
    try {
      setLoading(true);
      setError(null);
      setSearched(true);

      const token = getToken();
      const params = new URLSearchParams();
      if (schoolId) params.set("schoolId", schoolId);
      if (grade) params.set("grade", grade);
      if (section) params.set("section", section);

      const res = await fetch(`${API_BASE}/api/student-lookup/list?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Failed: ${res.status}`);
      }

      const data = await res.json();
      setStudents(data.students ?? []);
    } catch (err) {
      setStudents(null);
      setError(err instanceof Error ? err.message : "Failed to load students");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6">
      <p className="text-xs text-gray-400 mb-4">
        Look up who's currently on record for a school, grade, and section.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <SmartSelect
          label="School"
          value={schoolId}
          options={registry.schools.map(s => ({ label: s.name, value: String(s.id) }))}
          placeholder="All schools"
          onChange={setSchoolId}
        />
        <SmartSelect
          label="Grade"
          value={grade}
          options={registry.grades.map(g => ({ label: g.name, value: g.name }))}
          placeholder="All grades"
          onChange={setGrade}
        />
        <SmartSelect
          label="Section"
          value={section}
          options={registry.sections.map(s => ({ label: s, value: s }))}
          placeholder="All sections"
          onChange={setSection}
        />
      </div>

      <button
        onClick={handleVerify}
        disabled={loading}
        className="h-9 px-4 bg-indigo-50 border border-indigo-200 hover:border-indigo-400 disabled:opacity-40 text-indigo-600 rounded-lg text-sm font-medium transition flex items-center gap-2"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
        {loading ? "Searching…" : "Search students"}
      </button>

      {error && (
        <div className="flex items-start gap-2 p-3 mt-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-xs text-red-600 font-medium">{error}</p>
        </div>
      )}

      {searched && !loading && !error && students && (
        students.length === 0 ? (
          <div className="mt-4 p-4 text-center bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500">No students found for this selection.</p>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-xs font-semibold text-gray-600 mb-2">
              {students.length} student{students.length !== 1 ? "s" : ""} found
            </p>
            <div className="border border-gray-200 rounded-lg overflow-hidden max-h-[70vh] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-semibold text-gray-600">Name</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Admission No</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Roll</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Grade</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Section</th>
                    {!schoolId && <th className="px-3 py-2 font-semibold text-gray-600">School</th>}
                  </tr>
                </thead>
                <tbody>
                  {students.map((s, i) => (
                    <tr key={s.id ?? i} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-gray-900 font-medium">{s.name}</td>
                      <td className="px-3 py-2 text-gray-500 font-mono">{s.admissionNo || "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={s.rollNumber ?? ""}
                            disabled={s.id == null}
                            onChange={e => updateRollLocal(String(s.id), e.target.value)}
                            onBlur={() => saveRoll(s)}
                            title={s.id == null ? "Cannot edit (no id)" : "Edit roll number — saves on blur"}
                            className={`w-16 h-7 px-2 text-xs rounded border text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-gray-50 disabled:text-gray-400 ${
                              s.id != null && rollStatus[String(s.id)] === "error" ? "border-red-300 bg-red-50" : "border-gray-200"
                            }`}
                          />
                          {s.id != null && rollStatus[String(s.id)] === "saving" && <Loader2 size={12} className="animate-spin text-gray-400" />}
                          {s.id != null && rollStatus[String(s.id)] === "saved" && <CheckCircle size={12} className="text-green-500" />}
                          {s.id != null && rollStatus[String(s.id)] === "error" && <AlertCircle size={12} className="text-red-500" />}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-500">{s.grade || "—"}</td>
                      <td className="px-3 py-2 text-gray-500">{s.section || "—"}</td>
                      {!schoolId && <td className="px-3 py-2 text-gray-500">{s.schoolName || "—"}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}

/* ── Total Marks Panel ───────────────────────────────────────
   Shows student_exam_marks for a School + Grade (+ optional
   Section), via GET /api/student-lookup/marks. The API returns one
   row per student × subject × exam; we group by student so each
   student is a single row, with their marks summarised per subject
   and an editable roll number. Editing the roll auto-saves and
   (via admission_no) cascades server-side to all the student's rows.
-------------------------------------------------------------- */
type MarksListItem = {
  id?: string | number;
  name: string;
  admissionNo?: string;
  rollNumber?: string | number;
  section?: string;
  subject?: string;
  exam?: string;
  marks?: number | null;
};

// Group rows into one bucket per student. Prefer admission number (the roster
// key the backend cascades on); fall back to name+section when it's missing.
function marksGroupKey(m: MarksListItem): string {
  const adm = (m.admissionNo ?? "").trim();
  return adm ? `adm:${adm}` : `nm:${m.name}::${m.section ?? ""}`;
}

type MarksGroup = {
  key: string;
  name: string;
  admissionNo?: string;
  section?: string;
  rollNumber?: string | number;
  ids: string[];                 // all student_exam_marks row ids for this student
  entries: { subject?: string; exam?: string; marks?: number | null }[];
  multiExam: boolean;
};

function TotalMarksPanel({ registry }: { registry: { schools: any[]; grades: any[]; sections: string[] } }) {
  const { schoolId, grade, section, setSchoolId, setGrade, setSection } = useOnboardScope();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [marks, setMarks] = useState<MarksListItem[] | null>(null);
  const [searched, setSearched] = useState(false);
  // Roll edit state is keyed by group key (one student), not by row id.
  const [rollStatus, setRollStatus] = useState<Record<string, "saving" | "saved" | "error">>({});
  const dirtyRollRef = useRef<Set<string>>(new Set());

  const canSearch = schoolId !== "" && grade !== "";

  // Collapse the flat rows into one group per student.
  const groups = useMemo<MarksGroup[] | null>(() => {
    if (!marks) return null;
    const map = new Map<string, MarksGroup>();
    for (const m of marks) {
      const key = marksGroupKey(m);
      let g = map.get(key);
      if (!g) {
        g = { key, name: m.name, admissionNo: m.admissionNo, section: m.section, rollNumber: m.rollNumber, ids: [], entries: [], multiExam: false };
        map.set(key, g);
      }
      if (m.id != null) g.ids.push(String(m.id));
      if ((g.rollNumber == null || g.rollNumber === "") && m.rollNumber != null) g.rollNumber = m.rollNumber;
      g.entries.push({ subject: m.subject, exam: m.exam, marks: m.marks });
    }
    for (const g of map.values()) {
      g.multiExam = new Set(g.entries.map(e => e.exam ?? "")).size > 1;
    }
    return Array.from(map.values());
  }, [marks]);

  // Editing a student's roll updates every one of their raw rows locally so the
  // grouped value (derived from `marks`) reflects it while typing.
  const updateRollLocal = (key: string, value: string) => {
    dirtyRollRef.current.add(key);
    setRollStatus(p => { const n = { ...p }; delete n[key]; return n; });
    setMarks(prev => prev ? prev.map(m => marksGroupKey(m) === key ? { ...m, rollNumber: value } : m) : prev);
  };

  // Auto-save a student's roll on blur. With an admission number the backend
  // cascades to all their rows, so one PUT suffices; without one, PUT each row.
  const saveRoll = async (g: MarksGroup) => {
    if (!dirtyRollRef.current.has(g.key)) return;
    dirtyRollRef.current.delete(g.key);
    if (g.ids.length === 0) return;
    const value = (g.rollNumber ?? "").toString().trim();
    if (value === "" || !/^\d+$/.test(value)) {
      setRollStatus(p => ({ ...p, [g.key]: "error" }));
      return;
    }
    setRollStatus(p => ({ ...p, [g.key]: "saving" }));
    try {
      const token = getToken();
      const targetIds = g.admissionNo ? g.ids.slice(0, 1) : g.ids;
      for (const id of targetIds) {
        const res = await fetch(`${API_BASE}/api/student-lookup/marks/${id}/roll`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify({ rollNumber: Number(value) }),
        });
        if (!res.ok) throw new Error();
      }
      setRollStatus(p => ({ ...p, [g.key]: "saved" }));
      setTimeout(() => setRollStatus(p => { const n = { ...p }; delete n[g.key]; return n; }), 1500);
    } catch {
      setRollStatus(p => ({ ...p, [g.key]: "error" }));
    }
  };

  const handleSearch = async () => {
    if (!canSearch) return;
    try {
      setLoading(true);
      setError(null);
      setSearched(true);
      const token = getToken();
      const params = new URLSearchParams();
      params.set("schoolId", schoolId);
      params.set("grade", grade);
      if (section) params.set("section", section);

      const res = await fetch(`${API_BASE}/api/student-lookup/marks?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Failed: ${res.status}`);
      }
      const data = await res.json();
      setMarks(data.marks ?? []);
    } catch (err) {
      setMarks(null);
      setError(err instanceof Error ? err.message : "Failed to load marks");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6">
      <p className="text-xs text-gray-400 mb-4">
        Exam marks on record (student_exam_marks), one row per student with marks by subject. Pick a School and Grade to view; the roll number is editable and auto-saves across all of a student's subject rows.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <SmartSelect
          label="School"
          required
          value={schoolId}
          options={registry.schools.map(s => ({ label: s.name, value: String(s.id) }))}
          placeholder="Select school"
          onChange={setSchoolId}
        />
        <SmartSelect
          label="Grade"
          required
          value={grade}
          options={registry.grades.map(g => ({ label: g.name, value: g.name }))}
          placeholder="Select grade"
          onChange={setGrade}
        />
        <SmartSelect
          label="Section"
          value={section}
          options={registry.sections.map(s => ({ label: s, value: s }))}
          placeholder="All sections"
          onChange={setSection}
        />
      </div>

      <button
        onClick={handleSearch}
        disabled={loading || !canSearch}
        title={!canSearch ? "Select a school and grade first" : undefined}
        className="h-9 px-4 bg-indigo-50 border border-indigo-200 hover:border-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed text-indigo-600 rounded-lg text-sm font-medium transition flex items-center gap-2"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
        {loading ? "Loading…" : "View marks"}
      </button>

      {error && (
        <div className="flex items-start gap-2 p-3 mt-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-xs text-red-600 font-medium">{error}</p>
        </div>
      )}

      {searched && !loading && !error && groups && (
        groups.length === 0 ? (
          <div className="mt-4 p-4 text-center bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500">No marks found for this selection.</p>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-xs font-semibold text-gray-600 mb-2">
              {groups.length} student{groups.length !== 1 ? "s" : ""}
            </p>
            <div className="border border-gray-200 rounded-lg overflow-hidden max-h-[70vh] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-semibold text-gray-600">Name</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Admission No</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Roll</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Section</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Marks (by subject)</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.key} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-gray-900 font-medium align-top">{g.name}</td>
                      <td className="px-3 py-2 text-gray-500 font-mono align-top">{g.admissionNo || "—"}</td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={g.rollNumber ?? ""}
                            disabled={g.ids.length === 0}
                            onChange={e => updateRollLocal(g.key, e.target.value)}
                            onBlur={() => saveRoll(g)}
                            title={g.ids.length === 0 ? "Cannot edit (no id)" : "Edit roll number — saves on blur, applies to all this student's rows"}
                            className={`w-16 h-7 px-2 text-xs rounded border text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-gray-50 disabled:text-gray-400 ${
                              rollStatus[g.key] === "error" ? "border-red-300 bg-red-50" : "border-gray-200"
                            }`}
                          />
                          {rollStatus[g.key] === "saving" && <Loader2 size={12} className="animate-spin text-gray-400" />}
                          {rollStatus[g.key] === "saved" && <CheckCircle size={12} className="text-green-500" />}
                          {rollStatus[g.key] === "error" && <AlertCircle size={12} className="text-red-500" />}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-500 align-top">{g.section || "—"}</td>
                      <td className="px-3 py-2 align-top">
                        <div className="flex flex-wrap gap-1">
                          {g.entries.map((e, j) => (
                            <span key={j} className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gray-100">
                              {g.multiExam && e.exam && <span className="text-gray-400">{e.exam}·</span>}
                              <span className="text-gray-500">{e.subject || "—"}</span>
                              <span className="font-semibold text-gray-900">{e.marks ?? "—"}</span>
                            </span>
                          ))}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}

/* ── Student Transition Panel ────────────────────────────────
   Shows student_transitions rows (one per student per academic-
   year move) for a School (+ optional Grade / Section), via
   GET /api/student-lookup/transitions. The roll number is
   editable and auto-saves that single transition row.
-------------------------------------------------------------- */
type TransitionListItem = {
  id?: string | number;
  name: string;
  admissionNo?: string;
  rollNumber?: string | number;
  section?: string;
  grade?: string;
  yearFrom?: number;
  yearTo?: number;
};

function StudentTransitionPanel({ registry }: { registry: { schools: any[]; grades: any[]; sections: string[] } }) {
  const { schoolId, grade, section, setSchoolId, setGrade, setSection } = useOnboardScope();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<TransitionListItem[] | null>(null);
  const [searched, setSearched] = useState(false);
  const [rollStatus, setRollStatus] = useState<Record<string, "saving" | "saved" | "error">>({});
  const dirtyRollRef = useRef<Set<string>>(new Set());

  const canSearch = schoolId !== "";

  const updateRollLocal = (id: string, value: string) => {
    dirtyRollRef.current.add(id);
    setRollStatus(p => { const n = { ...p }; delete n[id]; return n; });
    setRows(prev => prev ? prev.map(r => String(r.id) === id ? { ...r, rollNumber: value } : r) : prev);
  };

  // Auto-save a single transition row's roll on blur.
  const saveRoll = async (row: TransitionListItem) => {
    if (row.id == null) return;
    const id = String(row.id);
    if (!dirtyRollRef.current.has(id)) return;
    dirtyRollRef.current.delete(id);
    const value = (row.rollNumber ?? "").toString().trim();
    if (value === "" || !/^\d+$/.test(value)) {
      setRollStatus(p => ({ ...p, [id]: "error" }));
      return;
    }
    setRollStatus(p => ({ ...p, [id]: "saving" }));
    try {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/student-lookup/transitions/${id}/roll`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ rollNumber: Number(value) }),
      });
      if (!res.ok) throw new Error();
      setRollStatus(p => ({ ...p, [id]: "saved" }));
      setTimeout(() => setRollStatus(p => { const n = { ...p }; delete n[id]; return n; }), 1500);
    } catch {
      setRollStatus(p => ({ ...p, [id]: "error" }));
    }
  };

  const handleSearch = async () => {
    if (!canSearch) return;
    try {
      setLoading(true);
      setError(null);
      setSearched(true);
      const token = getToken();
      const params = new URLSearchParams();
      params.set("schoolId", schoolId);
      if (grade) params.set("grade", grade);
      if (section) params.set("section", section);

      const res = await fetch(`${API_BASE}/api/student-lookup/transitions?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Failed: ${res.status}`);
      }
      const data = await res.json();
      setRows(data.transitions ?? []);
    } catch (err) {
      setRows(null);
      setError(err instanceof Error ? err.message : "Failed to load transitions");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6">
      <p className="text-xs text-gray-400 mb-4">
        Year-over-year transitions on record (student_transitions). Pick a School to view; the roll number is editable and auto-saves that transition row.
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <SmartSelect
          label="School"
          required
          value={schoolId}
          options={registry.schools.map(s => ({ label: s.name, value: String(s.id) }))}
          placeholder="Select school"
          onChange={setSchoolId}
        />
        <SmartSelect
          label="Grade"
          value={grade}
          options={registry.grades.map(g => ({ label: g.name, value: g.name }))}
          placeholder="All grades"
          onChange={setGrade}
        />
        <SmartSelect
          label="Section"
          value={section}
          options={registry.sections.map(s => ({ label: s, value: s }))}
          placeholder="All sections"
          onChange={setSection}
        />
      </div>

      <button
        onClick={handleSearch}
        disabled={loading || !canSearch}
        title={!canSearch ? "Select a school first" : undefined}
        className="h-9 px-4 bg-indigo-50 border border-indigo-200 hover:border-indigo-400 disabled:opacity-40 disabled:cursor-not-allowed text-indigo-600 rounded-lg text-sm font-medium transition flex items-center gap-2"
      >
        {loading ? <Loader2 size={14} className="animate-spin" /> : <Search size={14} />}
        {loading ? "Loading…" : "View transitions"}
      </button>

      {error && (
        <div className="flex items-start gap-2 p-3 mt-4 bg-red-50 border border-red-200 rounded-lg">
          <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
          <p className="text-xs text-red-600 font-medium">{error}</p>
        </div>
      )}

      {searched && !loading && !error && rows && (
        rows.length === 0 ? (
          <div className="mt-4 p-4 text-center bg-gray-50 rounded-lg">
            <p className="text-xs text-gray-500">No transitions found for this selection.</p>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-xs font-semibold text-gray-600 mb-2">
              {rows.length} row{rows.length !== 1 ? "s" : ""}
            </p>
            <div className="border border-gray-200 rounded-lg overflow-hidden max-h-[70vh] overflow-y-auto">
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50">
                  <tr className="text-left">
                    <th className="px-3 py-2 font-semibold text-gray-600">Name</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Admission No</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Roll</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Grade</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Section</th>
                    <th className="px-3 py-2 font-semibold text-gray-600">Year</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.id ?? i} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-gray-900 font-medium">{r.name}</td>
                      <td className="px-3 py-2 text-gray-500 font-mono">{r.admissionNo || "—"}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <input
                            type="text"
                            inputMode="numeric"
                            value={r.rollNumber ?? ""}
                            disabled={r.id == null}
                            onChange={e => updateRollLocal(String(r.id), e.target.value)}
                            onBlur={() => saveRoll(r)}
                            title={r.id == null ? "Cannot edit (no id)" : "Edit roll number — saves on blur"}
                            className={`w-16 h-7 px-2 text-xs rounded border text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:bg-gray-50 disabled:text-gray-400 ${
                              r.id != null && rollStatus[String(r.id)] === "error" ? "border-red-300 bg-red-50" : "border-gray-200"
                            }`}
                          />
                          {r.id != null && rollStatus[String(r.id)] === "saving" && <Loader2 size={12} className="animate-spin text-gray-400" />}
                          {r.id != null && rollStatus[String(r.id)] === "saved" && <CheckCircle size={12} className="text-green-500" />}
                          {r.id != null && rollStatus[String(r.id)] === "error" && <AlertCircle size={12} className="text-red-500" />}
                        </div>
                      </td>
                      <td className="px-3 py-2 text-gray-500">{r.grade || "—"}</td>
                      <td className="px-3 py-2 text-gray-500">{r.section || "—"}</td>
                      <td className="px-3 py-2 text-gray-500">{r.yearFrom ?? "—"}{r.yearTo != null ? `–${r.yearTo}` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      )}
    </div>
  );
}

/* ── Main Page ────────────────────────────────────────────── */
type TabKey = "verify" | "onboard" | "marks" | "transition";

export default function StudentOnboardPage() {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  // null renders the chooser, so  has no default in urlKeys.
  const [{ tab: activeTab }, setOnboard] = useQueryStates(urlKeys.studentsOnboard, URL_OPTIONS);
  const setActiveTab = useCallback((t: TabKey) => setOnboard({ tab: t }), [setOnboard]);

  const [form, setForm] = useState({
    school_id: "",
    grade_id: "",
    yearFrom: String(new Date().getFullYear()),
    yearTo: String(new Date().getFullYear() + 1),
  });

  const [registry, setRegistry] = useState({
    schools: [] as any[],
    grades: [] as any[],
    sections: [] as string[],
  });

  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);

  const set = (key: string) => (val: string) =>
    setForm(prev => ({ ...prev, [key]: val }));

  // Load registry options
  useEffect(() => {
    const loadRegistry = async () => {
      try {
        const token = getToken();
        const res = await fetch(`${API_BASE}/api/registry/batch-form-options`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error("Failed to load registry");
        const data = await res.json();
        setRegistry({
          schools: data.schools ?? [],
          grades: data.grades ?? [],
          sections: data.sections ?? [],
        });
      } catch (err) {
        console.error(err);
        setError("Failed to load form options");
      }
    };
    loadRegistry();
  }, []);

  // Get grade name from grade_id
  const getGradeName = () => {
    const grade = registry.grades.find(g => String(g.id) === form.grade_id);
    return grade?.name ?? "";
  };

  const handleSubmit = async () => {
    if (!form.school_id || !form.grade_id ) {
      setError("School, Grade and Section are required");
      return;
    }
    if (!file) {
      setError("Please upload an Excel file");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);
      setResult(null);

      const token = getToken();
      const fd = new FormData();
      fd.append("file", file);

      const params = new URLSearchParams({
        schoolId: form.school_id,
        gradeId: form.grade_id,
        grade: getGradeName(),
        yearFrom: form.yearFrom,
        yearTo: form.yearTo,
      });

      const res = await fetch(
        `${API_BASE}/api/student-lookup/onboard/bulk?${params.toString()}`,
        {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        }
      );

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Failed: ${res.status}`);
      }

      const data = await res.json();
      setResult(data);

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload students");
    } finally {
      setSubmitting(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
  };

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className={`mx-auto space-y-6 transition-all ${activeTab === "verify" || activeTab === "marks" || activeTab === "transition" ? "max-w-5xl" : "max-w-2xl"}`}>

        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/students")}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium transition"
          >
            <ArrowLeft size={15} /> Back
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <h1 className="text-lg font-bold text-gray-900">Students</h1>
        </div>

        {/* Tabs — only shown once a view has been picked, so you can switch later */}
        {activeTab !== null && (
          <div className="flex gap-2 border-b border-gray-200">
            <button
              onClick={() => setActiveTab("verify")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition ${
                activeTab === "verify"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <Search size={14} /> Verify
            </button>
            <button
              onClick={() => setActiveTab("onboard")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition ${
                activeTab === "onboard"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <UserCheck size={14} /> Onboard
            </button>
            <button
              onClick={() => setActiveTab("marks")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition ${
                activeTab === "marks"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <ClipboardList size={14} /> Total Marks
            </button>
            <button
              onClick={() => setActiveTab("transition")}
              className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold border-b-2 -mb-px transition ${
                activeTab === "transition"
                  ? "border-indigo-600 text-indigo-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              <ArrowRightLeft size={14} /> Student Transition
            </button>
          </div>
        )}

        {/* Chooser — shown until a tab is picked */}
        {activeTab === null && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <button
              onClick={() => setActiveTab("verify")}
              className="text-left bg-white border border-gray-200 hover:border-indigo-400 rounded-2xl p-6 transition group"
            >
              <Search size={20} className="text-indigo-500 mb-3" />
              <p className="text-sm font-bold text-gray-900 group-hover:text-indigo-600 transition">Verify Students</p>
              <p className="text-xs text-gray-400 mt-1">
                Look up who's currently on record for a school, grade, and section.
              </p>
            </button>
            <button
              onClick={() => setActiveTab("onboard")}
              className="text-left bg-white border border-gray-200 hover:border-indigo-400 rounded-2xl p-6 transition group"
            >
              <UserCheck size={20} className="text-indigo-500 mb-3" />
              <p className="text-sm font-bold text-gray-900 group-hover:text-indigo-600 transition">Onboard Students</p>
              <p className="text-xs text-gray-400 mt-1">
                Upload an Excel sheet to register or update students for a class.
              </p>
            </button>
            <button
              onClick={() => setActiveTab("marks")}
              className="text-left bg-white border border-gray-200 hover:border-indigo-400 rounded-2xl p-6 transition group"
            >
              <ClipboardList size={20} className="text-indigo-500 mb-3" />
              <p className="text-sm font-bold text-gray-900 group-hover:text-indigo-600 transition">Total Marks</p>
              <p className="text-xs text-gray-400 mt-1">
                View exam marks on record and fix roll numbers for a school, grade, and section.
              </p>
            </button>
            <button
              onClick={() => setActiveTab("transition")}
              className="text-left bg-white border border-gray-200 hover:border-indigo-400 rounded-2xl p-6 transition group"
            >
              <ArrowRightLeft size={20} className="text-indigo-500 mb-3" />
              <p className="text-sm font-bold text-gray-900 group-hover:text-indigo-600 transition">Student Transition</p>
              <p className="text-xs text-gray-400 mt-1">
                View year-over-year transitions on record and fix roll numbers for a school.
              </p>
            </button>
          </div>
        )}

        {/* Verify Students — independent lookup */}
        {activeTab === "verify" && (
          <VerifyStudentsPanel registry={registry} />
        )}

        {/* Total Marks — view student_exam_marks + fix roll numbers */}
        {activeTab === "marks" && (
          <TotalMarksPanel registry={registry} />
        )}

        {/* Student Transition — view student_transitions + fix roll numbers */}
        {activeTab === "transition" && (
          <StudentTransitionPanel registry={registry} />
        )}

        {/* Form */}
        {activeTab === "onboard" && !result && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">

            {/* School */}
            <SmartSelect
              label="School"
              required
              value={form.school_id}
              options={registry.schools.map(s => ({ label: s.name, value: String(s.id) }))}
              placeholder="Select school"
              onChange={set("school_id")}
            />

            {/* Grade + Section */}
            <div className="grid grid-cols-1 gap-4">
              <SmartSelect
                label="Grade"
                required
                value={form.grade_id}
                options={registry.grades.map(g => ({ label: g.name, value: String(g.id) }))}
                placeholder="Select grade"
                onChange={set("grade_id")}
              />
              
            </div>

            {/* Academic Year */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Year From</label>
                <input
                  type="number"
                  value={form.yearFrom}
                  onChange={(e) => setForm(prev => ({ ...prev, yearFrom: e.target.value }))}
                  className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1.5">Year To</label>
                <input
                  type="number"
                  value={form.yearTo}
                  onChange={(e) => setForm(prev => ({ ...prev, yearTo: e.target.value }))}
                  className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition"
                />
              </div>
            </div>

            {/* Excel Upload */}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Student List (Excel) <span className="text-red-400">*</span>
              </label>
              <p className="text-xs text-gray-400 mb-2">
                Excel file with columns: <span className="font-medium text-gray-500">Name, AdmissionNo, Section, RollNumber</span>
              </p>

              {file ? (
                <div className="flex items-center gap-3 h-10 px-3 bg-green-50 border border-green-200 rounded-lg">
                  <CheckCircle size={14} className="text-green-500" />
                  <span className="text-xs font-medium text-green-700 flex-1 truncate">{file.name}</span>
                  <span className="text-xs text-green-500">{(file.size / 1024).toFixed(0)} KB</span>
                  <button
                    onClick={() => setFile(null)}
                    className="text-green-400 hover:text-red-400 transition"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileRef.current?.click()}
                  className="w-full h-24 px-3 bg-white border-2 border-dashed border-gray-300 hover:border-indigo-400 text-gray-500 hover:text-indigo-600 rounded-lg text-sm font-medium transition flex flex-col items-center justify-center gap-2"
                >
                  <Upload size={20} />
                  <span>Click to select Excel file (.xlsx)</span>
                </button>
              )}

              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0];
                  if (f) setFile(f);
                  if (fileRef.current) fileRef.current.value = "";
                }}
              />
            </div>

            {/* Download Template */}
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Download size={12} />
              <span>
                Need a template?{" "}
                <button
                  onClick={() => {
                    // Create a simple CSV template for download
                    const csv = "Name,AdmissionNo,Section,RollNumber\nRahul Kumar,ADM2025001,A,1\nPriya Singh,ADM2025002,A,2\n";
                    const blob = new Blob([csv], { type: "text/csv" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url;
                    a.download = "student_template.csv";
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="text-indigo-500 hover:text-indigo-700 font-medium underline"
                >
                  Download sample template
                </button>
              </span>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
                <p className="text-xs text-red-600 font-medium">{error}</p>
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2"
            >
              {submitting
                ? <><Loader2 size={15} className="animate-spin" /> Uploading…</>
                : <><Upload size={15} /> Upload Students</>
              }
            </button>
          </div>
        )}

        {/* Results */}
        {activeTab === "onboard" && result && (
          <div className="space-y-4">

            {/* Summary Card */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6">
              <h2 className="text-base font-bold text-gray-900 mb-4">Upload Results</h2>

              <div className="grid grid-cols-3 gap-4 mb-4">
                <div className="text-center p-3 bg-gray-50 rounded-xl">
                  <div className="text-2xl font-bold text-gray-900">{result.total}</div>
                  <div className="text-xs text-gray-500 mt-1">Total</div>
                </div>
                <div className="text-center p-3 bg-green-50 rounded-xl">
                  <div className="text-2xl font-bold text-green-600">{result.successCount}</div>
                  <div className="text-xs text-green-600 mt-1">Success</div>
                </div>
                <div className="text-center p-3 bg-red-50 rounded-xl">
                  <div className="text-2xl font-bold text-red-600">{result.failedCount}</div>
                  <div className="text-xs text-red-600 mt-1">Failed</div>
                </div>
              </div>

              {/* Success List */}
              {result.success?.length > 0 && (
                <div className="mb-4">
                  <h3 className="text-xs font-semibold text-gray-600 mb-2">
                    Registered Students ({result.successCount})
                  </h3>
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 text-left">
                          <th className="px-3 py-2 font-semibold text-gray-600">Name</th>
                          <th className="px-3 py-2 font-semibold text-gray-600">Admission No</th>
                          <th className="px-3 py-2 font-semibold text-gray-600">Section</th>
                          <th className="px-3 py-2 font-semibold text-gray-600">Roll</th>
                          <th className="px-3 py-2 font-semibold text-gray-600">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.success.map((s: any, i: number) => (
                          <tr key={i} className="border-t border-gray-100">
                            <td className="px-3 py-2 text-gray-900">{s.name}</td>
                            <td className="px-3 py-2 text-gray-500 font-mono">{s.admissionNo}</td>
                            <td className="px-3 py-2 text-gray-500">{s.section}</td>
                            <td className="px-3 py-2 text-gray-500">{s.rollNumber}</td>
                            <td className="px-3 py-2">
                              <span className="inline-flex items-center gap-1 text-green-600">
                                <CheckCircle size={12} />
                                {s.message?.includes("updated") ? "Updated" : "Registered"}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Error List */}
              {result.errors?.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-red-600 mb-2">
                    Failed ({result.failedCount})
                  </h3>
                  <div className="border border-red-200 rounded-lg overflow-hidden">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-red-50 text-left">
                          <th className="px-3 py-2 font-semibold text-red-600">Row</th>
                          <th className="px-3 py-2 font-semibold text-red-600">Name</th>
                          <th className="px-3 py-2 font-semibold text-red-600">Admission No</th>
                          <th className="px-3 py-2 font-semibold text-red-600">Reason</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.errors.map((e: any, i: number) => (
                          <tr key={i} className="border-t border-red-100">
                            <td className="px-3 py-2 text-gray-500">{e.row}</td>
                            <td className="px-3 py-2 text-gray-900">{e.name}</td>
                            <td className="px-3 py-2 text-gray-500 font-mono">{e.admissionNo}</td>
                            <td className="px-3 py-2 text-red-600">{e.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleReset}
                className="flex-1 h-10 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2"
              >
                <Upload size={15} /> Upload More Students
              </button>
              <button
                onClick={() => router.push("/")}
                className="h-10 px-6 bg-white border border-gray-200 hover:border-gray-300 text-gray-700 text-sm font-semibold rounded-xl transition"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}