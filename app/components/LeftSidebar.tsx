"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import StudentCard from "./StudentCard";

type FilterTab = "all" | "pending" | "saved";
type StudentStatus = "undone" | "edited" | "done";

interface Student {
  id: number | string;
  studentName: string;
  studentId: string;
  marksObtained: number;
  totalMarks: number;
  status: StudentStatus;
}

interface LeftSidebarProps {
  students?: Student[];
  selectedId?: number | string;
  onSelect?: (id: number | string) => void;
}

export default function LeftSidebar({
  students = [],
  selectedId,
  onSelect,
}: LeftSidebarProps) {
  const [activeTab,  setActiveTab]  = useState<FilterTab>("all");
  const [collapsed,  setCollapsed]  = useState(false);

  const counts = {
    all:     students.length,
    pending: students.filter((s) => s.status !== "done").length,
    saved:   students.filter((s) => s.status === "done").length,
  };

  const filtered = students.filter((s) => {
    if (activeTab === "pending") return s.status !== "done";
    if (activeTab === "saved")   return s.status === "done";
    return true;
  });

  const tabs: { key: FilterTab; label: string }[] = [
    { key: "all",     label: "All"     },
    { key: "pending", label: "Pending" },
    { key: "saved",   label: "Saved"   },
  ];

  // ── Collapsed state — just a thin strip with toggle button ──
  if (collapsed) {
    return (
      <aside className="flex flex-col items-center w-10 h-full border-r border-gray-200 bg-white shrink-0 pt-4 gap-3">
        {/* Toggle button */}
        <button
          onClick={() => setCollapsed(false)}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition"
          title="Expand sidebar"
        >
          <ChevronRight size={16} />
        </button>

        {/* Vertical student count */}
        <div className="flex flex-col items-center gap-1 mt-2">
          <span className="text-xs font-bold text-gray-400"
            style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
            {counts.all} students
          </span>
        </div>
      </aside>
    );
  }

  // ── Expanded state ──────────────────────────────────────────
  return (
    <aside className="flex flex-col w-[456px] h-full border-r border-gray-200 bg-white shrink-0">

      {/* Header row with collapse button */}
      <div className="flex items-center justify-between px-4 pt-4 pb-0 shrink-0">
        <span className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
          Students
        </span>
        <button
          onClick={() => setCollapsed(true)}
          className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-gray-100 text-gray-400 hover:text-indigo-600 transition"
          title="Collapse sidebar"
        >
          <ChevronLeft size={16} />
        </button>
      </div>

      {/* Filter tabs */}
      <div className="flex border-b border-gray-100 px-2 pt-4 shrink-0">
        {tabs.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`flex-1 pb-2 text-xl font-semibold border-b-2 transition-colors ${
              activeTab === key
                ? "text-indigo-600 border-indigo-500"
                : "text-gray-400 border-transparent hover:text-gray-600"
            }`}
          >
            {label}{" "}
            <span className="opacity-50">({counts[key]})</span>
          </button>
        ))}
      </div>

      {/* Student list */}
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <p className="text-xs text-gray-400 text-center mt-8">No students</p>
        ) : (
          filtered.map((s) => (
            <StudentCard
              key={s.id}
              studentName={s.studentName}
              studentId={s.studentId}
              marksObtained={s.marksObtained}
              totalMarks={s.totalMarks}
              status={s.status}
              isSelected={selectedId === s.id}
              onClick={() => onSelect?.(s.id)}
            />
          ))
        )}
      </div>

    </aside>
  );
}