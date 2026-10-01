"use client";

import { Check } from "lucide-react";
import type { Cell } from "./scanboard";
import { projectStage, type StageKey } from "./phases";

// One paper as a cell, coloured by its status SCOPED TO THE CURRENT STAGE: while in the
// stage it shows the real sub-status (pulse if compute is in flight), once past it reads
// "cleared" (green), before it "not yet" (grey), and a missing roster student is a dashed
// ghost (scanning stage only). Overlays — the error exclamation (red blocking / orange
// soft, also stage-scoped) and the review circle/tick — sit on top. Hovering a cell lifts
// the matching student in the inline list (driven by the row).

function ErrorBadge({ level }: { level: "soft" | "blocking" }) {
  // Floats above the box (centred) so it reads as an alert and isn't clipped by neighbours.
  return (
    <span
      className={`absolute -top-2.5 left-1/2 -translate-x-1/2 z-20 grid place-items-center w-3 h-3 rounded-full text-white text-[8px] font-black leading-none shadow ${
        level === "blocking" ? "bg-rose-600" : "bg-orange-500"
      }`}
    >
      !
    </span>
  );
}

function ReviewBadge({ maker, checker }: { maker: boolean; checker: boolean }) {
  if (checker)
    return (
      <span className="absolute -bottom-1 -right-1 grid place-items-center w-3 h-3 rounded-full bg-emerald-600 text-white shadow">
        <Check size={8} strokeWidth={3.5} />
      </span>
    );
  if (maker)
    return <span className="absolute -bottom-1 -right-1 w-2.5 h-2.5 rounded-full bg-white ring-2 ring-emerald-400 shadow" />;
  return null;
}

export function PaperCells({
  cells,
  stage,
  hoveredId,
  onHover,
  onPick,
}: {
  cells: Cell[];
  stage: StageKey;
  hoveredId: string | null;
  onHover: (id: string | null) => void;
  onPick: (c: Cell) => void;
}) {
  if (cells.length === 0) {
    return <span className="text-[11px] text-slate-300">no papers yet</span>;
  }
  // Review markers are a maker/checker (answers-stage) concern — irrelevant to scanning.
  const showReview = stage !== "scanning";
  return (
    <div className="flex flex-wrap gap-1.5">
      {cells.map((c) => {
        const v = projectStage(c, stage);
        const hot = hoveredId === c.studentId;
        return (
          <button
            key={c.id}
            title={`${c.roll && c.roll !== "—" ? `#${c.roll} ` : ""}${c.name} — ${v.hover}`}
            onMouseEnter={() => onHover(c.studentId)}
            onMouseLeave={() => onHover(null)}
            onClick={(e) => { e.stopPropagation(); onPick(c); }}
            className={`relative w-5 h-5 rounded-[4px] ${v.cls} ${v.anim ? "animate-pulse" : ""} ${
              v.state === "missing" ? "opacity-80" : "shadow-sm"
            } transition ${hot ? "ring-2 ring-offset-1 ring-slate-800 scale-125 z-10" : "hover:scale-110"}`}
          >
            {v.error && <ErrorBadge level={v.error.level} />}
            {showReview && c.review && <ReviewBadge maker={c.review.maker} checker={c.review.checker} />}
          </button>
        );
      })}
    </div>
  );
}
