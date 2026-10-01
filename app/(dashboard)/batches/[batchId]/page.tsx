"use client";

import { useEffect, useState, useRef, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "@/app/lib/queryKeys";
import { useRouter, useParams } from "next/navigation";
import { ArrowLeft, Upload, Loader2, X, FileText, Archive, FolderOpen, Trash2, ShieldCheck, RotateCcw, CheckCircle , SquarePen } from "lucide-react";
import {
  getBatch,
  getBatchStudents,
  revalidateBatchStudents,
  getMoveTarget,
  moveStudent,
  removeStudent,
  rerunStudent,
  Batch,
  BatchStudent,
  MoveTarget,
  RerunConfirm409,
} from "@/app/(dashboard)/pdfExtract/lib/beaverApi";
import { getUsername, getUserRoles } from "@/app/lib/auth";
import { ApiError } from "@/app/lib/apiClient";
import { SetBadge, ConfigChips, getConfigItems } from "../components/BatchConfig";
import ConfirmModal from "../../pdfExtract/components/ConfirmModal";
import { getAuthToken as getToken } from "@/app/lib/auth";

const BASE = process.env.NEXT_PUBLIC_BEAVER_API_URL ?? "http://localhost:4000";


// Badge colors (for the status pill)
const STATUS_BADGE_COLORS: Record<string, string> = {
  pending: "bg-gray-200 text-gray-700",
  uploaded: "bg-slate-200 text-slate-700",
  preprocessing: "bg-blue-200 text-blue-700",
  preprocessed: "bg-blue-300 text-blue-800",
  bbox_detecting: "bg-violet-200 text-violet-700",
  bbox_detected: "bg-yellow-200 text-yellow-700",
  processing: "bg-amber-200 text-amber-700",
  ocr_running: "bg-orange-200 text-orange-700",
  extracting_grid: "bg-teal-200 text-teal-700",
  identifying_or: "bg-cyan-200 text-cyan-700",
  extracting_answers: "bg-emerald-200 text-emerald-700",
  completed: "bg-green-200 text-green-700",
  ocr_completed: "bg-indigo-200 text-indigo-700",
  failed: "bg-red-200 text-red-700",
};

// Row background colors (light pastel for the entire row)
const STATUS_ROW_COLORS: Record<string, string> = {
  pending: "bg-gray-50",
  uploaded: "bg-slate-50",
  preprocessing: "bg-blue-50",
  preprocessed: "bg-blue-50",
  bbox_detecting: "bg-violet-50",
  bbox_detected: "bg-yellow-50",
  processing: "bg-amber-50",
  ocr_running: "bg-orange-50",
  extracting_grid: "bg-teal-50",
  identifying_or: "bg-cyan-50",
  extracting_answers: "bg-emerald-50",
  completed: "bg-green-50",
  ocr_completed: "bg-indigo-50",
  failed: "bg-red-50",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  uploaded: "Uploaded",
  preprocessing: "Preprocessing",
  preprocessed: "Preprocessed",
  bbox_detecting: "Bbox Detecting",
  bbox_detected: "Bbox Detected",
  processing: "Post Processing",
  ocr_running: "OCR Running",
  ocr_completed: "OCR Completed",
  extracting_grid: "Extracting Grid",
  identifying_or: "Identifying OR",
  extracting_answers: "Extracting Answers",
  completed: "Completed",
  failed: "Failed",
};

// Statuses that mean a student is actively being processed — while any student
// is in one of these, the screen keeps polling so re-run progress updates live.
const TRANSIENT_STATUSES = [
  "processing", "preprocessing", "bbox_detecting", "ocr_running",
  "extracting_grid", "identifying_or", "extracting_answers",
];

// Batch-level statuses that mean the batch itself is still being processed.
const BATCH_PROCESSING_STATUSES = [
  "processing", "preprocessing", "bbox_detecting", "bbox_detected", "ocr_running",
];

const NO_STUDENTS: BatchStudent[] = [];

export default function BatchDetailPage() {
  const router = useRouter();
  const params = useParams();
  const batch_id = params.batchId as string;
  const zipRef = useRef<HTMLInputElement>(null);
  const pdfRef = useRef<HTMLInputElement>(null);
  const folderRef = useRef<HTMLInputElement>(null);

  const queryClient = useQueryClient();

  // Batch + students are fetched and polled together, as they were before:
  // the poll ran while EITHER the batch or any student was still processing.
  const detailQuery = useQuery({
    queryKey: keys.batch.detail(batch_id),
    queryFn: async () => {
      const [batchRes, studentsRes] = await Promise.all([
        getBatch(batch_id),
        getBatchStudents(batch_id),
      ]);
      return { batch: batchRes.batch, students: studentsRes.students ?? [] };
    },
    enabled: !!batch_id,
    refetchInterval: query => {
      const d = query.state.data;
      if (!d) return false;
      const batchProcessing = BATCH_PROCESSING_STATUSES.includes(d.batch?.status ?? "");
      const studentProcessing = d.students.some(s => TRANSIENT_STATUSES.includes(s.status));
      return batchProcessing || studentProcessing ? 5000 : false;
    },
    refetchIntervalInBackground: false,
  });

  const batch = detailQuery.data?.batch ?? null;
  const students = detailQuery.data?.students ?? NO_STUDENTS;
  const loading = detailQuery.isPending;

  // Errors raised by row actions (move / remove), distinct from fetch errors.
  const [actionError, setActionError] = useState<string | null>(null);
  const error =
    actionError ??
    (detailQuery.error instanceof Error ? detailQuery.error.message : null);

  const refetchDetail = useCallback(
    () => queryClient.invalidateQueries({ queryKey: keys.batch.detail(batch_id) }),
    [queryClient, batch_id]
  );

  const setStudents = useCallback(
    (updater: (prev: BatchStudent[]) => BatchStudent[]) =>
      queryClient.setQueryData<{ batch: Batch; students: BatchStudent[] }>(
        keys.batch.detail(batch_id),
        prev => (prev ? { ...prev, students: updater(prev.students) } : prev),
      ),
    [queryClient, batch_id]
  );

  const [revalidating, setRevalidating] = useState(false);
  const autoValidatedRef = useRef(false);

  // Recompute + persist per-student validation, then refetch so the rows update.
  const handleRevalidate = useCallback(async () => {
    if (revalidating || !batch_id) return;
    setRevalidating(true);
    try {
      await revalidateBatchStudents(batch_id);
      await refetchDetail();
    } catch {
      /* best-effort — validation service may be unavailable */
    } finally {
      setRevalidating(false);
    }
  }, [batch_id, revalidating, refetchDetail]);

  // Auto-validate once when a batch is opened with unvalidated students (at-ingest UX).
  useEffect(() => {
    if (autoValidatedRef.current || revalidating) return;
    if (students.length > 0 && students.some(s => s.validation_status == null)) {
      autoValidatedRef.current = true;
      handleRevalidate();
    }
  }, [students, revalidating, handleRevalidate]);

  // ── Fix a misplaced student (move to the right batch / remove) ──────────────
  const [fixOpen, setFixOpen] = useState<string | null>(null);
  const [fixTarget, setFixTarget] = useState<{ actualSection: string | null; targetBatch: MoveTarget | null } | null>(null);
  const [fixLoading, setFixLoading] = useState(false);
  const [fixBusy, setFixBusy] = useState(false);

  const refetchStudents = refetchDetail;

  const openFix = useCallback(async (sid: string) => {
    if (fixOpen === sid) { setFixOpen(null); return; }
    setFixOpen(sid); setFixTarget(null); setFixLoading(true);
    try { setFixTarget(await getMoveTarget(batch_id, sid)); }
    catch { setFixTarget({ actualSection: null, targetBatch: null }); }
    finally { setFixLoading(false); }
  }, [batch_id, fixOpen]);

  const doMove = useCallback(async (sid: string, targetId: string) => {
    setFixBusy(true);
    try { await moveStudent(batch_id, sid, targetId); setFixOpen(null); await refetchStudents(); }
    catch (e) { setActionError(e instanceof Error ? e.message : "Move failed"); }
    finally { setFixBusy(false); }
  }, [batch_id, refetchStudents]);

  const doRemove = useCallback(async (sid: string) => {
    if (!window.confirm("Remove this student's paper from this batch? This deletes their pages and crops.")) return;
    setFixBusy(true);
    try { await removeStudent(batch_id, sid); setFixOpen(null); await refetchStudents(); }
    catch (e) { setActionError(e instanceof Error ? e.message : "Remove failed"); }
    finally { setFixBusy(false); }
  }, [batch_id, refetchStudents]);

  // ── Re-run a pipeline step (ADMIN only — loamsupport has the ADMIN role) ────
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { setIsAdmin(getUserRoles().includes("ADMIN")); }, []);

  const [rerunBusy, setRerunBusy] = useState(false);
  const [rerunMsg, setRerunMsg] = useState<{ text: string; error?: boolean } | null>(null);

  // Populated once the force-rerun probe (below) comes back with the real
  // discard count, to drive the confirm dialog. Null = dialog closed.
  const [forceConfirm, setForceConfirm] = useState<{ student_id: string; edited_count: number } | null>(null);

  // A normal re-run is blocked once the paper carries ANY human grading work —
  // restarting would silently discard it. Mirrors the beaver-api 409 guard, which
  // trips on ANY verified / edited bbox (not just fully-verified papers), so a
  // partially-verified paper must also route to the explicit Force re-run.
  const rerunBlocked = (s: BatchStudent) =>
    s.ocr_verified === true ||
    (s.verified_questions_count ?? 0) > 0;

  // Single "Re-run": restart the whole pipeline from scratch for one student.
  // Only the unblocked path — the blocked/force path goes through
  // rerunForceStart → confirm dialog → rerunForceConfirm below instead.
  const rerunOne = useCallback(async (student_id: string) => {
    if (!window.confirm(
      "Re-run restarts the ENTIRE pipeline for this student from scratch — detected " +
      "boxes, OCR, and marks are regenerated. If this paper has verified or " +
      "manually-edited answers, you'll be asked next whether to preserve or " +
      "discard them. Continue?"
    )) return;
    setRerunBusy(true); setRerunMsg(null);
    try {
      // Probe with `force` (no `confirm_discard`): starts immediately when the
      // paper carries no human-touched work, 409s with the real edited_count
      // when it does — so edited papers always reach the preserve/discard
      // dialog, including ones the roster doesn't flag as verified (a paper
      // with only manually_edited answers used to dead-end on the server's
      // plain-rerun guard here).
      await rerunStudent(batch_id, student_id, true);
      setStudents(prev => prev.map(s =>
        s.student_id === student_id ? { ...s, status: "preprocessing" } : s));
      setRerunMsg({ text: "Re-run started — restarting the whole pipeline." });
      await refetchStudents();
    } catch (e) {
      const body = e instanceof ApiError ? (e.body as Partial<RerunConfirm409> | undefined) : undefined;
      if (e instanceof ApiError && e.status === 409 && typeof body?.edited_count === "number") {
        setPreserveEdits(true);
        setForceConfirm({ student_id, edited_count: body.edited_count });
      } else {
        setRerunMsg({ text: e instanceof Error ? e.message : "Re-run failed", error: true });
        await refetchStudents();
      }
    } finally {
      setRerunBusy(false);
    }
  }, [batch_id, refetchStudents, setStudents]);

  // Force re-run, step 1: probe the server with `force` (no `confirm_discard`).
  // Per the beaver-api contract this always 409s on an edited paper with
  // `{needs_confirmation: true, edited_count}` — WITHOUT discarding anything —
  // so we can show the operator the real count before they commit to it.
  const rerunForceStart = useCallback(async (student_id: string) => {
    if (rerunBusy) return;
    setRerunBusy(true); setRerunMsg(null);
    try {
      await rerunStudent(batch_id, student_id, true);
      // No 409 means there was nothing to discard after all — it already ran.
      setRerunMsg({ text: "Re-run started — restarting the whole pipeline." });
      await refetchStudents();
    } catch (e) {
      const body = e instanceof ApiError ? (e.body as Partial<RerunConfirm409> | undefined) : undefined;
      if (e instanceof ApiError && e.status === 409 && typeof body?.edited_count === "number") {
        setPreserveEdits(true);
        setForceConfirm({ student_id, edited_count: body.edited_count });
      } else {
        setRerunMsg({ text: e instanceof Error ? e.message : "Re-run failed", error: true });
      }
    } finally {
      setRerunBusy(false);
    }
  }, [batch_id, rerunBusy, refetchStudents]);

  // Force re-run, step 2: operator confirmed the discard count — send
  // `force + confirm_discard` to actually perform it.
  // Carry human edits across the re-run (snapshot + re-apply by question
  // number — see beaver-api preservedEdits). CHECKED by default — losing
  // grading work silently is the worse failure; operators untick it for
  // page fixes that renumber questions. Reset per dialog.
  const [preserveEdits, setPreserveEdits] = useState(true);

  const rerunForceConfirm = useCallback(async () => {
    if (!forceConfirm) return;
    const { student_id } = forceConfirm;
    setForceConfirm(null);
    setRerunBusy(true); setRerunMsg(null);
    setStudents(prev => prev.map(s =>
      s.student_id === student_id ? { ...s, status: "preprocessing" } : s));
    try {
      await rerunStudent(batch_id, student_id, true, true, preserveEdits);
      setRerunMsg({ text: "Force re-run started — restarting the whole pipeline." });
    } catch (e) {
      // Rare (e.g. the paper was edited again between probe and confirm) — surface
      // it via the same banner rather than silently dropping the request.
      setRerunMsg({ text: e instanceof Error ? e.message : "Force re-run failed — please retry", error: true });
    } finally {
      setRerunBusy(false);
      await refetchStudents();
    }
  }, [forceConfirm, batch_id, refetchStudents, setStudents, preserveEdits]);

  // Auto-dismiss the re-run status banner after a few seconds.
  useEffect(() => {
    if (!rerunMsg) return;
    const t = setTimeout(() => setRerunMsg(null), 6000);
    return () => clearTimeout(t);
  }, [rerunMsg]);

  // Delete (loamsupport only)
  const [loginUsername, setLoginUsername] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => { setLoginUsername(getUsername()); }, []);

  const handleDelete = async () => {
    try {
      setDeleting(true);
      setDeleteError(null);
      const res = await fetch(`${BASE}/api/batches/${batch_id}`, {
        method: "DELETE",
        headers: { ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Failed: ${res.status}`);
      }
      router.push("/batches");
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete batch");
      setDeleting(false);
    }
  };

  // Upload state
  const [zipFiles, setZipFiles] = useState<File[]>([]);
  const [pdfFiles, setPdfFiles] = useState<File[]>([]);
  const [folderFiles, setFolderFiles] = useState<{ folderName: string; files: File[] }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  // Preprocessing toggles default to the batch's saved metadata, and only
  // deviate once the operator ticks a box. Null = "not overridden yet", so the
  // saved value applies as soon as the batch loads — no effect needed.
  const [bookletOverride, setIsBookletScan] = useState<boolean | null>(null);
  const [rotateOverride, setRotatePages] = useState<boolean | null>(null);
  const [rotateA4Override, setRotateA4Pages] = useState<boolean | null>(null);

  const preprocessing = batch?.metadata?.preprocessing;
  const isBookletScan = bookletOverride ?? preprocessing?.booklet_scan ?? false;
  const rotatePages = rotateOverride ?? preprocessing?.rotate_pages ?? false;
  const rotateA4Pages = rotateA4Override ?? preprocessing?.rotate_a4_pages ?? false;

  // Load batch + students

  // Drag and drop handlers
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    const pdfs = files.filter(f => f.name.toLowerCase().endsWith(".pdf"));
    const zips = files.filter(f => f.name.toLowerCase().endsWith(".zip"));

    if (pdfs.length > 0) setPdfFiles(prev => [...prev, ...pdfs]);
    if (zips.length > 0) setZipFiles(prev => [...prev, ...zips]);
    setUploadMsg(null);
  }, []);

  // Direct folder upload to R2
  const handleFolderUpload = async () => {
    if (folderFiles.length === 0) return;
    try {
      setUploading(true);
      setUploadMsg(null);
      const token = getToken();

      for (let si = 0; si < folderFiles.length; si++) {
        const { folderName, files } = folderFiles[si];
        setUploadMsg(`Uploading ${folderName} (${si + 1}/${folderFiles.length})...`);

        // Step 1: Get presigned URLs
        const filenames = files.map(f => f.name);
        const urlRes = await fetch(`${BASE}/api/uploads/presigned-urls`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ batch_id, folderName, filenames }),
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

          setUploadMsg(`${folderName}: uploading ${i + 1}/${urls.length}...`);

          const putRes = await fetch(uploadUrl, {
            method: "PUT",
            headers: { "Content-Type": "image/png" },
            body: file,
          });

          if (!putRes.ok) throw new Error(`Failed to upload ${filename} to R2`);

          // Get image dimensions
          const dims = await new Promise<{ width: number; height: number }>((resolve) => {
            const img = new Image();
            img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
            img.onerror = () => resolve({ width: 0, height: 0 });
            img.src = URL.createObjectURL(file);
          });

          pages.push({
            filename,
            key,
            pageNumber: i + 1,
            width: dims.width,
            height: dims.height,
            fileSizeKb: Math.round(file.size / 1024),
          });
        }

        // Step 3: Confirm upload
        setUploadMsg(`${folderName}: confirming...`);
        const confirmRes = await fetch(`${BASE}/api/batches/${batch_id}/confirm-upload`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ 
            folderName, 
            pages,
            preprocessing: {
              booklet_scan: isBookletScan,
              rotate_pages: rotatePages,
              rotate_a4_pages: rotateA4Pages
            }
          }),
        });

        if (!confirmRes.ok) {
          const body = await confirmRes.json().catch(() => ({}));
          throw new Error(body?.error ?? `Failed to confirm upload for ${folderName}`);
        }
      }

      setUploadMsg(`✓ ${folderFiles.length} student(s) uploaded directly to R2`);
      setFolderFiles([]);

      // Refresh
      await refetchDetail();

    } catch (err) {
      setUploadMsg(`✕ ${err instanceof Error ? err.message : "Folder upload failed"}`);
    } finally {
      setUploading(false);
    }
  };

  // Upload files to existing batch
  const handleUpload = async () => {
    if (zipFiles.length === 0 && pdfFiles.length === 0) return;
    try {
      setUploading(true);
      setUploadMsg(null);

      const token = getToken();
      let successCount = 0;
      let totalFiles = zipFiles.length + pdfFiles.length;

      // Upload ZIP files
      for (const file of zipFiles) {
        const fd = new FormData();
        fd.append("zip", file);

        const res = await fetch(
          `${BASE}/api/batches/${batch_id}/students/upload?booklet=${isBookletScan}&rotate=${rotatePages}&rotate_a4=${rotateA4Pages}`,
          {
            method: "POST",
            headers: token ? { Authorization: `Bearer ${token}` } : {},
            body: fd,
          }
        );

        const body = await res.json().catch(() => ({}));

        // HTTP failure
        if (!res.ok) {
          throw new Error(
            body?.error ?? `Failed for ${file.name}: ${res.status}`
          );
        }

        // Backend validation failure
        if (body.failed?.length > 0) {
          const firstFailure = body.failed[0];

          setUploadMsg(
            `✕ ${firstFailure.folder}: ${firstFailure.reason}`
          );

          continue;
        }

        successCount++;
        setUploadMsg(`Uploading... ${successCount}/${totalFiles}`);
      }

      // Upload PDF files
      if (pdfFiles.length > 0) {
        const fd = new FormData();
        for (const file of pdfFiles) {
          fd.append("pdf", file);
        }

        const totalSize = pdfFiles.reduce((acc, file) => acc + file.size, 0);
        const sizeMB = (totalSize / 1024 / 1024).toFixed(1);
        setUploadMsg(`Uploading ${pdfFiles.length} PDF(s) (${sizeMB} MB)...`);

        const res = await fetch(`${BASE}/api/batches/${batch_id}/students/upload-pdf?booklet=${isBookletScan}&rotate=${rotatePages}&rotate_a4=${rotateA4Pages}`, {
          method: "POST",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: fd,
        });

        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body?.error ?? `Failed to upload PDFs: ${res.status}`);
        }
        successCount += pdfFiles.length;
        setUploadMsg(`Processed ${successCount}/${totalFiles} files`);
      }

      if (successCount > 0) {
        setUploadMsg(`✓ ${successCount} file(s) uploaded successfully`);
      }
      setZipFiles([]);
      setPdfFiles([]);

      // Refresh
      await refetchDetail();

    } catch (err) {
      setUploadMsg(`✕ ${err instanceof Error ? err.message : "Upload failed"}`);
    } finally {
      setUploading(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <Loader2 size={24} className="animate-spin text-indigo-500" />
    </div>
  );

  if (error) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center">
        <p className="text-red-500 text-sm font-medium mb-3">{error}</p>
        <button onClick={() => router.push("/batches")} className="text-indigo-600 text-sm underline">
          Back to batches
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="px-6 py-6">
        <div className="max-w-3xl mx-auto space-y-5">

          {/* Header */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/batches")}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium transition"
            >
              <ArrowLeft size={15} /> Back
            </button>
            <div className="w-px h-5 bg-gray-200" />
            <h1 className="text-lg font-bold text-gray-900 truncate">
              {batch?.school_name ? `${batch.school_name} · ` : ""}{batch?.batch_name}
            </h1>
            <SetBadge setName={batch?.set_name} />

            {loginUsername === "loamsupport" && batch && (
              <button
                onClick={() => { setDeleteError(null); setConfirmOpen(true); }}
                disabled={batch.status === "pushed"}
                title={batch.status === "pushed" ? "Pushed batches can't be deleted" : "Delete this batch"}
                className="ml-auto flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg transition text-red-600 border border-red-200 hover:bg-red-50 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
              >
                <Trash2 size={13} /> Delete Batch
              </button>
            )}
          </div>

          {/* Delete confirmation modal */}
          {confirmOpen && batch && (
            <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-xl">
                <h2 className="text-base font-bold text-gray-900 mb-2">Delete this batch?</h2>
                <p className="text-sm text-gray-600">
                  <span className="font-semibold">{batch.batch_name}</span> and all of its
                  students, pages, answer regions and uploaded scans will be permanently
                  removed. This cannot be undone. Other batches and master records are not affected.
                </p>
                {deleteError && (
                  <p className="mt-3 text-xs text-red-500 font-medium">{deleteError}</p>
                )}
                <div className="flex gap-3 mt-6">
                  <button
                    onClick={() => setConfirmOpen(false)}
                    disabled={deleting}
                    className="flex-1 h-10 border border-gray-200 text-gray-700 text-sm font-semibold rounded-xl hover:bg-gray-50 transition disabled:opacity-40"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={deleting}
                    className="flex-1 h-10 bg-red-600 hover:bg-red-700 text-white text-sm font-semibold rounded-xl transition flex items-center justify-center gap-2 disabled:opacity-40"
                  >
                    {deleting
                      ? <><Loader2 size={15} className="animate-spin" /> Deleting…</>
                      : "Delete Batch"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Force re-run confirmation — shows the real discard count from the
              probe in rerunForceStart before the operator commits to it. */}
          {forceConfirm && (
            <ConfirmModal
              title="Discard graded work and re-run?"
              message={
                `This will permanently discard ${forceConfirm.edited_count} graded ` +
                `question${forceConfirm.edited_count === 1 ? "" : "s"} (verified boxes, OCR, ` +
                "marks, and manual edits) and restart the whole pipeline from scratch. Continue?"
              }
              confirmLabel="Discard & re-run"
              variant="danger"
              onConfirm={rerunForceConfirm}
              onCancel={() => setForceConfirm(null)}
            >
              <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={preserveEdits}
                  onChange={e => setPreserveEdits(e.target.checked)}
                  className="mt-0.5 accent-indigo-600"
                />
                <span>
                  <span className="font-semibold">Preserve my edited marks &amp; text</span> — re-applies
                  them by question number after the re-run. Only safe when re-running to fix
                  pages/boxes of the SAME paper; leave unchecked if the page fix changes which
                  questions are which.
                </span>
              </label>
            </ConfirmModal>
          )}

          {/* Batch info card */}
          {batch && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <div className="flex flex-wrap gap-x-6 gap-y-3 mb-4">
                {[
                  { label: "School", value: batch.school_name || "—" },
                  { label: "Grade", value: batch.grade },
                  { label: "Subject", value: batch.subject },
                  { label: "Section", value: batch.section },
                  { label: "Exam", value: batch.exam_type, wide: true },
                  { label: "Set", value: batch.set_name || "—" },
                ].map(({ label, value, wide }) => (
                  <div key={label} className={wide ? "max-w-xs" : ""}>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-0.5">{label}</p>
                    <p className="text-sm font-semibold text-gray-800 break-words">{value}</p>
                  </div>
                ))}
              </div>

              {/* Selected configuration options (set at create time) */}
              {getConfigItems(batch).length > 0 && (
                <div className="mb-4">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 mb-1.5">Configuration</p>
                  <ConfigChips batch={batch} />
                </div>
              )}

              <div className="flex items-center gap-4 pt-4 border-t border-gray-100">
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{batch.total_students}</p>
                  <p className="text-[10px] text-gray-400 font-medium">students</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-gray-900">{batch.total_questions}</p>
                  <p className="text-[10px] text-gray-400 font-medium">questions</p>
                </div>
                <div className="ml-auto">
                  <span className="text-xs font-mono text-gray-400">{batch.batch_id}</span>
                </div>
              </div>
            </div>
          )}

          {/* Upload Section - ZIP and PDF with drag-and-drop */}
          <div
            className={`bg-white border-2 rounded-xl p-5 transition-colors ${isDragging
              ? "border-indigo-400 bg-indigo-50"
              : "border-gray-200"
              }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
          >
            <h2 className="text-sm font-bold text-gray-700 mb-2">Upload Student Scans</h2>
            <p className="text-xs text-gray-400 mb-4">
              <strong>PDF files:</strong> Each PDF = one student (filename becomes student name)<br />
              <strong>ZIP files:</strong> Contains student folders with page images
            </p>

            {/* Drag and drop zone with beaver backdrop */}
            <div
              className={`relative border-2 border-dashed rounded-lg text-center mb-4 transition-colors overflow-hidden flex items-center ${isDragging
                ? "border-indigo-400 bg-indigo-100"
                : "border-gray-300 hover:border-indigo-300"
                }`}
            >
              {/* Content */}
              <div className="flex-1 py-6 px-4">
                <Upload size={24} className="mx-auto text-gray-400 mb-2" />
                <p className="text-sm text-gray-600 font-medium">
                  Drag & drop PDF or ZIP files here
                </p>
                <p className="text-xs text-gray-400 mt-1">
                  or use the buttons below to select files
                </p>
              </div>
              {/* Beaver image */}
              <div className="h-40 w-40 mr-4 shrink-0">
                <img
                  src="/beaver2.png"
                  alt=""
                  className="h-full w-full object-contain pointer-events-none"
                />
              </div>
            </div>

            {/* File selection buttons */}
            <div className="flex items-center gap-2 mb-4">
              <button
                onClick={() => folderRef.current?.click()}
                className="flex-1 h-10 px-4 bg-indigo-50 border border-indigo-200 hover:border-indigo-400 text-indigo-600 hover:text-indigo-700 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
              >
                <FolderOpen size={16} /> Select Folder
              </button>
              <button
                onClick={() => pdfRef.current?.click()}
                className="flex-1 h-10 px-4 bg-white border border-gray-300 hover:border-indigo-400 text-gray-600 hover:text-indigo-600 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
              >
                <FileText size={16} /> PDFs
              </button>
              <button
                onClick={() => zipRef.current?.click()}
                className="flex-1 h-10 px-4 bg-white border border-gray-300 hover:border-indigo-400 text-gray-600 hover:text-indigo-600 rounded-lg text-sm font-medium transition flex items-center justify-center gap-2"
              >
                <Archive size={16} /> ZIPs
              </button>
            </div>

            {/* Booklet scan options */}
            <div className="space-y-2 mb-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isBookletScan}
                  onChange={(e) => setIsBookletScan(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-600">
                  Booklet scan (split pages horizontally and reorder)
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rotatePages}
                  onChange={(e) => setRotatePages(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-600">
                  Rotate pages as per booklet scan sequence
                </span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={rotateA4Pages}
                  onChange={(e) => setRotateA4Pages(e.target.checked)}
                  className="w-4 h-4 text-indigo-600 border-gray-300 rounded focus:ring-indigo-500"
                />
                <span className="text-sm text-gray-600">
                  Rotate pages for A4 scan
                </span>
              </label>
            </div>

            {/* Selected files list */}
            {(pdfFiles.length > 0 || zipFiles.length > 0) && (
              <div className="space-y-2 mb-4">
                {/* PDF files */}
                {pdfFiles.map((file, i) => (
                  <div
                    key={`pdf-${file.name}-${i}`}
                    className="flex items-center gap-2 h-9 px-3 bg-blue-50 border border-blue-200 rounded-lg"
                  >
                    <FileText size={14} className="text-blue-500 shrink-0" />
                    <span className="text-xs font-medium text-blue-700 flex-1 truncate">{file.name}</span>
                    <span className="text-xs text-blue-500">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
                    <button
                      onClick={() => setPdfFiles(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-blue-400 hover:text-red-400 transition"
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}

                {/* ZIP files */}
                {zipFiles.map((file, i) => (
                  <div
                    key={`zip-${file.name}-${i}`}
                    className="flex items-center gap-2 h-9 px-3 bg-green-50 border border-green-200 rounded-lg"
                  >
                    <Archive size={14} className="text-green-500 shrink-0" />
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
              </div>
            )}

            {/* Upload button */}
            <button
              onClick={folderFiles.length > 0 ? handleFolderUpload : handleUpload}
              disabled={(zipFiles.length === 0 && pdfFiles.length === 0 && folderFiles.length === 0) || uploading}
              className="w-full h-10 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-lg transition flex items-center justify-center gap-2"
            >
              {uploading ? (
                <><Loader2 size={16} className="animate-spin" /> {uploadMsg || "Processing..."}</>
              ) : (
                <><Upload size={16} /> Upload {folderFiles.length > 0 ? `${folderFiles.length} folder(s)` : `${pdfFiles.length + zipFiles.length} file(s)`}</>
              )}
            </button>

            {/* Folder files list */}
            {folderFiles.length > 0 && (
              <div className="space-y-2 mb-4">
                {folderFiles.map((group, i) => (
                  <div
                    key={`folder-${group.folderName}-${i}`}
                    className="flex items-center gap-2 h-9 px-3 bg-indigo-50 border border-indigo-200 rounded-lg"
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
              </div>
            )}

            {/* Hidden file inputs */}
            <input
              ref={folderRef}
              type="file"
              multiple
              className="hidden"
              // @ts-ignore - webkitdirectory is not in React types
              webkitdirectory=""
              onChange={e => {
                const files = Array.from(e.target.files ?? []);
                if (files.length === 0) return;

                // Group files by parent folder
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
                setUploadMsg(null);
                if (folderRef.current) folderRef.current.value = "";
              }}
            />

            <input
              ref={pdfRef}
              type="file"
              accept=".pdf"
              multiple
              className="hidden"
              onChange={e => {
                const files = Array.from(e.target.files ?? []);
                setPdfFiles(prev => [...prev, ...files]);
                setUploadMsg(null);
                if (pdfRef.current) pdfRef.current.value = "";
              }}
            />
            <input
              ref={zipRef}
              type="file"
              accept=".zip"
              multiple
              className="hidden"
              onChange={e => {
                const files = Array.from(e.target.files ?? []);
                setZipFiles(prev => [...prev, ...files]);
                setUploadMsg(null);
                if (zipRef.current) zipRef.current.value = "";
              }}
            />

            {/* Status message */}
            {uploadMsg && !uploading && (
              <p className={`mt-3 text-xs font-medium text-center ${uploadMsg.startsWith("✓") ? "text-green-600" :
                uploadMsg.startsWith("✕") ? "text-red-500" : "text-gray-500"
                }`}>
                {uploadMsg}
              </p>
            )}
          </div>

          {/* Students list */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-bold text-gray-700">
                Students ({students.length})
              </h2>
              <div className="flex items-center gap-2">
                {students.length > 0 && (
                  <button
                    onClick={handleRevalidate}
                    disabled={revalidating}
                    className="flex items-center gap-1.5 h-7 px-3 text-xs font-semibold text-gray-600 border border-gray-200 hover:border-indigo-300 hover:text-indigo-600 rounded-lg transition disabled:opacity-50"
                    title="Re-check each student against the roster + marks"
                  >
                    {revalidating ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={12} />}
                    {revalidating ? "Validating…" : "Re-validate"}
                  </button>
                )}
              </div>
            </div>
            {rerunMsg && (
              <p className={`text-[11px] rounded-md px-3 py-1.5 mb-3 border ${
                rerunMsg.error
                  ? "text-red-600 bg-red-50 border-red-100"
                  : "text-indigo-600 bg-indigo-50 border-indigo-100"
              }`}>
                {rerunMsg.text}
              </p>
            )}

            {students.length === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">
                No students yet. Upload a ZIP to add students.
              </p>
            ) : (
              <div className="space-y-2">
                {students.map(s => (
                  <div key={s.student_id} className="space-y-1.5">
                  <div
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border ${STATUS_ROW_COLORS[s.status] ?? "bg-gray-50"} ${s.status === "failed" ? "border-red-200" : s.status === "completed" ? "border-green-200" : "border-transparent"}`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold ${s.validation_status === "invalid" ? "text-red-600" : "text-gray-800"}`}>
                        {s.student_name}
                        {s.roll_number && (
                          <span className="ml-1.5 text-xs font-normal text-gray-400">
                            ({s.roll_number})
                          </span>
                        )}
                        {s.validation_status === "valid" && (
                          <span className="ml-2 inline-flex items-center gap-0.5 align-middle text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-100 text-green-700">
                            <CheckCircle size={10} /> Verified
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        {s.exam_marks != null
                          ? <span className="font-medium text-gray-700">{batch?.subject ?? "Marks"}: {s.exam_marks} · </span>
                          : <span className="text-gray-400">Marks: — · </span>}
                        {s.total_pages} pages · {s.verified_questions_count}/{s.total_questions} verified
                      </p>
                      {s.validation_status === "invalid" && (s.validation_reasons?.length ?? 0) > 0 && (
                        <p className="text-[11px] text-red-500 mt-0.5">
                          {s.validation_reasons!.join(" · ")}
                        </p>
                      )}
                    </div>

                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 ${STATUS_BADGE_COLORS[s.status] ?? "bg-gray-200 text-gray-700"}`}>
                      {STATUS_LABELS[s.status] ?? s.status}
                    </span>

                    {isAdmin && !rerunBlocked(s) && (
                      <button
                        onClick={() => rerunOne(s.student_id)}
                        disabled={rerunBusy}
                        className="h-7 w-7 flex items-center justify-center rounded-lg transition shrink-0 text-gray-500 hover:bg-gray-100 hover:text-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Re-run: restart the whole pipeline for this student from scratch"
                      >
                        <RotateCcw size={13} />
                      </button>
                    )}

                    {/* Explicit force re-run: only shown when a normal re-run is blocked
                        because the paper carries verified / edited work. Discards it. */}
                    {isAdmin && rerunBlocked(s) && (
                      <button
                        onClick={() => rerunForceStart(s.student_id)}
                        disabled={rerunBusy}
                        className="h-7 w-7 flex items-center justify-center rounded-lg transition shrink-0 text-red-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Force re-run: this student has verified / edited answers. Re-running DISCARDS them and restarts the whole pipeline (e.g. to re-split a booklet)."
                      >
                        <RotateCcw size={13} />
                      </button>
                    )}

                    {(s.status === "bbox_detected") && (
                      <>
                        <button
                          onClick={() => {
                            const params = new URLSearchParams({
                              batchId: batch_id,
                              studentId: s.student_id,
                              ...(batch?.school_name && { school: batch.school_name }),
                              ...(batch?.grade && { grade: batch.grade }),
                              ...(batch?.section && { section: batch.section }),
                              ...(batch?.subject && { subject: batch.subject }),
                              ...(batch?.exam_type && { exam: batch.exam_type }),
                            });
                            router.push(`/pdfExtract?${params.toString()}`);
                          }}
                          className="h-7 px-3 text-xs font-semibold rounded-lg transition shrink-0 bg-indigo-50 hover:bg-indigo-100 text-indigo-600"
                        >
                          Mark →
                        </button>
                        <button
                          onClick={() => {
                            const params = new URLSearchParams({
                              batchId: batch_id,
                              studentId: s.student_id,
                            });
                            router.push(`/answerEditing?${params.toString()}`);
                          }}
                          className="h-7 w-7 flex items-center justify-center rounded-lg transition shrink-0 text-indigo-600 bg-indigo-50 hover:bg-indigo-100"
                          title="Answer editing: edit this student's marks & answers"
                        >
                          <SquarePen size={13} />
                        </button>
                      </>
                    )}

                    {(s.status === "ocr_completed" || s.status === "completed") && (
                      <button
                        onClick={() => {
                          const params = new URLSearchParams({
                            batchId: batch_id,
                            studentId: s.student_id,
                            ...(batch?.school_name && { school: batch.school_name }),
                            ...(batch?.grade && { grade: batch.grade }),
                            ...(batch?.section && { section: batch.section }),
                            ...(batch?.subject && { subject: batch.subject }),
                            ...(batch?.exam_type && { exam: batch.exam_type }),
                          });
                          router.push(`/answerEditing?${params.toString()}`);
                        }}
                        className="h-7 px-3 text-xs font-semibold rounded-lg transition shrink-0 bg-green-50 hover:bg-green-100 text-green-600"
                      >
                        Edit Answers →
                      </button>
                    )}

                    {/* Fix is available for every student (not only failed validation),
                        and remains admin-only. Pressing it reveals the Remove-from-batch
                        panel below (gated on fixOpen). */}
                    {isAdmin && (
                      <button
                        onClick={() => openFix(s.student_id)}
                        className="h-7 px-3 text-xs font-semibold rounded-lg transition shrink-0 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200"
                      >
                        {fixOpen === s.student_id ? "Close" : "Fix"}
                      </button>
                    )}

                  </div>

                  {fixOpen === s.student_id && (
                    <div className="ml-3 flex items-center flex-wrap gap-2 text-xs">
                      {fixLoading ? (
                        <span className="text-gray-400">Checking…</span>
                      ) : (
                        <>
                          {fixTarget?.targetBatch ? (
                            <button
                              onClick={() => doMove(s.student_id, fixTarget!.targetBatch!.batch_id)}
                              disabled={fixBusy}
                              className="h-7 px-3 font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white transition"
                            >
                              Move to section {fixTarget.targetBatch.section} ({fixTarget.targetBatch.batch_name})
                            </button>
                          ) : fixTarget?.actualSection ? (
                            <span className="text-amber-600">
                              Belongs to section {fixTarget.actualSection} — create that batch first.
                            </span>
                          ) : (
                            <span className="text-gray-500">No other section to move to.</span>
                          )}
                          <button
                            onClick={() => doRemove(s.student_id)}
                            disabled={fixBusy}
                            className="h-7 px-3 font-semibold rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 transition"
                          >
                            Remove from this batch
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}