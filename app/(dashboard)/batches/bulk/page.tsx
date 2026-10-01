"use client";

import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { keys } from "@/app/lib/queryKeys";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, CheckCircle2, XCircle } from "lucide-react";
import SmartSelect from "../components/SmartSelect";
import MultiSelect from "../components/MultiSelect";
import BatchOptions from "../components/BatchOptions";
import { getAuthToken as getToken } from "@/app/lib/auth";


const BASE = process.env.NEXT_PUBLIC_BEAVER_API_URL ?? "http://localhost:4000";
const API_BASE = process.env.NEXT_PUBLIC_AGGREGATED_DATA_API_URL ?? "http://localhost:8082";


type ComboResult = {
  label: string;
  status: "created" | "failed";
  error?: string;
};

/* ── Bulk Batch Creation ──────────────────────────────────────
   Multi-select grade / section / subject; school, exam and all
   other options are single selections applied to every combination.
   One batch is created per grade × section × subject combo by
   looping the same POST /api/batches used in single creation.
   ───────────────────────────────────────────────────────────── */
interface RegistryOptions {
  schools: any[];
  grades: any[];
  sections: string[];
  subjects: any[];
  exams: any[];
}

const EMPTY_REGISTRY: RegistryOptions = {
  schools: [], grades: [], sections: [], subjects: [], exams: [],
};

