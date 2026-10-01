"use client";
import { useState, useEffect, useRef, useMemo, Fragment } from "react";
import { ArrowLeft, Loader2, Check, Upload, AlertCircle, ChevronDown, FileText } from "lucide-react";
import { InlineMath, BlockMath } from "react-katex";
import { useBloomsMapping, type BloomSuggestion } from "../hooks/useBloomsMapping";
import { buildUiGroups } from "../lib/questionGroups";
import { usePersistentState } from "../../../lib/usePersistentState";
import type { QuestionBloomRow, SaveStatus } from "../lib/types";

function LatexText({ text }: { text: string }) {
  const parts = text.split(/(\$\$[\s\S]*?\$\$|\$[^$\n]*?\$|\\\[[\s\S]*?\\\]|\\\(.*?\\\))/g);
  return (
    <>
      {parts.map((part, i) => {
        try {
          if ((part.startsWith("$$") && part.endsWith("$$")) || (part.startsWith("\\[") && part.endsWith("\\]")))
            return <BlockMath key={i} math={part.slice(2, -2)} />;
          if (part.startsWith("$") && part.endsWith("$"))
            return <InlineMath key={i} math={part.slice(1, -1)} />;
          if (part.startsWith("\\(") && part.endsWith("\\)"))
            return <InlineMath key={i} math={part.slice(2, -2)} />;
        } catch {
          return <span key={i}>{part}</span>;
        }
        return <span key={i}>{part}</span>;
      })}
    </>
  );
}

const BLOOM_OPTIONS = ["Knowledge", "Understanding", "Application", "Skill"];
const DIFF_OPTIONS  = ["Easy", "Moderate", "Hard"];

type Filter = "all" | "unmapped" | "mapped";
type PickerTarget = { questionId: number; field: "bloom" | "difficulty" } | null;

function Facet({
  placeholder, value, options, onChange,
}: {
  placeholder: string;
  value: string;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className={`h-8 pl-3 pr-7 text-xs border rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-400 appearance-none transition ${
          value
            ? "border-indigo-300 text-indigo-700 font-semibold"
            : "border-gray-200 text-gray-500 hover:border-gray-300"
        }`}
      >
        <option value="">{placeholder}</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
    </div>
  );
}

function TagPicker({
  options, value, onSelect, align = "left",
}: {
  options: string[];
  value: string | null;
  onSelect: (v: string | null) => void;
  align?: "left" | "right";
}) {
  return (
    <div className={`absolute z-50 top-full mt-1 ${align === "right" ? "right-0" : "left-0"} w-36 bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden`}>
      {value != null && (
        <button
          onClick={() => onSelect(null)}
          className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-red-50 transition border-b border-gray-100"
        >
          — Clear
        </button>
      )}
      {options.map(o => (
        <button
          key={o}
          onClick={() => onSelect(o)}
          className={`w-full text-left px-3 py-1.5 text-xs transition flex items-center gap-2 ${
            value === o ? "bg-indigo-50 text-indigo-700 font-semibold" : "text-gray-700 hover:bg-gray-50"
          }`}
        >
          {value === o ? <Check size={10} className="text-indigo-600 shrink-0" /> : <span className="w-2.5 shrink-0" />}
          {o}
        </button>
      ))}
    </div>
  );
}

