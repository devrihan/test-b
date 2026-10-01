// Client-side API helpers for the Published Answers editor (b0).
// All calls hit aggregatedData's /api/data-quality/* endpoints
// (DataQualityController in aggregatedData repo).

import { getAuthToken as getToken } from "@/app/lib/auth";

const API_BASE =
  process.env.NEXT_PUBLIC_AGGREGATED_DATA_API_URL ?? "http://localhost:8082";

// b0: exam types are just names (server uses SELECT DISTINCT on
// question_papers.exam; a real exam_types table is b1).
export type ExamType = { name: string };

export type SchoolWithPapers = {
  id: number;
  name: string;
  location: string | null;
  questionPapers: Array<{
    id: number;
    name: string;
    subject: string | null;
  }>;
};

// Mirrors StudentAnswerDetailDTO on the server side. Used by both the
// student list (one row per student × exam) and the editor (one row
// containing the full answers[] for one student × exam).
export type StudentRow = {
  studentId: number;
  name: string;
  rollNumber: string;
  grade: string;
  section: string;
  questionPaperName: string;   // exam name
  subject: string | null;
  examMaxMarks: number | null;
  totalMarks: number | null;
  /** V7: paper-level done-state. */
  completed?: boolean;
};

export type AnswerDetail = {
  questionNumber: number;
  answerNumber: number;
  marksObtained: number | null;
  extractedText: string | null;
  maxMarks: number | null;
  verified?: boolean;
  verifiedBy?: string | null;
  verifiedAt?: string | null;
  /** Chemistry: recognized answer structure (DECIMER + RDKit). */
  smiles?: string | null;
  inchikey?: string | null;
};

export type StudentAnswers = StudentRow & {
  answers: AnswerDetail[];
  // Detail endpoint (GET_STUDENT_ANSWER_DETAILS) returns who/when the paper was
  // marked done; the list endpoint (GET_STUDENTS_BY_SCHOOL_ID) does not, which is
  // why these live here on the detail type rather than on StudentRow.
  completedBy?: string | null;
  completedAt?: string | null;
};

export type QuestionListItemDTO = {
  id: number;
  questionNumber: number;
  questionText: string;
  answerKey?: string;
  cleanText?: string;
  mcqChoice?: string;
  maxMarks?: number;
};


function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    let err: unknown;
    try {
      err = JSON.parse(text);
    } catch {
      err = { error: text || `HTTP ${res.status}` };
    }
    throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status, body: err });
  }
  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ── Endpoints ─────────────────────────────────────────────────────────────

// /schools returns a plain array (server: ResponseEntity.ok(schools)).
export async function listSchools() {
  return jsonFetch<SchoolWithPapers[]>(
    `${API_BASE}/api/data-quality/schools`
  );
}

export async function listExamTypes(schoolId?: number) {
  const qs = schoolId != null ? `?schoolId=${schoolId}` : "";
  return jsonFetch<{ examTypes: ExamType[] }>(
    `${API_BASE}/api/data-quality/exam-types${qs}`
  );
}

// Returns the raw list (server endpoint responds with an array, not a wrapper).
export async function listStudents(params: {
  schoolId: number;
  grade?: string;
  section?: string;
  subject?: string;
}) {
  const qs = new URLSearchParams();
  qs.set("schoolId", String(params.schoolId));
  if (params.grade) qs.set("grade", params.grade);
  if (params.section) qs.set("section", params.section);
  if (params.subject) qs.set("subject", params.subject);
  return jsonFetch<StudentRow[]>(
    `${API_BASE}/api/data-quality/school/${params.schoolId}/students?${qs.toString()}`
  );
}

// ── Onboarded roster (source of truth from the school, pre-scan) ──────────
// The student-onboarding bulk upload (Name/AdmissionNo/Section/RollNumber) lands
// here. Unlike listStudents() above (which is answer-based and only returns
// students who already have processed answers), this is the ENROLLMENT roster —
// available before any paper is scanned. The endpoint ignores grade/section, so
// fetch the whole school once and filter client-side.
export type OnboardedStudent = {
  id: number;
  name: string;
  admissionNo: string | null;
  grade: string | null;
  gradeId: number | null;
  section: string | null;
  rollNumber: number | null;
  schoolId: number | null;
  schoolName: string | null;
};

export async function listOnboardedStudents(schoolId: number) {
  return jsonFetch<{ count: number; students: OnboardedStudent[] }>(
    `${API_BASE}/api/student-lookup/list?schoolId=${schoolId}`
  );
}

export async function getStudentAnswers(params: {
  schoolId: number;
  studentId: number;
  exam: string;
}): Promise<StudentAnswers> {
  const url = new URL(`${API_BASE}/api/data-quality/student/${params.studentId}/answers`);
  url.searchParams.set("schoolId", params.schoolId.toString());
  url.searchParams.set("exam", params.exam);
  return jsonFetch<StudentAnswers>(url.toString());
}

export async function saveStudentAnswers(params: {
  schoolId: number;
  studentId: number;
  exam: string;
  answers: Array<{
    answerNumber: number;
    marksObtained: number | null;
    extractedText: string | null;
    /** null = leave verified unchanged; server preserves verified_by/verified_at. */
    verified: boolean | null;
  }>;
  totalMarks?: number;
  /** V7: toggle answer_paper.completed. Null/omitted = preserve. */
  completed?: boolean;
}) {
  const qs = new URLSearchParams({
    schoolId: String(params.schoolId),
    exam: params.exam,
  });
  return jsonFetch<{ message: string; studentId: number; updatedCount: number }>(
    `${API_BASE}/api/data-quality/student/${params.studentId}/answers?${qs.toString()}`,
    {
      method: "PUT",
      body: JSON.stringify({
        answers: params.answers,
        ...(params.totalMarks != null ? { totalMarks: params.totalMarks } : {}),
        ...(params.completed != null ? { completed: params.completed } : {}),
      }),
    }
  );
}

export async function getQuestionsByExam(
  schoolId: number | string,
  grade: string,
  exam: string,
  questionPaperId?: number | null
): Promise<QuestionListItemDTO[]> {
  const params = new URLSearchParams({ schoolId: String(schoolId), grade, exam });
  if (questionPaperId) params.append("questionPaperId", String(questionPaperId));
  return jsonFetch<QuestionListItemDTO[]>(`${API_BASE}/api/data-quality/questions?${params.toString()}`);
}
