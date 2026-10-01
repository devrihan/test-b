"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { keys } from "@/app/lib/queryKeys";
import { useRouter } from "next/navigation";
import { ArrowLeft, Upload, Loader2, X, FolderOpen } from "lucide-react";
import SmartSelect from "../components/SmartSelect";
import BatchOptions from "../components/BatchOptions";
import { getAuthToken as getToken } from "@/app/lib/auth";


const BASE = process.env.NEXT_PUBLIC_BEAVER_API_URL ?? "http://localhost:4000";
const API_BASE = process.env.NEXT_PUBLIC_AGGREGATED_DATA_API_URL ?? "http://localhost:8082";


/* ── Main Page ────────────────────────────────────────────── */
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

export default function CreateBatchPage() {
  const router = useRouter();
  const zipRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);



  const [form, setForm] = useState({
    school_id: "",
    grade_id: "",
    section: "",
    subject_id: "",
    exam_id: "",
    total_questions: "32",
    grading_grid_mode: "none" as "table" | "none",
    skip_bbox_flow: false,
    sheet_type: "a4" as "booklet" | "a4",
    margin_pct: "6",
    rotate_pages: false,
    rotate_a4_pages: false,
  });

  const [zipFiles, setZipFiles] = useState<File[]>([]);
  const [folderFiles, setFolderFiles] = useState<{ folderName: string; files: File[] }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [questionNumbers, setQuestionNumbers] = useState<string[]>([]);
  const [loadingQuestions, setLoadingQuestions] = useState(false);

  const set = (key: string) => (val: string) =>
    setForm(prev => ({ ...prev, [key]: val }));

  const setInput = (key: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(prev => ({ ...prev, [key]: e.target.value }));


  // Shares the registry cache with /exportData (keys.registry.batchFormOptions).
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


  const filteredExams = registry.exams.filter((e: any) => {
    return (
      (!form.school_id || e.schoolId === Number(form.school_id)) &&
      (!form.grade_id || e.gradeId === Number(form.grade_id)) &&
      (!form.subject_id || e.subjectId === Number(form.subject_id))
    );
  });



  const handleSubmit = async () => {
    if (!form.grade_id || !form.section || !form.subject_id || !form.exam_id) {
      setError("Grade, Section, Subject and Exam are required");
      return;
    }

    try {
      setSubmitting(true);
      setError(null);

      const token = getToken();
      const fd = new FormData();

      // Send all form fields (IDs)
      // Send all form fields (IDs)
      Object.entries(form).forEach(([k, v]) => {
        if (v !== "" && v !== null && v !== undefined) {
          fd.append(k, typeof v === "boolean" ? String(v) : v);
        }
      });

      // Derived from sheet_type so existing booklet_scan consumers keep working.
      fd.append("booklet_scan", String(form.sheet_type === "booklet"));

      // Also send names (looked up from registry)
      const school = registry.schools.find(s => String(s.id) === form.school_id);
      if (school) fd.append("school_name", school.name);

      const grade = registry.grades.find(g => String(g.id) === form.grade_id);
      if (grade) fd.append("grade", grade.name);

      const subject = registry.subjects.find(s => String(s.id) === form.subject_id);
      if (subject) fd.append("subject", subject.name);

      const exam = filteredExams.find(e => String(e.id) === form.exam_id);
      if (exam) {
        fd.append("exam_type", exam.exam);
        if (exam.maxMarks) fd.append("max_marks", String(exam.maxMarks));
        if (exam.setNumber) fd.append("set_name", String(exam.setNumber));
      }

      if (questionNumbers.length > 0) {
        fd.append("question_numbers", JSON.stringify(questionNumbers));
      }

      zipFiles.forEach(f => fd.append("zip", f));

      const res = await fetch(`${BASE}/api/batches`, {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Failed: ${res.status}`);
      }

      const data = await res.json();
      const newBatchId = data.batch.batch_id;

      // If folder files selected, upload directly to R2
      if (folderFiles.length > 0) {
        for (const { folderName, files } of folderFiles) {
          setError(null);

          // Step 1: Get presigned URLs
          const filenames = files.map(f => f.name);
          const urlRes = await fetch(`${BASE}/api/uploads/presigned-urls`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ batch_id: newBatchId, folderName, filenames }),
          });

          if (!urlRes.ok) {
            const body = await urlRes.json().catch(() => ({}));
            throw new Error(body?.error ?? `Failed to get upload URLs for ${folderName}`);
          }

          const { urls } = await urlRes.json();

          // Step 2: Upload each file directly to R2
          const pages: any[] = [];
          for (let i = 0; i < urls.length; i++) {
            const { filename, key, uploadUrl } = urls[i];
            const file = files.find(f => f.name === filename);
            if (!file) continue;

            const putRes = await fetch(uploadUrl, {
              method: "PUT",
              headers: { "Content-Type": file.type || "image/png" },
              body: file,
            });

            if (!putRes.ok) throw new Error(`Failed to upload ${filename}`);

            const dims = await new Promise<{ width: number; height: number }>((resolve) => {
              const img = new Image();
              img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
              img.onerror = () => resolve({ width: 0, height: 0 });
              img.src = URL.createObjectURL(file);
            });

            pages.push({
              filename, key, pageNumber: i + 1,
              width: dims.width, height: dims.height,
              fileSizeKb: Math.round(file.size / 1024),
            });
          }

          // Step 3: Confirm upload
          const confirmRes = await fetch(`${BASE}/api/batches/${newBatchId}/confirm-upload`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            body: JSON.stringify({ folderName, pages }),
          });

          if (!confirmRes.ok) {
            const body = await confirmRes.json().catch(() => ({}));
            throw new Error(body?.error ?? `Failed to confirm upload for ${folderName}`);
          }
        }
      }

      router.push(`/batches/${newBatchId}`);

    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create batch");
    } finally {
      setSubmitting(false);
    }
  };

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
          <h1 className="text-lg font-bold text-gray-900">Create Batch</h1>
        </div>

        {/* Form */}
        <div className="bg-white border border-gray-200 rounded-2xl p-6 space-y-4">

          {/* Row 1 — School Name (full width, first) */}
          <SmartSelect
            label="School Name"
            value={form.school_id}
            options={registry.schools.map(s => ({
              label: s.name,
              value: String(s.id),
            }))}
            placeholder="Select school"
            onChange={set("school_id")}
          />

          {/* Row 2 — Grade + Subject */}
          <div className="grid grid-cols-2 gap-4">
            <SmartSelect
              label="Grade"
              required
              value={form.grade_id}
              options={registry.grades.map(g => ({
                label: g.name,
                value: String(g.id),
              }))}
              placeholder="Select grade"
              onChange={set("grade_id")}
            />
            <SmartSelect
              label="Subject"
              required
              value={form.subject_id}
              options={registry.subjects.map(s => ({
                label: s.name,
                value: String(s.id),
              }))}
              placeholder="Select subject"
              onChange={set("subject_id")}
            />
          </div>

          {/* Row 3 — Section + Exam */}
          <div className="grid grid-cols-2 gap-4">
            <SmartSelect
              label="Section"
              required
              value={form.section}
              options={registry.sections.map(s => ({
                label: s,
                value: s,
              }))}
              placeholder="e.g. Section A"
              onChange={set("section")}
            />
            <SmartSelect
              label="Exam Type"
              required
              value={form.exam_id}
              options={filteredExams.map(e => ({
                label: e.setNumber ? `Set ${e.setNumber} - ${e.exam}` : e.exam,
                value: String(e.id),
              }))}
              placeholder="Select exam"
              helperText="No exams available for selected school, grade and subject."
              onChange={set("exam_id")}
            />
          </div>

          {/* Row 4 — Total Questions */}
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

          {/* Row 5 — Processing Options */}
          <BatchOptions form={form} setForm={setForm} />

          {/* Upload Section */}
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Upload Scans (optional)
            </label>
            <p className="text-xs text-gray-400 mb-2">
              Select a student folder or ZIP file. Can also upload later from batch detail page.
            </p>

            <div className="space-y-2">
              {folderFiles.map((group, i) => (
                <div
                  key={`folder-${group.folderName}-${i}`}
                  className="flex items-center gap-3 h-9 px-3 bg-indigo-50 border border-indigo-200 rounded-lg"
                >
                  <FolderOpen size={14} className="text-indigo-500 shrink-0" />
                  <span className="text-xs font-medium text-indigo-700 flex-1 truncate">
                    {group.folderName} — {group.files.length} images
                  </span>
                  <button
                    onClick={() => setFolderFiles(prev => prev.filter((_, idx) => idx !== i))}
                    className="text-indigo-400 hover:text-red-400 transition"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
              
              {zipFiles.map((file, i) => (
                <div
                  key={`${file.name}-${i}`}
                  className="flex items-center gap-3 h-9 px-3 bg-green-50 border border-green-200 rounded-lg"
                >
                  <span className="text-xs font-medium text-green-700 flex-1 truncate">{file.name}</span>
                  <span className="text-xs text-green-500">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                  <button
                    onClick={() => setZipFiles(prev => prev.filter((_, idx) => idx !== i))}
                    className="text-green-400 hover:text-red-400 transition"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}

              <div className="flex gap-2">
                <button
                  onClick={() => folderRef.current?.click()}
                  className="flex-1 h-9 px-3 bg-indigo-50 border border-indigo-200 hover:border-indigo-400 text-indigo-600 rounded-lg text-xs font-medium transition flex items-center justify-center gap-2"
                >
                  <FolderOpen size={13} /> Select Folder
                </button>
                <button
                  onClick={() => zipRef.current?.click()}
                  className="flex-1 h-9 px-3 bg-white border border-dashed border-gray-300 hover:border-indigo-400 text-gray-500 hover:text-indigo-600 rounded-lg text-xs font-medium transition flex items-center justify-center gap-2"
                >
                  <Upload size={13} /> Select ZIP
                </button>
              </div>
            </div>

            <input
              ref={zipRef}
              type="file"
              accept=".zip"
              multiple
              className="hidden"
              onChange={e => {
                const files = Array.from(e.target.files ?? []);
                setZipFiles(prev => [...prev, ...files]);
                if (zipRef.current) zipRef.current.value = "";
              }}
            />

            <input
              ref={folderRef}
              type="file"
              multiple
              className="hidden"
              // @ts-ignore
              webkitdirectory=""
              onChange={e => {
                const files = Array.from(e.target.files ?? []);
                if (files.length === 0) return;

                const groups: Record<string, File[]> = {};
                for (const file of files) {
                  const path = (file as any).webkitRelativePath || file.name;
                  const parts = path.split("/");
                  const folderName = parts.length > 1 ? parts[parts.length - 2] : parts[0].replace(/\.[^.]+$/, "");
                  if (!groups[folderName]) groups[folderName] = [];
                  groups[folderName].push(file);
                }

                const newGroups = Object.entries(groups).map(([folderName, files]) => ({
                  folderName,
                  files: files.filter(f => /\.(png|jpg|jpeg)$/i.test(f.name)).sort((a, b) => a.name.localeCompare(b.name)),
                })).filter(g => g.files.length > 0);

                setFolderFiles(prev => [...prev, ...newGroups]);
                if (folderRef.current) folderRef.current.value = "";
              }}
            />
          </div>

          {/* Error */}
          {error && (
            <p className="text-xs text-red-500 font-medium">{error}</p>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full h-10 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2"
          >
            {submitting
              ? <><Loader2 size={15} className="animate-spin" /> Creating…</>
              : "Create Batch"
            }
          </button>

        </div>
      </div>
    </div>
  );
}