function Chip({
  value, placeholder, ss, showAi, onClick, disabled,
}: {
  value: string | null;
  placeholder: string;
  ss: SaveStatus;
  showAi: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  if (ss === "saving") {
    return (
      <span className="inline-flex items-center justify-center gap-1.5 h-7 px-2 rounded-lg text-xs text-indigo-400 bg-indigo-50 border border-indigo-100 w-full">
        <Loader2 size={11} className="animate-spin" />
      </span>
    );
  }
  if (ss === "saved") {
    return (
      <span className="inline-flex items-center justify-center gap-1.5 h-7 px-2 rounded-lg text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 font-medium w-full">
        <Check size={12} />
      </span>
    );
  }
  if (value) {
    return (
      <button
        onClick={onClick}
        disabled={disabled}
        title={value}
        className={`inline-flex items-center gap-1 h-7 pl-2.5 pr-1.5 rounded-lg text-xs font-medium w-full transition disabled:opacity-40 ${
          showAi
            ? "bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100"
            : ss === "error"
            ? "bg-red-50 text-red-500 border border-red-200"
            : "bg-gray-50 text-gray-700 border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40"
        }`}
      >
        <span className="truncate flex-1 text-left">{value}</span>
        <ChevronDown size={11} className="shrink-0 opacity-40" />
      </button>
    );
  }
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center justify-center gap-1 h-7 px-2 rounded-lg text-xs border border-dashed border-gray-300 text-gray-400 hover:border-indigo-400 hover:text-indigo-500 transition disabled:opacity-40 w-full"
    >
      {placeholder} <ChevronDown size={11} className="opacity-40" />
    </button>
  );
}

