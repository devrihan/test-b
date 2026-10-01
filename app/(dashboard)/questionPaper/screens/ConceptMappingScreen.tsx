"use client";
import { useState, useEffect, useRef, useMemo, Fragment } from "react";
import { ArrowLeft, Loader2, Check, Sparkles, AlertCircle, ChevronDown, FileText, Download } from "lucide-react";
import { InlineMath, BlockMath } from "react-katex";
import { useConceptMapping } from "../hooks/useConceptMapping";
import { ConceptPicker } from "../components/ConceptPicker";
import { buildUiGroups } from "../lib/questionGroups";
import { usePersistentState } from "../../../lib/usePersistentState";
import type { ConceptOption, QuestionConceptRow } from "../lib/types";

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

const CONF_DOT: Record<string, string> = { high: "bg-emerald-500", medium: "bg-amber-400", low: "bg-orange-400" };
type Filter = "all" | "unmapped" | "mapped";

function csvField(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function downloadConceptMappingCsv(questions: QuestionConceptRow[], paperLabel: string) {
  const header = ["Q No", "Question Text", "Marks", "Unit", "Chapter", "Concept"];
  const rows = questions.map(q => [
    q.questionNumber != null ? String(q.questionNumber) : (q.questionLabel ?? ""),
    q.questionText ?? "",
    q.maxMarks != null ? String(q.maxMarks) : "",
    q.unitName ?? "",
    q.chapterName ?? "",
    q.conceptName ?? "",
  ]);
  const body = [header, ...rows].map(r => r.map(csvField).join(",")).join("\n");
  const blob = new Blob(["﻿", body], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${paperLabel.replace(/[^a-z0-9]+/gi, "_")}_concept_mapping.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

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

export default function ConceptMappingScreen({ onBack }: { onBack: () => void }) {
  const {
    filteredPapers, facets, filters, setPaperFilter, resetFilters,
    paperId, selectPaper,
    questions, concepts, pdfUrl,
    loading, error,
    saveStates, assignConcept,
    mapped, total,
    aiSuggestions, aiMissingIds, aiRunning, aiError, savingAll,
    triggerAiMap, saveAllSuggestions, dismissSuggestions, clearSuggestion,
  } = useConceptMapping();

  const [showPdf, setShowPdf] = useState(false);
  const [pickerOpenId, setPickerOpenId] = useState<number | null>(null);
  const [filter, setFilter] = usePersistentState<Filter>("cm:tab", "all");
  // keyed by question id since renderRow isn't a component — ConceptPicker needs the anchor DOM node to position its portal
  const anchorRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  const inReview       = aiSuggestions !== null;
  const suggestedCount = aiSuggestions ? Object.keys(aiSuggestions).length : 0;
  const unmapped       = total - mapped;
  const pct            = total > 0 ? Math.round((mapped / total) * 100) : 0;
  const hasActiveFilter = !!(filters.academicYearId || filters.schoolId || filters.gradeId || filters.subjectId || filters.examType);

  const visible = useMemo(() => {
    if (filter === "mapped")   return questions.filter(q => q.conceptId != null);
    if (filter === "unmapped") return questions.filter(q => q.conceptId == null);
    return questions;
  }, [questions, filter]);

  const groups = useMemo(() => buildUiGroups(visible), [visible]);

  const missingLabels = useMemo(() => {
    if (aiMissingIds.length === 0) return [];
    const byId = new Map(questions.map(q => [q.id, q]));
    return aiMissingIds.map(id => {
      const q = byId.get(id);
      return q ? (q.questionNumber != null ? String(q.questionNumber) : (q.questionLabel || `#${id}`)) : `#${id}`;
    });
  }, [aiMissingIds, questions]);

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

  const renderRow = (q: QuestionConceptRow) => {
    const label      = q.questionNumber != null ? String(q.questionNumber) : (q.questionLabel || "—");
    const ss         = saveStates[q.id] ?? "idle";
    const isOpen     = pickerOpenId === q.id;
    const suggestion = aiSuggestions?.[q.id] ?? null;
    const sugConcept = suggestion ? concepts.find(c => c.conceptId === suggestion.conceptId) : null;

    const showAi    = inReview && !!suggestion;
    const isMapped  = q.conceptId != null;
    const chipName  = showAi ? (sugConcept?.conceptName ?? null) : q.conceptName;
    const unitName    = showAi ? (sugConcept?.unitName    ?? null) : q.unitName;
    const chapterName = showAi ? (sugConcept?.chapterName ?? null) : q.chapterName;

    return (
      <div
        key={q.id}
        className={`grid grid-cols-[52px_1fr_64px_260px] items-start gap-4 px-5 py-3.5 transition-colors ${
          isOpen ? "bg-indigo-50/30" : "hover:bg-gray-50/60"
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
          {ss === "saving" ? (
            <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs text-indigo-400 bg-indigo-50 border border-indigo-100">
              <Loader2 size={11} className="animate-spin" /> Saving
            </span>
          ) : ss === "saved" ? (
            <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-lg text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 font-medium">
              <Check size={12} /> Saved
            </span>
          ) : chipName ? (
            <div className="flex flex-col items-start gap-1 w-full max-w-[248px]">
              <button
                ref={el => { if (el) anchorRefs.current.set(q.id, el); }}
                onClick={() => setPickerOpenId(isOpen ? null : q.id)}
                disabled={aiRunning}
                title={chipName}
                className={`inline-flex items-center gap-1.5 h-7 pl-2.5 pr-1.5 rounded-lg text-xs font-medium w-full transition disabled:opacity-40 ${
                  showAi
                    ? "bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100"
                    : ss === "error"
                    ? "bg-red-50 text-red-500 border border-red-200"
                    : "bg-gray-50 text-gray-700 border border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40"
                }`}
              >
                {showAi && suggestion?.confidence && (
                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${CONF_DOT[suggestion.confidence] ?? "bg-gray-300"}`} />
                )}
                <span className="truncate flex-1 text-left">{chipName}</span>
                <ChevronDown size={12} className="shrink-0 opacity-40" />
              </button>
              {unitName && (
                <span className="inline-flex items-baseline gap-1.5 max-w-full px-2 py-1 rounded-md text-xs font-semibold bg-gray-100 text-gray-600">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 shrink-0">Unit</span>
                  <span className="break-words">{unitName}</span>
                </span>
              )}
              {chapterName && (
                <span className="inline-flex items-baseline gap-1.5 max-w-full px-2 py-1 rounded-md text-xs font-semibold bg-gray-100 text-gray-600">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 shrink-0">Chapter</span>
                  <span className="break-words">{chapterName}</span>
                </span>
              )}
            </div>
          ) : (
            <button
              ref={el => { if (el) anchorRefs.current.set(q.id, el); }}
              onClick={() => setPickerOpenId(isOpen ? null : q.id)}
              disabled={aiRunning}
              className="inline-flex items-center gap-1 h-7 px-3 rounded-lg text-xs border border-dashed border-gray-300 text-gray-400 hover:border-indigo-400 hover:text-indigo-500 transition disabled:opacity-40"
            >
              Assign <ChevronDown size={12} className="opacity-40" />
            </button>
          )}

          {isOpen && (
            <ConceptPicker
              align="right"
              anchorEl={anchorRefs.current.get(q.id) ?? null}
              concepts={concepts}
              value={showAi ? suggestion!.conceptId : q.conceptId}
              onSelect={(c: ConceptOption) => {
                assignConcept(q.id, c);
                if (showAi) clearSuggestion(q.id);
                setPickerOpenId(null);
              }}
              onClear={() => {
                assignConcept(q.id, null);
                if (showAi) clearSuggestion(q.id);
                setPickerOpenId(null);
              }}
              onClose={() => setPickerOpenId(null)}
            />
          )}
        </div>
      </div>
    );
  };

  useEffect(() => { setPickerOpenId(null); }, [paperId]);
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
            <h1 className="text-lg font-bold text-gray-900">Concept–Question Mapping</h1>
            <p className="text-xs text-gray-400 mt-0.5">Tag each question to a curriculum concept</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {total > 0 && (
              <button
                onClick={() => {
                  const paper = filteredPapers.find(p => p.id === paperId);
                  downloadConceptMappingCsv(questions, paper?.exam || "concept_mapping");
                }}
                title="Export to CSV"
                className="flex items-center justify-center w-9 h-9 rounded-lg border bg-white border-gray-200 text-gray-500 hover:border-indigo-300 hover:text-indigo-600 transition"
              >
                <Download size={16} />
              </button>
            )}
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
              <button
                onClick={triggerAiMap}
                disabled={aiRunning || savingAll || concepts.length === 0}
                className="flex items-center gap-1.5 h-9 px-4 text-sm font-medium border border-gray-200 bg-white rounded-lg text-gray-700 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
              >
                {aiRunning
                  ? <><Loader2 size={14} className="animate-spin" /> Mapping…</>
                  : <><Sparkles size={14} className="text-indigo-500" /> {inReview ? "Rerun" : "Map with AI"}</>}
              </button>
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
                    {p.exam}{p.setNumber ? ` · Set ${p.setNumber}` : ""}
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

            {inReview && (
              <div className="flex flex-col gap-1.5 px-5 py-3 bg-indigo-50/60 border-b border-indigo-100">
                <div className="flex items-center gap-3">
                  <Sparkles size={14} className="text-indigo-500 shrink-0" />
                  <span className="text-xs font-medium text-indigo-700 flex-1">
                    AI mapped {suggestedCount} of {total} questions — review and save
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
                      : `Save all ${suggestedCount}`}
                  </button>
                </div>
                {missingLabels.length > 0 && (
                  <div className="flex items-center gap-1.5 text-[11px] text-amber-600 pl-6">
                    <AlertCircle size={11} className="shrink-0" />
                    AI couldn&apos;t confidently map {missingLabels.length} question{missingLabels.length > 1 ? "s" : ""} even after retrying — needs manual review: Q{missingLabels.join(", Q")}
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

            {concepts.length === 0 && (
              <div className="flex items-center gap-1.5 text-[11px] text-amber-600 px-5 py-2 border-b border-gray-100 bg-amber-50/50">
                <AlertCircle size={12} />
                No concepts for this grade/subject — upload them in Chapter–Concept Mapping first.
              </div>
            )}

            <div className="grid grid-cols-[52px_1fr_64px_260px] gap-4 px-5 py-2 border-b border-gray-100 bg-gray-50/60">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Q.No</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Question</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-right block">Marks</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Concept</span>
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
                    <div className="grid grid-cols-[52px_1fr_64px_260px] gap-4 px-5 py-1.5 bg-gray-50/80 border-b border-gray-100">
                      <span className="col-span-4 text-[11px] font-bold text-gray-500">Q{group.parent}</span>
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
