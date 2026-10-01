"use client";

import { ArrowLeft, Upload, FileText, BookOpen, Link2, BarChart2, Loader2, Plus, ListChecks } from "lucide-react";
import { useRouter } from "next/navigation";
import CreatePaper from "./screens/CreatePaper";
import ViewPaper from "./screens/ViewPaper";
import ChapterMappingScreen from "./screens/ChapterMappingScreen";
import ConceptMappingScreen from "./screens/ConceptMappingScreen";
import BloomsMappingScreen from "./screens/BloomsMappingScreen";
import QuestionMappingsScreen from "./screens/QuestionMappingsScreen";
import { useQuestionPaperList } from "@/app/hooks/useQuestionPaperList";

function ComingSoonScreen({ title, onBack }: { title: string; onBack: () => void }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-6">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium transition mb-6"
        >
          <ArrowLeft size={15} /> Back
        </button>
        <p className="text-sm text-gray-400 text-center mt-20">{title} — coming soon</p>
      </div>
    </div>
  );
}

export default function QuestionPaperPage() {
  const router = useRouter();
  const { mode, setMode, subView, setSubView, selectedPaperId, setSelectedPaperId, filtered, loading, error, refresh } =
    useQuestionPaperList();

  if (mode === "create") {
    return <CreatePaper onCancel={() => { setMode("list"); setSubView("hub"); }} />;
  }

  if (mode === "view" && selectedPaperId) {
    return (
      <ViewPaper
        paperId={selectedPaperId}
        onBack={() => { setMode("list"); setSelectedPaperId(null); setSubView("papers"); }}
      />
    );
  }

  if (subView === "chapter-mapping") return <ChapterMappingScreen onBack={() => setSubView("hub")} />;
  if (subView === "concept-mapping") return <ConceptMappingScreen onBack={() => setSubView("hub")} />;
  if (subView === "blooms") return <BloomsMappingScreen onBack={() => setSubView("hub")} />;
  if (subView === "question-mappings") return <QuestionMappingsScreen onBack={() => setSubView("hub")} />;

  // --- Hub ---
  if (subView === "hub") {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-2xl mx-auto px-6 py-6">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium transition mb-6"
          >
            <ArrowLeft size={15} /> Back
          </button>

          {/* Row 1: available features */}
          <div className="flex gap-3 mb-3">
            <button
              onClick={() => setMode("create")}
              className="flex-1 bg-white border-2 border-gray-200 hover:border-indigo-400 rounded-2xl p-5 flex flex-col gap-2 text-left transition group"
            >
              <div className="w-9 h-9 bg-gray-50 rounded-xl flex items-center justify-center group-hover:bg-indigo-50 transition">
                <Upload size={16} className="text-gray-400 group-hover:text-indigo-600 transition" />
              </div>
              <p className="text-sm font-bold text-gray-900">Upload Question Paper</p>
              <p className="text-xs text-gray-400 leading-relaxed">
                Upload a PDF and extract questions via OCR into a structured, editable format.
              </p>
            </button>

            <button
              onClick={() => setSubView("papers")}
              className="flex-1 bg-white border-2 border-gray-200 hover:border-indigo-400 rounded-2xl p-5 flex flex-col gap-2 text-left transition group"
            >
              <div className="w-9 h-9 bg-gray-50 rounded-xl flex items-center justify-center group-hover:bg-indigo-50 transition">
                <FileText size={16} className="text-gray-400 group-hover:text-indigo-600 transition" />
              </div>
              <p className="text-sm font-bold text-gray-900">View Question Papers</p>
              <p className="text-xs text-gray-400 leading-relaxed">
                Browse all uploaded papers, edit questions, fix OCR, and review content.
              </p>
            </button>
          </div>

          {/* Row 2: coming-soon features */}
          <div className="flex gap-3">
            <button
              onClick={() => setSubView("chapter-mapping")}
              className="flex-1 bg-white border-2 border-gray-200 hover:border-indigo-400 rounded-2xl p-5 flex flex-col gap-2 text-left transition group"
            >
              <div className="w-9 h-9 bg-gray-50 rounded-xl flex items-center justify-center group-hover:bg-indigo-50 transition">
                <BookOpen size={16} className="text-gray-400 group-hover:text-indigo-600 transition" />
              </div>
              <p className="text-sm font-bold text-gray-900">Chapter–Concept Mapping</p>
              <p className="text-xs text-gray-400 leading-relaxed">
                Upload and manage units, chapters, and concepts by grade and subject.
              </p>
            </button>

            <button
              onClick={() => setSubView("concept-mapping")}
              className="flex-1 bg-white border-2 border-gray-200 hover:border-indigo-400 rounded-2xl p-5 flex flex-col gap-2 text-left transition group"
            >
              <div className="w-9 h-9 bg-gray-50 rounded-xl flex items-center justify-center group-hover:bg-indigo-50 transition">
                <Link2 size={16} className="text-gray-400 group-hover:text-indigo-600 transition" />
              </div>
              <p className="text-sm font-bold text-gray-900">Concept–Question Mapping</p>
              <p className="text-xs text-gray-400 leading-relaxed">
                AI-tag individual questions to concepts for revision and analytics.
              </p>
            </button>

            <button
              onClick={() => setSubView("blooms")}
              className="flex-1 bg-white border-2 border-gray-200 hover:border-indigo-400 rounded-2xl p-5 flex flex-col gap-2 text-left transition group"
            >
              <div className="w-9 h-9 bg-gray-50 rounded-xl flex items-center justify-center group-hover:bg-indigo-50 transition">
                <BarChart2 size={16} className="text-gray-400 group-hover:text-indigo-600 transition" />
              </div>
              <p className="text-sm font-bold text-gray-900">Bloom&apos;s & Difficulty</p>
              <p className="text-xs text-gray-400 leading-relaxed">
                AI-map Bloom&apos;s levels and difficulty ratings across papers.
              </p>
            </button>

            <button
              onClick={() => setSubView("question-mappings")}
              className="flex-1 bg-white border-2 border-gray-200 hover:border-indigo-400 rounded-2xl p-5 flex flex-col gap-2 text-left transition group"
            >
              <div className="w-9 h-9 bg-gray-50 rounded-xl flex items-center justify-center group-hover:bg-indigo-50 transition">
                <ListChecks size={16} className="text-gray-400 group-hover:text-indigo-600 transition" />
              </div>
              <p className="text-sm font-bold text-gray-900">Question Mappings</p>
              <p className="text-xs text-gray-400 leading-relaxed">
                Ingest the school blueprint: chapter, Bloom&apos;s &amp; difficulty with origin tracking.
              </p>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Papers list ---
  return (
    <div className="min-h-screen bg-gray-50 flex">
      <div className="flex-1 px-6 py-6">
        <button
          onClick={() => setSubView("hub")}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium transition mb-6"
        >
          <ArrowLeft size={15} /> Question Papers
        </button>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-indigo-500" />
          </div>
        )}

        {error && (
          <div className="text-center py-20">
            <p className="text-red-500 text-sm font-medium">{error}</p>
            <button onClick={refresh} className="mt-3 text-indigo-600 text-sm underline">Try again</button>
          </div>
        )}

        {!loading && !error && filtered.length === 0 && (
          <div className="text-center py-20">
            <p className="text-gray-400 text-sm font-medium">No question papers found</p>
            <button
              onClick={() => setMode("create")}
              className="mt-4 flex items-center gap-1.5 h-9 px-4 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition mx-auto"
            >
              <Plus size={14} /> Create your first question paper
            </button>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="flex justify-end mb-4">
            <button
              onClick={() => setMode("create")}
              className="flex items-center gap-1.5 h-8 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition"
            >
              <Plus size={12} /> New Question Paper
            </button>
          </div>
        )}

        {!loading && !error && filtered.length > 0 && (
          <div className="space-y-3">
            {filtered.map((paper) => (
              <div
                key={paper.id}
                onClick={() => { setSelectedPaperId(String(paper.id)); setMode("view"); }}
                className="bg-white border border-gray-200 rounded-xl px-5 py-4 flex items-center gap-4 hover:border-indigo-300 hover:shadow-sm transition cursor-pointer group"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-semibold text-gray-900 truncate">{paper.exam}</span>
                    <span className="shrink-0 text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600">
                      {paper.subjectName}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-400">
                    {paper.schoolName && (
                      <><span className="font-medium text-gray-500">{paper.schoolName}</span><span>·</span></>
                    )}
                    <span>{paper.gradeName}</span>
                    {paper.setNumber && (
                      <><span>·</span><span className="font-medium text-gray-600">Set {paper.setNumber}</span></>
                    )}
                  </div>
                </div>
                <div className="text-center mr-2 shrink-0">
                  <p className="text-lg font-bold text-gray-900">{paper.maxMarks || "-"}</p>
                  <p className="text-[10px] text-gray-400 font-medium">max marks</p>
                </div>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#d1d5db" strokeWidth="2" className="shrink-0 group-hover:translate-x-1 transition-transform group-hover:stroke-indigo-400">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
