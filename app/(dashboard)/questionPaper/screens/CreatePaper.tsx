"use client";

import { ArrowLeft, FileText, Plus, X, Loader2, Save, CheckCircle } from "lucide-react";
import PaperMetaForm from "../components/create/PaperMetaForm";
import ReviewQuestionCard from "../components/create/ReviewQuestionCard";
import { useCreatePaper } from "../hooks/useCreatePaper";
import { buildUiGroupsForCreate } from "../lib/questionGroups";

export default function CreatePaper({ onCancel }: { onCancel?: () => void }) {
  const cp = useCreatePaper(onCancel);

  if (cp.step === "review") {
    return (
      <div className="min-h-screen bg-gradient-to-b from-gray-50 to-gray-100/50 px-4 py-6">
        <div className="max-w-[1600px] mx-auto">

          <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
            <div className="flex items-center gap-3">
              <button onClick={cp.navigate} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium transition">
                <ArrowLeft size={15} /> Back
              </button>
              <div className="w-px h-5 bg-gray-200" />
              <button onClick={() => cp.setStep("form")} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium transition">
                <ArrowLeft size={15} /> Edit Details
              </button>
              <div className="w-px h-5 bg-gray-200" />
              <h1 className="text-lg font-bold text-gray-900">Review Extracted Questions</h1>
            </div>
            <button
              onClick={cp.clearSession}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 font-medium transition px-3 py-1.5 rounded-lg hover:bg-red-50 border border-transparent hover:border-red-200"
            >
              <X size={13} /> New Paper
            </button>
          </div>

          <div className="flex flex-col lg:flex-row gap-4 h-auto lg:h-[calc(100vh-120px)] min-h-[400px]">

            {/* PDF preview panel */}
            <div className="w-full lg:w-[40%] xl:w-[45%] shrink-0 bg-white border border-gray-200 rounded-2xl overflow-hidden shadow-sm flex flex-col h-[50vh] min-h-[300px] lg:h-auto">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50/80">
                <FileText size={14} className="text-indigo-500" />
                <span className="text-xs font-semibold text-gray-600">Question Paper Preview</span>
              </div>
              {cp.pdfUrl ? (
                <iframe src={cp.pdfUrl} className="flex-1 w-full" title="Question Paper PDF" />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-gray-300 gap-2">
                  <FileText size={48} strokeWidth={1} />
                  <p className="text-xs text-gray-400">PDF preview not available after refresh</p>
                  <p className="text-[10px] text-gray-300">Re-upload the PDF to restore the preview</p>
                </div>
              )}
            </div>

            {/* Questions panel */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

              {/* Paper metadata summary */}
              <div className="bg-white border border-gray-200 rounded-2xl p-4 mb-4 shadow-sm shrink-0 overflow-x-auto">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-3 text-sm">
                    {([
                      ["School", cp.resolvedNames.schoolName],
                      ["Grade", cp.resolvedNames.gradeName],
                      ["Subject", cp.resolvedNames.subjectName],
                      ["Subject Code", cp.registry.subjects.find((s) => String(s.id) === cp.form.subject_id)?.subjectCode || ""],
                      ["Exam", cp.form.exam_name],
                      ["Set", cp.form.set_number],
                      ["Type", cp.form.exam_type],
                      ["Sections", cp.resolvedSectionNames],
                      ["Max Marks", cp.form.max_marks],
                    ] as [string, string][])
                      .filter(([, value]) => value)
                      .map(([label, value]) => (
                        <div key={label}>
                          <span className="text-gray-400 text-[10px] uppercase tracking-wider font-semibold">{label}</span>
                          <p className="font-semibold text-gray-800 text-xs mt-0.5">{value}</p>
                        </div>
                      ))}
                  </div>
                  <div className="flex flex-wrap items-center gap-4">
                    <div className="flex items-center gap-1.5">
                      <div className="w-7 h-7 rounded-lg bg-indigo-50 flex items-center justify-center">
                        <span className="text-xs font-bold text-indigo-600">{cp.questions.length}</span>
                      </div>
                      <span className="text-[10px] text-gray-400 font-medium">Qs</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-7 h-7 rounded-lg bg-emerald-50 flex items-center justify-center">
                        <span className="text-xs font-bold text-emerald-600">{cp.totalMarks}</span>
                      </div>
                      <span className="text-[10px] text-gray-400 font-medium">Marks</span>
                    </div>
                    <button
                      onClick={cp.addQuestionAtEnd}
                      className="ml-2 flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-indigo-600 bg-indigo-50 hover:bg-indigo-100 rounded-lg transition-colors shadow-sm border border-indigo-100"
                    >
                      <Plus size={14} /> Add Q
                    </button>
                  </div>
                </div>
              </div>

              <div className="flex flex-1 min-h-0 gap-2">

                {/* Sidebar tree */}
                <div className="w-40 shrink-0 overflow-y-auto py-4 space-y-2 font-mono text-[11px] pr-2 hidden sm:block">
                  {buildUiGroupsForCreate(cp.questions).map((group) => (
                    <div key={group.parent} className="border border-gray-100 rounded-md p-1.5 bg-gray-50/30">
                      <div className="font-bold mb-2 text-gray-600 bg-gray-100 px-2 py-0.5 rounded">
                        Q{group.parent}
                      </div>
                      {group.blocks.map((block, i) => {
                        if (block.type === "compulsory") {
                          return (
                            <div key={i} className="space-y-0.5 mb-2 px-1">
                              {block.items!.map(({ q }) => {
                                const isActive = cp.editingKey === q.question_number;
                                return (
                                  <button
                                    key={q._ui_id || q.question_number}
                                    onClick={() => cp.openEditor(q.question_number)}
                                    className={`w-full text-left px-2 py-1 rounded transition-colors ${
                                      isActive ? "bg-indigo-100 text-indigo-700 font-bold" : "text-gray-600 hover:bg-gray-200"
                                    }`}
                                  >
                                    {q.question_number}
                                  </button>
                                );
                              })}
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
                                  {block.sets!.flatMap((s) => s.items).map(({ q }) => {
                                    const isActive = cp.editingKey === q.question_number;
                                    return (
                                      <button
                                        key={q._ui_id || q.question_number}
                                        onClick={() => cp.openEditor(q.question_number)}
                                        className={`w-full text-left px-2 py-1 rounded transition-colors flex items-center gap-1.5 ${
                                          isActive ? "bg-indigo-100 text-indigo-700 font-bold" : "text-gray-600 hover:bg-amber-100/50"
                                        }`}
                                      >
                                        <span className="text-gray-400">☐</span> {q.question_number}
                                      </button>
                                    );
                                  })}
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
                                    {set.items.map(({ q }) => {
                                      const isActive = cp.editingKey === q._ui_id;
                                      return (
                                        <button
                                          key={q._ui_id || q.question_number}
                                          onClick={() => cp.openEditor(q._ui_id!)}
                                          className={`w-full text-left px-2 py-1 rounded transition-colors ${
                                            isActive ? "bg-indigo-100 text-indigo-700 font-bold" : "text-gray-600 hover:bg-amber-100/50"
                                          }`}
                                        >
                                          {q.question_number}
                                        </button>
                                      );
                                    })}
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

                {/* Question cards list */}
                <div className="flex-1 overflow-y-auto pr-1 space-y-3 pb-4">
                  {cp.questions.map((q, idx) => (
                    <ReviewQuestionCard
                      key={q._ui_id || q.question_number}
                      q={q}
                      idx={idx}
                      editingKey={cp.editingKey}
                      questionTextRef={(el) => {
                        if (el) cp.questionTextRefs.current.set(idx, el);
                        else cp.questionTextRefs.current.delete(idx);
                      }}
                      onOpenEditor={cp.openEditor}
                      onSave={cp.saveQuestion}
                      onAddBelow={cp.addQuestionAt}
                      onDelete={cp.deleteQuestionAt}
                      onUpdate={cp.updateQuestion}
                      onApplyHangingIndent={cp.applyHangingIndent}
                      onToggleDiagram={cp.toggleDiagram}
                      onToggleQuestionChemStructure={cp.toggleQuestionChemStructure}
                      onToggleAnswerChemStructure={cp.toggleAnswerChemStructure}
                      onRecropDiagram={cp.recropDiagram}
                    />
                  ))}

                  <button
                    onClick={cp.addQuestionAtEnd}
                    className="w-full h-9 border-2 border-dashed border-gray-300 hover:border-indigo-400 rounded-xl flex items-center justify-center gap-1.5 text-xs font-semibold text-gray-400 hover:text-indigo-600 transition"
                  >
                    <Plus size={13} /> Add Question
                  </button>
                </div>
              </div>

              {/* Save bar */}
              <div className="shrink-0 pt-3 border-t border-gray-200 mt-2">
                {cp.error && <p className="text-xs text-red-500 font-medium mb-2">{cp.error}</p>}
                {cp.success && (
                  <div className="flex items-center gap-2 text-xs text-emerald-600 font-medium bg-emerald-50 border border-emerald-200 rounded-lg p-2.5 mb-2">
                    <CheckCircle size={13} className="text-emerald-500 shrink-0" />
                    <span>{cp.success}</span>
                  </div>
                )}
                <button
                  onClick={cp.handleSaveToBackend}
                  disabled={cp.saving || cp.questions.length === 0}
                  className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2 shadow-sm shadow-indigo-200"
                >
                  {cp.saving ? (
                    <><Loader2 size={14} className="animate-spin" /> Saving…</>
                  ) : (
                    <><Save size={14} /> Save ({cp.questions.length} questions, {cp.totalMarks} marks)</>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <PaperMetaForm
      form={cp.form}
      registry={cp.registry}
      sections={cp.sections}
      pdfFile={cp.pdfFile}
      ocrStatus={cp.ocrStatus}
      error={cp.error}
      success={cp.success}
      submitting={cp.submitting}
      fileInputRef={cp.fileInputRef}
      onNavigateBack={cp.navigate}
      onSetField={cp.setField}
      onSetForm={cp.setForm}
      onSetPdfFile={cp.setPdfFile}
      onSetError={cp.setError}
      onSetSuccess={cp.setSuccess}
      onSubmit={cp.handleUploadAndParse}
    />
  );
}
