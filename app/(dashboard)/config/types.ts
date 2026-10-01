export interface Subject {
  id: number;
  name: string;
  code: string | null;
}

export interface Section {
  id: number;
  schoolId: number;
  gradeId: number;
  name: string;
}

export interface ExamType {
  id: number;
  name: string;
}

export interface Exam {
  id: number;
  name: string;
  schoolId: number;
  gradeId: number;
  subjectId: number;
  examTypeId: number;
  examDate: string | null;
}

export interface SchoolOption {
  id: number;
  name: string;
}

export interface GradeOption {
  id: number;
  name: string;
}

export interface AcademicYear {
  id: number;
  yearFrom: number;
  yearTo: number;
}

export type SelectOption = { label: string; value: string };


