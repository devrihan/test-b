"use client";

import { useMemo } from "react";
import { X, AlertTriangle } from "lucide-react";
import { STAGE_DEFS, stageMetrics } from "./phases";
import { granularityOf, granValue, scopeLabel, type Scope, type SectionBoard } from "./scanboard";

// The error roll-up drawer (right side). Summarises warnings/blockers across the CURRENT
// scope, organised by stage (Scanning / Chunking / Extraction) and, within each stage, by
// the values at the selected granularity (the deepest unselected scope level — schools,
// grades, subjects, or sections). Answers "where are the errors right now?".

const GRAN_LABEL: Record<ReturnType<typeof granularityOf>, string> = {
  school: "school", grade: "grade", subject: "subject", section: "section",
};

export default function ErrorDrawer({
  sections,
  scope,
  onClose,
}: {
  sections: SectionBoard[];
  scope: Scope;
  onClose: () => void;
}) {
  const gran = granularityOf(scope);

  // Group the in-scope sections by the current granularity value, then tally per stage.
  const perStage = useMemo(() => {
    const groups = new Map<string, SectionBoard[]>();
    for (const s of sections) {
      const v = granValue(s, gran);
      (groups.get(v) ?? groups.set(v, []).get(v)!).push(s);
    }
    return STAGE_DEFS.map((stage) => {
      const rows = [...groups.entries()]
        .map(([value, secs]) => {
          const m = stageMetrics(secs.flatMap((s) => s.cells), stage.key);
          return { value, blocking: m.blocking, soft: m.soft };
        })
        .filter((r) => r.blocking > 0 || r.soft > 0)
        .sort((a, b) => b.blocking - a.blocking || b.soft - a.soft);
      const blocking = rows.reduce((n, r) => n + r.blocking, 0);
      const soft = rows.reduce((n, r) => n + r.soft, 0);
      return { stage, rows, blocking, soft };
    });
  }, [sections, gran]);

  const totalBlocking = perStage.reduce((n, s) => n + s.blocking, 0);
  const totalSoft = perStage.reduce((n, s) => n + s.soft, 0);

  return (
    <aside className="shrink-0 w-80 flex flex-col bg-white border-l border-slate-200">
      <header className="shrink-0 flex items-start justify-between gap-2 px-4 py-3 border-b border-slate-100">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-800">Issues</h3>
          <p className="text-[11px] text-slate-500 truncate">{scopeLabel(scope)}</p>
          <div className="mt-1 flex items-center gap-3 text-[11px]">
            <span className="inline-flex items-center gap-1 text-rose-600 font-semibold">
              <span className="grid place-items-center w-3.5 h-3.5 rounded-full bg-rose-600 text-white text-[8px] font-black leading-none">!</span>
              {totalBlocking} blocked
            </span>
            <span className="inline-flex items-center gap-1 text-orange-600 font-semibold">
              <span className="grid place-items-center w-3.5 h-3.5 rounded-full bg-orange-500 text-white text-[8px] font-black leading-none">!</span>
              {totalSoft} warnings
            </span>
          </div>
        </div>
        <button onClick={onClose} aria-label="Close" className="grid place-items-center w-7 h-7 rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700 shrink-0">
          <X size={16} />
        </button>
      </header>

      <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-4">
        {totalBlocking === 0 && totalSoft === 0 ? (
          <p className="text-center text-sm text-slate-400 mt-8">No errors in this scope. 🎉</p>
        ) : (
          perStage.map(({ stage, rows, blocking, soft }) => (
            <div key={stage.key}>
              <div className="flex items-center justify-between px-1 pb-1.5 border-b border-slate-100">
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-500">{stage.title}</span>
                <span className="text-[10px] text-slate-400">
                  {blocking + soft === 0 ? "clean" : `${blocking + soft} by ${GRAN_LABEL[gran]}`}
                </span>
              </div>
              {rows.length === 0 ? (
                <p className="px-1 py-1.5 text-[11px] text-slate-300">no errors</p>
              ) : (
                <div className="mt-1 space-y-0.5">
                  {rows.map((r) => (
                    <div key={r.value} className="flex items-center gap-2 px-1.5 py-1 rounded-lg hover:bg-slate-50">
                      <span className="flex-1 min-w-0 text-sm text-slate-700 truncate">{r.value}</span>
                      {r.blocking > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700">
                          <AlertTriangle size={11} /> {r.blocking}
                        </span>
                      )}
                      {r.soft > 0 && (
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-orange-600">
                          <AlertTriangle size={11} /> {r.soft}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </aside>
  );
}
