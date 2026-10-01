import type { NormBBox } from "../DiagramEditor";

export type SaveStatus = "idle" | "saving" | "saved" | "error";

export interface ConceptOption {
  unitId:      number | null;
  unitName:    string | null;
  chapterId:   number;
  chapterName: string;
  conceptId:   number;
  conceptName: string;
}

export interface QuestionConceptRow {
  id:             number;
  questionNumber: number | null;
  questionText:   string | null;
  maxMarks:       number | null;
  questionType:   string | null;
  questionLabel:  string | null;
  conceptId:      number | null;
  conceptName:    string | null;
  chapterId:      number | null;
  chapterName:    string | null;
  unitId:         number | null;
  unitName:       string | null;
  // OR-grouping fields (reused by buildViewBlocks)
  optionGroup?:   string | null;
  optionSet?:     string | null;
  pickCount?:     number | null;
}

export interface QuestionBloomRow {
  id:              number;
  questionNumber:  number | null;
  questionText:    string | null;
  maxMarks:        number | null;
  questionType:    string | null;
  questionLabel:   string | null;
  difficultyLevel: string | null;
  bloomTaxonomy:   string | null;
  // OR-grouping fields (reused by buildViewBlocks)
  optionGroup?:    string | null;
  optionSet?:      string | null;
  pickCount?:      number | null;
}

export interface DiagramBBox extends NormBBox {
  page: number;
  page_image_url: string;
}

export interface QuestionListItemDTO {
  id: number;
  questionNumber: number;
  questionText: string;
  fileName?: string;
  unit: string | null;
  optionGroup?: string | null;
  optionSet?: string | null;
  pickCount?: number | null;
  questionLabel?: string | null;
  maxMarks: number;
  questionType: string | null;
  answerKey: string | null;
  aiAnswer: string | null;
  difficultyLevel?: string | null;
  bloomTaxonomy?: string | null;
  hasDiagram?: boolean | null;
  diagramBbox?: string | null;
  diagramCropUrl?: string | null;
  hasQuestionChemicalStructure?: boolean | null;
  hasAnswerChemicalStructure?: boolean | null;
  questionStructureSmiles?: string | null;
  questionStructureInchikey?: string | null;
  // Ephemeral flag — cleared on successful addQuestion() call
  isNew?: boolean;
}

export interface PaperMeta {
  id: number;
  exam: string;
  schoolId: number;
  gradeId: number;
  subjectId: number;
  maxMarks?: number;
  setNumber?: string;
  setMode?: string;
  schoolName: string;
  gradeName: string;
  subjectName: string;
  difficultyLevel?: string;
  bloomTaxonomy?: string;
  academicYearId?: number | null;
  academicYear?: string | null;   // display label, e.g. "2025-26"
}

// "saving" keeps form values in-flight so the card can disable buttons without losing edits
export type EditState =
  | { status: "idle" }
  | { status: "editing"; questionId: number; form: Partial<QuestionListItemDTO> }
  | { status: "saving"; questionId: number; form: Partial<QuestionListItemDTO> };

export interface ViewOrSet<T = QuestionListItemDTO> {
  set: string | null;
  items: T[];
}

export interface ViewBlock<T = QuestionListItemDTO> {
  type: "single" | "or";
  groupKey?: string;
  pickCount?: number | null;
  sets?: ViewOrSet<T>[];
  items?: T[];
}

export interface UiOrSet<T = QuestionListItemDTO> {
  set: string;
  items: { q: T; idx: number }[];
}

export interface UiBlock<T = QuestionListItemDTO> {
  type: "compulsory" | "or";
  groupKey?: string;
  pickCount?: number | null;
  sets?: UiOrSet<T>[];
  items?: { q: T; idx: number }[];
}

export interface UiGroup<T = QuestionListItemDTO> {
  parent: string;
  blocks: UiBlock<T>[];
}

export interface ParsedQuestion {
  question_number: string;
  question_text: string;
  question_type: string;
  max_marks: number;
  option_group: string | null;
  option_set: string | null;
  pick_count: number | null;
  question_label: string;
  answer_key: string;
  ai_answer: string;
  difficulty_level?: string;
  bloom_taxonomy?: string;
  chapter_name?: string;
  concept_name?: string;
  has_diagram?: boolean;
  diagram_bbox?: DiagramBBox | null;
  diagram_crop_url?: string | null;
  has_question_chemical_structure?: boolean;
  has_answer_chemical_structure?: boolean;
  question_structure_smiles?: string | null;
  question_structure_inchikey?: string | null;
  _ui_id?: string;
}

export interface OrEntry {
  description_a: string;
  description_b: string;
  keywords_a: string[];
  keywords_b: string[];
}

export interface RegistryItem {
  id: number;
  name: string;
  subjectCode?: string;
}

export interface RegistryExamItem {
  id: number;
  name: string;
  examDate?: string;
  schoolId?: number;
  gradeId?: number;
  examType?: string;
}

export interface AcademicYearItem {
  id: number;
  yearFrom: number;
  yearTo: number;
}

export interface Registry {
  schools: RegistryItem[];
  grades: RegistryItem[];
  subjects: RegistryItem[];
  examNames: RegistryExamItem[];
  academicYears: AcademicYearItem[];
}

export interface FormState {
  school_id: string;
  grade_id: string;
  subject_id: string;
  exam_id: string;
  exam_name: string;
  exam_date: string;
  set_number: string;
  set_mode: string;
  exam_type: string;
  display_name: string;
  max_marks: string;
  academic_year_id: string;
  sections_attended: number[];
}

export function academicYearLabel(y: { yearFrom: number; yearTo: number }): string {
  return `${y.yearFrom}-${String(y.yearTo).slice(-2).padStart(2, "0")}`;
}

export interface SessionData {
  step: "form" | "review";
  form: FormState;
  questions: ParsedQuestion[];
  orQuestions: Record<string, OrEntry>;
  pdfUrl: string | null;
}

export interface SectionItem {
  id: number;
  schoolId: number;
  gradeId: number;
  name: string;
}

export type SelectOption = { label: string; value: string };

export interface CreateOrSet {
  set: string;
  items: { q: ParsedQuestion; idx: number }[];
}

export interface CreateUiBlock {
  type: "compulsory" | "or";
  groupKey?: string;
  pickCount?: number | null;
  sets?: CreateOrSet[];
  items?: { q: ParsedQuestion; idx: number }[];
}

export interface CreateUiGroup {
  parent: string;
  blocks: CreateUiBlock[];
}
