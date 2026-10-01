import {
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs";

export const URL_OPTIONS = {
  history: "replace",
  shallow: false,
  clearOnDefault: true,
} as const;

export const URL_OPTIONS_PUSH = {
  history: "push",
  shallow: false,
  clearOnDefault: true,
} as const;

export const REVIEW_STAGES = ["chunking", "answers", "marks_verification"] as const;
export const QUEUE_VIEWS = ["mine", "all", "report"] as const;
export const METRICS_GROUP_BY = ["reviewer", "batch"] as const;
export const CONFIG_TABS = [
  "schools",
  "grades",
  "subjects",
  "sections",
  "examTypes",
  "exams",
  "academicYears",
] as const;
export const ONBOARD_TABS = ["verify", "onboard", "marks", "transition"] as const;
export const RECONCILE_FILTERS = ["all", "needs_onboarding", "no_admission"] as const;
export const SCANS_TABS = ["documents", "attention", "pages"] as const;
export const ANSWER_KEY_MODES = ["upload", "upload-form", "review", "bbox"] as const;
export const QP_MODES = ["list", "create", "view"] as const;
export const QP_SUB_VIEWS = [
  "hub",
  "papers",
  "chapter-mapping",
  "concept-mapping",
  "blooms",
  "question-mappings",
] as const;

const batchId = parseAsString.withDefault("");
const studentId = parseAsString.withDefault("");

const scopeParams = {
  school: parseAsString.withDefault(""),
  grade: parseAsString.withDefault(""),
  subject: parseAsString.withDefault(""),
  section: parseAsString.withDefault(""),
  exam: parseAsString.withDefault(""),
};

export const urlKeys = {
  pdfExtract: {
    ...scopeParams,
    batchId,
    studentId,
    q: parseAsString.withDefault(""),
  },

  answerEditing: {
    ...scopeParams,
    batchId,
    studentId,
  },

  answerKey: {
    mode: parseAsStringLiteral(ANSWER_KEY_MODES).withDefault("upload"),
    paperId: parseAsInteger.withDefault(0),
  },

  answerKeyBbox: {
    paperId: parseAsInteger.withDefault(0),
  },

  batches: {
    grade: parseAsString.withDefault(""),
    subject: parseAsString.withDefault(""),
    section: parseAsString.withDefault(""),
    status: parseAsString.withDefault(""),
  },

  scans: {
    dispatchId: parseAsString.withDefault(""),
    tab: parseAsStringLiteral(SCANS_TABS).withDefault("documents"),
    docId: parseAsString.withDefault(""),
  },

  reviewQueue: {
    stage: parseAsStringLiteral(REVIEW_STAGES).withDefault("marks_verification"),
    view: parseAsStringLiteral(QUEUE_VIEWS),
    assignee: parseAsString.withDefault(""),
    schoolId: parseAsString.withDefault(""),
    grade: parseAsString.withDefault(""),
    academicYear: parseAsString.withDefault(""),
    subjectId: parseAsString.withDefault(""),
    examId: parseAsString.withDefault(""),
    from: parseAsString.withDefault(""),
    to: parseAsString.withDefault(""),
  },

  reviewMetrics: {
    by: parseAsStringLiteral(METRICS_GROUP_BY).withDefault("reviewer"),
  },

  config: {
    tab: parseAsStringLiteral(CONFIG_TABS).withDefault("subjects"),
  },

  studentsOnboard: {
    tab: parseAsStringLiteral(ONBOARD_TABS),
    schoolId: parseAsString.withDefault(""),
    grade: parseAsString.withDefault(""),
    section: parseAsString.withDefault(""),
  },

  studentsReconcile: {
    filter: parseAsStringLiteral(RECONCILE_FILTERS).withDefault("needs_onboarding"),
  },

  exportData: {
    schoolId: parseAsString.withDefault(""),
    gradeId: parseAsString.withDefault(""),
    subjectId: parseAsString.withDefault(""),
    section: parseAsString.withDefault(""),
    exam: parseAsString.withDefault(""),
  },

  manualRepair: {
    studentId,
    originals: parseAsBoolean.withDefault(false),
  },

  questionPaper: {
    mode: parseAsStringLiteral(QP_MODES).withDefault("list"),
    subView: parseAsStringLiteral(QP_SUB_VIEWS).withDefault("hub"),
    paperId: parseAsString.withDefault(""),
    school: parseAsString.withDefault(""),
    academicYear: parseAsString.withDefault(""),
    grade: parseAsString.withDefault(""),
    subject: parseAsString.withDefault(""),
    examType: parseAsString.withDefault(""),
  },
} as const;

