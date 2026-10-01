"use client";

import { Check } from "lucide-react";
import { STAGE_LEGEND, type StageKey } from "./phases";

// The markers for the CURRENTLY-OPEN stage: that stage's status colours, the two error
// exclamations (soft/blocking), and — for review stages only — the maker/checker markers.

export default function StageLegend({ stage }: { stage: StageKey }) {
  const showReview = stage !== "scanning";
  return (
    <div className="flex items-center flex-wrap gap-x-4 gap-y-1.5">
      {STAGE_LEGEND[stage].map((item) => (
        <span key={item.label} className="inline-flex items-center gap-1.5 text-xs text-slate-600">
          <span className={`w-3.5 h-3.5 rounded-[3px] ${item.cls} ${item.anim ? "animate-pulse" : ""}`} />
          {item.label}
        </span>
      ))}

      <span className="w-px h-4 bg-slate-200" />
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
        <span className="grid place-items-center w-3.5 h-3.5 rounded-full bg-orange-500 text-white text-[8px] font-black leading-none">!</span>
        soft
      </span>
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
        <span className="grid place-items-center w-3.5 h-3.5 rounded-full bg-rose-600 text-white text-[8px] font-black leading-none">!</span>
        blocking
      </span>

      {showReview && (
        <>
          <span className="w-px h-4 bg-slate-200" />
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <span className="w-3 h-3 rounded-full bg-white ring-2 ring-emerald-400" />
            maker
          </span>
          <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
            <span className="grid place-items-center w-3.5 h-3.5 rounded-full bg-emerald-600 text-white">
              <Check size={9} strokeWidth={3.5} />
            </span>
            checked
          </span>
        </>
      )}
    </div>
  );
}
