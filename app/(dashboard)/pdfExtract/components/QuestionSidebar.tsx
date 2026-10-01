import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Question, MarkMode } from "../types";
import { getQuestionColor } from "../constants";

type Props = {
  questions: Question[];
  activeQId: number | null;
  markMode: MarkMode;
  numQ: number;
  doneCount: number;
  onSelectQ: (id: number) => void;
  onBeginMark: (qId: number, mode: "drawing") => void;
  onDeleteRegion: (qId: number, regionId: string) => void;
  onClearQ: (qId: number) => void;
  onDownloadOne: (qId: number) => void;
  onClearAll: () => void;
  onReset: () => void;
  onVerify: (qId: number) => void;
  onSetNa: (qId: number) => void;
  onFillRemainingNa: () => void;
  mode?: "marking" | "answerKey";
};

export default function QuestionSidebar({
  questions,
  activeQId,
  markMode,
  numQ,
  doneCount,
  onSelectQ,
  onBeginMark,
  onDeleteRegion,
  onClearQ,
  onDownloadOne,
  onClearAll,
  onReset,
  onVerify,
  onSetNa,
  onFillRemainingNa,
  mode = "marking",
}: Props) {
  const isAK = mode === "answerKey";
  const [collapsed, setCollapsed] = useState(false);

  // Group questions by their base identifier (e.g. 23.1 -> 23)
  const groupedQuestions = useMemo(() => {
    const groups: { baseId: string; children: Question[] }[] = [];
    const groupMap = new Map<string, number>();

    questions.forEach((q) => {
      const key = q.questionKey.toUpperCase();
      const cleanMain = key.startsWith("Q") ? key.substring(1) : key;
      const cleanKey = cleanMain.includes("_OR_") ? cleanMain.split("_OR_")[0] : cleanMain;

      let basePart = cleanKey;
      if (cleanKey.includes('.')) {
        basePart = cleanKey.split('.')[0];
      } else {
        const numMatch = cleanKey.match(/^(\d+)/);
        if (numMatch) basePart = numMatch[1];
      }

      if (!groupMap.has(basePart)) {
        groupMap.set(basePart, groups.length);
        groups.push({ baseId: basePart, children: [] });
      }
      groups[groupMap.get(basePart)!].children.push(q);
    });

    return groups;
  }, [questions]);

  const renderQuestionRow = (q: Question, isIndented: boolean, isLastSub: boolean) => {
    const qi = questions.indexOf(q);
    const c = getQuestionColor(qi);
    const isActive = activeQId === q.id;
    const isDone = q.regions.length > 0 || q.isNa;
    const isDrawing = isActive && markMode === "drawing";
    const hasAI = q.regions.some(r => r.source === "ai");

    return (
      <div key={q.id} className="relative">
        {/* ── Collapsed row ── */}
        <div
          className={`
            flex items-center gap-2.5 ${collapsed ? "px-0 justify-center" : (isIndented ? "pl-10 pr-4" : "px-4")} py-2.5
            cursor-pointer border-l-2 transition-colors select-none
            ${isActive
              ? "bg-indigo-50 border-indigo-500"
              : isDone
                ? "border-green-400 bg-white hover:bg-gray-50"
                : "border-transparent bg-white hover:bg-gray-50"
            }
          `}
          onClick={() => onSelectQ(q.id)}
        >
          {/* Color dot */}
          <div
            className={`${collapsed ? "w-8 h-8 text-[10px] font-bold text-white flex items-center justify-center rounded-lg" : "w-2 h-2 rounded-full"} shrink-0`}
            style={{ background: c }}
            title={collapsed ? q.questionKey.toUpperCase() : undefined}
          >
            {collapsed ? q.questionKey.toUpperCase() : null}
          </div>

          {/* Question label */}
          {!collapsed && (
            <span className={`text-sm font-semibold flex-1 ${isActive ? "text-indigo-700" : "text-gray-700"}`}>
              {(() => {
                const key = q.questionKey.toUpperCase();
                const cleanMain = key.startsWith("Q") ? key.substring(1) : key;
                let cleanKey = cleanMain.includes("_OR_") ? cleanMain.split("_OR_")[0] : cleanMain;
                
                if (isIndented) {
                  const prefix = isLastSub ? "└─ " : "├─ ";
                  cleanKey = `${prefix}${cleanKey}`;
                }

                return cleanKey;
              })()}
            </span>
          )}

          {/* OR badge */}
          {!collapsed && q.isOptional && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 bg-purple-50 text-purple-600 border border-purple-200 rounded shrink-0">
              OR
            </span>
          )}

          {/* AI badge */}
          {!collapsed && !isAK && hasAI && !q.verified && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 bg-amber-50 text-amber-600 border border-amber-200 rounded shrink-0">
              AI
            </span>
          )}

          {/* Verified badge */}
          {!collapsed && !isAK && q.verified && !q.isNa && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 bg-green-50 text-green-600 border border-green-200 rounded shrink-0">
              ✓
            </span>
          )}

          {/* NA badge */}
          {!collapsed && q.isNa && (
            <span className="text-[9px] font-bold px-1.5 py-0.5 bg-gray-100 text-gray-500 border border-gray-200 rounded">
              NA
            </span>
          )}

          {/* Region count */}
          {!collapsed && q.regions.length > 0 && (
            <span className="text-[10px] text-gray-400 font-medium">
              {q.regions.length}r
            </span>
          )}
        </div>

        {/* ── Expanded panel ── */}
        {isActive && !collapsed && (
          <div className={`px-4 pb-3 pt-2 bg-indigo-50 border-l-2 border-indigo-500 ${isIndented ? "ml-6" : ""}`}>
            {/* Regions list */}
            {q.regions.length > 0 && (
              <div className="mb-2.5 space-y-1">
                {q.regions
                  .sort((a, b) => a.order - b.order)
                  .map(region => (
                    <div
                      key={region.regionId}
                      className="flex items-center gap-1.5 text-xs font-mono text-gray-500 bg-white rounded-lg px-2 py-1.5 border border-gray-100"
                    >
                      {/* Order badge */}
                      <div
                        className="w-4 h-4 rounded flex items-center justify-center text-white shrink-0"
                        style={{ background: c, fontSize: 9, fontWeight: 700 }}
                      >
                        {region.order}
                      </div>

                      {/* Image ID */}
                      <span className="flex-1 truncate text-gray-400">
                        {region.imgId}
                      </span>

                      {/* AI confidence */}
                      {region.source === "ai" && region.confidence !== null && (
                        <span className="text-amber-500 text-[9px] font-bold shrink-0">
                          {Math.round(region.confidence * 100)}%
                        </span>
                      )}

                      {/* Delete region button */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onDeleteRegion(q.id, region.regionId);
                        }}
                        className="text-gray-300 hover:text-red-400 transition shrink-0 text-xs"
                        title="Delete this region"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
              </div>
            )}

            {/* Empty state */}
            {q.regions.length === 0 && !q.isNa && (
              <p className="text-xs text-gray-400 mb-2.5">
                No regions yet. Click Draw to add one.
              </p>
            )}

            {/* NA state */}
            {q.isNa && (
              <p className="text-xs text-gray-500 font-medium mb-2.5 bg-gray-100 px-2 py-1.5 rounded-lg border border-gray-200">
                Marked as Not Applicable
              </p>
            )}

            {/* Action buttons */}
            <div className="flex gap-1.5 flex-wrap">

              {/* Draw button */}
              <button
                onClick={() => onBeginMark(q.id, "drawing")}
                className={`
                  px-2.5 py-1 rounded-lg text-xs font-semibold border transition
                  ${isDrawing
                    ? "bg-amber-100 border-amber-400 text-amber-700 animate-pulse"
                    : "bg-white border-gray-200 text-gray-600 hover:border-indigo-400 hover:text-indigo-600"
                  }
                `}
              >
                {isDrawing ? "⊙ Drag PDF…" : "⬚ Draw"}
              </button>

              {/* NA button — not relevant for answer keys */}
              {!isAK && q.regions.length === 0 && !q.isNa && (
                <button
                  onClick={() => onSetNa(q.id)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-gray-200 bg-gray-50 text-gray-500 hover:bg-gray-100 transition"
                >
                  NA
                </button>
              )}

              {/* Verify button — not relevant for answer keys */}
              {!isAK && !q.verified && q.regions.length > 0 && (
                <button
                  onClick={() => onVerify(q.id)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-green-200 bg-green-50 text-green-700 hover:bg-green-100 transition"
                >
                  ✓ Verify
                </button>
              )}

              {/* Clear all regions button */}
              {(q.regions.length > 0 || q.isNa) && (
                <button
                  onClick={() => onClearQ(q.id)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-gray-200 bg-white text-gray-400 hover:border-red-300 hover:text-red-500 transition"
                >
                  ✕ Clear
                </button>
              )}

              {/* Download button — not relevant for answer keys */}
              {!isAK && q.regions.length > 0 && (
                <button
                  onClick={() => onDownloadOne(q.id)}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold border border-indigo-200 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 transition"
                >
                  ↓ PNG
                </button>
              )}

            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className={`${collapsed ? "w-14" : "w-64"} bg-white border-r border-gray-200 flex flex-col overflow-hidden shrink-0 transition-[width] duration-200`}>

      {/* ── Header ── */}
      <div className={`${collapsed ? "px-2 justify-center" : "px-4 justify-between"} py-3 border-b border-gray-100 flex items-center shrink-0`}>
        {!collapsed && (
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
              Questions
            </span>
            {doneCount > 0 && (
              <span className="text-xs font-bold px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 rounded-full">
                {doneCount}/{numQ} done
              </span>
            )}
          </div>
        )}
        <button
          type="button"
          onClick={() => setCollapsed(v => !v)}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-400 transition shrink-0"
          title={collapsed ? "Expand questions" : "Collapse questions"}
          aria-label={collapsed ? "Expand questions" : "Collapse questions"}
        >
          {collapsed ? <ChevronRight size={15} /> : <ChevronLeft size={15} />}
        </button>
      </div>

      {/* ── Question list ── */}
      <div className="flex-1 overflow-y-auto py-1">
        {groupedQuestions.map((group) => {
          // Find the primary question in this group (if any)
          const mainQuestion = group.children.find(q => {
            const k = q.questionKey.toUpperCase();
            const cMain = k.startsWith("Q") ? k.substring(1) : k;
            const cKey = cMain.includes("_OR_") ? cMain.split("_OR_")[0] : cMain;
            return cKey === group.baseId && !q.isOrQuestion;
          });

          const subQuestions = group.children.filter(q => q !== mainQuestion);

          return (
            <div key={`group-${group.baseId}`} className="mb-1">
              {/* Render main question or dummy header */}
              {mainQuestion ? (
                renderQuestionRow(mainQuestion, false, false)
              ) : (
                subQuestions.length > 0 && !collapsed && (
                  <div className="px-4 py-1.5 text-xs font-bold text-gray-400 uppercase tracking-wider">
                    {group.baseId}
                  </div>
                )
              )}

              {/* Render subquestions */}
              {subQuestions.map((sq, i) => (
                <div key={sq.id}>
                  {/* ── OR separator between consecutive optional sub-questions ── */}
                  {i > 0 && sq.isOptional && subQuestions[i - 1].isOptional && !collapsed && (
                    <div className="flex items-center pl-[72px] py-0.5 select-none">
                      <span className="text-[10px] font-bold tracking-widest text-amber-500 leading-none">
                        OR
                      </span>
                    </div>
                  )}
                  {renderQuestionRow(sq, true, i === subQuestions.length - 1)}
                </div>
              ))}
            </div>
          );
        })}
      </div>

      {/* ── Footer ── */}
      {!collapsed && (
        <div className="p-3 border-t border-gray-100 flex flex-col gap-2 shrink-0">
          {!isAK && (
            <button
              onClick={onFillRemainingNa}
              className="w-full h-8 text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg transition border border-gray-200"
            >
              Fill Remaining as NA
            </button>
          )}
          <div className="flex gap-2">
            <button
              onClick={onClearAll}
              className="flex-1 h-8 text-xs font-semibold bg-gray-100 hover:bg-red-50 hover:text-red-600 text-gray-600 rounded-lg transition"
            >
              ✕ Clear All
            </button>
            <button
              onClick={onReset}
              className="flex-1 h-8 text-xs font-semibold bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition"
            >
              ↺ Reset
            </button>
          </div>
        </div>
      )}

    </aside>
  );
}
