import type { ListDocumentsOptions } from "./scanApi";

export type BatchFilters = {
  grade?: string;
  subject?: string;
  section?: string;
  status?: string;
};

export type ReviewStage = "chunking" | "answers" | "marks_verification";

export type StudentFilters = {
  schoolId: number;
  grade?: string;
  section?: string;
  subject?: string;
};

export type StudentAnswersParams = {
  schoolId: number;
  studentId: number;
  exam: string;
};

export type QuestionsParams = {
  schoolId: number;
  grade: string;
  exam: string;
  questionPaperId?: number;
};

export const keys = {
  batch: {
    all: () => ["beaver", "batches"] as const,
    list: (filters?: BatchFilters) => ["beaver", "batches", filters ?? {}] as const,
    /** Prefix covering every per-batch query (one / detail / students / roster). */
    byId: () => ["beaver", "batch"] as const,
    one: (batchId: string) => ["beaver", "batch", batchId] as const,
    detail: (batchId: string) => ["beaver", "batch", batchId, "detail"] as const,
    students: (batchId: string) => ["beaver", "batch", batchId, "students"] as const,
    student: (batchId: string, studentId: string) =>
      ["beaver", "batch", batchId, "students", studentId] as const,
    roster: (batchId: string) => ["beaver", "batch", batchId, "roster"] as const,
    rosterReconcile: (batchId: string) =>
      ["beaver", "batch", batchId, "rosterReconcile"] as const,
  },

  paper: {
    one: (batchId: string, paperId: string) =>
      ["beaver", "paper", batchId, paperId] as const,
    pages: (batchId: string, paperId: string) =>
      ["beaver", "paper", batchId, paperId, "pages"] as const,
    bboxes: (batchId: string, paperId: string) =>
      ["beaver", "paper", batchId, paperId, "bboxes"] as const,
  },

  review: {
    all: () => ["beaver", "review"] as const,
    queue: (batchId: string, stage: ReviewStage) =>
      ["beaver", "review", "queue", batchId, stage] as const,
    metrics: (by: string) => ["beaver", "review", "metrics", by] as const,
    gate: (batchId: string, studentId: string, stage: string) =>
      ["beaver", "review", "gate", batchId, studentId, stage] as const,
    reviewers: () => ["beaver", "review", "reviewers"] as const,
    history: (batchId: string, studentId: string) =>
      ["beaver", "review", "history", batchId, studentId] as const,
    tasksAll: () => ["beaver", "review", "tasks"] as const,
    tasks: (params: {
      view: string;
      stage: string;
      scope: unknown;
      assignee: string | null;
    }) => ["beaver", "review", "tasks", params] as const,
    report: (params: { stage: string; scope: unknown; from: string; to: string }) =>
      ["beaver", "review", "report", params] as const,
  },

  errorBucket: (status?: string) => status
    ? ["beaver", "errorBucket", status] as const
    : ["beaver", "errorBucket"] as const,

  answerKey: {
    all: () => ["beaver", "answerKey"] as const,
    questionPapers: () => ["beaver", "answerKey", "questionPapers"] as const,
    rows: (questionPaperId: number) =>
      ["beaver", "answerKey", "rows", questionPaperId] as const,
    /** Page images of the uploaded AK PDF. Immutable once ingested. */
    pages: (questionPaperId: number) =>
      ["beaver", "answerKey", "pages", questionPaperId] as const,
    /** Canonical questions from preflight, used to seed the marking sidebar. */
    preflight: (questionPaperId: number) =>
      ["beaver", "answerKey", "preflight", questionPaperId] as const,
  },

  students: {
    needsOnboarding: () => ["beaver", "students", "needsOnboarding"] as const,
  },

  health: () => ["beaver", "health"] as const,

  push: {
    all: () => ["beaver", "push"] as const,
    exams: () => ["beaver", "push", "exams"] as const,
    jobs: () => ["beaver", "push", "jobs"] as const,
  },

  eval: {
    all: () => ["beaver", "eval"] as const,
    runs: () => ["beaver", "eval", "runs"] as const,
    run: (runId: string) => ["beaver", "eval", "run", runId] as const,
    testSets: () => ["beaver", "eval", "testSets"] as const,
  },

  scans: {
    dispatches: () => ["scans", "dispatches"] as const,
    dispatch: (dispatchId: string) => ["scans", "dispatch", dispatchId] as const,
    dispatchPages: (dispatchId: string) =>
      ["scans", "dispatch", dispatchId, "pages"] as const,
    documents: (filters?: ListDocumentsOptions) =>
      ["scans", "documents", filters ?? {}] as const,
    document: (documentId: string) => ["scans", "document", documentId] as const,
  },

  aggregated: {
    schools: () => ["aggregated", "schools"] as const,
    examTypes: (schoolId?: number) => ["aggregated", "examTypes", schoolId ?? null] as const,
    students: (filters: StudentFilters) => ["aggregated", "students", filters] as const,
    onboarded: (schoolId: number) => ["aggregated", "onboarded", schoolId] as const,
    studentAnswers: (params: StudentAnswersParams) =>
      ["aggregated", "studentAnswers", params] as const,
    questions: (params: QuestionsParams) => ["aggregated", "questions", params] as const,
  },

  questionPaper: {
    all: () => ["aggregated", "questionPaper"] as const,
    bloomsMapping: (paperId: number) =>
      ["aggregated", "questionPaper", paperId, "bloomsMapping"] as const,
    conceptMapping: (paperId: number) =>
      ["aggregated", "questionPaper", paperId, "conceptMapping"] as const,
    questionMappings: (paperId: number) =>
      ["aggregated", "questionPaper", paperId, "questionMappings"] as const,
    view: (paperId: string) =>
      ["aggregated", "questionPaper", paperId, "view"] as const,
    curriculum: (gradeId: number | null, subjectId: number | null) =>
      ["aggregated", "curriculum", gradeId ?? null, subjectId ?? null] as const,
  },

  registry: {
    me: () => ["registry", "me"] as const,
    users: () => ["registry", "users"] as const,
    batchFormOptions: () => ["registry", "batchFormOptions"] as const,
    academicYears: () => ["registry", "academicYears"] as const,
    sections: (schoolId: string, gradeId: string) =>
      ["registry", "sections", schoolId, gradeId] as const,
  },

  config: {
    all: () => ["config"] as const,
    panel: (endpoint: string, params?: Record<string, string>) =>
      ["config", endpoint, params ?? {}] as const,
  },
} as const;