export default function BulkBatchPage() {
  const router = useRouter();

  // Single selections applied to every combination.
  const [form, setForm] = useState({
    school_id: "",
    exam_id: "",
    total_questions: "0",
    grading_grid_mode: "none" as "table" | "none",
    skip_bbox_flow: false,
    sheet_type: "a4" as "booklet" | "a4",
    margin_pct: "6",
    rotate_pages: false,
    rotate_a4_pages: false,
  });

  // Sections to create a batch for. Filtered to the chosen question paper's set.
  const [sectionVals, setSectionVals] = useState<string[]>([]);

  const [questionNumbers, setQuestionNumbers] = useState<string[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [results, setResults] = useState<ComboResult[] | null>(null);

  const set = (key: string) => (val: string) =>
    setForm(prev => ({ ...prev, [key]: val }));

  // Shares the registry cache with /exportData and /batches/new.
  const registryQuery = useQuery({
    queryKey: keys.registry.batchFormOptions(),
    queryFn: async (): Promise<RegistryOptions> => {
      const token = getToken();
      const res = await fetch(`${API_BASE}/api/registry/batch-form-options`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Failed to load registry");
      return res.json();
    },
  });

  const registry = registryQuery.data ?? EMPTY_REGISTRY;

  // Auto-detect total questions for the single selected exam (same as single flow).
  useEffect(() => {
    if (!form.exam_id) {
      setQuestionNumbers([]);
      setForm(prev => ({ ...prev, total_questions: "0" }));
      return;
    }
    const fetchQuestions = async () => {
      setLoadingQuestions(true);
      try {
        const token = getToken();
        const res = await fetch(`${API_BASE}/api/registry/exams/${form.exam_id}/questions`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (res.ok) {
          const qNums: string[] = await res.json();
          setQuestionNumbers(qNums);
          setForm(prev => ({ ...prev, total_questions: String(qNums.length) }));
        }
      } catch (err) {
        console.error("Failed to fetch exact question numbers", err);
      } finally {
        setLoadingQuestions(false);
      }
    };
    fetchQuestions();
  }, [form.exam_id]);

  // Question papers for the selected school (a school must be picked first).
  // Each row is one (exam, set); selecting it fixes grade+subject+exam+set.
  const filteredExams = form.school_id
    ? registry.exams.filter((e: any) => e.schoolId === Number(form.school_id))
    : [];

  const selectedPaper = filteredExams.find((e: any) => String(e.id) === form.exam_id);
  // Only the sections this paper/set applies to (mutually exclusive across sets).
  const allowedSections: string[] = selectedPaper?.sectionNames ?? [];
  const comboCount = sectionVals.length;

  // Label a paper by its exam, qualified with the set name when it has one.
  const paperLabel = (e: any) =>
    e.setNumber ? `${e.exam} — Set ${e.setNumber}` : e.exam;

  // Reset the paper + sections whenever the school changes.
  useEffect(() => {
    setForm(prev => ({ ...prev, exam_id: "" }));
    setSectionVals([]);
  }, [form.school_id]);

  // Prune selected sections to the chosen paper's allowed set.
  useEffect(() => {
    setSectionVals(prev => prev.filter(s => allowedSections.includes(s)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.exam_id]);

  const handleCreateAll = async () => {
    if (!form.school_id) { setError("Select a school"); return; }
    if (!form.exam_id || !selectedPaper) { setError("Select a question paper"); return; }
    if (sectionVals.length === 0) { setError("Select at least one section"); return; }

    const token = getToken();
    const school = registry.schools.find(s => String(s.id) === form.school_id);
    const paper = selectedPaper;
    // grade + subject are fixed by the chosen paper (one paper = one grade+subject).
    const grade = registry.grades.find(g => String(g.id) === String(paper.gradeId));
    const subject = registry.subjects.find(s => String(s.id) === String(paper.subjectId));

    setError(null);
    setSubmitting(true);
    setResults(null);
    setProgress({ done: 0, total: sectionVals.length });

    const collected: ComboResult[] = [];

    // Backend auto-generates batch_id as `batch_{YYYYMMDDHHmmss}` (second-precision),
    // so looped creates collide within the same second. Mirror that format and add
    // a per-section suffix so every request gets a unique, opaque batch_id.
    const ts = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);

    // One batch per selected section — all sharing the paper's grade/subject/exam/set.
    for (let i = 0; i < sectionVals.length; i++) {
      const section = sectionVals[i];
      const label = `${grade?.name ?? paper.gradeId} · ${subject?.name ?? paper.subjectId} · ${section}`
        + (paper.setNumber ? ` · Set ${paper.setNumber}` : "");

      try {
        const fd = new FormData();
        fd.append("batch_id", `batch_${ts}_${i + 1}`);

        // Shared fields: school_id, exam_id (→question_paper_id) + options.
        Object.entries(form).forEach(([k, v]) => {
          if (v !== "" && v !== null && v !== undefined) {
            fd.append(k, typeof v === "boolean" ? String(v) : String(v));
          }
        });
        fd.append("booklet_scan", String(form.sheet_type === "booklet"));

        // Per-section + paper-derived fields.
        fd.append("section", section);
        fd.append("grade_id", String(paper.gradeId));
        fd.append("subject_id", String(paper.subjectId));
        if (school) fd.append("school_name", school.name);
        if (grade) fd.append("grade", grade.name);
        if (subject) fd.append("subject", subject.name);
        fd.append("exam_type", paper.exam);
        if (paper.setNumber) fd.append("set_name", String(paper.setNumber));
        if (paper.maxMarks) fd.append("max_marks", String(paper.maxMarks));
        if (questionNumbers.length > 0) {
          fd.append("question_numbers", JSON.stringify(questionNumbers));
        }

        const res = await fetch(`${BASE}/api/batches`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `Failed: ${res.status}`);
        }

        collected.push({ label, status: "created" });
      } catch (err) {
        collected.push({
          label,
          status: "failed",
          error: err instanceof Error ? err.message : "Failed",
        });
      } finally {
        setProgress({ done: i + 1, total: sectionVals.length });
      }
    }

    setResults(collected);
    setSubmitting(false);
  };

  const createdCount = results?.filter(r => r.status === "created").length ?? 0;
  const failedCount = results?.filter(r => r.status === "failed").length ?? 0;

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="max-w-xl mx-auto">

        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <button
            onClick={() => router.push("/batches")}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium transition"
          >
            <ArrowLeft size={15} /> Back
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <h1 className="text-lg font-bold text-gray-900">Bulk Batch Creation</h1>
        </div>

        {/* Results summary */}
        {results && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 mb-6">
            <h2 className="text-sm font-bold text-gray-900 mb-1">
              {createdCount} batch{createdCount === 1 ? "" : "es"} created
              {failedCount > 0 && `, ${failedCount} failed`}
            </h2>
            <div className="mt-3 space-y-1.5 max-h-72 overflow-y-auto">
              {results.map((r, i) => (
                <div key={i} className="flex items-start gap-2 text-xs">
                  {r.status === "created"
                    ? <CheckCircle2 size={14} className="text-green-500 shrink-0 mt-0.5" />
                    : <XCircle size={14} className="text-red-500 shrink-0 mt-0.5" />}
                  <span className={r.status === "created" ? "text-gray-600" : "text-red-600"}>
                    {r.label}
                    {r.error && <span className="text-gray-400"> — {r.error}</span>}
                  </span>
                </div>
              ))}
            </div>
            <button
              onClick={() => router.push("/batches")}
              className="mt-5 w-full h-10 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition"
            >
              Go to Batches
            </button>
          </div>
        )}

        {/* Form */}
        {!results && (
          <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">

            {/* School (single, required — must be picked first) */}
            <SmartSelect
              label="School Name"
              required
              value={form.school_id}
              options={registry.schools.map(s => ({ label: s.name, value: String(s.id) }))}
              placeholder="Select school"
              onChange={set("school_id")}
            />

            {/* Question paper (exam + set) — fixes grade, subject, exam and set */}
            <SmartSelect
              label="Question Paper (Set)"
              required
              value={form.exam_id}
              options={filteredExams.map(e => ({ label: paperLabel(e), value: String(e.id) }))}
              placeholder={form.school_id ? "Select question paper / set" : "Select a school first"}
              helperText={form.school_id ? "No question papers for the selected school." : "Select a school to load its papers."}
              onChange={set("exam_id")}
            />

            {/* Grade + subject are derived from the chosen paper */}
            {selectedPaper && (
              <p className="text-xs text-gray-500 -mt-2">
                Grade{" "}
                <span className="font-semibold text-gray-700">
                  {registry.grades.find(g => String(g.id) === String(selectedPaper.gradeId))?.name ?? selectedPaper.gradeId}
                </span>{" · "}
                <span className="font-semibold text-gray-700">
                  {registry.subjects.find(s => String(s.id) === String(selectedPaper.subjectId))?.name ?? selectedPaper.subjectId}
                </span>
                {selectedPaper.setNumber && <> · Set <span className="font-semibold text-gray-700">{selectedPaper.setNumber}</span></>}
                {" "}(from the question paper)
              </p>
            )}

            {/* Sections — only those this paper/set applies to */}
            <MultiSelect
              label="Sections"
              required
              values={sectionVals}
              options={allowedSections.map(s => ({ label: s, value: s }))}
              placeholder={form.exam_id ? "Select sections" : "Select a question paper first"}
              onChange={setSectionVals}
            />
            {form.exam_id && allowedSections.length === 0 && (
              <p className="text-xs text-amber-600 -mt-2">
                This question paper has no sections mapped. Add them in Question Paper setup.
              </p>
            )}

            {/* Total Questions (auto-detected from exam) */}
            <div className="max-w-[50%] relative">
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">
                Total Questions (Auto-detected)
              </label>
              <input
                type="text"
                value={loadingQuestions ? "Loading..." : form.total_questions}
                disabled
                className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg bg-gray-50 text-gray-500 cursor-not-allowed transition"
              />
              {questionNumbers.length > 0 && (
                <p className="mt-1.5 text-[10px] text-gray-400">
                  Found {questionNumbers.length} exact question(s) in DB for this exam.
                </p>
              )}
            </div>

            {/* Shared options (identical to single creation) */}
            <BatchOptions form={form} setForm={setForm} />

            {/* Combo count hint */}
            {comboCount > 0 && (
              <p className="text-xs text-gray-500">
                This will create <span className="font-semibold text-indigo-600">{comboCount}</span> batch{comboCount === 1 ? "" : "es"}
                {" "}(1 per section), all sharing the selected question paper, set and options.
              </p>
            )}

            {/* Error */}
            {error && <p className="text-xs text-red-500 font-medium">{error}</p>}

            {/* Submit */}
            <button
              onClick={handleCreateAll}
              disabled={submitting}
              className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2"
            >
              {submitting
                ? <><Loader2 size={15} className="animate-spin" /> Creating {progress?.done}/{progress?.total}…</>
                : `Create ${comboCount > 0 ? comboCount : ""} Batch${comboCount === 1 ? "" : "es"}`.trim()
              }
            </button>

          </div>
        )}
      </div>
    </div>
  );
}