export default function BloomsMappingScreen({ onBack }: { onBack: () => void }) {
  const {
    filteredPapers, facets, filters, setPaperFilter, resetFilters,
    paperId, selectPaper,
    questions, pdfUrl,
    loading, error,
    saveStates, assignBlooms,
    mapped, total,
    aiSuggestions, blueprintMeta, aiRunning, aiError, savingAll,
    uploadBlueprint, saveAllSuggestions, dismissSuggestions, clearSuggestion,
  } = useBloomsMapping();

  const [showPdf, setShowPdf] = useState(false);
  const [pickerOpen, setPickerOpen] = useState<PickerTarget>(null);
  const [filter, setFilter] = usePersistentState<Filter>("bm:tab", "all");
  const pickerRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const inReview = aiSuggestions !== null;
  const unmapped = total - mapped;
  const pct = total > 0 ? Math.round((mapped / total) * 100) : 0;
  const hasActiveFilter = !!(filters.academicYearId || filters.schoolId || filters.gradeId || filters.subjectId || filters.examType);

  const visible = useMemo(() => {
    if (filter === "mapped")   return questions.filter(q => q.difficultyLevel != null && q.bloomTaxonomy != null);
    if (filter === "unmapped") return questions.filter(q => q.difficultyLevel == null || q.bloomTaxonomy == null);
    return questions;
  }, [questions, filter]);

  const groups = useMemo(() => buildUiGroups(visible), [visible]);

  const Tab = ({ id, label, count }: { id: Filter; label: string; count: number }) => (
    <button
      onClick={() => setFilter(id)}
      className={`px-3 py-1 text-xs font-medium rounded-md transition-all ${
        filter === id
          ? "bg-white text-indigo-600 shadow-sm font-semibold"
          : "text-gray-500 hover:text-gray-700"
      }`}
    >
      {label} <span className="tabular-nums opacity-70">{count}</span>
    </button>
  );

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadBlueprint(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const renderRow = (q: QuestionBloomRow) => {
    const label = q.questionNumber != null ? String(q.questionNumber) : (q.questionLabel || "—");
    const ss = saveStates[q.id] ?? "idle";
    const suggestion: BloomSuggestion | null = aiSuggestions?.[q.id] ?? null;
    const showAi = inReview && !!suggestion;

    const currentBloom = showAi ? suggestion!.bloomTaxonomy : q.bloomTaxonomy;
    const currentDiff  = showAi ? suggestion!.difficultyLevel : q.difficultyLevel;
    const isMapped = q.difficultyLevel != null && q.bloomTaxonomy != null;

    const commit = (field: "bloom" | "difficulty", value: string | null) => {
      const nextBloom = field === "bloom" ? value : currentBloom;
      const nextDiff  = field === "difficulty" ? value : currentDiff;
      assignBlooms(q.id, nextDiff, nextBloom);
      if (showAi) clearSuggestion(q.id);
      setPickerOpen(null);
    };

    return (
      <div
        key={q.id}
        className={`grid grid-cols-[52px_1fr_48px_150px_120px] items-start gap-4 px-5 py-3.5 transition-colors ${
          pickerOpen?.questionId === q.id ? "bg-indigo-50/30" : "hover:bg-gray-50/60"
        }`}
      >
        <div className="flex items-center gap-1.5 pt-0.5">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isMapped ? "bg-indigo-500" : "bg-gray-200"}`} />
          <span className="font-mono text-xs font-semibold text-gray-400 leading-none">{label}</span>
        </div>

        <div className="pt-0.5 min-w-0">
          <div className="text-sm text-gray-800 leading-relaxed line-clamp-2">
            {q.questionText
              ? <LatexText text={q.questionText} />
              : <span className="text-gray-300 italic text-xs">No question text</span>}
          </div>
        </div>

        <div className="pt-1 text-right">
          {q.maxMarks != null && (
            <span className="text-xs text-gray-400 tabular-nums">{q.maxMarks}m</span>
          )}
        </div>

        <div className="relative pt-0.5">
          <Chip
            value={currentBloom}
            placeholder="Bloom's"
            ss={ss}
            showAi={showAi}
            disabled={aiRunning}
            onClick={() => setPickerOpen(p => p?.questionId === q.id && p.field === "bloom" ? null : { questionId: q.id, field: "bloom" })}
          />
          {pickerOpen?.questionId === q.id && pickerOpen.field === "bloom" && (
            <div ref={pickerRef}>
              <TagPicker options={BLOOM_OPTIONS} value={currentBloom} onSelect={v => commit("bloom", v)} />
            </div>
          )}
        </div>

        <div className="relative pt-0.5">
          <Chip
            value={currentDiff}
            placeholder="Difficulty"
            ss={ss}
            showAi={showAi}
            disabled={aiRunning}
            onClick={() => setPickerOpen(p => p?.questionId === q.id && p.field === "difficulty" ? null : { questionId: q.id, field: "difficulty" })}
          />
          {pickerOpen?.questionId === q.id && pickerOpen.field === "difficulty" && (
            <div ref={pickerRef}>
              <TagPicker options={DIFF_OPTIONS} value={currentDiff} onSelect={v => commit("difficulty", v)} align="right" />
            </div>
          )}
        </div>
      </div>
    );
  };

  useEffect(() => {
    if (pickerOpen == null) return;
    function onDown(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(null);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [pickerOpen]);

  useEffect(() => { setPickerOpen(null); }, [paperId]);
  // close the PDF panel when the user switches to a different paper
  useEffect(() => { setShowPdf(false); }, [paperId]);

  return (
    <div className={`min-h-screen bg-gray-50/60 ${showPdf ? "flex" : ""}`}>

      {showPdf && (
        <aside className="w-[42%] shrink-0 sticky top-0 h-screen bg-gray-100 border-r border-gray-200 flex flex-col">
          {pdfUrl ? (
            <iframe src={pdfUrl} className="flex-1 border-none" title="Question Paper" />
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-gray-400">
              No PDF available for this paper
            </div>
          )}
        </aside>
      )}

      <div className={`${showPdf ? "flex-1 overflow-y-auto" : "max-w-5xl mx-auto w-full"} px-6 py-6`}>

        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium transition mb-6"
        >
          <ArrowLeft size={15} /> Back
        </button>

        <div className="flex items-center justify-between gap-4 mb-5">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Bloom&apos;s &amp; Difficulty</h1>
            <p className="text-xs text-gray-400 mt-0.5">Upload the school&apos;s blueprint PDF to tag each question by number</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {total > 0 && (
              <button
                onClick={() => setShowPdf(v => !v)}
                title={showPdf ? "Hide question paper" : "Show question paper"}
                className={`flex items-center justify-center w-9 h-9 rounded-lg border transition ${
                  showPdf
                    ? "bg-indigo-100 border-indigo-200 text-indigo-600"
                    : "bg-white border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600"
                }`}
              >
                <FileText size={16} />
              </button>
            )}
            {total > 0 && (
              <>
                <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFile} />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={aiRunning || savingAll}
                  className="flex items-center gap-1.5 h-9 px-4 text-sm font-medium border border-gray-200 bg-white rounded-lg text-gray-700 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
                >
                  {aiRunning
                    ? <><Loader2 size={14} className="animate-spin" /> Extracting…</>
                    : <><Upload size={14} className="text-indigo-500" /> {inReview ? "Re-upload blueprint" : "Upload Blueprint PDF"}</>}
                </button>
              </>
            )}
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl mb-4 shadow-sm overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-4 py-2.5 border-b border-gray-100">
            <span className="text-[11px] font-semibold text-gray-400 uppercase tracking-wider mr-1">Filter</span>
            {facets.academicYears.length > 0 && (
              <Facet placeholder="All years"      value={filters.academicYearId} options={facets.academicYears} onChange={v => setPaperFilter("academicYearId", v)} />
            )}
            {facets.schools.length > 0 && (
              <Facet placeholder="All schools"    value={filters.schoolId}  options={facets.schools}   onChange={v => setPaperFilter("schoolId", v)} />
            )}
            {facets.grades.length > 0 && (
              <Facet placeholder="All classes"    value={filters.gradeId}   options={facets.grades}    onChange={v => setPaperFilter("gradeId", v)} />
            )}
            {facets.subjects.length > 0 && (
              <Facet placeholder="All subjects"   value={filters.subjectId} options={facets.subjects}  onChange={v => setPaperFilter("subjectId", v)} />
            )}
            {facets.examTypes.length > 0 && (
              <Facet placeholder="All exam types" value={filters.examType}  options={facets.examTypes} onChange={v => setPaperFilter("examType", v)} />
            )}
            {hasActiveFilter && (
              <button
                onClick={resetFilters}
                className="text-xs font-medium text-gray-400 hover:text-gray-600 transition px-1 ml-1"
              >
                Clear
              </button>
            )}
          </div>

          <div className="px-4 py-3 flex items-center gap-3">
            <span className="text-xs font-medium text-gray-500 shrink-0">Question paper</span>
            <div className="relative flex-1 max-w-lg">
              <select
                value={paperId}
                onChange={e => selectPaper(e.target.value ? Number(e.target.value) : "")}
                className="w-full h-9 pl-3 pr-9 text-sm border border-gray-200 rounded-lg bg-white hover:border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-400 appearance-none font-medium text-gray-700"
              >
                <option value="">
                  {filteredPapers.length ? `Select a paper — ${filteredPapers.length} available` : "No papers match the current filters"}
                </option>
                {filteredPapers.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.exam}
                    {p.setNumber    ? ` · Set ${p.setNumber}` : ""}
                    {p.academicYear ? ` · ${p.academicYear}` : ""}
                    {p.gradeName    ? ` — ${p.gradeName}` : ""}
                    {p.subjectName  ? ` ${p.subjectName}` : ""}
                  </option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-indigo-400 pointer-events-none" />
            </div>
          </div>
        </div>

        {aiError && (
          <div className="mb-4 px-4 py-2.5 rounded-lg text-sm text-red-600 bg-red-50 border border-red-200 flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" /> {aiError}
          </div>
        )}
        {error && (
          <div className="mb-4 px-4 py-2.5 rounded-lg text-sm text-red-600 bg-red-50 border border-red-200">{error}</div>
        )}

        {!paperId ? (
          <div className="py-28 text-center text-sm text-gray-400">Select a question paper to begin</div>
        ) : loading ? (
          <div className="flex justify-center py-28"><Loader2 size={24} className="animate-spin text-indigo-400" /></div>
        ) : total === 0 ? (
          <div className="py-28 text-center text-sm text-gray-400">No questions found for this paper</div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">

            {inReview && blueprintMeta && (
              <div className="flex flex-col gap-1.5 px-5 py-3 bg-indigo-50/60 border-b border-indigo-100">
                <div className="flex items-center gap-3">
                  <Upload size={14} className="text-indigo-500 shrink-0" />
                  <span className="text-xs font-medium text-indigo-700 flex-1">
                    Blueprint matched {blueprintMeta.matchedQuestions} of {blueprintMeta.totalQuestions} questions
                    ({blueprintMeta.extractedRows} rows read) — review and save
                  </span>
                  <button
                    onClick={dismissSuggestions}
                    disabled={savingAll}
                    className="text-xs font-medium text-gray-400 hover:text-gray-600 transition"
                  >
                    Discard
                  </button>
                  <button
                    onClick={saveAllSuggestions}
                    disabled={savingAll}
                    className="flex items-center gap-1.5 h-7 px-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition"
                  >
                    {savingAll
                      ? <><Loader2 size={11} className="animate-spin" /> Saving…</>
                      : `Save all ${Object.keys(aiSuggestions ?? {}).length}`}
                  </button>
                </div>
                {blueprintMeta.unmatchedBlueprintNumbers.length > 0 && (
                  <div className="flex items-center gap-1.5 text-[11px] text-amber-600 pl-6">
                    <AlertCircle size={11} className="shrink-0" />
                    Blueprint rows not found in this paper: {blueprintMeta.unmatchedBlueprintNumbers.join(", ")}
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-5 px-5 py-3 border-b border-gray-100">
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-semibold text-gray-700 tabular-nums">{mapped}/{total}</span>
                <div className="w-28 h-1.5 rounded-full bg-gray-100 overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <span className="text-xs text-gray-400 tabular-nums">{pct}%</span>
              </div>
              <div className="flex-1" />
              <div className="flex items-center gap-0.5 bg-gray-100 rounded-lg p-0.5">
                <Tab id="all"      label="All"      count={total} />
                <Tab id="unmapped" label="Unmapped" count={unmapped} />
                <Tab id="mapped"   label="Mapped"   count={mapped} />
              </div>
            </div>

            <div className="grid grid-cols-[52px_1fr_48px_150px_120px] gap-4 px-5 py-2 border-b border-gray-100 bg-gray-50/60">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Q#</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Question</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-right">Marks</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Bloom&apos;s</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Difficulty</span>
            </div>

            <div className="divide-y divide-gray-100">
              {visible.length === 0 && (
                <div className="py-14 text-center text-sm text-gray-400">Nothing here — try a different filter.</div>
              )}

              {groups.map((group) => {
                const itemCount = group.blocks.reduce(
                  (n, b) => n + (b.type === "compulsory" ? (b.items?.length ?? 0) : (b.sets?.reduce((m, s) => m + s.items.length, 0) ?? 0)),
                  0,
                );
                const hasOr = group.blocks.some(b => b.type === "or");

                if (!hasOr && itemCount <= 1) {
                  const only = group.blocks[0]?.items?.[0]?.q;
                  return only ? renderRow(only) : null;
                }

                return (
                  <div key={`g-${group.parent}`}>
                    <div className="grid grid-cols-[52px_1fr_48px_150px_120px] gap-4 px-5 py-1.5 bg-gray-50/80 border-b border-gray-100">
                      <span className="col-span-5 text-[11px] font-bold text-gray-500">Q{group.parent}</span>
                    </div>
                    <div className="divide-y divide-gray-100">
                      {group.blocks.map((block, bi) =>
                        block.type === "compulsory" ? (
                          <Fragment key={`c-${bi}`}>
                            {block.items!.map(({ q }) => renderRow(q))}
                          </Fragment>
                        ) : (
                          <div key={`or-${block.groupKey ?? bi}`} className="px-5 py-2.5">
                            <div className="rounded-lg border border-amber-200 bg-amber-50/20">
                              <div className="px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-amber-700 bg-amber-50 border-b border-amber-100 rounded-t-lg">
                                {block.pickCount && block.pickCount > 1 ? `Choose any ${block.pickCount}` : "Choose one"}
                              </div>
                              {block.sets!.map((set, si) => (
                                <div key={set.set ?? si}>
                                  {si > 0 && (
                                    <div className="text-center text-[9px] font-bold text-amber-400 py-1 bg-amber-50/40">OR</div>
                                  )}
                                  <div className="divide-y divide-amber-100/60">
                                    {set.items.map(({ q }) => renderRow(q))}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
