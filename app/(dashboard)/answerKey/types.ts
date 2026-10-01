// ─────────────────────────────────────────────────────────────────────────────
// Shared types for the Answer Key review UI
// ─────────────────────────────────────────────────────────────────────────────

export type AKStatus = "DRAFT" | "MISSING" | "UNMAPPED" | "MARKS_ISSUE" | "READY";

export type StepItem = {
  stepNumber:  number;
  description: string;
  marks:       number;
};

export type AnswerKeyRow = {
  id:                  number;
  questionId:          number;
  questionNumber:      string;
  questionText:        string;
  questionType:        string | null;
  maxMarks:            number;
  ocrText:             string | null;
  cleanText:           string | null;
  mcqChoice:           string | null;
  status:              AKStatus;
  version:             number;
  steps:               StepItem[];
  r2CroppedImageUrl:   string | null;
  createdAt:           string | null;
  updatedAt:           string | null;
};

export type ValidationIssue = {
  questionNumber: string;
  status:         string;
  reason:         string;
};

export type IngestSummary = {
  totalQuestions:  number;
  draftCount:      number;
  missingCount:    number;
  unmappedCount:   number;
  marksIssueCount: number;
  message:         string;
};

export type IngestResult = {
  success:         boolean;
  questionPaperId: number;
  summary:         IngestSummary;
  validationIssues: ValidationIssue[];
  requiresReview:  boolean;
};

export type PaperOption = {
  id:          number;
  name:        string;
  subjectName: string | null;
  gradeName:   string | null;
  schoolName:  string | null;
  maxMarks:    number | null;
  setNumber?:  string | null;
  setMode?:    string | null;
};