"use client";

import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from "react";
import { Check, X, Users, Loader2, Search, Upload, ExternalLink, ScanLine, MessageSquare, Globe, ArrowLeft, Download } from "lucide-react";
import Link from "next/link";
import { apiClient } from "@/app/lib/apiClient";
import { usePersistentState } from "@/app/lib/usePersistentState";

const QrScanner = lazy(() => import("@/app/components/QrScanner"));
const preloadQr = () => import("@/app/components/QrScanner").then((m) => m.preloadQrScanner?.());

const AGGREGATED_BASE =
  process.env.NEXT_PUBLIC_AGGREGATED_DATA_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  "http://localhost:8082";
const BEAVER_BASE =
  process.env.NEXT_PUBLIC_BEAVER_API_URL ?? "http://localhost:4000";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const cookie = document.cookie
    .split(";")
    .map((r) => r.trim())
    .find((r) => r.startsWith("token="))
    ?.slice("token=".length);
  if (cookie) return decodeURIComponent(cookie);
  return (
    localStorage.getItem("keycloak_token") ??
    sessionStorage.getItem("keycloak_token")
  );
}

function titleCase(s: string): string {
  return s.toLowerCase().replace(/(?:^|[\s\-'])\S/g, c => c.toUpperCase());
}

type AttendanceVal = "present" | "absent" | null;

type RegistrySchool = { id: number; name: string };
type RegistryGrade = { id: number; name: string };
type RegistrySubject = { id: number; name: string; subjectCode?: string };
type ExamItem = {
  id: number;
  name: string;
  schoolId: number;
  gradeId: number;
  subjectId: number;
  examTypeId: number;
  examDate: string | null;
};

type StudentItem = {
  id: number;
  name: string;
  admissionNo?: string;
  rollNumber?: string | number;
  grade?: string;
  section?: string;
  schoolName?: string;
  schoolId?: number;
};

type AttendanceMap = Record<
  number,
  { attendance: string; marked_by: string | null; remarks: string | null }
>;

type BatchCheckMap = Record<
  string,
  { batch_id: string; batch_name: string }
>;

export default function AttendancePage() {
  const [schools, setSchools] = useState<RegistrySchool[]>([]);
  const [grades, setGrades] = useState<RegistryGrade[]>([]);
  const [sections, setSections] = useState<string[]>([]);
  const [sectionsLoading, setSectionsLoading] = useState(false);
  const [subjects, setSubjects] = useState<RegistrySubject[]>([]);
  const [registryLoading, setRegistryLoading] = useState(true);

  const [schoolId, setSchoolId] = usePersistentState("att:schoolId", "");
  const [grade, setGrade] = usePersistentState("att:grade", "");
  const [section, setSection] = usePersistentState("att:section", "");
  const [subject, setSubject] = usePersistentState("att:subject", "");

  const [allExams, setAllExams] = useState<ExamItem[]>([]);
  const [examsLoading, setExamsLoading] = useState(false);
  const [examId, setExamId] = usePersistentState("att:examId", "");

  const [students, setStudents] = useState<StudentItem[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);

  const [attendanceMap, setAttendanceMap] = useState<AttendanceMap>({});
  const [saving, setSaving] = useState<Record<number, boolean>>({});

  const [batchCheck, setBatchCheck] = useState<BatchCheckMap>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [showScanner, setShowScanner] = useState(false);
  const [globalQuery, setGlobalQuery] = useState("");
  const [globalResults, setGlobalResults] = useState<{ id: number; name: string; admissionNo: string; grade: string; section: string; rollNumber: number | null; subjects: string[] }[]>([]);
  const [globalLoading, setGlobalLoading] = useState(false);
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [prevFilters, setPrevFilters] = useState<{ grade: string; section: string; subject: string; examId: string; label: string } | null>(null);
  const globalDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const errorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [manualConfirm, setManualConfirm] = useState<{ studentId: number; studentName: string; value: "present" | "absent" } | null>(null);
  const [manualReason, setManualReason] = useState("");
  const [absentOther, setAbsentOther] = useState(false);
  const [clearConfirm, setClearConfirm] = useState<{ studentId: number; studentName: string } | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportMenu, setExportMenu] = useState(false);
  const exportRef = useRef<HTMLDivElement>(null);
  const savingRef = useRef(saving);
  savingRef.current = saving;

  useEffect(() => {
    if (!exportMenu) return;
    const close = (e: MouseEvent) => {
      if (exportRef.current && !exportRef.current.contains(e.target as Node)) setExportMenu(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [exportMenu]);

  const [scanFeedback, setScanFeedback] = useState<{ name: string; message?: string; status: "success" | "not-found" | "already" | "wrong-section" | "invalid-qr" } | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = getToken();
        const res = await fetch(
          `${AGGREGATED_BASE}/api/registry/batch-form-options`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );
        if (!res.ok) throw new Error("Failed to load registry");
        const data = await res.json();
        setSchools(data.schools ?? []);
        setGrades(data.grades ?? []);
        setSubjects(data.subjects ?? []);
      } catch (err) {
        console.error("registry load failed", err);
      } finally {
        setRegistryLoading(false);
      }
    })();
  }, []);

  // Load sections filtered by subject
  useEffect(() => {
    if (!schoolId || !grade) {
      setSections([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setSectionsLoading(true);
        const token = getToken();
        const params = new URLSearchParams({ schoolId, grade });
        const selectedSubject = subjects.find((s) => s.name === subject);
        if (selectedSubject) params.set("subjectId", String(selectedSubject.id));
        const res = await fetch(
          `${AGGREGATED_BASE}/api/student-lookup/sections?${params.toString()}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );
        if (!res.ok) throw new Error("Failed to load sections");
        const data = await res.json();
        if (!cancelled) setSections(data.sections ?? []);
      } catch (err) {
        console.error("sections load failed", err);
        if (!cancelled) setSections([]);
      } finally {
        if (!cancelled) setSectionsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [schoolId, grade, subject, subjects]);

  // Clear section if it's no longer in the filtered list
  useEffect(() => {
    if (section && sections.length > 0 && !sections.includes(section)) {
      setSection("");
    }
  }, [sections]);

  // Load exams when school is selected
  useEffect(() => {
    if (!schoolId) {
      setAllExams([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setExamsLoading(true);
        const token = getToken();
        const res = await fetch(
          `${AGGREGATED_BASE}/api/data-quality/exams?schoolId=${schoolId}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );
        if (!res.ok) throw new Error("Failed to load exams");
        const data = await res.json();
        if (!cancelled) setAllExams(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("exams load failed", err);
        if (!cancelled) setAllExams([]);
      } finally {
        if (!cancelled) setExamsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [schoolId]);

  // Subjects that actually have exams for the selected school + grade
  const filteredSubjects = useMemo(() => {
    const selectedGrade = grades.find((g) => g.name === grade);
    if (!selectedGrade || allExams.length === 0) return subjects;
    const validSubjectIds = new Set(
      allExams.filter((e) => e.gradeId === selectedGrade.id).map((e) => e.subjectId),
    );
    return subjects.filter((s) => validSubjectIds.has(s.id));
  }, [allExams, grade, grades, subjects]);

  // Filter exams by selected grade + subject
  const filteredExams = useMemo(() => {
    const selectedGrade = grades.find((g) => g.name === grade);
    const selectedSubject = subjects.find((s) => s.name === subject);
    return allExams.filter((e) => {
      if (selectedGrade && e.gradeId !== selectedGrade.id) return false;
      if (selectedSubject && e.subjectId !== selectedSubject.id) return false;
      return true;
    });
  }, [allExams, grade, grades, subject, subjects]);

  const filtersReady = !!(schoolId && grade && section && examId);

  const selectedExam = allExams.find((e) => String(e.id) === examId);

  useEffect(() => {
    if (!filtersReady) {
      setStudents([]);
      setAttendanceMap({});
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoadingStudents(true);
        const token = getToken();

        const params = new URLSearchParams();
        params.set("schoolId", schoolId);
        params.set("grade", grade);
        params.set("section", section);
        const selectedSubject = subjects.find((s) => s.name === subject);
        if (selectedSubject) params.set("subjectId", String(selectedSubject.id));

        const studentsRes = await fetch(
          `${AGGREGATED_BASE}/api/student-lookup/list?${params.toString()}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );
        if (!studentsRes.ok) throw new Error("Failed to load students");
        const studentsData = await studentsRes.json();

        if (cancelled) return;
        setStudents(studentsData.students ?? []);

        const attParams: Record<string, string> = {
          school_id: schoolId,
          grade,
          section,
          exam_id: examId,
        };
        if (subject) attParams.subject = subject;
        const attRes = await apiClient.get<{ attendance: AttendanceMap }>(
          `${BEAVER_BASE}/api/attendance`,
          { params: attParams },
        );
        if (!cancelled) setAttendanceMap(attRes.attendance ?? {});

        const batchParams: Record<string, string> = {
          school_id: schoolId,
          grade,
          section,
        };
        if (subject) batchParams.subject = subject;
        if (selectedExam) batchParams.exam_type = selectedExam.name;
        const batchRes = await apiClient.get<{ uploaded: BatchCheckMap }>(
          `${BEAVER_BASE}/api/attendance/batch-check`,
          { params: batchParams },
        );
        if (!cancelled) setBatchCheck(batchRes.uploaded ?? {});
      } catch (err) {
        console.error("load failed", err);
        if (!cancelled) {
          setStudents([]);
          setAttendanceMap({});
          setBatchCheck({});
        }
      } finally {
        if (!cancelled) setLoadingStudents(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [filtersReady, schoolId, grade, section, subject, examId, subjects]);

  const handleSchool = (v: string) => {
    setSchoolId(v);
    setGrade("");
    setSection("");
    setSubject("");
    setExamId("");
    setPrevFilters(null);
  };
  const handleGrade = (v: string) => {
    setGrade(v);
    setSubject("");
    setSection("");
    setExamId("");
    setPrevFilters(null);
  };
  const handleSubject = (v: string) => {
    setSubject(v);
    setSection("");
    setExamId("");
    setPrevFilters(null);
  };
  const handleSection = (v: string) => {
    setSection(v);
    setExamId("");
    setPrevFilters(null);
  };
  const handleExam = (v: string) => {
    setExamId(v);
    if (v) {
      const exam = allExams.find((e) => String(e.id) === v);
      if (exam) {
        const subj = subjects.find((s) => s.id === exam.subjectId);
        if (subj && subj.name !== subject) setSubject(subj.name);
      }
    }
  };

  const showError = useCallback((msg: string) => {
    if (errorTimerRef.current) clearTimeout(errorTimerRef.current);
    setErrorToast(msg);
    errorTimerRef.current = setTimeout(() => setErrorToast(null), 4000);
  }, []);

  const toggleAttendance = useCallback(
    async (studentId: number, value: AttendanceVal, remarks?: string | null) => {
      setSaving((p) => ({ ...p, [studentId]: true }));
      try {
        await apiClient.patch(`${BEAVER_BASE}/api/attendance`, {
          loam_student_id: studentId,
          school_id: Number(schoolId),
          grade,
          section,
          ...(subject && { subject }),
          exam_id: Number(examId),
          exam_name: selectedExam?.name ?? null,
          attendance: value,
          ...(remarks !== undefined && { remarks }),
        });

        setAttendanceMap((prev) => {
          const next = { ...prev };
          if (value === null) {
            delete next[studentId];
          } else {
            next[studentId] = {
              attendance: value,
              marked_by: null,
              remarks: remarks !== undefined ? (remarks ?? null) : (prev[studentId]?.remarks ?? null),
            };
          }
          return next;
        });
      } catch (e) {
        console.error("attendance save failed", e);
        showError("Failed to save attendance. Please try again.");
      } finally {
        setSaving((p) => ({ ...p, [studentId]: false }));
      }
    },
    [schoolId, grade, section, subject, examId, selectedExam, showError],
  );

  const requestManualToggle = useCallback(
    (studentId: number, studentName: string, value: AttendanceVal) => {
      if (value === null) {
        setClearConfirm({ studentId, studentName });
        return;
      }
      setManualConfirm({ studentId, studentName, value });
      setManualReason("");
      setAbsentOther(false);
    },
    [],
  );

  const confirmManualToggle = useCallback(() => {
    if (!manualConfirm) return;
    const reason = manualReason.trim() || null;
    toggleAttendance(manualConfirm.studentId, manualConfirm.value, reason);
    setManualConfirm(null);
    setManualReason("");
    setAbsentOther(false);
  }, [manualConfirm, manualReason, toggleAttendance]);

  const saveRemarks = useCallback(
    async (studentId: number, remarks: string | null) => {
      const current = attendanceMap[studentId];
      if (!current) return;
      setSaving((p) => ({ ...p, [studentId]: true }));
      try {
        await apiClient.patch(`${BEAVER_BASE}/api/attendance`, {
          loam_student_id: studentId,
          school_id: Number(schoolId),
          grade,
          section,
          ...(subject && { subject }),
          exam_id: Number(examId),
          exam_name: selectedExam?.name ?? null,
          attendance: current.attendance,
          remarks,
        });
        setAttendanceMap((prev) => ({
          ...prev,
          [studentId]: { ...prev[studentId], remarks },
        }));
      } catch (e) {
        console.error("remarks save failed", e);
        showError("Failed to save remarks. Please try again.");
      } finally {
        setSaving((p) => ({ ...p, [studentId]: false }));
      }
    },
    [attendanceMap, schoolId, grade, section, subject, examId, selectedExam, showError],
  );

  const showToast = useCallback((fb: typeof scanFeedback, duration = 3000) => {
    if (feedbackTimerRef.current) clearTimeout(feedbackTimerRef.current);
    setScanFeedback(fb);
    feedbackTimerRef.current = setTimeout(() => setScanFeedback(null), duration);
  }, []);

  const handleQrScan = useCallback(
    (value: string) => {
      const raw = value.trim();

      if (!raw.startsWith("LOAM1|")) {
        showToast({ name: "Invalid QR", message: "This is not a valid student QR code", status: "invalid-qr" }, 4000);
        return;
      }

      let admNo: string | null = null;
      let roll: string | null = null;
      let qrName: string | null = null;
      let qrGrade: string | null = null;
      let qrSection: string | null = null;
      {
        const parts = raw.split("|");
        // LOAM1|school|exam_type|year|subject_code|subject|set_name|grade|section|roll|admission_no|name
        // Some QRs merge grade+section (e.g. "11V") or omit set_name — extract from end
        qrName = parts[parts.length - 1] || null;
        admNo = parts[parts.length - 2] || null;
        roll = parts[parts.length - 3] || null;
        const gradeSection = parts[parts.length - 4] || "";
        const gsMatch = gradeSection.match(/^(\d+)([A-Za-z]+)$/);
        if (gsMatch) {
          qrGrade = gsMatch[1];
          qrSection = gsMatch[2].toUpperCase();
        }
      }

      const selectedCombo = [grade && `Grade ${grade}`, section && `Section ${section}`, subject].filter(Boolean).join(" · ");

      if (qrGrade && qrSection && grade && section) {
        if (qrGrade !== grade || qrSection !== section.toUpperCase()) {
          showToast({ name: qrName ?? "Student", message: `${qrName ?? "Student"} is not in ${selectedCombo}`, status: "wrong-section" }, 4000);
          return;
        }
      }

      const val = admNo ?? raw;
      const match = students.find((s) => {
        if (admNo && s.admissionNo && s.admissionNo.replace(/^0+/, "").toLowerCase() === admNo.replace(/^0+/, "").toLowerCase()) return true;
        if (roll && String(s.rollNumber) === String(Number(roll))) return true;
        return false;
      });
      if (!match) {
        const notFoundName = qrName ?? val;
        showToast({ name: notFoundName, message: `${notFoundName} is not in ${selectedCombo}`, status: "not-found" });
        return;
      }
      if (attendanceMap[match.id]?.attendance === "present") {
        showToast({ name: match.name, status: "already" });
        return;
      }
      toggleAttendance(match.id, "present");
      showToast({ name: match.name, status: "success" });
    },
    [students, attendanceMap, toggleAttendance, grade, section, subject],
  );


  useEffect(() => {
    if (!globalQuery.trim() || globalQuery.trim().length < 2 || !schoolId) {
      setGlobalResults([]);
      return;
    }
    if (globalDebounceRef.current) clearTimeout(globalDebounceRef.current);
    globalDebounceRef.current = setTimeout(async () => {
      setGlobalLoading(true);
      try {
        const token = getToken();
        const params = new URLSearchParams({ schoolId, query: globalQuery.trim() });
        const res = await fetch(
          `${AGGREGATED_BASE}/api/student-lookup/search?${params}`,
          { headers: token ? { Authorization: `Bearer ${token}` } : {} },
        );
        if (res.ok) {
          const data = await res.json();
          setGlobalResults(data.results ?? []);
        } else {
          setGlobalResults([]);
        }
      } catch {
        setGlobalResults([]);
        showError("Search failed. Please try again.");
      } finally {
        setGlobalLoading(false);
      }
    }, 300);
    return () => { if (globalDebounceRef.current) clearTimeout(globalDebounceRef.current); };
  }, [globalQuery, schoolId]);

  const refreshAttendance = useCallback(async () => {
    if (!filtersReady) return;
    if (Object.values(savingRef.current).some(Boolean)) return;
    try {
      const attParams: Record<string, string> = {
        school_id: schoolId, grade, section, exam_id: examId,
      };
      if (subject) attParams.subject = subject;
      const attRes = await apiClient.get<{ attendance: AttendanceMap }>(
        `${BEAVER_BASE}/api/attendance`,
        { params: attParams },
      );
      setAttendanceMap(attRes.attendance ?? {});
    } catch {}
  }, [filtersReady, schoolId, grade, section, subject, examId]);

  // Auto-refresh: poll every 5s only while tab is visible, fetch immediately on tab focus
  useEffect(() => {
    if (!filtersReady) return;
    let interval: ReturnType<typeof setInterval> | null = null;

    const startPolling = () => {
      if (interval) return;
      interval = setInterval(refreshAttendance, 5000);
    };
    const stopPolling = () => {
      if (interval) { clearInterval(interval); interval = null; }
    };
    const onVisibility = () => {
      if (document.hidden) { stopPolling(); }
      else { refreshAttendance(); startPolling(); }
    };

    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) startPolling();

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [filtersReady, refreshAttendance]);

  const presentCount = students.filter(
    (s) => attendanceMap[s.id]?.attendance === "present",
  ).length;
  const absentCount = students.filter(
    (s) => attendanceMap[s.id]?.attendance === "absent",
  ).length;
  const unmarkedCount = students.length - presentCount - absentCount;

  const hasBatchData = Object.keys(batchCheck).length > 0;
  const uploadedCount = hasBatchData
    ? students.filter((s) => s.admissionNo && batchCheck[s.admissionNo]).length
    : 0;

  const getBatchInfo = (s: StudentItem) => {
    if (!hasBatchData) return null;
    if (s.admissionNo && batchCheck[s.admissionNo]) {
      return { status: "uploaded" as const, batchId: batchCheck[s.admissionNo].batch_id };
    }
    return { status: "not-uploaded" as const, batchId: null };
  };

  const sorted = useMemo(() => {
    let list = [...students];
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      list = list.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          String(s.rollNumber ?? "").includes(q) ||
          (s.admissionNo ?? "").toLowerCase().includes(q),
      );
    }
    return list.sort((a, b) => {
      const ra = parseInt(String(a.rollNumber)) || 0;
      const rb = parseInt(String(b.rollNumber)) || 0;
      return ra - rb || a.name.localeCompare(b.name);
    });
  }, [students, searchQuery]);

  const csvEscape = (val: string) => {
    if (val.includes(",") || val.includes('"') || val.includes("\n")) return `"${val.replace(/"/g, '""')}"`;
    return val;
  };

  const downloadCsv = (filename: string, content: string) => {
    const blob = new Blob(["﻿" + content], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportSectionCsv = (absentOnly = false) => {
    const source = absentOnly
      ? sorted.filter((s) => attendanceMap[s.id]?.attendance === "absent")
      : sorted;
    const header = "Grade,Section,Roll,Name,Admission No,Attendance,Remarks";
    const rows = source.map((s) => {
      const att = attendanceMap[s.id]?.attendance ?? "unmarked";
      const rem = attendanceMap[s.id]?.remarks ?? "";
      return [grade, section, s.rollNumber ?? "", csvEscape(titleCase(s.name)), s.admissionNo ?? "", att, csvEscape(rem)].join(",");
    });
    const examLabel = (selectedExam?.name ?? examId).replace(/[^a-zA-Z0-9_-]/g, "_");
    const tag = absentOnly ? "_absent" : "";
    downloadCsv(`attendance_${grade}_${section}${tag}_${examLabel}.csv`, [header, ...rows].join("\n"));
  };

  const exportExamCsv = async (absentOnly = false) => {
    setExporting(true);
    try {
      const token = getToken();
      const allRows: string[] = [];
      const selectedSubject = subjects.find((s) => s.name === subject);

      for (const sec of sections) {
        const params = new URLSearchParams({ schoolId, grade, section: sec });
        if (selectedSubject) params.set("subjectId", String(selectedSubject.id));
        const studRes = await fetch(`${AGGREGATED_BASE}/api/student-lookup/list?${params}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!studRes.ok) continue;
        const studData = await studRes.json();
        const sectionStudents: StudentItem[] = (studData.students ?? []).sort((a: StudentItem, b: StudentItem) => {
          const ra = parseInt(String(a.rollNumber)) || 0;
          const rb = parseInt(String(b.rollNumber)) || 0;
          return ra - rb || a.name.localeCompare(b.name);
        });

        const attParams: Record<string, string> = { school_id: schoolId, grade, section: sec, exam_id: examId };
        if (subject) attParams.subject = subject;
        const attRes = await apiClient.get<{ attendance: AttendanceMap }>(`${BEAVER_BASE}/api/attendance`, { params: attParams });
        const att = attRes.attendance ?? {};

        for (const s of sectionStudents) {
          const a = att[s.id]?.attendance ?? "unmarked";
          if (absentOnly && a !== "absent") continue;
          const r = att[s.id]?.remarks ?? "";
          allRows.push([grade, sec, s.rollNumber ?? "", csvEscape(titleCase(s.name)), s.admissionNo ?? "", a, csvEscape(r)].join(","));
        }
      }

      const header = "Grade,Section,Roll,Name,Admission No,Attendance,Remarks";
      const examLabel = (selectedExam?.name ?? examId).replace(/[^a-zA-Z0-9_-]/g, "_");
      const tag = absentOnly ? "_absent" : "";
      downloadCsv(`attendance_${grade}_all_sections${tag}_${examLabel}.csv`, [header, ...allRows].join("\n"));
    } catch {
      showError("Failed to export. Please try again.");
    } finally {
      setExporting(false);
    }
  };

  const schoolName = schools.find((s) => String(s.id) === schoolId)?.name;

  return (
    <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
      {/* Page header */}
      <div className="pt-6 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div>
          <h1 className="text-lg sm:text-xl font-bold text-gray-900">
            Attendance
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-0.5">
            Mark students present or absent during scanning
          </p>
        </div>
        {filtersReady && !loadingStudents && students.length > 0 && (
          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => setShowScanner(true)}
              onPointerEnter={preloadQr}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition shadow-sm"
            >
              <ScanLine size={14} /> Scan QR
            </button>
            <div className="relative" ref={exportRef}>
              <button
                onClick={() => setExportMenu(!exportMenu)}
                disabled={exporting}
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:bg-gray-50 transition shadow-sm disabled:opacity-50"
              >
                {exporting ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />} Export
              </button>
              {exportMenu && (
                <div className="absolute left-0 sm:left-auto sm:right-0 mt-1 w-52 bg-white border border-gray-200 rounded-lg shadow-lg z-10 py-1">
                  <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">This Section</p>
                  <button
                    onClick={() => { exportSectionCsv(); setExportMenu(false); }}
                    className="w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                  >
                    All students
                  </button>
                  <button
                    onClick={() => { exportSectionCsv(true); setExportMenu(false); }}
                    className="w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                  >
                    Absent only (with reason)
                  </button>
                  {sections.length > 1 && (<>
                    <div className="my-1 border-t border-gray-100" />
                    <p className="px-3 py-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">All Sections</p>
                    <button
                      onClick={() => { exportExamCsv(); setExportMenu(false); }}
                      className="w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                    >
                      All students
                    </button>
                    <button
                      onClick={() => { exportExamCsv(true); setExportMenu(false); }}
                      className="w-full px-3 py-1.5 text-left text-xs text-gray-700 hover:bg-gray-50"
                    >
                      Absent only (with reason)
                    </button>
                  </>)}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        <div className="px-4 py-2.5 border-b border-gray-100 bg-gray-50">
          <p className="text-xs font-semibold text-gray-600 uppercase tracking-wider">
            Select class &amp; exam
          </p>
        </div>
        <div className="p-3 grid grid-cols-2 sm:grid-cols-3 gap-2">
          <FilterSelect
            label="School"
            value={schoolId}
            options={schools.map((s) => ({
              label: s.name,
              value: String(s.id),
            }))}
            onChange={handleSchool}
            loading={registryLoading}
            className="col-span-2 sm:col-span-1"
          />
          <FilterSelect
            label="Grade"
            value={grade}
            options={grades.map((g) => ({ label: g.name, value: g.name }))}
            onChange={handleGrade}
          />
          <FilterSelect
            label="Subject"
            value={subject}
            options={filteredSubjects.map((s) => ({
              label: s.subjectCode ? `${s.name} (${s.subjectCode})` : s.name,
              value: s.name,
            }))}
            onChange={handleSubject}
            placeholder="All subjects"
          />
          <FilterSelect
            label="Section"
            value={section}
            options={sections.map((s) => ({ label: s, value: s }))}
            onChange={handleSection}
            loading={sectionsLoading}
          />
          <FilterSelect
            label="Exam"
            value={examId}
            options={filteredExams.map((e) => {
              const sub = subjects.find((s) => s.id === e.subjectId);
              return {
                label: !subject && sub ? `${e.name} (${sub.name})` : e.name,
                value: String(e.id),
              };
            })}
            onChange={handleExam}
            loading={examsLoading}
            className="col-span-2"
          />
        </div>
      </div>

      {/* Loading registry */}
      {registryLoading && (
        <div className="flex items-center justify-center py-16 text-gray-400">
          <Loader2 size={20} className="animate-spin mr-2" />
          <span className="text-sm">Loading...</span>
        </div>
      )}

      {/* Empty state */}
      {!registryLoading && !filtersReady && (
        <div className="mt-6 py-10 text-center">
          <Users size={32} className="mx-auto text-gray-400 mb-3" />
          <p className="text-sm text-gray-400">
            Select school, grade, section, and exam to load the student list
          </p>
        </div>
      )}

      {/* No students found */}
      {!registryLoading &&
        filtersReady &&
        !loadingStudents &&
        students.length === 0 &&
        !searchQuery.trim() && (
          <div className="mt-6 py-10 text-center">
            <p className="text-sm text-gray-400">
              No students enrolled for this class
            </p>
          </div>
        )}

      {/* Student list */}
      {!registryLoading && filtersReady && (loadingStudents || students.length > 0) && (
        <div className="mt-4">
          {/* Back button after global search navigation */}
          {prevFilters && !loadingStudents && (
            <button
              onClick={() => {
                setGrade(prevFilters.grade);
                setSection(prevFilters.section);
                setSubject(prevFilters.subject);
                setExamId(prevFilters.examId);
                setPrevFilters(null);
              }}
              className="mb-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-indigo-600 bg-indigo-50 hover:bg-indigo-100 transition border border-indigo-200"
            >
              <ArrowLeft size={14} /> Back to {prevFilters.label}
            </button>
          )}

          {/* Summary + search bar */}
          {!loadingStudents && students.length > 0 && (
            <>
              <div className="mb-3 bg-white rounded-xl border border-gray-200 px-3 sm:px-4 py-2.5 space-y-2">
                {/* Context line — wraps on mobile, single line on desktop */}
                <div className="text-xs text-gray-500">
                  <span className="hidden sm:block truncate">
                    <span className="font-medium text-gray-700">{schoolName ?? `School ${schoolId}`}</span>
                    {" "}&middot; Grade {grade} &middot; Section {section}
                    {subject && <> &middot; <span className="font-semibold text-gray-700">{subject}</span></>}
                    {selectedExam && <> &middot; <span className="font-medium text-gray-700">{selectedExam.name}</span></>}
                  </span>
                  <div className="sm:hidden space-y-0.5">
                    <div>
                      <span className="font-medium text-gray-700">{schoolName ?? `School ${schoolId}`}</span>
                      {" "}&middot; Grade {grade} &middot; Sec {section}
                    </div>
                    {subject && <div className="text-sm font-semibold text-gray-700">{subject}</div>}
                    {selectedExam && <div className="font-medium text-gray-700">{selectedExam.name}</div>}
                  </div>
                </div>
                {/* Stats + search */}
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-2 sm:gap-3 text-xs text-gray-500 flex-wrap">
                    <span className="font-medium text-gray-600">
                      <Users size={12} className="inline -mt-0.5 mr-1" />{students.length}
                    </span>
                    <span className="text-green-600 font-medium">{presentCount} present</span>
                    <span className="text-red-600 font-medium">{absentCount} absent</span>
                    {unmarkedCount > 0 && <span className="text-gray-400">{unmarkedCount} unmarked</span>}
                    {hasBatchData && (
                      <span className="text-blue-600 font-medium">
                        <Upload size={12} className="inline -mt-0.5 mr-0.5" />{uploadedCount}/{students.length} batch
                      </span>
                    )}
                  </div>
                  {students.length > 5 && (
                    <div className="flex items-center gap-2">
                      <div className="relative flex-1 sm:flex-none">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                        <input
                          type="text"
                          placeholder="Search name, roll..."
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className="w-full sm:w-48 h-8 pl-8 pr-3 text-xs bg-gray-50 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:bg-white"
                        />
                      </div>
                      <button
                        onClick={() => setShowGlobalSearch(!showGlobalSearch)}
                        className={`h-8 px-2.5 rounded-lg text-xs font-medium flex items-center gap-1 border transition shrink-0 ${
                          showGlobalSearch
                            ? "bg-indigo-50 text-indigo-600 border-indigo-200"
                            : "bg-gray-50 text-gray-500 border-gray-200 hover:bg-gray-100"
                        }`}
                        title="Search across all sections"
                      >
                        <Globe size={13} /> Find
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Universal search */}
              {showGlobalSearch && (
                <div className="mb-3 max-w-xl">
                  <div className="bg-indigo-50/50 border border-indigo-100 rounded-lg p-3">
                    <p className="text-[11px] text-indigo-600 font-medium mb-2">Search across all grades &amp; sections</p>
                    <div className="relative">
                      <Globe size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-indigo-400" />
                      <input
                        type="text"
                        autoFocus
                        placeholder="Type a student name..."
                        value={globalQuery}
                        onChange={(e) => setGlobalQuery(e.target.value)}
                        className="w-full h-9 pl-8 pr-3 text-sm bg-white border border-indigo-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      />
                      {globalLoading && (
                        <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-indigo-400 animate-spin" />
                      )}
                    </div>
                    {globalResults.length > 0 && (
                      <div className="mt-2 bg-white border border-gray-200 rounded-lg divide-y divide-gray-100 max-h-64 overflow-y-auto">
                        {globalResults.map((r) => {
                          const navigateToSubject = (targetSubject: string) => {
                            const label = [grade && `Grade ${grade}`, section && `Sec ${section}`, subject].filter(Boolean).join(" · ");
                            setPrevFilters({ grade, section, subject, examId, label });
                            const currentExamName = allExams.find((e) => String(e.id) === examId)?.name;
                            const newGrade = grades.find((g) => g.name === r.grade);
                            const newSub = subjects.find((s) => s.name === targetSubject);
                            const candidateExams = allExams.filter((e) =>
                              (!newGrade || e.gradeId === newGrade.id) &&
                              (!newSub || e.subjectId === newSub.id)
                            );
                            const sameNameMatch = currentExamName
                              ? candidateExams.find((e) => e.name === currentExamName)
                              : null;

                            setGrade(r.grade);
                            setSection(r.section);
                            setSubject(targetSubject);
                            setExamId(sameNameMatch ? String(sameNameMatch.id) : "");
                            setGlobalQuery("");
                            setGlobalResults([]);
                            setShowGlobalSearch(false);
                          };
                          return (
                            <div key={r.id} className="px-3 py-2.5">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium text-gray-900">{titleCase(r.name)}</span>
                                <span className="text-[11px] text-gray-400 shrink-0">{r.admissionNo}</span>
                              </div>
                              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                                  Grade {r.grade} · Section {r.section}
                                </span>
                                {r.rollNumber && (
                                  <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-gray-100 text-gray-600">
                                    Roll {r.rollNumber}
                                  </span>
                                )}
                                {r.subjects.map((sub) => (
                                  <button
                                    key={sub}
                                    onClick={() => navigateToSubject(sub)}
                                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition cursor-pointer"
                                  >
                                    {sub}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {globalQuery.trim().length >= 2 && !globalLoading && globalResults.length === 0 && (
                      <p className="mt-2 text-xs text-gray-400 text-center">No students found</p>
                    )}
                  </div>
                </div>
              )}
            </>
          )}

          {loadingStudents ? (
            <div className="flex items-center justify-center py-16 text-gray-400">
              <Loader2 size={20} className="animate-spin mr-2" />
              <span className="text-sm">Loading students...</span>
            </div>
          ) : (
            <>
              {/* Desktop table view */}
              <div className="hidden md:block bg-white rounded-xl border border-gray-200 overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-200">
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-16">
                        Roll
                      </th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
                        Student Name
                      </th>
                      <th className="px-4 py-2.5 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-40">
                        Admission No
                      </th>
                      <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-36">
                        Attendance
                      </th>
                      <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-48">
                        Remarks
                      </th>
                      {hasBatchData && (
                        <th className="px-4 py-2.5 text-center text-[11px] font-semibold text-gray-500 uppercase tracking-wider w-36">
                          Batch Status
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {sorted.map((s) => {
                      const att =
                        (attendanceMap[s.id]?.attendance as AttendanceVal) ??
                        null;
                      const isSaving = !!saving[s.id];
                      return (
                        <tr
                          key={s.id}
                          className={
                            att === "present"
                              ? "bg-green-50/40"
                              : att === "absent"
                                ? "bg-red-50/40"
                                : "bg-white"
                          }
                        >
                          <td className="px-4 py-2.5 text-sm font-bold text-gray-500">
                            {s.rollNumber ?? "–"}
                          </td>
                          <td className="px-4 py-2.5 text-sm font-medium text-gray-900">
                            {titleCase(s.name)}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-gray-400">
                            {s.admissionNo ?? "–"}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="flex items-center justify-center gap-1.5">
                              {isSaving ? (
                                <Loader2
                                  size={16}
                                  className="animate-spin text-gray-400"
                                />
                              ) : (
                                <>
                                  <button
                                    onClick={() =>
                                      requestManualToggle(
                                        s.id,
                                        s.name,
                                        att === "present" ? null : "present",
                                      )
                                    }
                                    className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-semibold transition ${
                                      att === "present"
                                        ? "bg-green-600 text-white shadow-sm"
                                        : "bg-gray-100 text-gray-500 hover:bg-green-50 hover:text-green-700"
                                    }`}
                                  >
                                    <Check size={14} /> Present
                                  </button>
                                  <button
                                    onClick={() =>
                                      requestManualToggle(
                                        s.id,
                                        s.name,
                                        att === "absent" ? null : "absent",
                                      )
                                    }
                                    className={`inline-flex items-center gap-1 h-7 px-2.5 rounded-md text-xs font-semibold transition ${
                                      att === "absent"
                                        ? "bg-red-600 text-white shadow-sm"
                                        : "bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-700"
                                    }`}
                                  >
                                    <X size={14} /> Absent
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-2.5 text-center">
                            <RemarksCell
                              studentId={s.id}
                              remarks={attendanceMap[s.id]?.remarks ?? null}
                              hasAttendance={!!att}
                              onSave={saveRemarks}
                            />
                          </td>
                          {hasBatchData && (
                            <td className="px-4 py-2.5 text-center">
                              <BatchStatusBadge info={getBatchInfo(s)} attendance={att} />
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {sorted.length === 0 && (
                  <div className="px-4 py-10 text-center text-sm text-gray-400">
                    {searchQuery.trim()
                      ? "No students match your search"
                      : "No students enrolled in this class"}
                  </div>
                )}
              </div>

              {/* Mobile card view */}
              <div className="md:hidden bg-white rounded-xl border border-gray-200 overflow-hidden divide-y divide-gray-100">
                {sorted.map((s) => (
                  <StudentRowMobile
                    key={s.id}
                    student={s}
                    attendance={
                      (attendanceMap[s.id]?.attendance as AttendanceVal) ?? null
                    }
                    remarks={attendanceMap[s.id]?.remarks ?? null}
                    saving={!!saving[s.id]}
                    onToggle={requestManualToggle}
                    onSaveRemarks={saveRemarks}
                    batchInfo={getBatchInfo(s)}
                  />
                ))}
                {sorted.length === 0 && (
                  <div className="px-4 py-10 text-center text-sm text-gray-400">
                    {searchQuery.trim()
                      ? "No students match your search"
                      : "No students enrolled in this class"}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* QR Scanner modal */}
      {showScanner && (
        <Suspense fallback={null}>
          <QrScanner onScan={handleQrScan} onClose={() => { setShowScanner(false); refreshAttendance(); }} />
        </Suspense>
      )}

      {/* Manual attendance confirmation modal */}
      {manualConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => { setManualConfirm(null); setManualReason(""); setAbsentOther(false); }}>
          <div className="bg-white rounded-xl shadow-xl w-[90vw] max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Manual Attendance</h3>
            <p className="text-xs text-gray-500 mb-3">
              Mark <span className="font-medium text-gray-700">{manualConfirm.studentName}</span> as{" "}
              <span className={`font-medium ${manualConfirm.value === "present" ? "text-green-600" : "text-red-600"}`}>
                {manualConfirm.value}
              </span>
              ?
            </p>
            <label className="block text-xs font-medium text-gray-600 mb-1">Reason for manual marking</label>
            {manualConfirm.value === "absent" ? (
              <>
                <select
                  autoFocus
                  value={absentOther ? "__other__" : manualReason}
                  onChange={(e) => {
                    if (e.target.value === "__other__") { setAbsentOther(true); setManualReason(""); }
                    else { setAbsentOther(false); setManualReason(e.target.value); }
                  }}
                  onKeyDown={(e) => { if (e.key === "Escape") { setManualConfirm(null); setManualReason(""); setAbsentOther(false); } }}
                  className="w-full h-9 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 mb-1"
                >
                  <option value="">Select reason</option>
                  <option value="Teacher confirmed absent">Teacher confirmed absent</option>
                  <option value="Booklet not received">Booklet not received</option>
                  <option value="__other__">Other</option>
                </select>
                {absentOther && (
                  <input
                    autoFocus
                    type="text"
                    placeholder="Type reason..."
                    value={manualReason}
                    onChange={(e) => setManualReason(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && manualReason.trim()) confirmManualToggle(); if (e.key === "Escape") { setManualConfirm(null); setManualReason(""); setAbsentOther(false); } }}
                    className="w-full h-9 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 mb-1"
                  />
                )}
              </>
            ) : (
              <input
                autoFocus
                type="text"
                placeholder="e.g. QR not found"
                value={manualReason}
                onChange={(e) => setManualReason(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && manualReason.trim()) confirmManualToggle(); if (e.key === "Escape") { setManualConfirm(null); setManualReason(""); setAbsentOther(false); } }}
                className="w-full h-9 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 mb-1"
              />
            )}
            <p className="text-[10px] text-gray-400 mb-4">This is being marked manually, not via QR scan.</p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => { setManualConfirm(null); setManualReason(""); setAbsentOther(false); }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={confirmManualToggle}
                disabled={!manualReason.trim()}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium text-white transition ${
                  manualConfirm.value === "present"
                    ? "bg-green-600 hover:bg-green-700 disabled:bg-green-300"
                    : "bg-red-600 hover:bg-red-700 disabled:bg-red-300"
                }`}
              >
                Confirm {manualConfirm.value === "present" ? "Present" : "Absent"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear attendance confirmation modal */}
      {clearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setClearConfirm(null)}>
          <div className="bg-white rounded-xl shadow-xl w-[90vw] max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-sm font-semibold text-gray-900 mb-1">Clear Attendance</h3>
            <p className="text-xs text-gray-500 mb-4">
              Clear attendance for <span className="font-medium text-gray-700">{clearConfirm.studentName}</span>? The recorded reason will be removed.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                onClick={() => setClearConfirm(null)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 transition"
              >
                Cancel
              </button>
              <button
                onClick={() => { toggleAttendance(clearConfirm.studentId, null); setClearConfirm(null); }}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-white bg-gray-700 hover:bg-gray-800 transition"
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error toast */}
      {errorToast && (
        <div className="fixed bottom-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium bg-red-600 text-white">
          {errorToast}
        </div>
      )}

      {/* Scan feedback toast */}
      {scanFeedback && (
        <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-lg shadow-lg text-sm font-medium ${
          scanFeedback.status === "success"
            ? "bg-green-600 text-white"
            : scanFeedback.status === "already"
              ? "bg-yellow-500 text-white"
              : scanFeedback.status === "wrong-section"
                ? "bg-orange-600 text-white"
                : scanFeedback.status === "invalid-qr"
                  ? "bg-gray-700 text-white"
                  : "bg-red-600 text-white"
        }`}>
          {scanFeedback.status === "success" && `${scanFeedback.name} marked present`}
          {scanFeedback.status === "already" && `${scanFeedback.name} is already present`}
          {scanFeedback.status === "not-found" && (scanFeedback.message ?? `No student found for "${scanFeedback.name}"`)}
          {scanFeedback.status === "wrong-section" && scanFeedback.message}
          {scanFeedback.status === "invalid-qr" && scanFeedback.message}
        </div>
      )}
    </div>
  );
}

function RemarksCell({
  studentId,
  remarks,
  hasAttendance,
  onSave,
}: {
  studentId: number;
  remarks: string | null;
  hasAttendance: boolean;
  onSave: (studentId: number, remarks: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(remarks ?? "");

  if (!hasAttendance) return <span className="text-xs text-gray-400 block text-center">–</span>;

  if (!open) {
    return (
      <button
        onClick={() => { setDraft(remarks ?? ""); setOpen(true); }}
        className={`mx-auto truncate max-w-[180px] flex items-center justify-center gap-1 h-7 px-2 rounded-md transition ${
          remarks
            ? "text-xs text-gray-600 bg-gray-50 border border-gray-200 hover:border-indigo-300 hover:text-indigo-600"
            : "text-xs text-gray-400 bg-gray-50 border border-dashed border-gray-200 hover:border-indigo-300 hover:text-indigo-600"
        }`}
        title={remarks ?? undefined}
      >
        {remarks ?? <><MessageSquare size={12} /> Add</>}
      </button>
    );
  }

  return (
    <div className="flex items-center justify-center gap-1">
      <input
        type="text"
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onSave(studentId, draft.trim() || null);
            setOpen(false);
          }
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder="Type a remark..."
        className="flex-1 h-7 px-2 text-[11px] bg-white border border-gray-200 rounded focus:outline-none focus:ring-1 focus:ring-indigo-300"
      />
      <button
        onClick={() => { onSave(studentId, draft.trim() || null); setOpen(false); }}
        className="h-7 px-2 text-xs text-white bg-indigo-600 hover:bg-indigo-700 rounded"
      >
        Save
      </button>
      {remarks && (
        <button
          onClick={() => { onSave(studentId, null); setDraft(""); setOpen(false); }}
          className="h-7 px-2 text-xs text-red-600 hover:text-red-700 bg-red-50 rounded border border-red-200"
        >
          Clear
        </button>
      )}
      <button
        onClick={() => setOpen(false)}
        className="h-7 px-2 text-xs text-gray-500 hover:text-gray-600 bg-gray-100 rounded border border-gray-200"
      >
        Cancel
      </button>
    </div>
  );
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
  loading,
  className,
  placeholder,
}: {
  label: string;
  value: string;
  options: { label: string; value: string }[];
  onChange: (v: string) => void;
  loading?: boolean;
  className?: string;
  placeholder?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-[11px] font-medium text-gray-500 mb-1">
        {label}
      </label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={loading}
        className="w-full h-10 px-3 text-sm bg-white border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-300 disabled:opacity-50"
      >
        <option value="">
          {loading ? "Loading..." : (placeholder ?? `Select ${label.toLowerCase()}`)}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function StudentRowMobile({
  student,
  attendance,
  remarks,
  saving,
  onToggle,
  onSaveRemarks,
  batchInfo,
}: {
  student: StudentItem;
  attendance: AttendanceVal;
  remarks: string | null;
  saving: boolean;
  onToggle: (studentId: number, studentName: string, value: AttendanceVal) => void;
  onSaveRemarks: (studentId: number, remarks: string | null) => void;
  batchInfo: { status: "uploaded" | "not-uploaded"; batchId: string | null } | null;
}) {
  const [showRemarks, setShowRemarks] = useState(false);

  return (
    <div
      className={`px-3 py-2.5 ${
        attendance === "present"
          ? "bg-green-50/40"
          : attendance === "absent"
            ? "bg-red-50/40"
            : ""
      }`}
    >
      <div className="flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
          <span className="text-xs font-bold text-gray-500">
            {student.rollNumber ?? "–"}
          </span>
        </div>

        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 truncate">
            {titleCase(student.name)}
          </p>
          <div className="flex items-center gap-1.5">
            {student.admissionNo && (
              <p className="text-[11px] text-gray-400 truncate">
                {student.admissionNo}
              </p>
            )}
            {batchInfo && (
              <BatchStatusBadge info={batchInfo} attendance={attendance} small />
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          {attendance && (
            <button
              onClick={() => setShowRemarks(!showRemarks)}
              className={`w-9 h-9 rounded-lg flex items-center justify-center transition ${
                remarks
                  ? "bg-indigo-100 text-indigo-600"
                  : "bg-gray-100 text-gray-400 active:bg-indigo-50"
              }`}
              aria-label="Remarks"
            >
              <MessageSquare size={16} />
            </button>
          )}
          {saving ? (
            <Loader2 size={16} className="animate-spin text-gray-400" />
          ) : (
            <>
              <button
                onClick={() =>
                  onToggle(
                    student.id,
                    student.name,
                    attendance === "present" ? null : "present",
                  )
                }
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition ${
                  attendance === "present"
                    ? "bg-green-600 text-white shadow-sm"
                    : "bg-gray-100 text-gray-400 active:bg-green-50"
                }`}
                aria-label="Present"
              >
                <Check
                  size={18}
                  strokeWidth={attendance === "present" ? 3 : 2}
                />
              </button>
              <button
                onClick={() =>
                  onToggle(
                    student.id,
                    student.name,
                    attendance === "absent" ? null : "absent",
                  )
                }
                className={`w-9 h-9 rounded-lg flex items-center justify-center transition ${
                  attendance === "absent"
                    ? "bg-red-600 text-white shadow-sm"
                    : "bg-gray-100 text-gray-400 active:bg-red-50"
                }`}
                aria-label="Absent"
              >
                <X size={18} strokeWidth={attendance === "absent" ? 3 : 2} />
              </button>
            </>
          )}
        </div>
      </div>

      {showRemarks && attendance && (
        <div className="mt-2 ml-11">
          <RemarksCell
            studentId={student.id}
            remarks={remarks}
            hasAttendance={!!attendance}
            onSave={onSaveRemarks}
          />
        </div>
      )}
      {remarks && !showRemarks && (
        <p className="mt-1 ml-11 text-[11px] text-gray-500 truncate">{remarks}</p>
      )}
    </div>
  );
}

function BatchStatusBadge({
  info,
  attendance,
  small,
}: {
  info: { status: "uploaded" | "not-uploaded"; batchId: string | null } | null;
  attendance: AttendanceVal;
  small?: boolean;
}) {
  if (!info) return null;

  const isUploaded = info.status === "uploaded";

  if (isUploaded && attendance === "absent") {
    const badge = (
      <span className={`inline-flex items-center gap-0.5 ${small ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-1 text-xs"} font-semibold rounded-md bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100 transition`}>
        Absent but in batch <ExternalLink size={small ? 8 : 10} />
      </span>
    );
    return info.batchId ? <Link href={`/batches/${info.batchId}`}>{badge}</Link> : badge;
  }

  if (isUploaded) {
    const badge = (
      <span className={`inline-flex items-center gap-0.5 ${small ? "text-[10px]" : "text-xs"} font-medium text-blue-600 hover:text-blue-800 transition`}>
        <Upload size={small ? 10 : 12} /> In batch <ExternalLink size={small ? 8 : 10} />
      </span>
    );
    return info.batchId ? <Link href={`/batches/${info.batchId}`}>{badge}</Link> : badge;
  }

  if (!isUploaded && attendance === "present") {
    return (
      <span className={`inline-flex items-center gap-0.5 ${small ? "text-[10px]" : "text-xs"} text-gray-400`}>
        Not in batch
      </span>
    );
  }

  return null;
}
