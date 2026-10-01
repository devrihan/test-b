import type { FormState, ParsedQuestion, SelectOption } from "./types";

export const QP_STORAGE_KEY = "qp_session";
export const MAX_PDF_SIZE_MB = 32;

export const SET_NUMBER_OPTIONS: SelectOption[] = [
  { label: "No Set", value: "No Set" },
  ...Array.from({ length: 5 }, (_, i) => {
    const char = String.fromCharCode(65 + i);
    return { label: char, value: char };
  }),
];

export const SET_MODE_OPTIONS: SelectOption[] = [
  { label: "Single (One set, one paper)", value: "SINGLE" },
  { label: "Independent (Multiple sets, completely different questions)", value: "INDEPENDENT" },
  { label: "Reordered (Multiple sets, same questions different order)", value: "REORDERED" },
  { label: "Partial Overlap (Multiple sets, some shared some unique)", value: "PARTIAL_OVERLAP" },
];

export const EMPTY_FORM: FormState = {
  school_id: "", grade_id: "", subject_id: "", exam_id: "", exam_name: "",
  exam_date: "", max_marks: "", set_number: "", set_mode: "SINGLE",
  exam_type: "", display_name: "", academic_year_id: "", sections_attended: [],
};

export const EMPTY_QUESTION: ParsedQuestion = {
  question_number: "", question_text: "", question_type: "SA",
  max_marks: 1, option_group: null, option_set: null, pick_count: null,
  question_label: "", answer_key: "", ai_answer: "",
};

export const TYPE_BADGE: Record<string, string> = {
  MCQ: "bg-violet-50 text-violet-700 border-violet-200",
  VSA: "bg-sky-50 text-sky-700 border-sky-200",
  SA: "bg-teal-50 text-teal-700 border-teal-200",
  LA: "bg-amber-50 text-amber-700 border-amber-200",
  CASE_STUDY: "bg-orange-50 text-orange-700 border-orange-200",
};
