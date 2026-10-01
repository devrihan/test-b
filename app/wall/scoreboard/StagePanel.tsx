"use client";

import type { ReactNode } from "react";
import { ChevronRight, ChevronLeft } from "lucide-react";

// A pipeline stage as a collapsible panel. Click toggles it: an open stage collapses,
// a collapsed stage opens (the page closes whichever was open — accordion). Every
// state has a clear hover highlight so it reads as interactive.

export default function StagePanel({
  title,
  expanded,
  onToggle,
  enabled = true,
  rollup,
  rollupCompact,
  children,
}: {
  title: string;
  expanded: boolean;
  onToggle: () => void;
  /** false → a not-yet-wired stage: muted, still openable to a stub. */
  enabled?: boolean;
  /** "X/Y done for {scope}" — shown centred in the expanded header. */
  rollup?: ReactNode;
  /** Compact "X/Y" — shown on the collapsed bar so the count is visible without opening. */
  rollupCompact?: ReactNode;
  children?: ReactNode;
}) {
  if (!expanded) {
    return (
      <button
        onClick={onToggle}
        title={enabled ? `Open ${title}` : `${title} — not wired yet`}
        className={`group shrink-0 w-14 self-stretch rounded-2xl border transition flex flex-col items-center py-3 gap-2 cursor-pointer ${
          enabled
            ? "bg-white border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 hover:w-16"
            : "bg-slate-50 border-dashed border-slate-200 text-slate-400 hover:bg-slate-100"
        }`}
      >
        {/* compact "12/43" — horizontal, pinned at the top of the bar */}
        {rollupCompact != null && (
          <span className="shrink-0 text-[11px] font-bold tabular-nums text-slate-600 select-none">
            {rollupCompact}
          </span>
        )}
        <ChevronRight size={16} className="text-slate-400 group-hover:text-indigo-500 shrink-0" />
        <span className="flex-1 grid place-items-center text-xs font-bold uppercase tracking-widest text-slate-500 group-hover:text-indigo-600 [writing-mode:vertical-rl] rotate-180 select-none">
          {title}
        </span>
      </button>
    );
  }

  return (
    <section className="flex-1 min-w-0 flex flex-col rounded-2xl bg-white ring-1 ring-slate-200 overflow-hidden">
      <button
        onClick={onToggle}
        title={`Collapse ${title}`}
        className="group shrink-0 px-4 h-11 flex items-center gap-3 bg-slate-800 hover:bg-slate-700 text-white transition cursor-pointer"
      >
        <h2 className="text-sm font-bold tracking-wide shrink-0">{title}</h2>
        {rollup && (
          <span className="flex-1 min-w-0 text-center text-[13px] font-medium text-slate-200 truncate">{rollup}</span>
        )}
        <span className="flex items-center gap-1 text-[11px] text-slate-300 group-hover:text-white shrink-0 ml-auto">
          Collapse <ChevronLeft size={14} />
        </span>
      </button>
      <div className="flex-1 min-h-0 overflow-y-auto p-2">{children}</div>
    </section>
  );
}
