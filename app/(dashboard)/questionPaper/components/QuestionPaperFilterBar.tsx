"use client";

import { ChevronDown, RefreshCw } from "lucide-react";
import { useQuestionPaperList } from "@/app/hooks/useQuestionPaperList";

// Rendered by the Header, but only on /questionPaper — which keeps
// useQuestionPaperList and its params off every other route. The mode/subView
// gate lives here rather than in the Header so the Header needs no context.
export default function QuestionPaperFilterBar() {
  const qpList = useQuestionPaperList();

  if (qpList.mode !== "list" || qpList.subView !== "papers") return null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 shrink-0">
        Filter:
      </span>

      {[
        { label: "School", value: qpList.filterSchool, options: qpList.schools, set: qpList.setFilterSchool },
        { label: "Academic Year", value: qpList.filterAcademicYear, options: qpList.academicYears, set: qpList.setFilterAcademicYear },
        { label: "Grade", value: qpList.filterGrade, options: qpList.grades, set: qpList.setFilterGrade },
        { label: "Subject", value: qpList.filterSubject, options: qpList.subjects, set: qpList.setFilterSubject },
        { label: "Exam Type", value: qpList.filterExamType, options: qpList.examTypes, set: qpList.setFilterExamType },
      ].map(({ label, value, options, set }) => (
        <div key={label} className="relative">
          <select
            value={value}
            onChange={e => set(e.target.value)}
            className={`h-8 pl-3 pr-8 text-xs font-medium rounded-lg border appearance-none cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 ${value ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-white border-gray-200 text-gray-500"}`}
          >
            <option value="">{label}</option>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
        </div>
      ))}

      {(qpList.filterGrade || qpList.filterSubject || qpList.filterSchool || qpList.filterAcademicYear || qpList.filterExamType) && (
        <button
          onClick={qpList.clearFilters}
          className="h-8 px-3 text-xs font-medium text-red-500 hover:text-red-600 border border-red-200 hover:border-red-300 rounded-lg transition"
        >
          Clear
        </button>
      )}

      <div className="w-px h-5 bg-gray-200 mx-1 shrink-0" />

      <button
        onClick={qpList.refresh}
        className="flex items-center gap-1.5 h-8 px-3 bg-white border border-gray-200 text-gray-600 hover:border-indigo-400 hover:text-indigo-600 rounded-lg text-xs font-medium transition"
      >
        <RefreshCw size={12} /> Refresh
      </button>
    </div>
  );
}
