"use client";
import { useState, useRef, useMemo, Fragment } from "react";
import { ArrowLeft, Loader2, Check, Upload, AlertCircle, ChevronDown, FileText, CloudUpload, Download } from "lucide-react";
import { InlineMath, BlockMath } from "react-katex";
import { useQuestionMappings, groupMaxMarks } from "../hooks/useQuestionMappings";
import { buildUiGroups } from "../lib/questionGroups";
import type { PaperQuestion } from "../hooks/useQuestionMappings";

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

function ValueChip({ value, valid }: { value: string | null; valid?: boolean }) {
  if (!value) return <span className="text-xs text-gray-300 italic">—</span>;
  return (
    <span
      className={`inline-flex items-center h-6 px-2 rounded-md text-xs font-medium border ${
        valid === false
          ? "bg-red-50 text-red-500 border-red-200"
          : "bg-gray-50 text-gray-700 border-gray-200"
      }`}
      title={valid === false ? `Invalid value: ${value}` : undefined}
    >
      {value}
    </span>
  );
}

function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

function downloadCsv(filename: string, headers: string[], rows: unknown[][]) {
  const lines = [headers.map(csvCell).join(","), ...rows.map(r => r.map(csvCell).join(","))];
  const blob = new Blob([lines.join("\n") + "\n"], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function QuestionMappingsScreen({ onBack }: { onBack: () => void }) {
  const {
    filteredPapers, facets, filters, setPaperFilter, resetFilters,
    paperId, selectPaper,
    totalQuestions, pdfUrl,
    questionInfoByBase, preReviewRows, paperQuestions,
    loading, error,
    chapterOptions,
    blueprintRows, extractMeta, extracting, extractError,
    overrides, setChapterOverride,
    dryResult, dryRunning, dryError,
    saving, saveError, savedResult, dirty,
    pushing, pushError, pushResult,
    uploadBlueprint, saveAll, pushToProd,
  } = useQuestionMappings();

  const [showPdf, setShowPdf] = useState(false);
  const [groupByChapter, setGroupByChapter] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const hasActiveFilter = !!(filters.academicYearId || filters.schoolId || filters.gradeId || filters.subjectId || filters.examType);
  const inReview = blueprintRows !== null;

  const reviewRows = useMemo(() => {
    if (!blueprintRows) return [];
    const byBase = new Map((dryResult?.rowResults ?? []).map(r => [r.baseQuestionNumber, r]));
    return blueprintRows.map(row => ({ row, result: byBase.get(row.baseQuestionNumber) ?? null }));
  }, [blueprintRows, dryResult]);

  const unresolvedCount = dryResult?.unresolvedChapters.length ?? 0;
  const groupsMatched   = dryResult?.groupsMatched ?? 0;
  const savedAndClean   = savedResult != null && !dirty;

  const validRows = useMemo(() => paperQuestions.filter(q => q.questionNumber != null), [paperQuestions]);

  // groups the pre-upload table by current (DB) chapter tag; "(No chapter)" bucket
  // collects untagged questions, always sorted last.
  const preReviewGroups = useMemo(() => {
    const withUiGroups = (rows: PaperQuestion[]) => ({ rows, uiGroups: buildUiGroups(rows) });
    if (!groupByChapter) return [{ chapterName: "", totalMarks: 0, ...withUiGroups(validRows) }];
    const byChapter = new Map<string, PaperQuestion[]>();
    for (const q of validRows) {
      const key = q.chapterName || "(No chapter)";
      if (!byChapter.has(key)) byChapter.set(key, []);
      byChapter.get(key)!.push(q);
    }
    return [...byChapter.entries()]
      .sort(([a], [b]) => a === "(No chapter)" ? 1 : b === "(No chapter)" ? -1 : a.localeCompare(b))
      .map(([chapterName, rows]) => ({
        chapterName,
        totalMarks: groupMaxMarks(rows),
        ...withUiGroups(rows),
      }));
  }, [groupByChapter, validRows]);

  const exportPreReviewCsv = () => {
    const rows = preReviewRows.map(({ base, info }) => [
      base, info.questionText ?? "", info.totalMarks ?? "", info.chapterName ?? "",
      info.bloomTaxonomy ?? "", info.difficultyLevel ?? "", info.rowCount ?? "",
    ]);
    downloadCsv(`question-mappings_paper-${paperId}.csv`,
      ["Q#", "Question", "Marks", "Chapter", "Bloom's", "Difficulty", "Rows"], rows);
  };

  // blueprint tags apply per BASE question number; look these up per sub-part row below
  const blueprintByBase = useMemo(() => new Map((blueprintRows ?? []).map(r => [r.baseQuestionNumber, r])), [blueprintRows]);
  const resultByBase     = useMemo(() => new Map((dryResult?.rowResults ?? []).map(r => [r.baseQuestionNumber, r])), [dryResult]);

  // groups the post-upload review table by resolved chapter name; unresolved rows collect
  // under "(Unresolved)", always sorted last. Uses validRows (sub-part level, same as
  // preReviewGroups) so a question's parts don't collapse into one row here either.
  const reviewGroups = useMemo(() => {
    const withUiGroups = (rows: PaperQuestion[]) => ({ rows, uiGroups: buildUiGroups(rows) });
    if (!groupByChapter) return [{ chapterName: "", totalMarks: 0, ...withUiGroups(validRows) }];
    const byChapter = new Map<string, PaperQuestion[]>();
    for (const q of validRows) {
      const base = q.questionNumber != null ? Math.floor(q.questionNumber) : null;
      const key = (base != null ? resultByBase.get(base)?.chapterName : null) || "(Unresolved)";
      if (!byChapter.has(key)) byChapter.set(key, []);
      byChapter.get(key)!.push(q);
    }
    return [...byChapter.entries()]
      .sort(([a], [b]) => a === "(Unresolved)" ? 1 : b === "(Unresolved)" ? -1 : a.localeCompare(b))
      .map(([chapterName, rows]) => ({
        chapterName,
        totalMarks: groupMaxMarks(rows),
        ...withUiGroups(rows),
      }));
  }, [groupByChapter, validRows, resultByBase]);

  const exportReviewCsv = () => {
    const rows = reviewRows.map(({ row, result }) => {
      const info = questionInfoByBase.get(row.baseQuestionNumber);
      return [row.questionNumberRaw, info?.questionText ?? "", info?.totalMarks ?? "",
               result?.chapterName ?? row.chapter ?? "", row.bloomTaxonomy ?? "", row.difficultyLevel ?? "",
               result?.questionRows ?? "", savedAndClean ? "school" : ""];
    });
    downloadCsv(`question-mappings_paper-${paperId}.csv`,
      ["Q#", "Question", "Marks", "Chapter", "Bloom's", "Difficulty", "Rows", "Origin"], rows);
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) await uploadBlueprint(file);
    if (fileRef.current) fileRef.current.value = "";
  };

  const saveDisabled = saving || !blueprintRows || blueprintRows.length === 0 || savedAndClean;
  const pushDisabled  = pushing || !savedAndClean;

  const renderReviewRow = (q: PaperQuestion) => {
    const label = q.questionNumber != null ? String(q.questionNumber) : "—";
    const base = q.questionNumber != null ? Math.floor(q.questionNumber) : null;
    const blueprintRow = base != null ? blueprintByBase.get(base) : undefined;
    const result = base != null ? resultByBase.get(base) : undefined;
    const resolved = result?.chapterResolved ?? false;
    const overrideValue = base != null ? (overrides[base] ?? "") : "";

    return (
      <div
        key={q.id}
        className="grid grid-cols-[60px_1fr_70px_140px_110px_110px_90px] items-start gap-4 px-5 py-3.5 hover:bg-gray-50/60 transition-colors"
      >
        <div className="flex items-center gap-1.5 pt-1">
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${resolved ? "bg-emerald-500" : "bg-red-400"}`} />
          <span className="font-mono text-xs font-semibold text-gray-500 leading-none">{label}</span>
        </div>

        <div className="pt-1 min-w-0 leading-relaxed">
          <span className="text-xs text-gray-600">
            {q.questionText ? <LatexText text={q.questionText} /> : <span className="italic text-gray-300">—</span>}
          </span>
        </div>

        <div className="pt-1 text-right">
          <span className="text-xs text-gray-500 tabular-nums">{q.maxMarks ?? "—"}</span>
        </div>

        <div className="pt-0.5 min-w-0">
          <div className="text-xs text-gray-500 mb-1">{blueprintRow?.chapter || <span className="italic text-gray-300">No chapter text</span>}</div>
          {resolved ? (
            <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600">
              <Check size={12} className="shrink-0" /> {result?.chapterName}
            </span>
          ) : (
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 text-xs font-medium text-red-500 shrink-0">
                <AlertCircle size={12} className="shrink-0" /> Unresolved
              </span>
              <div className="relative">
                <select
                  value={overrideValue}
                  onChange={e => e.target.value && base != null && setChapterOverride(base, Number(e.target.value))}
                  disabled={dryRunning || saving}
                  className="h-7 pl-2 pr-6 text-xs border border-red-200 rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/15 focus:border-indigo-400 appearance-none disabled:opacity-50"
                >
                  <option value="" disabled>Pick chapter…</option>
                  {chapterOptions.map(c => (
                    <option key={c.id} value={c.id}>{c.unitName ? `${c.unitName} — ` : ""}{c.name}</option>
                  ))}
                </select>
                <ChevronDown size={10} className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          )}
        </div>

        <div className="pt-0.5"><ValueChip value={blueprintRow?.bloomTaxonomy ?? null} valid={result?.bloomsValid} /></div>
        <div className="pt-0.5"><ValueChip value={blueprintRow?.difficultyLevel ?? null} valid={result?.difficultyValid} /></div>

        <div className="pt-0.5">
          {savedAndClean && (
            <span className="inline-flex items-center h-5 px-2 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-600 border border-indigo-100">
              school
            </span>
          )}
        </div>
      </div>
    );
  };

  const renderPreReviewRow = (q: PaperQuestion) => {
    const label = q.questionNumber != null ? String(q.questionNumber) : "—";
    return (
      <div
        key={q.id}
        className="grid grid-cols-[60px_1fr_70px_160px_110px_110px] items-start gap-4 px-5 py-3.5 hover:bg-gray-50/60 transition-colors"
      >
        <span className="font-mono text-xs font-semibold text-gray-500 pt-1">{label}</span>
        <span className="text-xs text-gray-600 pt-1 leading-relaxed">
          {q.questionText ? <LatexText text={q.questionText} /> : <span className="italic text-gray-300">—</span>}
        </span>
        <span className="text-xs text-gray-500 tabular-nums text-right pt-1">{q.maxMarks ?? "—"}</span>
        <span className="text-xs text-gray-600 pt-1">
          {q.chapterName || <span className="italic text-gray-300">—</span>}
        </span>
        <div className="pt-0.5"><ValueChip value={q.bloomTaxonomy} /></div>
        <div className="pt-0.5"><ValueChip value={q.difficultyLevel} /></div>
      </div>
    );
  };

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

      <div className={`${showPdf ? "flex-1 overflow-y-auto" : "max-w-6xl mx-auto w-full"} px-6 py-6`}>

        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium transition mb-6"
        >
          <ArrowLeft size={15} /> Back
        </button>

        <div className="flex items-center justify-between gap-4 mb-5">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Question Mappings</h1>
            <p className="text-xs text-gray-400 mt-0.5">Upload the school&apos;s blueprint PDF to ingest chapter, Bloom&apos;s &amp; difficulty for this paper</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {totalQuestions > 0 && (
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
            {totalQuestions > 0 && (
              <>
                <input ref={fileRef} type="file" accept=".pdf" className="hidden" onChange={handleFile} />
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={extracting || saving}
                  className="flex items-center gap-1.5 h-9 px-4 text-sm font-medium border border-gray-200 bg-white rounded-lg text-gray-700 hover:border-indigo-300 hover:text-indigo-600 disabled:opacity-50 disabled:cursor-not-allowed transition shadow-sm"
                >
                  {extracting
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

        {extractError && (
          <div className="mb-4 px-4 py-2.5 rounded-lg text-sm text-red-600 bg-red-50 border border-red-200 flex items-center gap-2">
            <AlertCircle size={14} className="shrink-0" /> {extractError}
          </div>
        )}
        {error && (
          <div className="mb-4 px-4 py-2.5 rounded-lg text-sm text-red-600 bg-red-50 border border-red-200">{error}</div>
        )}

        {!paperId ? (
          <div className="py-28 text-center text-sm text-gray-400">Select a question paper to begin</div>
        ) : loading ? (
          <div className="flex justify-center py-28"><Loader2 size={24} className="animate-spin text-indigo-400" /></div>
        ) : totalQuestions === 0 ? (
          <div className="py-28 text-center text-sm text-gray-400">No questions found for this paper</div>
        ) : !inReview ? (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">
            <div className="flex items-center justify-between gap-3 px-5 py-3 bg-gray-50/60 border-b border-gray-100">
              <span className="text-xs text-gray-400">
                Current tags for this paper — upload a blueprint PDF above to update chapter, Bloom&apos;s &amp; difficulty
              </span>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setGroupByChapter(v => !v)}
                  className={`h-7 px-3 text-xs font-medium rounded-md border transition ${
                    groupByChapter ? "bg-indigo-100 border-indigo-200 text-indigo-700" : "bg-white border-gray-200 text-gray-500 hover:border-indigo-300"
                  }`}
                >
                  Group by chapter
                </button>
                <button
                  onClick={exportPreReviewCsv}
                  className="flex items-center gap-1.5 h-7 px-3 text-xs font-medium border border-gray-200 bg-white rounded-md text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition"
                >
                  <Download size={12} /> Export
                </button>
              </div>
            </div>
            <div className="grid grid-cols-[60px_1fr_70px_160px_110px_110px] gap-4 px-5 py-2 border-b border-gray-100 bg-gray-50/60">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Q#</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Question</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-right">Marks</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Chapter</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Bloom&apos;s</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Difficulty</span>
            </div>
            {preReviewGroups.map(({ chapterName, rows, uiGroups, totalMarks }) => (
              <div key={chapterName} className="divide-y divide-gray-100">
                {groupByChapter && (
                  <div className="px-5 py-1.5 bg-indigo-50/40 text-[11px] font-semibold text-indigo-700">
                    {chapterName} <span className="text-indigo-400 font-normal">({rows.length} question{rows.length === 1 ? "" : "s"}, {totalMarks} marks)</span>
                  </div>
                )}
                <div className="divide-y divide-gray-100">
                  {uiGroups.map((group) => {
                    const itemCount = group.blocks.reduce(
                      (n, b) => n + (b.type === "compulsory" ? (b.items?.length ?? 0) : (b.sets?.reduce((m, s) => m + s.items.length, 0) ?? 0)),
                      0,
                    );
                    const hasOr = group.blocks.some(b => b.type === "or");

                    if (!hasOr && itemCount <= 1) {
                      const only = group.blocks[0]?.items?.[0]?.q;
                      return only ? renderPreReviewRow(only) : null;
                    }

                    return (
                      <div key={`g-${group.parent}`}>
                        <div className="grid grid-cols-[60px_1fr_70px_160px_110px_110px] gap-4 px-5 py-1.5 bg-gray-50/80 border-b border-gray-100">
                          <span className="col-span-6 text-[11px] font-bold text-gray-500">Q{group.parent}</span>
                        </div>
                        <div className="divide-y divide-gray-100">
                          {group.blocks.map((block, bi) =>
                            block.type === "compulsory" ? (
                              <Fragment key={`c-${bi}`}>
                                {block.items!.map(({ q }) => renderPreReviewRow(q))}
                              </Fragment>
                            ) : (
                              <div key={`or-${block.groupKey ?? bi}`} className="px-2 py-2.5">
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
                                        {set.items.map(({ q }) => renderPreReviewRow(q))}
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
            ))}
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden">

            {extractMeta && (
              <div className="flex flex-col gap-1.5 px-5 py-3 bg-indigo-50/60 border-b border-indigo-100">
                <div className="flex items-center gap-3">
                  <Upload size={14} className="text-indigo-500 shrink-0" />
                  <span className="text-xs font-medium text-indigo-700 flex-1">
                    Blueprint matched {extractMeta.matchedQuestions} of {extractMeta.totalQuestions} questions
                    ({extractMeta.extractedRows} rows read)
                    {dryRunning
                      ? " — validating chapters…"
                      : dryResult
                      ? ` — ${groupsMatched} group${groupsMatched === 1 ? "" : "s"} matched, ${unresolvedCount} unresolved chapter${unresolvedCount === 1 ? "" : "s"}`
                      : ""}
                  </span>
                  <button
                    onClick={saveAll}
                    disabled={saveDisabled}
                    className="flex items-center gap-1.5 h-7 px-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition"
                  >
                    {saving
                      ? <><Loader2 size={11} className="animate-spin" /> Saving…</>
                      : savedAndClean
                      ? <><Check size={11} /> Saved</>
                      : `Save all ${blueprintRows?.length ?? 0}`}
                  </button>
                  <button
                    onClick={pushToProd}
                    disabled={pushDisabled}
                    title={savedAndClean ? "Push the saved mappings to prod" : "Save first to enable pushing to prod"}
                    className="flex items-center gap-1.5 h-7 px-3.5 bg-white border border-gray-300 hover:border-indigo-400 hover:text-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed text-gray-600 text-xs font-semibold rounded-lg transition"
                  >
                    {pushing
                      ? <><Loader2 size={11} className="animate-spin" /> Pushing…</>
                      : <><CloudUpload size={11} /> Push to prod</>}
                  </button>
                  <button
                    onClick={() => setGroupByChapter(v => !v)}
                    className={`h-7 px-3 text-xs font-medium rounded-md border transition ${
                      groupByChapter ? "bg-indigo-100 border-indigo-200 text-indigo-700" : "bg-white border-gray-200 text-gray-500 hover:border-indigo-300"
                    }`}
                  >
                    Group by chapter
                  </button>
                  <button
                    onClick={exportReviewCsv}
                    className="flex items-center gap-1.5 h-7 px-3 text-xs font-medium border border-gray-200 bg-white rounded-md text-gray-600 hover:border-indigo-300 hover:text-indigo-600 transition"
                  >
                    <Download size={12} /> Export
                  </button>
                </div>
                {extractMeta.unmatchedBlueprintNumbers.length > 0 && (
                  <div className="flex items-center gap-1.5 text-[11px] text-amber-600 pl-6">
                    <AlertCircle size={11} className="shrink-0" />
                    Blueprint rows not found in this paper: {extractMeta.unmatchedBlueprintNumbers.join(", ")}
                  </div>
                )}
                {dryResult && dryResult.unmatchedBaseNumbers.length > 0 && (
                  <div className="flex items-center gap-1.5 text-[11px] text-amber-600 pl-6">
                    <AlertCircle size={11} className="shrink-0" />
                    Base question numbers not matched to any group: {dryResult.unmatchedBaseNumbers.join(", ")}
                  </div>
                )}
                {dryError && (
                  <div className="flex items-center gap-1.5 text-[11px] text-red-500 pl-6">
                    <AlertCircle size={11} className="shrink-0" /> {dryError}
                  </div>
                )}
                {saveError && (
                  <div className="flex items-center gap-1.5 text-[11px] text-red-500 pl-6">
                    <AlertCircle size={11} className="shrink-0" /> {saveError}
                  </div>
                )}
                {savedResult && (
                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 pl-6">
                    <Check size={11} className="shrink-0" />
                    Saved — {savedResult.questionsUpdated} question{savedResult.questionsUpdated === 1 ? "" : "s"} updated (data input #{savedResult.dataInputId})
                  </div>
                )}
                {pushError && (
                  <div className="flex items-center gap-1.5 text-[11px] text-red-500 pl-6">
                    <AlertCircle size={11} className="shrink-0" /> Push to prod: {pushError}
                  </div>
                )}
                {pushResult && (
                  <div className="flex items-center gap-1.5 text-[11px] text-emerald-600 pl-6">
                    <Check size={11} className="shrink-0" />
                    Pushed to prod — {pushResult.questionsUpdated} question{pushResult.questionsUpdated === 1 ? "" : "s"} updated
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-[60px_1fr_70px_140px_110px_110px_90px] gap-4 px-5 py-2 border-b border-gray-100 bg-gray-50/60">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Q#</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Question</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400 text-right">Marks</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Chapter</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Bloom&apos;s</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Difficulty</span>
              <span className="text-[10px] font-semibold uppercase tracking-wider text-gray-400">Origin</span>
            </div>

            {reviewGroups.map(({ chapterName, rows, uiGroups, totalMarks }) => (
              <div key={chapterName} className="divide-y divide-gray-100">
                {groupByChapter && (
                  <div className="px-5 py-1.5 bg-indigo-50/40 text-[11px] font-semibold text-indigo-700">
                    {chapterName} <span className="text-indigo-400 font-normal">({rows.length} question{rows.length === 1 ? "" : "s"}, {totalMarks} marks)</span>
                  </div>
                )}
                <div className="divide-y divide-gray-100">
                  {uiGroups.map((group) => {
                    const itemCount = group.blocks.reduce(
                      (n, b) => n + (b.type === "compulsory" ? (b.items?.length ?? 0) : (b.sets?.reduce((m, s) => m + s.items.length, 0) ?? 0)),
                      0,
                    );
                    const hasOr = group.blocks.some(b => b.type === "or");

                    if (!hasOr && itemCount <= 1) {
                      const only = group.blocks[0]?.items?.[0]?.q;
                      return only ? renderReviewRow(only) : null;
                    }

                    return (
                      <div key={`g-${group.parent}`}>
                        <div className="grid grid-cols-[60px_1fr_70px_140px_110px_110px_90px] gap-4 px-5 py-1.5 bg-gray-50/80 border-b border-gray-100">
                          <span className="col-span-7 text-[11px] font-bold text-gray-500">Q{group.parent}</span>
                        </div>
                        <div className="divide-y divide-gray-100">
                          {group.blocks.map((block, bi) =>
                            block.type === "compulsory" ? (
                              <Fragment key={`c-${bi}`}>
                                {block.items!.map(({ q }) => renderReviewRow(q))}
                              </Fragment>
                            ) : (
                              <div key={`or-${block.groupKey ?? bi}`} className="px-2 py-2.5">
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
                                        {set.items.map(({ q }) => renderReviewRow(q))}
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
