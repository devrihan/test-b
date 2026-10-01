"use client";

import { Loader2, ArrowLeft, ScanLine, PlusCircle } from "lucide-react";
import ConfirmModal from "../../../components/ConfirmModal";
import OCRDrawer from "../../../components/OCRDrawer";
import { OCRExtractionProvider } from "../../../context/Ocrextractioncontext";
import { useViewPaper } from "../hooks/useViewPaper";
import QuestionCard from "../components/questions/QuestionCard";
import ImageInputModal from "../components/questions/ImageInputModal";
import DiagramEditModal from "../components/questions/DiagramEditModal";
import { buildUiGroups, buildViewBlocks } from "../lib/questionGroups";

function EmptyPdf() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-400 p-8 text-center">
      <p>No PDF available for this question paper.</p>
    </div>
  );
}

export default function ViewPaper({ paperId, onBack }: { paperId: string; onBack: () => void }) {
  const vp = useViewPaper(paperId);

  return (
    <OCRExtractionProvider onFillOCR={vp.handleFillOCR} onRunOCR={vp.handleRunOCR}>
      <div className="min-h-screen lg:h-screen flex flex-col bg-gray-50">

        {/* Page header */}
        <header className="flex-none px-4 lg:px-6 py-4 border-b border-gray-200 bg-white">
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={async () => {
                if (vp.editState.status === "editing") {
                  await vp.autoSaveQuestion(vp.editState.questionId, vp.editState.form);
                }
                onBack();
              }}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium transition shrink-0"
            >
              <ArrowLeft size={15} /> Back
            </button>

            {vp.paperMeta && (
              <>
                <div className="w-px h-5 bg-gray-200 hidden sm:block" />
                <h1 className="text-base lg:text-lg font-bold text-gray-900 shrink-0">{vp.paperMeta.exam}</h1>
                <div className="flex flex-wrap gap-2 text-xs lg:text-sm text-gray-600 sm:ml-2">
                  <span className="bg-gray-100 px-2 py-0.5 rounded-md font-medium">{vp.paperMeta.schoolName}</span>
                  <span className="bg-gray-100 px-2 py-0.5 rounded-md font-medium">{vp.paperMeta.gradeName}</span>
                  <span className="bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded-md font-medium">{vp.paperMeta.subjectName}</span>
                  {vp.paperMeta.maxMarks != null && (
                    <span className="bg-green-50 text-green-700 px-2 py-0.5 rounded-md font-medium shrink-0">
                      Max Marks: {vp.paperMeta.maxMarks}
                    </span>
                  )}
                  {vp.paperMeta.setNumber && (
                    <span className="bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md font-medium shrink-0">
                      Set: {vp.paperMeta.setNumber}
                    </span>
                  )}
                  {vp.paperMeta.setMode && (
                    <span className="bg-orange-50 text-orange-700 px-2 py-0.5 rounded-md font-medium shrink-0">
                      Mode: {vp.paperMeta.setMode}
                    </span>
                  )}
                  {vp.paperMeta.academicYear && (
                    <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-md font-medium shrink-0">
                      AY: {vp.paperMeta.academicYear}
                    </span>
                  )}
                </div>
                <div className="flex-1" />
              </>
            )}
          </div>
        </header>

        {/* Split pane body */}
        <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">

          {/* Left pane: PDF viewer */}
          <aside className="w-full lg:w-2/5 h-[50vh] lg:h-full flex flex-col border-b lg:border-b-0 lg:border-r border-gray-200 bg-gray-100 shrink-0 lg:shrink">
            {!vp.loading && (
              vp.pdfUrl
                ? <iframe src={vp.pdfUrl} className="w-full h-full border-none" title="Question Paper PDF" />
                : <EmptyPdf />
            )}
          </aside>

          {/* Right pane: sidebar + scrollable question list */}
          <main className="w-full lg:w-3/5 flex flex-1 min-h-0 overflow-hidden bg-white">

            {/* Sidebar */}
            {!vp.loading && !vp.fetchError && vp.questions.length > 0 && (
              <div className="w-32 lg:w-40 shrink-0 overflow-y-auto p-4 border-r border-gray-100 bg-gray-50/30 space-y-2 font-mono text-[11px] hidden sm:block">
                {buildUiGroups(vp.questions).map((group) => (
                  <div key={group.parent} className="border border-gray-100 rounded-md p-1.5 bg-white shadow-sm mb-2">
                    <div className="font-bold mb-2 text-gray-600 bg-gray-50 px-2 py-0.5 rounded">Q{group.parent}</div>
                    {group.blocks.map((block, i) => {
                      if (block.type === "compulsory") {
                        return (
                          <div key={i} className="space-y-0.5 mb-2 px-1">
                            {block.items!.map(({ q }) => (
                              <button
                                key={q.id}
                                onClick={() => document.getElementById(`q-card-${q.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                                className="w-full text-left px-2 py-1 rounded transition-colors text-gray-600 hover:bg-indigo-50 hover:text-indigo-700"
                              >
                                {q.questionNumber}
                              </button>
                            ))}
                          </div>
                        );
                      }
                      if (block.type === "or") {
                        if (block.pickCount && block.pickCount > 1) {
                          return (
                            <div key={i} className="mb-2 p-1 border border-amber-200/50 bg-amber-50/30 rounded">
                              <div className="text-amber-600 font-semibold mb-1 text-[10px] uppercase tracking-wide">
                                Choose any {block.pickCount}:
                              </div>
                              <div className="space-y-0.5">
                                {block.sets!.flatMap((s) => s.items).map(({ q }) => (
                                  <button
                                    key={q.id}
                                    onClick={() => document.getElementById(`q-card-${q.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                                    className="w-full text-left px-2 py-1 rounded transition-colors flex items-center gap-1.5 text-gray-600 hover:bg-amber-100/50 hover:text-amber-700"
                                  >
                                    <span className="text-gray-400">☐</span> {q.questionNumber}
                                  </button>
                                ))}
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div key={i} className="mb-2 p-1 border border-amber-200/50 bg-amber-50/30 rounded">
                            <div className="text-amber-600 font-semibold mb-1 text-[10px] uppercase tracking-wide">Choose one:</div>
                            {block.sets!.map((set, si) => (
                              <div key={si}>
                                {si > 0 && <div className="text-center text-[9px] text-amber-400 font-bold my-1">OR</div>}
                                <div className="space-y-0.5">
                                  {set.items.map(({ q }) => (
                                    <button
                                      key={q.id}
                                      onClick={() => document.getElementById(`q-card-${q.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" })}
                                      className="w-full text-left px-2 py-1 rounded transition-colors text-gray-600 hover:bg-amber-100/50 hover:text-amber-700"
                                    >
                                      {q.questionNumber}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        );
                      }
                      return null;
                    })}
                  </div>
                ))}
              </div>
            )}

            {/* Question list */}
            <div className="flex-1 overflow-y-auto px-4 lg:px-6 py-6 lg:py-8">
              <div className="max-w-3xl mx-auto">

                {vp.loading && (
                  <div className="flex flex-col items-center justify-center py-20 text-indigo-600">
                    <Loader2 size={32} className="animate-spin mb-4" />
                    <p className="text-sm font-medium">Loading question paper...</p>
                  </div>
                )}

                {vp.fetchError && (
                  <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center shadow-sm">
                    <p className="text-red-500 font-medium mb-4">{vp.fetchError}</p>
                    <button onClick={vp.fetchPaperData} className="text-indigo-600 hover:underline text-sm font-semibold mr-4">
                      Retry
                    </button>
                    <button onClick={onBack} className="text-gray-500 hover:underline text-sm">Go back</button>
                  </div>
                )}

                {!vp.loading && !vp.fetchError && vp.paperMeta && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-end mb-4">
                      <h2 className="text-base font-bold text-gray-800">Questions ({vp.questions.length})</h2>
                      <button
                        onClick={() => vp.setShowReExtractModal(true)}
                        disabled={vp.isReExtractingPaper}
                        className="flex items-center gap-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-semibold transition shadow-sm"
                      >
                        {vp.isReExtractingPaper ? (
                          <><Loader2 size={16} className="animate-spin" /> Re-extracting...</>
                        ) : (
                          <><ScanLine size={16} /> Re-extract Entire Paper</>
                        )}
                      </button>
                    </div>

                    {vp.isReExtractingPaper && (
                      <div className="flex items-center justify-center gap-3 text-sm text-indigo-700 font-medium bg-indigo-50/80 border border-indigo-200/60 rounded-xl p-4 shadow-sm animate-pulse">
                        <Loader2 size={18} className="animate-spin text-indigo-600" />
                        <span>Extracting questions with AI (takes ~1-2 minutes). Please don&apos;t close this page...</span>
                      </div>
                    )}

                    {vp.questions.length === 0 ? (
                      <div className="bg-white border border-gray-200 rounded-2xl p-12 text-center text-gray-500 text-sm shadow-sm">
                        This question paper hasn&apos;t been parsed yet or has no questions.
                      </div>
                    ) : (
                      buildViewBlocks(vp.questions).map((block, index) => {
                        if (block.type === "single") {
                          return block.items!.map((q) => (
                            <QuestionCard
                              key={q.id}
                              q={q}
                              editState={vp.editState}
                              onEdit={vp.handleEdit}
                              onCancel={vp.handleCancel}
                              onSave={vp.handleSave}
                              onDelete={(id) => vp.setDeleteQuestionId(id)}
                              onAddBelow={vp.handleAddQuestion}
                              onFormChange={vp.handleFormChange}
                              onReExtract={(q) => vp.setReExtractQuestionId(q.id)}
                              onEditDiagram={(q) => vp.setEditingDiagramId(q.id)}
                              saveError={vp.saveError}
                            />
                          ));
                        }
                        if (block.type === "or") {
                          return (
                            <div key={`or-${index}`} className="border-2 border-amber-200 rounded-xl p-4 bg-amber-50/50 shadow-sm relative overflow-hidden">
                              <div className="absolute top-0 left-0 w-1.5 h-full bg-amber-400" />
                              <div className="text-xs font-black text-amber-700 mb-4 uppercase tracking-wide flex items-center gap-2">
                                {block.pickCount && block.pickCount > 1 ? `Choose any ${block.pickCount}` : "Choose one"}
                              </div>
                              <div className="space-y-4">
                                {block.sets!.map((set, setIndex) => (
                                  <div key={setIndex}>
                                    {setIndex > 0 && (
                                      <div className="flex items-center justify-center my-6 relative">
                                        <div className="absolute inset-0 flex items-center">
                                          <div className="w-full border-t-2 border-dashed border-amber-300" />
                                        </div>
                                        <span className="relative bg-amber-50 px-4 text-[11px] font-black tracking-widest text-amber-500 rounded-full border-2 border-amber-200">
                                          OR
                                        </span>
                                      </div>
                                    )}
                                    <div className="space-y-4">
                                      {set.items.map((q) => (
                                        <QuestionCard
                                          key={q.id}
                                          q={q}
                                          editState={vp.editState}
                                          onEdit={vp.handleEdit}
                                          onCancel={vp.handleCancel}
                                          onSave={vp.handleSave}
                                          onDelete={(id) => vp.setDeleteQuestionId(id)}
                                          onAddBelow={vp.handleAddQuestion}
                                          onFormChange={vp.handleFormChange}
                                          onReExtract={(q) => vp.setReExtractQuestionId(q.id)}
                                          onEditDiagram={(q) => vp.setEditingDiagramId(q.id)}
                                          saveError={vp.saveError}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        }
                        return null;
                      })
                    )}

                    <div className="pt-4 border-t border-gray-200 mt-6 flex justify-center">
                      <button
                        onClick={() => vp.handleAddQuestion()}
                        className="flex items-center gap-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 px-4 py-2 rounded-lg text-sm font-semibold transition shadow-sm"
                      >
                        <PlusCircle size={16} /> Add Question
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </main>
        </div>

        <ConfirmModal
          isOpen={vp.deleteQuestionId !== null}
          title="Delete Question"
          message="Are you sure you want to delete this question? This action cannot be undone."
          confirmText="Delete"
          onConfirm={vp.handleDeleteQuestion}
          onCancel={() => vp.setDeleteQuestionId(null)}
        />
        <ConfirmModal
          isOpen={vp.showReExtractModal}
          title="Re-extract Entire Question Paper"
          message="This action will re-process the entire question paper document to extract text, options, and marks. It will update the existing questions with the newly extracted data. This process may take a minute or two to complete. Are you sure you want to proceed?"
          confirmText="Proceed"
          onConfirm={vp.executeReExtractEntirePaper}
          onCancel={() => vp.setShowReExtractModal(false)}
        />
        <ConfirmModal
          isOpen={vp.successMessage !== null}
          title="Success"
          message={vp.successMessage || ""}
          confirmText="Done"
          iconType="success"
          onConfirm={() => vp.setSuccessMessage(null)}
          onCancel={() => vp.setSuccessMessage(null)}
        />
        <ConfirmModal
          isOpen={vp.errorMessage !== null}
          title="Error"
          message={vp.errorMessage || ""}
          confirmText="Dismiss"
          iconType="warning"
          onConfirm={() => vp.setErrorMessage(null)}
          onCancel={() => vp.setErrorMessage(null)}
        />
      </div>

      {vp.editingDiagramId !== null && vp.questions.find((q) => q.id === vp.editingDiagramId) && (
        <DiagramEditModal
          question={vp.questions.find((q) => q.id === vp.editingDiagramId)!}
          onClose={() => vp.setEditingDiagramId(null)}
          onCommit={vp.handleCommitRecropDiagram}
        />
      )}
      {vp.reExtractQuestionId !== null && (
        <ImageInputModal
          questionId={String(vp.reExtractQuestionId)}
          onClose={() => vp.setReExtractQuestionId(null)}
        />
      )}
      <OCRDrawer latexPreview={true} />
    </OCRExtractionProvider>
  );
}
