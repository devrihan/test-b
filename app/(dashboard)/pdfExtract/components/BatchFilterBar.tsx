"use client";

import { ChevronDown, Loader2 } from "lucide-react";
import { UseBatchFilterReturn } from "../hooks/useBatchFilter";
import { SectionDoneButton } from "@/app/components/SectionDoneButton";
import { useSectionTimerContext } from "@/app/context/SectionTimerContext";

export function FilterSelect({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label:    string;
  value:    string;
  options:  string[];
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="relative">
      <select
        value    = {value}
        onChange = {e => onChange(e.target.value)}
        disabled = {disabled || options.length === 0}
        className={`h-8 pl-3 pr-8 text-xs font-medium rounded-lg border appearance-none cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 ${value ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-white border-gray-200 text-gray-500"} ${(disabled || options.length === 0) ? "opacity-40 cursor-not-allowed" : "hover:border-indigo-400"}`}
      >
        <option value="">{label}</option>
        {options.map(opt => (
          <option key={opt} value={opt}>{opt}</option>
        ))}
      </select>
      <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
    </div>
  );
}

type Props = UseBatchFilterReturn & {
  onOpenStudent: () => void;
  loading:       boolean;
};

export default function BatchFilterBar({
  schoolOptions,
  gradeOptions,
  sectionOptions,
  subjectOptions,
  examOptions,
  allBatches,
  filters,
  setSchool,
  setGrade,
  setSection,
  setSubject,
  setExam,
  batchIdInput,
  setBatchIdInput,
  loadByBatchId,
  matchedBatch,
  matchedBatches,
  setBatch,
  students,
  selectedStudentId,
  setSelectedStudent,
  loadingBatches,
  loadingStudents,
  error,
  isReady,
  onOpenStudent,
  loading,
}: Props) {

  const sectionTimer = useSectionTimerContext();

  // Auto-open when student is selected
  const handleStudentChange = (id: string) => {
    setSelectedStudent(id);
    if (id) {
      // Small delay to let state update
      setTimeout(() => onOpenStudent(), 50);
    }
  };

  return (
    <div className="flex flex-col gap-1.5 px-2 py-1">

      {/* Row 1 — filter chain + matched batch/student */}
      <div className="flex items-center gap-2 flex-wrap">

        {/* Filter label */}
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 shrink-0">
          Filter:
        </span>

        {/* Filter dropdowns */}
        <FilterSelect label="School"  value={filters.school}  options={schoolOptions}  onChange={setSchool}  disabled={loadingBatches} />
        <FilterSelect label="Grade"   value={filters.grade}   options={gradeOptions}   onChange={setGrade}   disabled={loadingBatches} />
        <FilterSelect label="Subject" value={filters.subject} options={subjectOptions} onChange={setSubject} disabled={!filters.grade} />
        <FilterSelect label="Section" value={filters.section} options={sectionOptions} onChange={setSection} disabled={!filters.subject} />
        <FilterSelect label="Exam"    value={filters.exam}    options={examOptions}    onChange={setExam}    disabled={!filters.section} />

        {/* Batch dropdown — shown when multiple batches match same filters */}
        {matchedBatches.length > 1 && (
          <div className="relative">
            <select
              value={matchedBatch?.batch_id ?? ""}
              onChange={e => setBatch(e.target.value)}
              className={`h-8 pl-3 pr-8 text-xs font-medium rounded-lg border appearance-none cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 ${matchedBatch ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-white border-gray-200 text-gray-500"} hover:border-indigo-400`}
            >
              <option value="">Select Batch ({matchedBatches.length})</option>
              {matchedBatches.map(b => (
                <option key={b.batch_id} value={b.batch_id}>
                  {b.batch_name} · {b.total_students}s · {b.status}
                </option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
          </div>
        )}

        {/* Student dropdown — appears right after exam when batch is matched */}
        {matchedBatch && (
          <div className="relative">
            <select
              value    = {selectedStudentId}
              onChange = {e => handleStudentChange(e.target.value)}
              disabled = {loadingStudents || students.length === 0}
              className={`h-8 pl-3 pr-8 text-xs font-medium rounded-lg border appearance-none cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 ${selectedStudentId ? "bg-green-50 border-green-300 text-green-700" : "bg-white border-gray-200 text-gray-500"} ${loadingStudents ? "opacity-40 cursor-not-allowed" : "hover:border-indigo-400"}`}
            >
              <option value="">
                {loadingStudents ? "Loading…" : students.length === 0 ? "No students" : "Student"}
              </option>
              {students.map(s => (
                <option key={s.student_id} value={s.student_id}>
                  {s.student_name}{s.roll_number ? ` (${s.roll_number})` : ""} · {s.total_pages}p
                </option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
          </div>
        )}

        {/* Loading spinner */}
        {(loadingBatches || loadingStudents || loading) && (
          <Loader2 size={14} className="animate-spin text-indigo-500 shrink-0" />
        )}
      </div>

      {/* Row 2 — direct batch ID lookup */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 shrink-0">
          Batch ID:
        </span>

        <div className="relative">
          <input
            type        = "text"
            list        = "batch-options"
            value       = {batchIdInput}
            onChange    = {e => setBatchIdInput(e.target.value)}
            placeholder = "Type or select batch..."
            onKeyDown   = {e => { if (e.key === "Enter") loadByBatchId(); }}
            className   = "h-8 px-3 pr-8 text-xs font-mono border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/20 w-56 transition"
          />
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
          <datalist id="batch-options">
            {allBatches.map(b => (
              <option key={b.batch_id} value={b.batch_id}>
                {b.grade} {b.section} · {b.subject} · {b.exam_type}
              </option>
            ))}
          </datalist>
        </div>

        {/* Error */}
        {error && (
          <span className="text-xs text-red-500 font-medium">{error}</span>
        )}

        {/* Ends this operator's pass on the batch above. */}
        {sectionTimer.stage && (
          <SectionDoneButton
            open={sectionTimer.open}
            makers={sectionTimer.makers}
            checkers={sectionTimer.checkers}
            opsStatus={sectionTimer.opsStatus}
            onDone={sectionTimer.done}
          />
        )}
      </div>

    </div>
  );
}