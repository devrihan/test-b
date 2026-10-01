"use client";

import { ChevronRight, CheckCircle2 } from "lucide-react";

// undone  → grey  → not yet reviewed
// edited  → amber → changes made, not saved
// done    → green → saved & complete
type StudentStatus = "undone" | "edited" | "done";

export interface StudentCardProps {
  studentName: string;
  studentId: string;
  marksObtained: number;
  totalMarks: number;
  status?: StudentStatus;
  isSelected?: boolean;
  onClick?: () => void;
}

export default function StudentCard({
  studentName,
  studentId,
  marksObtained,
  totalMarks,
  status = "undone",
  isSelected = false,
  onClick,
}: StudentCardProps) {
  const dotColor =
    status === "done"   ? "bg-green-500" :
    status === "edited" ? "bg-amber-400" :
    "bg-gray-300";

  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-2.5 flex items-center gap-2.5 border-b border-gray-50 transition border-l-2 ${
        isSelected
          ? "bg-indigo-50 border-l-indigo-500"
          : "hover:bg-gray-50 border-l-transparent"
      }`}
    >
      {/* Status dot */}
      <div className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`} />

      {/* Info */}
      <div className="flex-1 min-w-0">
        <p className={`text-xl font-semibold truncate leading-tight ${
          isSelected ? "text-indigo-700" : "text-gray-800"
        }`}>
          {studentName}
        </p>
        <p className="text-base text-gray-400 leading-tight mt-0.5">
          {studentId} · {marksObtained ?? 0}/{totalMarks}
        </p>
      </div>

      {/* Right icon */}
      {status === "done"
        ? <CheckCircle2 size={24} className="text-green-500 shrink-0" />
        : <ChevronRight size={24} className={`shrink-0 ${status === "edited" ? "text-amber-300" : "text-gray-300"}`} />
      }
    </button>
  );
}