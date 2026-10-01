"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, ChevronDown, ChevronRight, ChevronUp } from "lucide-react";
import type { Cell, SectionBoard } from "./scanboard";
import { projectStage, phaseStage, type StageKey } from "./phases";

// The student list for a section, shown INLINE beneath its row. Each answer-paper row shows
// its status + (if any) its ISSUE TEXT inline — no click needed — and expands to a detail
// panel with what we know today (status, last progress, review, placement) plus subtle
// placeholders for things still being worked out (reconciliation, workflow-driven edit/
// review history, re-run actions). Hovering a row lifts its cell above, and vice-versa.

function relTime(iso?: string | null): string | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return null;
  const mins = Math.max(0, Math.round((Date.now() - t) / 60000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const h = Math.floor(mins / 60);
  return h < 24 ? `${h}h ago` : `${Math.floor(h / 24)}d ago`;
}

const STAGE_TITLE: Record<StageKey, string> = {
  scanning: "Scanning & Uploading", chunking: "Answer Chunking", extraction: "Answer Extraction",
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-24 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400">{label}</span>
      <span className="flex-1 min-w-0 text-[12px] text-slate-700">{children}</span>
    </div>
  );
}

// A subtle "not built yet" line — marks info we know is coming but can't show today.
function Pending({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-slate-300 italic">
      <span className="w-1 h-1 rounded-full bg-slate-300 shrink-0" />
      {children}
    </div>
  );
}

function Row({
  cell,
  stage,
  hot,
  focused,
  showReview,
  onHover,
  rowRef,
}: {
  cell: Cell;
  stage: StageKey;
  hot: boolean;
  focused: boolean;
  showReview: boolean;
  onHover: (id: string | null) => void;
  rowRef?: (el: HTMLDivElement | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const v = projectStage(cell, stage);
  const err = v.error;
  const paperStage = phaseStage(cell.vis.phase); // the stage the paper actually sits in
  const last = relTime(cell.updatedAt);
  const reviewLabel = cell.review?.checker ? "Checked" : cell.review?.maker ? "Maker done" : null;

  return (
    <div ref={rowRef}>
      <div
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => onHover(cell.studentId)}
        onMouseLeave={() => onHover(null)}
        className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition ${
          hot ? "bg-slate-100" : "hover:bg-slate-50"
        } ${focused ? "ring-1 ring-indigo-300" : ""} ${v.state === "notyet" ? "opacity-60" : ""}`}
      >
        {open ? <ChevronDown size={13} className="shrink-0 text-slate-400" /> : <ChevronRight size={13} className="shrink-0 text-slate-300 group-hover:text-slate-400" />}
        <span className={`w-3 h-3 rounded-[3px] shrink-0 ${v.cls} ${v.anim ? "animate-pulse" : ""}`} />
        <span className="w-8 shrink-0 text-[11px] font-mono text-slate-400">{cell.roll}</span>
        <span className="min-w-0 max-w-[9rem] text-sm text-slate-800 truncate">{cell.name}</span>

        {/* ISSUE TEXT — shown inline on the row, no expand needed */}
        {err ? (
          <span className={`flex-1 min-w-0 inline-flex items-center gap-1 text-[12px] font-medium truncate ${err.level === "blocking" ? "text-rose-600" : "text-orange-600"}`}>
            <AlertTriangle size={12} className="shrink-0" /> <span className="truncate">{err.reason}</span>
          </span>
        ) : (
          <span className="flex-1" />
        )}

        {showReview && (cell.review?.checker ? (
          <span className="grid place-items-center w-3.5 h-3.5 rounded-full bg-emerald-600 text-white shrink-0"><Check size={9} strokeWidth={3.5} /></span>
        ) : cell.review?.maker ? (
          <span className="w-3 h-3 rounded-full bg-white ring-2 ring-emerald-400 shrink-0" />
        ) : null)}

        <span className="w-24 shrink-0 text-right text-[10px] font-semibold text-slate-500 truncate">{v.label}</span>
      </div>

      {/* expanded detail — only what we know, plus subtle placeholders */}
      {open && (
        <div onClick={(e) => e.stopPropagation()} className="ml-6 mr-1 mt-0.5 mb-1 px-3 py-2 rounded-lg bg-white ring-1 ring-slate-200 space-y-1.5">
          <Field label="Status">
            <span className="font-mono text-[11px] text-slate-600">{cell.status || "—"}</span>
            <span className="text-slate-400"> · {STAGE_TITLE[paperStage ?? "scanning"]}</span>
          </Field>
          {err && (
            <Field label="Issue">
              <span className={err.level === "blocking" ? "text-rose-600 font-medium" : "text-orange-600 font-medium"}>{err.reason}</span>
              <span className="text-slate-400"> ({err.level})</span>
            </Field>
          )}
          {last && <Field label="Last progress">{last}</Field>}
          {reviewLabel && <Field label="Review">{reviewLabel}</Field>}
          <Field label="Placement">
            {cell.misplaced ? <span className="text-orange-600">Not on this section&apos;s roster</span> : "On roster"}
          </Field>

          <div className="pt-1.5 mt-1 border-t border-slate-100 space-y-1">
            <Pending>Roster reconciliation detail — pending identity linkage</Pending>
            <Pending>Ops edits &amp; review history — with the workflow updates</Pending>
            <Pending>Re-run chunking / extraction — coming</Pending>
          </div>
        </div>
      )}
    </div>
  );
}

export default function StudentList({
  section,
  stage,
  hoveredId,
  focusedId,
  onHover,
  onCollapse,
}: {
  section: SectionBoard;
  stage: StageKey;
  hoveredId: string | null;
  focusedId: string | null;
  onHover: (id: string | null) => void;
  onCollapse: () => void;
}) {
  const focusRef = useRef<HTMLDivElement | null>(null);

  // Scroll the focused (just-clicked) student into view within the inline list.
  useEffect(() => {
    if (focusedId) focusRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusedId]);

  const showReview = stage !== "scanning";
  return (
    <div
      // Stop row-level clicks (which toggle the section) from firing inside the list.
      onClick={(e) => e.stopPropagation()}
      className="mt-2 ml-[3.75rem] rounded-xl bg-slate-50/80 ring-1 ring-slate-200"
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-200/80">
        <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Students · {section.cells.length}</span>
        <button onClick={onCollapse} className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-700">
          Collapse <ChevronUp size={13} />
        </button>
      </div>
      <div className="max-h-80 overflow-y-auto p-1.5 space-y-0.5">
        {section.cells.map((c) => (
          <Row
            key={c.id}
            cell={c}
            stage={stage}
            hot={hoveredId === c.studentId}
            focused={focusedId === c.studentId}
            showReview={showReview}
            onHover={onHover}
            rowRef={focusedId === c.studentId ? (el) => { focusRef.current = el; } : undefined}
          />
        ))}
      </div>
    </div>
  );
}
