"use client";

import { ArrowLeft, Upload, Loader2, X, CheckCircle } from "lucide-react";
import SmartSelect from "../SmartSelect";
import MultiSelect from "../MultiSelect";
import type { FormState, Registry, SectionItem } from "../../lib/types";
import { academicYearLabel } from "../../lib/types";
import { SET_NUMBER_OPTIONS, SET_MODE_OPTIONS, MAX_PDF_SIZE_MB } from "../../lib/constants";

interface PaperMetaFormProps {
  form: FormState;
  registry: Registry;
  sections: SectionItem[];
  pdfFile: File | null;
  ocrStatus: string;
  error: string | null;
  success: string | null;
  submitting: boolean;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onNavigateBack: () => void;
  onSetField: (key: keyof FormState) => (val: string) => void;
  onSetForm: React.Dispatch<React.SetStateAction<FormState>>;
  onSetPdfFile: (f: File | null) => void;
  onSetError: (e: string | null) => void;
  onSetSuccess: (s: string | null) => void;
  onSubmit: () => void;
}

export default function PaperMetaForm({
  form, registry, sections, pdfFile, ocrStatus, error, success, submitting,
  fileInputRef, onNavigateBack, onSetField, onSetForm, onSetPdfFile, onSetError, onSetSuccess, onSubmit,
}: PaperMetaFormProps) {
  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="max-w-xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <button onClick={onNavigateBack} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium transition">
            <ArrowLeft size={15} /> Back
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <h1 className="text-lg font-bold text-gray-900">Upload Question Paper</h1>
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">
          <SmartSelect
            label="School Name" required value={form.school_id}
            options={registry.schools.map((s) => ({ label: s.name, value: String(s.id) }))}
            placeholder="Select school" onChange={onSetField("school_id")}
          />

          <div className="grid grid-cols-2 gap-4">
            <SmartSelect
              label="Grade" required value={form.grade_id}
              options={registry.grades.map((g) => ({ label: g.name, value: String(g.id) }))}
              placeholder="Select grade" onChange={onSetField("grade_id")}
            />
            <SmartSelect
              label="Subject Name" required value={form.subject_id}
              options={registry.subjects.map((s) => ({ label: s.name, value: String(s.id) }))}
              placeholder="Select subject" onChange={onSetField("subject_id")}
            />
          </div>

          <div>
            <SmartSelect
              label="Exam Name" required value={form.exam_name}
              options={registry.examNames
                .filter((e) =>
                  (!form.school_id || String(e.schoolId) === form.school_id) &&
                  (!form.grade_id || String(e.gradeId) === form.grade_id)
                )
                .map((e) => ({ label: e.name, value: e.name }))}
              placeholder="Select exam name"
              onChange={(val) => {
                onSetField("exam_name")(val);
                const examObj = registry.examNames.find((e) => e.name === val);
                if (examObj) {
                  onSetField("exam_id")(String(examObj.id));
                  if (examObj.examDate) {
                    const d = new Date(examObj.examDate);
                    if (!isNaN(d.getTime())) onSetField("exam_date")(d.toISOString().split("T")[0]);
                  }
                  if (examObj.examType) onSetField("exam_type")(examObj.examType);
                }
              }}
            />
            <p className="mt-1 text-[11px] text-gray-400">
              A new question paper record will be created with this name.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Exam Date</label>
              <input
                type="text" readOnly
                value={form.exam_date || "Auto-filled on selection"}
                className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed focus:outline-none transition"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Max Marks <span className="text-red-400">*</span>
              </label>
              <input
                type="number" min="1" step="any"
                value={form.max_marks || ""}
                onChange={(e) => onSetField("max_marks")(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder="e.g. 80"
                className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Subject Code</label>
              <input
                type="text" readOnly
                value={registry.subjects.find((s) => String(s.id) === form.subject_id)?.subjectCode || ""}
                placeholder="Autofills from subject..."
                className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed focus:outline-none transition"
              />
            </div>
            <SmartSelect
              label="Set Number" required value={form.set_number}
              options={SET_NUMBER_OPTIONS}
              placeholder="Select set" onChange={onSetField("set_number")}
            />
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Exam Type</label>
              <input
                type="text" readOnly
                value={form.exam_type || ""}
                placeholder="Autofills from exam..."
                className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed focus:outline-none transition"
              />
            </div>
            <SmartSelect
              label="Set Mode" required value={form.set_mode}
              options={SET_MODE_OPTIONS}
              placeholder="Select set mode" onChange={onSetField("set_mode")}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <SmartSelect
              label="Academic Year" value={form.academic_year_id}
              options={registry.academicYears.map((y) => ({ label: academicYearLabel(y), value: String(y.id) }))}
              placeholder="Select academic year"
              helperText="No academic years configured yet."
              onChange={onSetField("academic_year_id")}
            />
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Display Name</label>
              <input
                type="text"
                value={form.display_name}
                onChange={(e) => onSetField("display_name")(e.target.value)}
                placeholder="Friendly name shown in the paper list"
                className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/10 transition"
              />
            </div>
          </div>

          <MultiSelect
            label="Sections Attended"
            values={form.sections_attended}
            options={sections.map((s) => ({ label: s.name, value: s.id }))}
            emptyText={
              !form.school_id || !form.grade_id
                ? "Select a school and grade first"
                : "No sections configured for this school + grade"
            }
            helperText="The sections that sat this paper."
            onChange={(ids) => onSetForm((prev) => ({ ...prev, sections_attended: ids }))}
          />

          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Upload Question Paper (PDF) <span className="text-red-400">*</span>
            </label>
            <p className="text-xs text-gray-400 mb-2">
              PDF file containing the questions. OCR will extract and structure them automatically. Max {MAX_PDF_SIZE_MB} MB.
            </p>
            <div className="space-y-2">
              {pdfFile ? (
                <div className="flex items-center gap-3 h-9 px-3 bg-green-50 border border-green-200 rounded-lg">
                  <span className="text-xs font-medium text-green-700 flex-1 truncate">{pdfFile.name}</span>
                  <span className="text-xs text-green-500">{(pdfFile.size / 1024 / 1024).toFixed(1)} MB</span>
                  <button
                    onClick={() => { onSetPdfFile(null); onSetError(null); onSetSuccess(null); }}
                    className="text-green-400 hover:text-red-400 transition"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full h-9 px-3 bg-white border border-dashed border-gray-300 hover:border-indigo-400 text-gray-500 hover:text-indigo-600 rounded-lg text-xs font-medium transition flex items-center justify-center gap-2"
                >
                  <Upload size={13} /> Select PDF
                </button>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
                  onSetError("Please select a valid PDF file."); return;
                }
                if (file.size > MAX_PDF_SIZE_MB * 1024 * 1024) {
                  onSetError(`PDF exceeds the ${MAX_PDF_SIZE_MB} MB limit.`); return;
                }
                onSetPdfFile(file);
                onSetError(null);
                if (fileInputRef.current) fileInputRef.current.value = "";
              }}
            />
          </div>

          {ocrStatus && (
            <div className="flex items-center gap-2 text-xs text-indigo-600 font-medium bg-indigo-50 border border-indigo-200 rounded-lg p-3">
              <Loader2 size={14} className="animate-spin shrink-0" />
              <span>{ocrStatus}</span>
            </div>
          )}

          {error && <p className="text-xs text-red-500 font-medium">{error}</p>}
          {success && (
            <div className="flex items-center gap-2 text-xs text-emerald-600 font-medium bg-emerald-50 border border-emerald-200 rounded-lg p-3">
              <CheckCircle size={14} className="text-emerald-500 shrink-0" />
              <span>{success}</span>
            </div>
          )}

          <button
            onClick={onSubmit}
            disabled={submitting}
            className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2"
          >
            {submitting ? (
              <><Loader2 size={15} className="animate-spin" /> Uploading &amp; Parsing…</>
            ) : (
              "Upload and Parse"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
