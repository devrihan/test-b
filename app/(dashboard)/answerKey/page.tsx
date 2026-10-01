"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { keys } from "@/app/lib/queryKeys";
import { urlKeys, URL_OPTIONS, ANSWER_KEY_MODES } from "@/app/lib/urlKeys";
import { ArrowLeft, Upload, ClipboardList, ChevronDown, PenLine } from "lucide-react";
import { useRouter } from "next/navigation";
import AKUpload      from "./components/AKUpload";
import AKReviewTable from "./components/AKReviewTable";
import { listQuestionPapers } from "./lib/answerKeyApi";
import type { PaperOption } from "./types";

type Mode = (typeof ANSWER_KEY_MODES)[number];

const NO_PAPERS: PaperOption[] = [];

export default function AnswerKeyPage() {
  const router = useRouter();

  const [{ mode, paperId }, setAnswerKey] = useQueryStates(urlKeys.answerKey, URL_OPTIONS);

  // Lazily loaded — only fetched once the review view is open. Shares the key
  // with AKUpload, so opening both costs one request.
  const papersQuery = useQuery({
    queryKey: keys.answerKey.questionPapers(),
    queryFn: listQuestionPapers,
    enabled: mode === "review",
  });

  const papers = papersQuery.data ?? NO_PAPERS;
  const papersLoading = papersQuery.isFetching;

  function handleIngestComplete(ingestedPaperId: number) {
    setAnswerKey({ mode: "review", paperId: ingestedPaperId });
  }

  const activePaperId = paperId || null;

  // ── Review mode — full screen like answerEditing ───────────────────────────
  if (mode === "review") {
    return (
      <div className="flex flex-col h-screen overflow-hidden bg-gray-50">

        {/* Top bar */}
        <div className="flex items-center gap-3 px-4 h-14 border-b border-gray-200 bg-white shrink-0">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium transition"
          >
            <ArrowLeft size={15} /> Back
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <h1 className="text-sm font-bold text-gray-900">Answer Key</h1>
          <div className="w-px h-5 bg-gray-200" />

          {/* Tab switcher */}
          <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setAnswerKey({ mode: "upload" })}
              className="flex items-center gap-1.5 h-7 px-3 text-xs font-semibold rounded-md text-gray-500 hover:text-gray-700 transition"
            >
              <Upload size={11} /> Upload
            </button>
            <button
              className="flex items-center gap-1.5 h-7 px-3 text-xs font-semibold rounded-md bg-white text-indigo-600 shadow-sm transition"
            >
              <ClipboardList size={11} /> Review
              {activePaperId && (
                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-600">
                  #{activePaperId}
                </span>
              )}
            </button>
          </div>

          {/* Draw Boxes button */}
          {activePaperId && (
            <button
              onClick={() => router.push(`/answerKey/bbox?paperId=${activePaperId}`)}
              className="flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-gray-600 bg-white border border-gray-200 hover:border-indigo-400 hover:text-indigo-600 rounded-lg transition"
            >
              <PenLine size={12} /> Draw Boxes
            </button>
          )}

          {/* Paper selector */}
          <div className="relative ml-2">
            <select
              value={activePaperId ?? ""}
              onChange={e => setAnswerKey({ paperId: Number(e.target.value) || null })}
              className="h-8 pl-3 pr-8 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 appearance-none bg-white cursor-pointer min-w-[200px]"
            >
              <option value="">
                {papersLoading ? "Loading…" : "Select a paper"}
              </option>
              {papers.map(p => (
                <option key={p.id} value={p.id}>
                  {p.name}{p.subjectName ? ` — ${p.subjectName}` : ""}{p.schoolName ? ` (${p.schoolName})` : ""}{p.setNumber ? ` (Set ${p.setNumber})` : ""}
                </option>
              ))}
            </select>
            <ChevronDown size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>
        </div>

        {/* Full screen review table */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {activePaperId ? (
            <AKReviewTable
              key={activePaperId}
              questionPaperId={activePaperId}
              onBack={() => setAnswerKey({ mode: "upload" })}
            />
          ) : (
            <div className="flex items-center justify-center h-full text-gray-300 text-sm">
              Select a question paper above to load its answer key
            </div>
          )}
        </div>
      </div>
    );
  }

  // ── Upload mode ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-xl mx-auto px-6 py-6">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium transition"
          >
            <ArrowLeft size={15} /> Back
          </button>
          {/* <div className="w-px h-5 bg-gray-200" />
          <h1 className="text-lg font-bold text-gray-900">Answer Key</h1> */}
        </div>

        {/* Upload / Review / Draw Boxes toggle */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => setAnswerKey({ mode: "upload-form" })}
            className="flex-1 bg-white border-2 border-indigo-500 rounded-2xl p-5 flex flex-col gap-2 text-left transition group hover:shadow-md"
          >
            <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center">
              <Upload size={16} className="text-indigo-600" />
            </div>
            <p className="text-sm font-bold text-gray-900">Upload Answer Key</p>
            <p className="text-xs text-gray-400 leading-relaxed">
              Upload a new answer key PDF. Claude will parse, validate and write rows.
            </p>
          </button>

          <button
            onClick={() => setAnswerKey({ mode: "review" })}
            className="flex-1 bg-white border-2 border-gray-200 hover:border-indigo-400 rounded-2xl p-5 flex flex-col gap-2 text-left transition group"
          >
            <div className="w-9 h-9 bg-gray-50 rounded-xl flex items-center justify-center group-hover:bg-indigo-50 transition">
              <ClipboardList size={16} className="text-gray-400 group-hover:text-indigo-600 transition" />
            </div>
            <p className="text-sm font-bold text-gray-900">Review Answer Key</p>
            <p className="text-xs text-gray-400 leading-relaxed">
              Review, edit and publish existing answer key rows for any paper.
            </p>
          </button>

          <button
            onClick={() => setAnswerKey({ mode: "bbox" })}
            className="flex-1 bg-white border-2 border-gray-200 hover:border-indigo-400 rounded-2xl p-5 flex flex-col gap-2 text-left transition group"
          >
            <div className="w-9 h-9 bg-gray-50 rounded-xl flex items-center justify-center group-hover:bg-indigo-50 transition">
              <PenLine size={16} className="text-gray-400 group-hover:text-indigo-600 transition" />
            </div>
            <p className="text-sm font-bold text-gray-900">Draw Boxes</p>
            <p className="text-xs text-gray-400 leading-relaxed">
              Draw boxes per question for handwritten AKs.
            </p>
          </button>
        </div>

        {mode === "bbox" && (
          <BBoxPaperSelector onSelect={(paperId) => router.push(`/answerKey/bbox?paperId=${paperId}`)} />
        )}

            {mode === "upload-form" && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center gap-2 mb-5">
              <button
                onClick={() => setAnswerKey({ mode: "upload" })}
                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-indigo-600 font-medium transition"
              >
                <ArrowLeft size={13} /> Back
              </button>
              <div className="w-px h-4 bg-gray-200" />
              <h2 className="text-sm font-bold text-gray-900">Upload Answer Key PDF</h2>
            </div>
            <AKUpload onIngestComplete={handleIngestComplete} />
          </div>
        )}
        
      </div>
    </div>
  );
}


