"use client";

import { AlertTriangle } from "lucide-react";
import type { Cell, SectionBoard } from "./scanboard";
import { stageMetrics, type StageKey } from "./phases";
import { PaperCells } from "./cells";
import StudentList from "./StudentDrawer";

// One section row: a grade·section tile, STAGE-SCOPED metric chips, then the cells grid.
// Clicking the row toggles its inline student list open/closed; clicking a cell opens it
// focused on that student. Hover highlights flow both ways between cells and list rows.

function Chip({ n, label, tone }: { n: number; label: string; tone: string }) {
  if (n === 0) return null;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold ${tone}`}>
      {n} {label}
    </span>
  );
}

export default function SectionRow({
  section,
  stage,
  hoveredId,
  focusedId,
  onHover,
  onPick,
  onToggle,
  active,
}: {
  section: SectionBoard;
  stage: StageKey;
  hoveredId: string | null;
  focusedId: string | null;
  onHover: (id: string | null) => void;
  onPick: (section: SectionBoard, c: Cell) => void;
  onToggle: (section: SectionBoard) => void;
  active: boolean;
}) {
  const m = stageMetrics(section.cells, stage);
  return (
    <div
      onClick={() => onToggle(section)}
      className={`px-3 py-2.5 rounded-xl transition cursor-pointer ${
        active ? "bg-indigo-50/60 ring-1 ring-indigo-200" : "hover:bg-slate-100 hover:ring-1 hover:ring-slate-200"
      }`}
    >
      <div className="flex items-start gap-3">
        {/* section tile */}
        <div className="shrink-0 w-12 h-12 grid place-items-center rounded-lg bg-amber-50 ring-1 ring-amber-200 leading-tight">
          <span className="text-[10px] font-medium text-amber-700">{section.grade}</span>
          <span className="text-base font-extrabold text-amber-800 -mt-0.5">{section.section}</span>
        </div>

        <div className="min-w-0 flex-1">
          {/* stage-scoped metrics */}
          <div className="flex items-center flex-wrap gap-1.5">
            <span className="text-xs font-semibold text-slate-700 tabular-nums">
              {m.papers}{section.expected != null ? ` / ${section.expected}` : ""} papers
            </span>
            <Chip n={m.inStage} label="in stage" tone="bg-amber-100 text-amber-700" />
            <Chip n={m.cleared} label="cleared" tone="bg-emerald-100 text-emerald-700" />
            <Chip n={m.notYet} label="not yet" tone="bg-slate-100 text-slate-500" />
            <Chip n={m.missing} label="missing" tone="bg-slate-100 text-slate-600" />
            {m.soft > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-orange-100 text-orange-700">
                <AlertTriangle size={11} /> {m.soft} warning{m.soft > 1 ? "s" : ""}
              </span>
            )}
            {m.blocking > 0 && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-semibold bg-rose-100 text-rose-700">
                <AlertTriangle size={11} /> {m.blocking} blocked
              </span>
            )}
            {section.rosterUnlinked && (
              <span className="text-[11px] text-slate-400 italic">roster unlinked</span>
            )}
          </div>
          {/* cells */}
          <div className="mt-2">
            <PaperCells
              cells={section.cells}
              stage={stage}
              hoveredId={hoveredId}
              onHover={onHover}
              onPick={(c) => onPick(section, c)}
            />
          </div>
        </div>
      </div>

      {/* inline, collapsible student list */}
      {active && (
        <StudentList
          section={section}
          stage={stage}
          hoveredId={hoveredId}
          focusedId={focusedId}
          onHover={onHover}
          onCollapse={() => onToggle(section)}
        />
      )}
    </div>
  );
}