function BBoxPaperSelector({ onSelect }: { onSelect: (id: number) => void }) {
  const [papers, setPapers]     = useState<PaperOption[]>([]);
  const [loading, setLoading]   = useState(false);
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    setLoading(true);
    listQuestionPapers()
      .then(setPapers)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
      <div className="flex items-center gap-2 mb-5">
        <h2 className="text-sm font-bold text-gray-900">Draw Boxes — Select Paper</h2>
      </div>
      <div className="space-y-4">
        <div>
          <label className="block text-xs font-semibold text-gray-600 mb-1.5">
            Question Paper
          </label>
          <select
            value={selected ?? ""}
            onChange={e => setSelected(Number(e.target.value) || null)}
            className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 appearance-none bg-white"
          >
            <option value="">{loading ? "Loading…" : "Select a paper"}</option>
            {papers.map(p => (
              <option key={p.id} value={p.id}>
                {p.name}{p.subjectName ? ` — ${p.subjectName}` : ""}{p.schoolName ? ` (${p.schoolName})` : ""}{p.setNumber ? ` (Set ${p.setNumber})` : ""}
              </option>
            ))}
          </select>
        </div>
        <button
          onClick={() => selected && onSelect(selected)}
          disabled={!selected}
          className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2"
        >
          <PenLine size={14} /> Go to Draw Boxes
        </button>
      </div>
    </div>
  );
}