"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "@/app/lib/queryKeys";
import { useRouter } from "next/navigation";
import {
  ChevronDown, ChevronLeft, ChevronRight, Download, DownloadCloud, Eye, FlipVertical, Maximize, RotateCcw, RotateCw, Trash2, X, ZoomIn, ZoomOut,
} from "lucide-react";
import {
  getErrorBucket,
  removeFromErrorBucket,
  escalateErrorBucket,
  resolveErrorBucket,
  reopenErrorBucket,
  getStudentPages,
  getProxyImageUrl,
  deletePage,
  reprocessFromBbox,
  reorderPages,
  restoreFromDispatch,
  removeStudent,
  rerunStudent,
  rotateStudentPage,
  bookletResplit,
  flipAlternateSpreads,
  probeRerunEdits,
  notifyManualRepairFixed,
  ErrorBucketRow,
  StudentPage,
  ERROR_BUCKET_REASONS,
} from "@/app/(dashboard)/pdfExtract/lib/beaverApi";
import { getDispatchPages, listDocuments, getDocument, pageImageUrl, type ScannedDocument, type ScannedPage } from "@/app/lib/scanApi";
import { getUserRoles } from "@/app/lib/auth";
import ConfirmModal from "@/app/(dashboard)/pdfExtract/components/ConfirmModal";
import { FilterSelect, type FilterOption } from "@/app/components/FilterSelect";

// Zoom/pan/rotate popup for a single page (click a thumbnail in View/edit
// pages to open). Pan via drag, zoom via wheel or the buttons; rotate calls
// the backend in place and the caller reloads the page list so the image
// shown here updates once the parent's `page` prop refreshes.
function PageZoomViewer({
  page,
  index,
  total,
  onClose,
  onRotate,
  rotating,
  onPrev,
  onNext,
}: {
  page: StudentPage;
  index: number;
  total: number;
  onClose: () => void;
  onRotate: (direction: "cw" | "ccw" | "180") => void;
  rotating: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.min(6, Math.max(0.5, s * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
  };
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setOffset({ x: drag.current.ox + (e.clientX - drag.current.x), y: drag.current.oy + (e.clientY - drag.current.y) });
  };
  const onPointerUp = () => { drag.current = null; };
  const resetView = () => { setScale(1); setOffset({ x: 0, y: 0 }); };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-xl shadow-xl w-full max-w-3xl h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="shrink-0 px-5 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <p className="text-sm font-semibold text-gray-800">Page {page.page_number}</p>
            <span className="text-[11px] text-gray-400 tabular-nums">{index + 1} of {total}</span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={onPrev}
              disabled={index <= 0}
              className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-indigo-600 transition disabled:opacity-30 disabled:cursor-not-allowed"
              title="Previous page"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={onNext}
              disabled={index >= total - 1}
              className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-indigo-600 transition disabled:opacity-30 disabled:cursor-not-allowed"
              title="Next page"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={onClose}
              className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition"
              title="Close"
            >
              <X size={16} />
            </button>
          </div>
        </div>
        <div
          className="bg-gray-100 relative flex-1 min-h-0 cursor-grab touch-none overflow-hidden active:cursor-grabbing"
          onWheel={onWheel}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <div
            className="flex h-full w-full items-center justify-center"
            style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`, transformOrigin: "center center" }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={getProxyImageUrl(`${page.image_url}?rev=${page.file_size_kb || 0}_${page.natural_width || 0}_${page.natural_height || 0}`)}
              alt={`Page ${page.page_number}`}
              className="max-h-full max-w-full select-none object-contain"
              draggable={false}
            />
            {rotating && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/60">
                <span className="text-xs font-semibold text-gray-500">Rotating…</span>
              </div>
            )}
          </div>
        </div>
        <div className="shrink-0 flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-100">
          <div className="flex items-center gap-1">
            <button
              onClick={() => setScale((s) => Math.max(0.5, s / 1.25))}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition"
              title="Zoom out"
            >
              <ZoomOut size={14} />
            </button>
            <span className="text-[11px] text-gray-500 w-10 text-center tabular-nums">{Math.round(scale * 100)}%</span>
            <button
              onClick={() => setScale((s) => Math.min(6, s * 1.25))}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition"
              title="Zoom in"
            >
              <ZoomIn size={14} />
            </button>
            <button
              onClick={resetView}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition"
              title="Reset zoom"
            >
              <Maximize size={14} />
            </button>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onRotate("ccw")}
              disabled={rotating}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
              title="Rotate left 90°"
            >
              <RotateCcw size={14} />
            </button>
            <button
              onClick={() => onRotate("cw")}
              disabled={rotating}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
              title="Rotate right 90°"
            >
              <RotateCw size={14} />
            </button>
            <button
              onClick={() => onRotate("180")}
              disabled={rotating}
              className="h-8 w-8 flex items-center justify-center rounded-lg border border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
              title="Flip 180° (for a page scanned upside down)"
            >
              <FlipVertical size={14} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

const NO_ROWS: ErrorBucketRow[] = [];

function examTypeOf(r: ErrorBucketRow): string {
  return r.exam_type_name ?? "No exam type";
}

// The scope filters, outermost first; each dropdown lists only values left by the ones before it.
const SCOPE_LEVELS = [
  { key: "school", label: "School", all: "All schools", get: (r: ErrorBucketRow) => r.school_name },
  { key: "grade", label: "Grade", all: "All grades", get: (r: ErrorBucketRow) => r.grade },
  { key: "section", label: "Section", all: "All sections", get: (r: ErrorBucketRow) => r.section },
  { key: "subject", label: "Subject", all: "All subjects", get: (r: ErrorBucketRow) => r.subject },
  { key: "exam", label: "Exam", all: "All exams", get: (r: ErrorBucketRow) => r.exam_type },
] as const;
type ScopeKey = (typeof SCOPE_LEVELS)[number]["key"];
type Scope = Record<ScopeKey, string>;
const NO_SCOPE: Scope = { school: "", grade: "", section: "", subject: "", exam: "" };

// Dropdown options for one field: each distinct value with how many rows have it, in natural order.
function countOptions(rows: ErrorBucketRow[], get: (r: ErrorBucketRow) => string | null): FilterOption[] {
  const counts = new Map<string, number>();
  for (const r of rows) {
    const v = get(r);
    if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  return [...counts.keys()]
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
    .map((v) => ({ value: v, label: `${v} (${counts.get(v)})` }));
}

// True when the row matches every chosen filter among the first `levels` ("" = any).
function inScope(r: ErrorBucketRow, scope: Scope, levels: number = SCOPE_LEVELS.length): boolean {
  return SCOPE_LEVELS.slice(0, levels).every((l) => !scope[l.key] || (l.get(r) ?? "") === scope[l.key]);
}

export default function ManualRepairPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [msg, setMsg] = useState<{ text: string; error?: boolean } | null>(null);
  const [tab, setTab] = useState<"repair" | "rescan">("repair");

  // Prevent layout shift when switching tabs: short content hides the
  // browser scrollbar, shifting the centered container right.
  useEffect(() => {
    document.documentElement.style.scrollbarGutter = "stable";
    return () => { document.documentElement.style.scrollbarGutter = ""; };
  }, []);

  // Generic confirmation modal state — replaces all window.confirm calls.
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    confirmLabel: string;
    variant: "danger" | "primary" | "warning";
    onConfirm: () => void;
  } | null>(null);

  // Per-entry page editor
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [pages, setPages] = useState<StudentPage[]>([]);
  const [pagesLoading, setPagesLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  // Drag-to-reorder: index being dragged and whether the on-screen order has
  // diverged from the saved page_number sequence.
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [orderDirty, setOrderDirty] = useState(false);

  // Delete / full re-run are ADMIN only, same as on the batch details page.
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => { setIsAdmin(getUserRoles().includes("ADMIN")); }, []);

  // Bulk selection
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const toggleSelect = (id: number) => setSelectedIds(prev => {
    const next = new Set(prev);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });
  const [bulkBusy, setBulkBusy] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<{ done: number; total: number; failed: number } | null>(null);

  const repairQuery = useQuery({
    queryKey: keys.errorBucket("open"),
    queryFn: () => getErrorBucket("open").then(res => res.rows ?? []),
  });

  const rescanEscalatedQuery = useQuery({
    queryKey: keys.errorBucket("escalated"),
    queryFn: () => getErrorBucket("escalated").then(res => res.rows ?? []),
  });

  const rescanResolvedQuery = useQuery({
    queryKey: keys.errorBucket("resolved"),
    queryFn: () => getErrorBucket("resolved").then(res => res.rows ?? []),
  });

  const rescanRows = [...(rescanEscalatedQuery.data ?? []), ...(rescanResolvedQuery.data ?? [])];
  const rescanLoading = rescanEscalatedQuery.isPending || rescanResolvedQuery.isPending;
  const rescanError = rescanEscalatedQuery.error ?? rescanResolvedQuery.error;

  const tabRows = tab === "repair" ? (repairQuery.data ?? NO_ROWS) : rescanRows;
  const [scope, setScope] = useState<Scope>(NO_SCOPE);
  const scopeActive = SCOPE_LEVELS.some((l) => scope[l.key]);
  // Both tabs work on the rows left by the School / Grade / Section / Subject / Exam filters.
  const rows = scopeActive ? tabRows.filter((r) => inScope(r, scope)) : tabRows;
  const loading = tab === "repair" ? repairQuery.isPending : rescanLoading;
  const error = tab === "repair"
    ? (repairQuery.error instanceof Error ? repairQuery.error.message : null)
    : (rescanError instanceof Error ? rescanError.message : null);

  const fetchBucket = useCallback(
    () => Promise.all([
      queryClient.invalidateQueries({ queryKey: keys.errorBucket("open") }),
      queryClient.invalidateQueries({ queryKey: keys.errorBucket("escalated") }),
      queryClient.invalidateQueries({ queryKey: keys.errorBucket("resolved") }),
    ]),
    [queryClient],
  );

  const downloadCsv = useCallback((list: ErrorBucketRow[], filename: string) => {
    const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
    const header = "Grade,Section,Subject,Name,Roll,Reason,Notes,Status";
    const csv = [header, ...list.map(r =>
      [r.grade, r.section, r.subject, r.student_name, r.roll_number, r.reason, r.notes, r.status]
        .map(v => escape(String(v ?? "")))
        .join(",")
    )].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, []);

  // Auto-dismiss the status banner.
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 5000);
    return () => clearTimeout(t);
  }, [msg]);

  const openInChunking = (r: ErrorBucketRow) => {
    const params = new URLSearchParams({ batchId: r.batch_id, studentId: r.student_id });
    if (r.school_name) params.set("school", r.school_name);
    if (r.grade) params.set("grade", r.grade);
    if (r.section) params.set("section", r.section);
    if (r.subject) params.set("subject", r.subject);
    if (r.exam_type) params.set("exam", r.exam_type);
    router.push(`/pdfExtract?${params.toString()}`);
  };

  const remove = (id: number) => {
    setConfirmAction({
      title: "Remove from bucket",
      message: "This entry will be removed from the repair bucket. You can always re-send the student from Answer Chunking if needed.",
      confirmLabel: "Remove",
      variant: "danger",
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          await removeFromErrorBucket(id);
          if (expandedId === id) setExpandedId(null);
          await fetchBucket();
        } catch (e) {
          setMsg({ text: e instanceof Error ? e.message : "Remove failed", error: true });
        }
      },
    });
  };

  const escalate = (id: number) => {
    setConfirmAction({
      title: "Send to Rescan",
      message: "This student will be moved to the Rescan list. You can send it back to Repair from there if needed.",
      confirmLabel: "Send to Rescan",
      variant: "warning",
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          await escalateErrorBucket(id);
          if (expandedId === id) setExpandedId(null);
          await fetchBucket();
          setMsg({ text: "Moved to Rescan list." });
        } catch (e) {
          setMsg({ text: e instanceof Error ? e.message : "Escalate failed", error: true });
        }
      },
    });
  };

  const resolve = (id: number) => {
    setConfirmAction({
      title: "Mark as resolved",
      message: "This entry will be marked as resolved and removed from the Rescan list.",
      confirmLabel: "Resolve",
      variant: "primary",
      onConfirm: async () => {
        setConfirmAction(null);
        try {
          await resolveErrorBucket(id);
          if (expandedId === id) setExpandedId(null);
          await fetchBucket();
          setMsg({ text: "Marked as resolved." });
        } catch (e) {
          setMsg({ text: e instanceof Error ? e.message : "Resolve failed", error: true });
        }
      },
    });
  };

  const reopen = async (id: number) => {
    try {
      await reopenErrorBucket(id);
      if (expandedId === id) setExpandedId(null);
      await fetchBucket();
      setMsg({ text: "Moved back to Manual Repair." });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Reopen failed", error: true });
    }
  };

  // Pages stay local: the operator reorders and rotates them before saving, so
  // this is an editable draft, not a cached server copy.
  const loadPages = useCallback(async (r: ErrorBucketRow) => {
    setPagesLoading(true);
    setPages([]);
    try {
      const res = await getStudentPages(r.batch_id, r.student_id);
      setPages(res.scans ?? []);
      setOrderDirty(false);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Failed to load pages", error: true });
    } finally {
      setPagesLoading(false);
    }
  }, []);

  const togglePages = (r: ErrorBucketRow) => {
    if (expandedId === r.id) { setExpandedId(null); return; }
    setExpandedId(r.id);
    loadPages(r);
  };

  const moveTo = (from: number, to: number) => {
    if (from === to) return;
    setPages(prev => {
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next;
    });
    setOrderDirty(true);
  };

  const saveOrder = async (r: ErrorBucketRow) => {
    if (busy) return;
    setBusy(true);
    try {
      await reorderPages(r.batch_id, r.student_id, pages.map(p => p.img_id));
      await loadPages(r);
      setMsg({ text: "Page order saved; pages renumbered." });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Save order failed", error: true });
    } finally {
      setBusy(false);
    }
  };

  // Zoom/rotate popup: click a thumbnail in View/edit pages to open it. Keyed
  // by img_id (not the StudentPage object) so it stays pointed at the same
  // page across a `pages` reload after a rotate.
  const [pageViewer, setPageViewer] = useState<{ r: ErrorBucketRow; imgId: string } | null>(null);
  const [rotating, setRotating] = useState(false);
  const viewerIndex = pageViewer ? pages.findIndex(p => p.img_id === pageViewer.imgId) : -1;
  const viewerPage = viewerIndex >= 0 ? pages[viewerIndex] : null;

  const goToViewerPage = (delta: number) => {
    if (!pageViewer || viewerIndex < 0) return;
    const next = pages[viewerIndex + delta];
    if (next) setPageViewer({ r: pageViewer.r, imgId: next.img_id });
  };

  const rotatePage = async (direction: "cw" | "ccw" | "180") => {
    if (!pageViewer || !viewerPage || rotating) return;
    const { r } = pageViewer;
    setRotating(true);
    try {
      await rotateStudentPage(r.batch_id, r.student_id, viewerPage.page_number, direction);
      await loadPages(r);
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Rotate failed", error: true });
    } finally {
      setRotating(false);
    }
  };

  const deleteOne = (r: ErrorBucketRow, img_id: string, pageNumber: number) => {
    if (busy) return;
    setConfirmAction({
      title: "Delete page",
      message: `Page ${pageNumber} will be deleted. Remaining pages will be renumbered automatically.`,
      confirmLabel: "Delete",
      variant: "danger",
      onConfirm: async () => {
        setConfirmAction(null);
        setBusy(true);
        try {
          await deletePage(r.batch_id, r.student_id, img_id);
          await loadPages(r);
          setMsg({ text: `Deleted page ${pageNumber}; pages renumbered.` });
        } catch (e) {
          setMsg({ text: e instanceof Error ? e.message : "Delete failed", error: true });
        } finally {
          setBusy(false);
        }
      },
    });
  };

  // Same delete as the batch details page: removes the student's paper (pages +
  // crops) from the batch. The bucket entry then points at nothing, so clear it too.
  const deleteStudent = (r: ErrorBucketRow) => {
    if (busy) return;
    setConfirmAction({
      title: "Delete student paper",
      message: "This will permanently delete all pages and crops for this student from the batch. The bucket entry will also be removed.",
      confirmLabel: "Delete paper",
      variant: "danger",
      onConfirm: async () => {
        setConfirmAction(null);
        setBusy(true);
        try {
          await removeStudent(r.batch_id, r.student_id);
          await removeFromErrorBucket(r.id).catch(() => {});
          if (expandedId === r.id) setExpandedId(null);
          await fetchBucket();
          setMsg({ text: "Paper deleted; entry removed from the bucket." });
        } catch (e) {
          setMsg({ text: e instanceof Error ? e.message : "Delete failed", error: true });
        } finally {
          setBusy(false);
        }
      },
    });
  };

  // The three re-run kinds, all sharing one confirm-then-execute flow:
  // - "plain":  restart the whole pipeline. Nothing is touched beforehand.
  // - "flip":   rotate every even-positioned RAW spread 180° (a scanning
  //             operator fed alternate sheets upside down), then a plain
  //             re-run — the pipeline still does its own trimming, spread
  //             validation, split, reorder and loose-sheet rotation on the
  //             corrected scans.
  // - "multi":  re-split into mini-booklets of 2 spreads via booklet-resplit,
  //             then re-run from bbox detection. Only for combined-subject
  //             papers (Physics/Chemistry/Biology under one Science cover, or
  //             the Social Science equivalent) that the pipeline's
  //             one-booklet assumption genuinely cannot handle — it
  //             reimplements preprocessing and OVERWRITES the raw scans.
  type RerunKind = "plain" | "flip" | "multi";

  // Pending re-run awaiting the operator's discard decision. Every kind is
  // probed for graded work BEFORE any destructive step runs, so cancelling
  // here always leaves the paper exactly as it was. (Previously the
  // multi-booklet path re-split first and only then discovered the paper was
  // graded, so cancelling left rewritten pages with stale bboxes.)
  const [rerunPlan, setRerunPlan] = useState<
    { r: ErrorBucketRow; kind: RerunKind; flipAlternate: boolean; edited_count: number } | null
  >(null);

  // Carry human edits across the re-run (snapshot + re-apply by question
  // number — see beaver-api preservedEdits). CHECKED by default — losing
  // grading work silently is the worse failure; operators untick it for
  // page fixes that renumber questions. Reset per dialog.
  const [preserveEdits, setPreserveEdits] = useState(true);

  const KIND_LABEL: Record<RerunKind, string> = {
    plain: "Re-run",
    flip: "Flip alternate spreads & re-run",
    multi: "Multi-booklet re-split & re-run",
  };

  // Step 1: ask the server how much graded work this would discard, without
  // starting or changing anything. Confirm first if there is any.
  const startRerun = async (r: ErrorBucketRow, kind: RerunKind, flipAlternate = false) => {
    if (busy) return;
    setBusy(true);
    try {
      const { edited_count } = await probeRerunEdits(r.batch_id, r.student_id);
      if (edited_count > 0) {
        setPreserveEdits(true);
        setRerunPlan({ r, kind, flipAlternate, edited_count });
      } else {
        await executeRerun(r, kind, flipAlternate, false);
      }
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Could not check this paper's graded work", error: true });
    } finally {
      setBusy(false);
    }
  };

  // Step 2: do the destructive work, now that discarding is confirmed (or
  // there was nothing to discard). `confirmDiscard` is only true on the path
  // that actually showed the operator a count.
  const executeRerun = async (r: ErrorBucketRow, kind: RerunKind, flipAlternate: boolean, confirmDiscard: boolean) => {
    if (kind === "flip") {
      try {
        const res = await flipAlternateSpreads(r.batch_id, r.student_id);
        await loadPages(r);
        setExpandedId(r.id);
        setMsg({ text: `Flipped ${res.flipped_count} of ${res.spreads_found} spreads — starting re-run…` });
      } catch (e) {
        setMsg({ text: e instanceof Error ? e.message : "Flip alternate spreads failed", error: true });
        return;
      }
    } else if (kind === "multi") {
      try {
        const resplit = await bookletResplit(r.batch_id, r.student_id, { flip_alternate_spreads: flipAlternate });
        await loadPages(r);
        setExpandedId(r.id);
        const leftoverNote = resplit.leftover_pages?.length
          ? `, ${resplit.leftover_pages.length} page(s) left unplaced at the end (${resplit.leftover_pages.join(", ")})`
          : "";
        setMsg({
          text: `Re-split into ${resplit.booklets.length} booklet${resplit.booklets.length === 1 ? "" : "s"} ` +
            `(${resplit.final_page_count} pages` +
            (resplit.dropped_blank_pages?.length ? `, dropped ${resplit.dropped_blank_pages.length} blank` : "") +
            `${leftoverNote}) — starting re-run…`,
        });
      } catch (e) {
        setMsg({ text: e instanceof Error ? e.message : "Booklet re-split failed", error: true });
        return;
      }
    }
    try {
      // "multi" resumes from bbox: its pages are already split, so the
      // pipeline's own preprocessing must be skipped. "plain" and "flip" both
      // want the full pipeline — that is the entire point of the flip
      // pre-step.
      await rerunStudent(r.batch_id, r.student_id, true, confirmDiscard, confirmDiscard && preserveEdits,
        kind === "multi" ? "bbox" : undefined);
      notifyManualRepairFixed(r.batch_id, r.student_id, r.student_name ?? undefined, r.roll_number ?? undefined).catch(() => {});
      setMsg({ text: `${KIND_LABEL[kind]} started.` });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Re-run failed", error: true });
    }
  };

  const confirmRerunPlan = async () => {
    if (!rerunPlan) return;
    const { r, kind, flipAlternate } = rerunPlan;
    setRerunPlan(null);
    setBusy(true);
    try {
      await executeRerun(r, kind, flipAlternate, true);
    } finally {
      setBusy(false);
    }
  };

  // Rerun ▾ dropdown: only one row's menu open at a time. Plain and Flip run
  // straight through startRerun; Multi-booklet opens the options panel first,
  // since its flip toggle needs choosing rather than a yes/no confirm.
  const [rerunMenuOpenId, setRerunMenuOpenId] = useState<number | null>(null);
  const [removeMenuOpenId, setRemoveMenuOpenId] = useState<number | null>(null);
  const [tableActionOpenId, setTableActionOpenId] = useState<number | null>(null);
  const [rescanFilter, setRescanFilter] = useState<"all" | "escalated" | "resolved">("all");
  const [reasonFilter, setReasonFilter] = useState<string>("all");
  const [addedByFilter, setAddedByFilter] = useState<string>("all");
  const [examTypeFilter, setExamTypeFilter] = useState<string>("all");
  const [multiOptions, setMultiOptions] = useState<{ r: ErrorBucketRow } | null>(null);
  const [multiFlipAlternate, setMultiFlipAlternate] = useState(false);

  // Find this paper's dispatch document by its QR claim (newest wins when the
  // paper was scanned more than once). Shared by "Get from dispatch" and
  // "View originals"; resolves null after surfacing the reason in the banner.
  const findDispatchDocument = async (
    r: ErrorBucketRow,
  ): Promise<{ doc: ScannedDocument; detail: Awaited<ReturnType<typeof getDocument>>; pages: ScannedPage[]; matchCount: number } | null> => {
    const norm = (s: string | null | undefined) => (s ?? "").trim().toUpperCase().replace(/\s+/g, " ");
    const docs: ScannedDocument[] = [];
    for (let offset = 0; ; offset += 1000) {
      const page = await listDocuments({ limit: 1000, offset });
      docs.push(...page.documents);
      if (page.documents.length === 0 || docs.length >= (page.total ?? docs.length)) break;
    }
    type Claim = { student_name?: string; roll_number?: string | number; subject?: string; grade?: string | number; section?: string };
    const matches = docs
      .filter((d) => {
        const c = (d.claimed_metadata ?? {}) as Claim;
        return d.kind === "answer_paper"
          && norm(c.student_name as string) === norm(r.student_name)
          && (!r.roll_number || String(c.roll_number ?? "") === String(r.roll_number))
          && (!r.subject || c.subject === r.subject)
          && (!r.grade || String(c.grade ?? "") === String(r.grade))
          && (!r.section || c.section === r.section);
      })
      .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
    if (matches.length === 0) {
      setMsg({ text: "No matching dispatch document found for this paper.", error: true });
      return null;
    }
    const doc = matches[0];
    const detail = await getDocument(doc.document_id);
    const pages = [...(detail.pages ?? [])].sort((a, b) => a.page_number - b.page_number);
    if (pages.length === 0) {
      setMsg({ text: "Matched dispatch document has no stored pages.", error: true });
      return null;
    }
    return { doc, detail, pages, matchCount: matches.length };
  };

  // "View originals": show the permanent scan-intake copy of this paper —
  // exactly what the scanner produced — without touching anything. Each page
  // carries its dispatch SEQUENCE number (position in the physical scan
  // order), which is what locates a stray sheet in a neighbouring block.
  type OriginalPage = ScannedPage & { seq: number | null; stream: string | null };
  const [originalsView, setOriginalsView] = useState<{ r: ErrorBucketRow; doc: ScannedDocument; pages: OriginalPage[]; matchCount: number; dispatchName: string | null } | null>(null);
  const viewOriginals = async (r: ErrorBucketRow) => {
    if (busy) return;
    setBusy(true);
    try {
      const found = await findDispatchDocument(r);
      if (!found) return;
      // Map each page to its dispatch stream position via r2 key. Best-effort:
      // the viewer still works (without sequence numbers) if this join fails.
      let seqByKey = new Map<string, { seq: number | null; stream: string | null }>();
      let dispatchName: string | null = null;
      try {
        const sortEvent = (found.detail.events ?? []).find((ev) => ev.event_kind === "sorted_from_dispatch");
        const dispatchId = (sortEvent?.payload as { dispatch_id?: string } | null)?.dispatch_id;
        if (dispatchId) {
          dispatchName = dispatchId;
          const dp = await getDispatchPages(dispatchId);
          seqByKey = new Map(dp.pages.map((pg) => [pg.r2_key_original, { seq: pg.page_no, stream: pg.stream }]));
        }
      } catch { /* sequence numbers are an enhancement, not a requirement */ }
      const pages: OriginalPage[] = found.pages.map((pg) => ({
        ...pg,
        seq: seqByKey.get(pg.r2_key_original)?.seq ?? null,
        stream: seqByKey.get(pg.r2_key_original)?.stream ?? null,
      }));
      setOriginalsView({ r, doc: found.doc, pages, matchCount: found.matchCount, dispatchName });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Could not load dispatch originals", error: true });
    } finally {
      setBusy(false);
    }
  };

  // "Get from dispatch": re-seed this paper's raw scans from its permanent
  // dispatch-store copy (matched by the QR claim). Deliberately does NOT
  // chain a re-run — restored scans sometimes carry a stray blank A4 page
  // mid-spread, and the operator needs to review/delete it in the page
  // editor first. Re-run is a separate, explicit step (the Re-run ▾ menu).
  const getFromDispatch = async (r: ErrorBucketRow) => {
    if (busy) return;
    setBusy(true);
    try {
      const found = await findDispatchDocument(r);
      if (!found) { setBusy(false); return; }
      const { doc, pages, matchCount } = found;
      const when = (doc.created_at || "").slice(0, 10);
      setBusy(false);
      setConfirmAction({
        title: "Restore from dispatch",
        message: `This will replace the current raw scans with the dispatch copy (scanned ${when}, ${pages.length} pages${matchCount > 1 ? `, newest of ${matchCount} matches` : ""}). Review the pages afterward — re-run is a separate step.`,
        confirmLabel: "Restore scans",
        variant: "warning",
        onConfirm: async () => {
          setConfirmAction(null);
          setBusy(true);
          try {
            await restoreFromDispatch(r.batch_id, r.student_id, pages.map((p) => p.r2_key_original));
            setMsg({ text: `Restored ${pages.length} scans from dispatch — review pages, then re-run when ready.` });
            setExpandedId(r.id);
            await loadPages(r);
          } catch (e) {
            setMsg({ text: e instanceof Error ? e.message : "Get from dispatch failed", error: true });
          } finally {
            setBusy(false);
          }
        },
      });
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Get from dispatch failed", error: true });
      setBusy(false);
    }
  };

  const reprocess = (r: ErrorBucketRow) => {
    if (busy) return;
    setConfirmAction({
      title: "Re-process pages",
      message: "This will re-detect boxes on the current page set and stop at Answer Chunking for review.",
      confirmLabel: "Re-process",
      variant: "primary",
      onConfirm: async () => {
        setConfirmAction(null);
        setBusy(true);
        try {
          await reprocessFromBbox(r.batch_id, r.student_id);
          setMsg({ text: "Re-processing started (bbox → chunking review)." });
        } catch (e) {
          setMsg({ text: e instanceof Error ? e.message : "Re-process failed", error: true });
        } finally {
          setBusy(false);
        }
      },
    });
  };

  // ── Bulk actions ────────────────────────────────────────────────────────
  const getSelectedRows = useCallback(() => {
    const all = tab === "repair" ? (repairQuery.data ?? []) : rescanRows;
    return all.filter(r => selectedIds.has(r.id));
  }, [tab, repairQuery.data, rescanRows, selectedIds]);

  const runBulkAction = (label: string, action: (r: ErrorBucketRow) => Promise<void>) => {
    const selected = getSelectedRows();
    if (selected.length === 0) return;
    setConfirmAction({
      title: label,
      message: `Run on ${selected.length} selected student${selected.length === 1 ? "" : "s"}?`,
      confirmLabel: `${label} (${selected.length})`,
      variant: "warning",
      onConfirm: async () => {
        setConfirmAction(null);
        setBulkBusy(true);
        let done = 0, failed = 0;
        const failures: string[] = [];
        setBulkProgress({ done: 0, total: selected.length, failed: 0 });
        for (const r of selected) {
          try {
            await action(r);
          } catch (e) {
            const reason = e instanceof Error ? e.message : "Unknown error";
            const name = r.student_name || r.roll_number || r.student_id;
            failures.push(`${name}: ${reason}`);
            console.error(`${label} failed for ${name}:`, e);
            failed++;
          }
          done++;
          setBulkProgress({ done, total: selected.length, failed });
        }
        setBulkBusy(false);
        setBulkProgress(null);
        setSelectedIds(new Set());
        await fetchBucket();
        const summary = `${label}: ${done - failed}/${selected.length} succeeded`;
        setMsg({
          text: failures.length
            ? `${summary}\nFailed:\n${failures.join("\n")}`
            : summary,
          error: failed > 0,
        });
      },
    });
  };

  const bulkRerun = () => runBulkAction("Re-run", async (r) => {
    const { edited_count } = await probeRerunEdits(r.batch_id, r.student_id);
    await rerunStudent(r.batch_id, r.student_id, true, edited_count > 0, false);
    notifyManualRepairFixed(r.batch_id, r.student_id, r.student_name ?? undefined, r.roll_number ?? undefined).catch(() => {});
  });
  const bulkFlip = () => runBulkAction("Flip & re-run", async (r) => {
    try {
      await flipAlternateSpreads(r.batch_id, r.student_id);
    } catch {
      // no alternate spreads — fall through to a plain re-run
    }
    const { edited_count } = await probeRerunEdits(r.batch_id, r.student_id);
    await rerunStudent(r.batch_id, r.student_id, true, edited_count > 0, false);
    notifyManualRepairFixed(r.batch_id, r.student_id, r.student_name ?? undefined, r.roll_number ?? undefined).catch(() => {});
  });
  const bulkResplit = () => runBulkAction("Re-split & re-run", async (r) => {
    let didResplit = false;
    try {
      await bookletResplit(r.batch_id, r.student_id, { flip_alternate_spreads: false });
      didResplit = true;
    } catch {
      // no spreads to re-split — fall through to a plain re-run
    }
    const { edited_count } = await probeRerunEdits(r.batch_id, r.student_id);
    await rerunStudent(r.batch_id, r.student_id, true, edited_count > 0, false,
      didResplit ? "bbox" : undefined);
    notifyManualRepairFixed(r.batch_id, r.student_id, r.student_name ?? undefined, r.roll_number ?? undefined).catch(() => {});
  });
  const bulkEscalate = () => runBulkAction("Send to Rescan", async (r) => {
    await escalateErrorBucket(r.id);
  });
  const bulkRemove = () => runBulkAction("Remove", async (r) => {
    await removeFromErrorBucket(r.id);
  });

  return (
    <div className="p-6">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-gray-900">Manual Repair</h1>
        <p className="text-sm text-gray-500">
          Students flagged from Answer Chunking. View pages, delete blanks (survivors auto-renumber),
          re-process, then remove when fixed.
        </p>
        <div className="flex items-center gap-1 mt-3 border-b border-gray-200">
          <button
            onClick={() => { setTab("repair"); setExpandedId(null); setReasonFilter("all"); setAddedByFilter("all"); setExamTypeFilter("all"); setSelectedIds(new Set()); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              tab === "repair"
                ? "border-amber-600 text-amber-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Repair
            {(repairQuery.data?.length ?? 0) > 0 && (
              <span className="ml-1.5 min-w-[18px] h-[18px] inline-flex items-center justify-center rounded-full bg-amber-600 text-white text-[10px] font-bold px-1">
                {repairQuery.data!.length}
              </span>
            )}
          </button>
          <button
            onClick={() => { setTab("rescan"); setExpandedId(null); setReasonFilter("all"); setAddedByFilter("all"); setExamTypeFilter("all"); setSelectedIds(new Set()); }}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition ${
              tab === "rescan"
                ? "border-red-600 text-red-700"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            Rescan List
            {(rescanEscalatedQuery.data?.length ?? 0) > 0 && (
              <span className="ml-1.5 min-w-[18px] h-[18px] inline-flex items-center justify-center rounded-full bg-red-600 text-white text-[10px] font-bold px-1">
                {rescanEscalatedQuery.data!.length}
              </span>
            )}
          </button>
        </div>
        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {SCOPE_LEVELS.map((level, i) => {
            const options = countOptions(tabRows.filter((r) => inScope(r, scope, i)), level.get);
            return (
              <FilterSelect
                key={level.key}
                label={level.label}
                value={scope[level.key]}
                placeholder={level.all}
                onChange={(v) => {
                  // A new choice clears the filters after it, and any ticked rows it may hide.
                  const next = { ...scope, [level.key]: v };
                  SCOPE_LEVELS.slice(i + 1).forEach((l) => { next[l.key] = ""; });
                  setScope(next);
                  setSelectedIds(new Set());
                }}
                options={options}
              />
            );
          })}
          {scopeActive && (
            <button
              onClick={() => { setScope(NO_SCOPE); setSelectedIds(new Set()); }}
              className="text-[11px] text-gray-400 hover:text-gray-600 transition"
            >
              Clear filters
            </button>
          )}
        </div>
      </div>

      {msg && (
        <p className={`text-xs rounded-md px-3 py-1.5 mb-3 border ${
          msg.error ? "text-red-600 bg-red-50 border-red-100" : "text-indigo-600 bg-indigo-50 border-indigo-100"
        }`} style={{ whiteSpace: "pre-line" }}>{msg.text}</p>
      )}

      {/* Dispatch-originals viewer: read-only look at the scan-intake copy.
          Sizes are tagged the way the booklet splitter will classify them, so
          a bad bundle (odd spreads, ambiguous size, half-spread pages) is
          visible before choosing a repair. */}
      {originalsView && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setOriginalsView(null)}>
          <div
            className="bg-white rounded-xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="shrink-0 px-5 py-3 border-b border-gray-100 flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-gray-800">
                  Dispatch originals — {originalsView.r.student_name}
                </p>
                <p className="text-xs text-gray-500 mt-0.5">
                  {originalsView.pages.length} pages, scanned {(originalsView.doc.created_at || "").slice(0, 10)}
                  {originalsView.matchCount > 1 ? ` (newest of ${originalsView.matchCount} matching documents)` : ""}
                  {(() => {
                    const seqs = originalsView.pages.map((pg) => pg.seq).filter((n): n is number => n != null);
                    if (seqs.length === 0) return null;
                    const stream = originalsView.pages.find((pg) => pg.stream != null)?.stream;
                    return ` · dispatch seq ${Math.min(...seqs)}–${Math.max(...seqs)}${stream != null ? ` (stream ${stream})` : ""}`;
                  })()}
                  {" · "}
                  {(() => {
                    const longer = (pg: ScannedPage) => Math.max(pg.width ?? 0, pg.height ?? 0);
                    const spreads = originalsView.pages.filter((pg) => longer(pg) >= 7000).length;
                    const loose = originalsView.pages.filter((pg) => longer(pg) > 0 && longer(pg) <= 4000).length;
                    const odd = originalsView.pages.length - spreads - loose;
                    return `${spreads} spreads + ${loose} loose${odd > 0 ? ` + ${odd} unclassifiable` : ""}`;
                  })()}
                </p>
              </div>
              <button
                onClick={() => setOriginalsView(null)}
                className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition shrink-0"
                title="Close"
              >
                <X size={16} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50 rounded-b-xl">
              {originalsView.pages.map((pg) => {
                const longer = Math.max(pg.width ?? 0, pg.height ?? 0);
                const kind = !longer ? { label: "size unknown", cls: "bg-gray-100 text-gray-500" }
                  : longer >= 7000 ? { label: "spread", cls: "bg-indigo-50 text-indigo-600" }
                  : longer <= 4000 ? { label: "loose sheet", cls: "bg-gray-100 text-gray-600" }
                  : { label: "ambiguous size — will park", cls: "bg-red-50 text-red-600" };
                return (
                  <div key={pg.page_number}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-[11px] font-semibold text-gray-700">
                        {pg.seq != null ? `seq ${pg.seq}` : `page ${pg.page_number}`}
                      </span>
                      {pg.seq != null && <span className="text-[11px] text-gray-400">(doc page {pg.page_number})</span>}
                      <span className="text-[11px] text-gray-400">{pg.width ?? "?"}×{pg.height ?? "?"}</span>
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${kind.cls}`}>{kind.label}</span>
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={pageImageUrl(pg.r2_key_downscaled)}
                      alt={`Original page ${pg.page_number}`}
                      loading="lazy"
                      className="w-full rounded-lg border border-gray-200 bg-white"
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Page zoom/rotate popup — opened by clicking a thumbnail in View/edit pages. */}
      {pageViewer && viewerPage && (
        <PageZoomViewer
          key={viewerPage.img_id}
          page={viewerPage}
          index={viewerIndex}
          total={pages.length}
          onClose={() => setPageViewer(null)}
          onRotate={rotatePage}
          rotating={rotating}
          onPrev={() => goToViewerPage(-1)}
          onNext={() => goToViewerPage(1)}
        />
      )}

      {/* Multi-booklet options — its flip toggle needs choosing rather than a
          yes/no confirm, so it gets a panel. Marked danger: unlike the other
          two kinds this REPLACES the raw scans, which a plain re-run can no
          longer be run against afterwards without Get from dispatch first. */}
      {multiOptions && (
        <ConfirmModal
          title="Multi-booklet re-split & re-run"
          message={
            "Only for combined-subject papers that bundle several mini-booklets under one cover " +
            "(e.g. Physics+Chemistry+Biology under one Science cover). Splits the current pages into " +
            "mini-booklets of 2 spreads, reorders and rotates each independently, drops blank sheets, " +
            "then re-runs from bbox detection.\n\n" +
            "This REPLACES the paper's raw scans. To go back to a plain re-run afterwards, run " +
            "Get from dispatch first."
          }
          confirmLabel="Re-split & re-run"
          variant="danger"
          onConfirm={() => {
            const { r } = multiOptions;
            setMultiOptions(null);
            startRerun(r, "multi", multiFlipAlternate);
          }}
          onCancel={() => setMultiOptions(null)}
        >
          <label className="flex items-start gap-2 text-xs text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={multiFlipAlternate}
              onChange={e => setMultiFlipAlternate(e.target.checked)}
              className="mt-0.5 accent-indigo-600"
            />
            <span>
              <span className="font-semibold">Also flip alternate spreads</span> — if this paper ALSO
              has the scanning defect where every other physical sheet was fed upside down. Leave
              unchecked unless you know it does.
            </span>
          </label>
        </ConfirmModal>
      )}

      {/* Discard confirmation — shown for any re-run kind when the probe found
          graded work, BEFORE anything destructive has run. Cancelling here
          leaves the paper untouched. */}
      {rerunPlan && (
        <ConfirmModal
          title="Discard graded work and re-run?"
          message={
            `This will permanently discard ${rerunPlan.edited_count} graded ` +
            `question${rerunPlan.edited_count === 1 ? "" : "s"} (verified boxes, OCR, ` +
            `marks, and manual edits) and run: ${KIND_LABEL[rerunPlan.kind]}. Continue?`
          }
          confirmLabel="Discard & re-run"
          variant="danger"
          onConfirm={confirmRerunPlan}
          onCancel={() => setRerunPlan(null)}
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

      {confirmAction && (
        <ConfirmModal
          title={confirmAction.title}
          message={confirmAction.message}
          confirmLabel={confirmAction.confirmLabel}
          variant={confirmAction.variant}
          onConfirm={confirmAction.onConfirm}
          onCancel={() => setConfirmAction(null)}
        />
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Loading…</p>
      ) : error ? (
        <p className="text-sm text-red-500">{error}</p>
      ) : tab !== "repair" ? (
        /* ── Rescan / Done: simple table ── */
        rows.length === 0 ? (
          <p className="text-sm text-gray-400">
            {scopeActive ? "No entries match these filters." : "No entries in the Rescan list."}
          </p>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1.5">
                {(["all", "escalated", "resolved"] as const).map((f) => {
                  const label = f === "all" ? "All" : f === "escalated" ? "Pending" : "Resolved";
                  const count = f === "all" ? rows.length : rows.filter(r => r.status === f).length;
                  return (
                    <button
                      key={f}
                      onClick={() => setRescanFilter(f)}
                      className={`px-3 py-1.5 text-xs font-medium rounded-full transition ${
                        rescanFilter === f
                          ? "bg-gray-900 text-white"
                          : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                      }`}
                    >
                      {label} <span className="tabular-nums">{count}</span>
                    </button>
                  );
                })}
              </div>
              <button
                onClick={() => downloadCsv(
                  rescanFilter === "all" ? rows : rows.filter(r => r.status === rescanFilter),
                  "rescan-list.csv",
                )}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 transition"
              >
                <Download size={14} /> Download CSV
              </button>
            </div>

            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-200">
                <span className="text-xs font-medium text-indigo-700">{selectedIds.size} selected</span>
                <div className="h-4 w-px bg-indigo-200" />
                <button onClick={bulkRemove} disabled={bulkBusy} className="h-7 px-2.5 text-xs font-medium rounded-md bg-white border border-red-300 text-red-600 hover:bg-red-50 transition disabled:opacity-50">
                  Remove
                </button>
                <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-xs text-indigo-500 hover:text-indigo-700 transition">
                  Clear selection
                </button>
                {bulkProgress && (
                  <span className="text-xs text-indigo-600 font-mono">
                    {bulkProgress.done}/{bulkProgress.total}{bulkProgress.failed > 0 && ` (${bulkProgress.failed} failed)`}
                  </span>
                )}
              </div>
            )}

            <div className="border border-gray-200 rounded-xl overflow-visible">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-left text-xs text-gray-500 font-medium">
                    <th className="w-10 px-4 py-3">
                      <input
                        type="checkbox"
                        checked={(() => {
                          const visible = rescanFilter === "all" ? rows : rows.filter(r => r.status === rescanFilter);
                          return visible.length > 0 && visible.every(r => selectedIds.has(r.id));
                        })()}
                        ref={el => {
                          if (el) {
                            const visible = rescanFilter === "all" ? rows : rows.filter(r => r.status === rescanFilter);
                            el.indeterminate = visible.some(r => selectedIds.has(r.id)) && !visible.every(r => selectedIds.has(r.id));
                          }
                        }}
                        onChange={() => {
                          const visible = rescanFilter === "all" ? rows : rows.filter(r => r.status === rescanFilter);
                          const allChecked = visible.length > 0 && visible.every(r => selectedIds.has(r.id));
                          setSelectedIds(prev => {
                            const next = new Set(prev);
                            visible.forEach(r => allChecked ? next.delete(r.id) : next.add(r.id));
                            return next;
                          });
                        }}
                        className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </th>
                    <th className="px-4 py-3">Grade</th>
                    <th className="px-4 py-3">Sec</th>
                    <th className="px-4 py-3">Subject</th>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Roll</th>
                    <th className="px-4 py-3">Reason</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {(rescanFilter === "all" ? rows : rows.filter(r => r.status === rescanFilter)).map((r) => (
                    <tr key={r.id} className={`hover:bg-gray-50 transition ${selectedIds.has(r.id) ? "bg-indigo-50/50" : r.status === "resolved" ? "bg-green-50/40" : "bg-white"}`}>
                      <td className="px-4 py-3">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(r.id)}
                          onChange={() => toggleSelect(r.id)}
                          className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="px-4 py-3 text-gray-500">{r.grade ?? "-"}</td>
                      <td className="px-4 py-3 text-gray-500">{r.section ?? "-"}</td>
                      <td className="px-4 py-3 text-gray-500">{r.subject ?? "-"}</td>
                      <td className="px-4 py-3 font-medium text-gray-900 whitespace-nowrap">{r.student_name || r.student_id}</td>
                      <td className="px-4 py-3 text-gray-500 font-mono">{r.roll_number ?? "-"}</td>
                      <td className="px-4 py-3">
                        {r.reason && (
                          <span className="text-xs text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded font-medium">
                            {r.reason}
                          </span>
                        )}
                        {r.notes && <span className="text-xs text-gray-400 italic ml-1.5">{r.notes}</span>}
                      </td>
                      <td className="px-4 py-3">
                        {r.status === "resolved" ? (
                          <span className="text-xs text-green-700 bg-green-50 border border-green-200 px-1.5 py-0.5 rounded font-medium">Resolved</span>
                        ) : (
                          <span className="text-xs text-red-700 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded font-medium">Pending</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="relative inline-block">
                          <button
                            onClick={() => setTableActionOpenId(tableActionOpenId === r.id ? null : r.id)}
                            className="h-8 px-2.5 flex items-center gap-1 text-xs font-medium rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
                          >
                            Actions <ChevronDown size={12} />
                          </button>
                          {tableActionOpenId === r.id && (
                            <>
                              <div className="fixed inset-0 z-10" onClick={() => setTableActionOpenId(null)} />
                              <div className="absolute right-0 top-9 z-20 w-48 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                                {r.status === "escalated" && (
                                  <button
                                    onClick={() => { setTableActionOpenId(null); resolve(r.id); }}
                                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition font-medium text-green-600"
                                  >
                                    Mark as Resolved
                                  </button>
                                )}
                                <button
                                  onClick={() => { setTableActionOpenId(null); reopen(r.id); }}
                                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 transition text-gray-600 ${r.status === "escalated" || r.status === "resolved" ? "border-t border-gray-100" : ""}`}
                                >
                                  Back to Repair
                                </button>
                                <button
                                  onClick={() => { setTableActionOpenId(null); remove(r.id); }}
                                  className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 transition text-red-600 border-t border-gray-100"
                                >
                                  Remove
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400">{scopeActive ? "No students match these filters." : "No students pending repair."}</p>
      ) : (
        /* ── Repair: full card layout ── */
        <>
        {(() => {
          const filteredRows = rows
            .filter(r => reasonFilter === "all" || r.reason === reasonFilter)
            .filter(r => addedByFilter === "all" || r.added_by === addedByFilter)
            .filter(r => examTypeFilter === "all" || examTypeOf(r) === examTypeFilter);
          const allFilteredSelected = filteredRows.length > 0 && filteredRows.every(r => selectedIds.has(r.id));
          const someFilteredSelected = filteredRows.some(r => selectedIds.has(r.id));
          return (
            <>
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  ref={el => { if (el) el.indeterminate = someFilteredSelected && !allFilteredSelected; }}
                  onChange={() => {
                    if (allFilteredSelected) {
                      setSelectedIds(prev => {
                        const next = new Set(prev);
                        filteredRows.forEach(r => next.delete(r.id));
                        return next;
                      });
                    } else {
                      setSelectedIds(prev => {
                        const next = new Set(prev);
                        filteredRows.forEach(r => next.add(r.id));
                        return next;
                      });
                    }
                  }}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span className="text-xs text-gray-500">Select all</span>
              </label>
              {/* FilterSelect uses "" for "any"; these filters keep "all", so map between the two. */}
              <FilterSelect
                label="Reason"
                value={reasonFilter === "all" ? "" : reasonFilter}
                onChange={(v) => setReasonFilter(v || "all")}
                placeholder="All reasons"
                options={countOptions(rows, (r) => r.reason)}
              />
              <FilterSelect
                label="Sender"
                value={addedByFilter === "all" ? "" : addedByFilter}
                onChange={(v) => setAddedByFilter(v || "all")}
                placeholder="All senders"
                options={countOptions(rows, (r) => r.added_by)}
              />
              <FilterSelect
                label="Exam type"
                value={examTypeFilter === "all" ? "" : examTypeFilter}
                onChange={(v) => setExamTypeFilter(v || "all")}
                placeholder="All exam types"
                options={countOptions(rows, (r) => examTypeOf(r))}
              />
              {(reasonFilter !== "all" || addedByFilter !== "all" || examTypeFilter !== "all") && (
                <button onClick={() => { setReasonFilter("all"); setAddedByFilter("all"); setExamTypeFilter("all"); }} className="text-[11px] text-gray-400 hover:text-gray-600 transition">
                  Clear
                </button>
              )}
            </div>

            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-200">
                <span className="text-xs font-medium text-indigo-700">{selectedIds.size} selected</span>
                <div className="h-4 w-px bg-indigo-200" />
                <button onClick={bulkRerun} disabled={bulkBusy} className="h-7 px-2.5 text-xs font-medium rounded-md bg-indigo-600 text-white hover:bg-indigo-700 transition disabled:opacity-50">
                  Re-run
                </button>
                <button onClick={bulkFlip} disabled={bulkBusy} className="h-7 px-2.5 text-xs font-medium rounded-md bg-white border border-indigo-300 text-indigo-700 hover:bg-indigo-50 transition disabled:opacity-50">
                  Flip & re-run
                </button>
                <button onClick={bulkResplit} disabled={bulkBusy} className="h-7 px-2.5 text-xs font-medium rounded-md bg-white border border-indigo-300 text-indigo-700 hover:bg-indigo-50 transition disabled:opacity-50">
                  Re-split & re-run
                </button>
                <button onClick={bulkEscalate} disabled={bulkBusy} className="h-7 px-2.5 text-xs font-medium rounded-md bg-white border border-indigo-300 text-indigo-700 hover:bg-indigo-50 transition disabled:opacity-50">
                  Send to Rescan
                </button>
                <button onClick={() => setSelectedIds(new Set())} className="ml-auto text-xs text-indigo-500 hover:text-indigo-700 transition">
                  Clear selection
                </button>
                {bulkProgress && (
                  <span className="text-xs text-indigo-600 font-mono">
                    {bulkProgress.done}/{bulkProgress.total}{bulkProgress.failed > 0 && ` (${bulkProgress.failed} failed)`}
                  </span>
                )}
              </div>
            )}
            </>
          );
        })()}
        <div className="space-y-3">
          {rows
            .filter(r => reasonFilter === "all" || r.reason === reasonFilter)
            .filter(r => addedByFilter === "all" || r.added_by === addedByFilter)
            .filter(r => examTypeFilter === "all" || examTypeOf(r) === examTypeFilter)
            .map((r) => (
            <div key={r.id} className={`border rounded-xl bg-white ${selectedIds.has(r.id) ? "border-indigo-300 ring-1 ring-indigo-200" : "border-gray-200"}`}>
              <div className="flex items-center gap-3 px-4 py-3">
                <input
                  type="checkbox"
                  checked={selectedIds.has(r.id)}
                  onChange={() => toggleSelect(r.id)}
                  className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-gray-900">{r.student_name || r.student_id}</span>
                    {r.roll_number && (
                      <span className="text-xs font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
                        Roll {r.roll_number}
                      </span>
                    )}
                    {r.set_name && <span className="text-xs text-gray-400">Set {r.set_name}</span>}
                  </div>
                  <div className="text-xs text-gray-400 mt-0.5">
                    {[r.grade && `Grade ${r.grade}`, r.section && `Sec ${r.section}`, r.subject, r.exam_type]
                      .filter(Boolean).join(" · ")}
                  </div>
                  <div className="text-[11px] text-gray-400 mt-0.5 font-mono">{r.batch_id}</div>
                  {r.reason && (
                    <span className="inline-block text-xs text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded mt-1 font-medium">
                      {r.reason}
                    </span>
                  )}
                  {r.notes && <div className="text-xs text-gray-500 mt-0.5 italic">&ldquo;{r.notes}&rdquo;</div>}
                  <div className="text-[11px] text-gray-400 mt-0.5">
                    {r.added_by ? `by ${r.added_by}` : ""} {new Date(r.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isAdmin && (
                    <>
                      <button
                        onClick={() => deleteStudent(r)}
                        disabled={busy || bulkBusy}
                        className="h-8 w-8 flex items-center justify-center rounded-lg transition shrink-0 text-red-500 hover:bg-red-50 hover:text-red-600 disabled:opacity-40 disabled:cursor-not-allowed"
                        title="Delete this student's paper from the batch (removes pages and crops)"
                      >
                        <Trash2 size={14} />
                      </button>
                      <button
                        onClick={() => viewOriginals(r)}
                        disabled={busy || bulkBusy}
                        title="View originals: the permanent scan-intake copy of this paper, exactly as the scanner produced it"
                        className="h-8 w-8 flex items-center justify-center rounded-lg transition shrink-0 text-gray-500 hover:bg-gray-100 hover:text-indigo-600 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => getFromDispatch(r)}
                        disabled={busy || bulkBusy}
                        title="Get from dispatch: re-seed this paper's raw scans from its scan-intake copy for review (does not re-run)"
                        className="h-8 px-2.5 flex items-center gap-1.5 text-xs font-semibold rounded-lg border border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <DownloadCloud size={13} /> Get from dispatch
                      </button>
                      {/* Rerun ▾ — one entry point per scan defect, so the row
                          doesn't grow a button per variant. Ordered least to
                          most invasive. */}
                      <div className="relative shrink-0">
                        <button
                          onClick={() => setRerunMenuOpenId(rerunMenuOpenId === r.id ? null : r.id)}
                          disabled={busy || bulkBusy}
                          title="Re-run options"
                          className="h-8 px-2.5 flex items-center gap-1 text-xs font-semibold rounded-lg border border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <RotateCcw size={13} /> Re-run <ChevronDown size={12} />
                        </button>
                        {rerunMenuOpenId === r.id && (
                          <>
                            <div className="fixed inset-0 z-10" onClick={() => setRerunMenuOpenId(null)} />
                            <div className="absolute right-0 top-9 z-20 w-72 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                              <button
                                onClick={() => { setRerunMenuOpenId(null); startRerun(r, "plain"); }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition"
                              >
                                <span className="font-semibold text-gray-800">Re-run</span>
                                <p className="text-[11px] text-gray-400 mt-0.5">
                                  Restart the whole pipeline — for a normal paper with no known scan
                                  defects.
                                </p>
                              </button>
                              <button
                                onClick={() => { setRerunMenuOpenId(null); startRerun(r, "flip"); }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition border-t border-gray-100"
                              >
                                <span className="font-semibold text-gray-800">Flip alternate spreads &amp; re-run</span>
                                <p className="text-[11px] text-gray-400 mt-0.5">
                                  Rotates every other spread 180° first, then re-runs normally — for a
                                  paper scanned with alternate sheets upside down.
                                </p>
                              </button>
                              <button
                                onClick={() => {
                                  setRerunMenuOpenId(null);
                                  setMultiFlipAlternate(false);
                                  setMultiOptions({ r });
                                }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition border-t border-gray-100"
                              >
                                <span className="font-semibold text-gray-800">Multi-booklet re-split &amp; re-run…</span>
                                <p className="text-[11px] text-gray-400 mt-0.5">
                                  For combined-subject papers bundling several mini-booklets under one
                                  cover. Replaces the raw scans.
                                </p>
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    </>
                  )}
                  <button
                    onClick={() => togglePages(r)}
                    className="h-8 px-3 text-xs font-semibold rounded-lg border border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition"
                  >
                    {expandedId === r.id ? "Hide pages" : "View / edit pages"}
                  </button>
                  <button
                    onClick={() => openInChunking(r)}
                    className="h-8 px-3 text-xs font-semibold rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-600 transition"
                  >
                    Answer Chunking →
                  </button>
                  <button
                    onClick={() => router.push(`/batches/${r.batch_id}`)}
                    title="Open this batch's details page (paper status, pipeline actions)"
                    className="h-8 px-3 text-xs font-semibold rounded-lg border border-gray-300 text-gray-600 hover:border-indigo-400 hover:text-indigo-600 transition"
                  >
                    Batch →
                  </button>
                  <div className="relative shrink-0">
                    <button
                      onClick={() => setRemoveMenuOpenId(removeMenuOpenId === r.id ? null : r.id)}
                      className="h-8 px-2.5 flex items-center gap-1 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
                    >
                      Actions <ChevronDown size={12} />
                    </button>
                    {removeMenuOpenId === r.id && (
                      <>
                        <div className="fixed inset-0 z-10" onClick={() => setRemoveMenuOpenId(null)} />
                        <div className="absolute right-0 top-9 z-20 w-56 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                          <button
                            onClick={() => { setRemoveMenuOpenId(null); escalate(r.id); }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-gray-50 transition"
                          >
                            <span className="font-semibold text-gray-800">Send to Rescan</span>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              Move to the Rescan list for re-scanning.
                            </p>
                          </button>
                          <button
                            onClick={() => { setRemoveMenuOpenId(null); remove(r.id); }}
                            className="w-full text-left px-3 py-2 text-xs hover:bg-red-50 transition border-t border-gray-100"
                          >
                            <span className="font-semibold text-red-600">Remove from bucket</span>
                            <p className="text-[11px] text-gray-400 mt-0.5">
                              Remove this entry permanently.
                            </p>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {expandedId === r.id && (
                <div className="border-t border-gray-100 px-4 py-3 bg-gray-50 rounded-b-xl">
                  {pagesLoading ? (
                    <p className="text-xs text-gray-400">Loading pages…</p>
                  ) : pages.length === 0 ? (
                    <p className="text-xs text-gray-400">No pages found for this student.</p>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                        {pages.map((p, idx) => (
                          <div
                            key={p.img_id}
                            draggable={!busy}
                            onDragStart={() => setDragIdx(idx)}
                            onDragOver={e => e.preventDefault()}
                            onDrop={() => { if (dragIdx !== null) moveTo(dragIdx, idx); setDragIdx(null); }}
                            onDragEnd={() => setDragIdx(null)}
                            onClick={() => setPageViewer({ r, imgId: p.img_id })}
                            title="Click to zoom / rotate — drag to reorder"
                            className={`relative group border rounded-lg overflow-hidden bg-white cursor-grab active:cursor-grabbing ${
                              dragIdx === idx ? "opacity-50 border-indigo-400" : "border-gray-200"
                            }`}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={getProxyImageUrl(`${p.image_url}?rev=${p.file_size_kb || 0}_${p.natural_width || 0}_${p.natural_height || 0}`, 600)}
                              alt={`Page ${idx + 1}`}
                              className="w-full h-40 object-contain bg-gray-100 pointer-events-none"
                            />
                            <div className="flex items-center justify-between px-2 py-1">
                              <span className="text-[11px] font-semibold text-gray-600">
                                Page {idx + 1}
                                {orderDirty && idx + 1 !== p.page_number && (
                                  <span className="text-amber-600 font-normal"> (was {p.page_number})</span>
                                )}
                              </span>
                              <button
                                onClick={(e) => { e.stopPropagation(); deleteOne(r, p.img_id, p.page_number); }}
                                disabled={busy || bulkBusy}
                                title="Delete this page"
                                className="text-red-500 hover:text-red-700 disabled:opacity-50"
                              >
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                                  <path d="M10 11v6M14 11v6" />
                                </svg>
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      {orderDirty && (
                        <div className="flex items-center gap-2 mt-3">
                          <button
                            onClick={() => saveOrder(r)}
                            disabled={busy || bulkBusy}
                            className="h-8 px-3 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white transition disabled:opacity-50"
                          >
                            Save page order
                          </button>
                          <button
                            onClick={() => loadPages(r)}
                            disabled={busy || bulkBusy}
                            className="h-8 px-3 text-xs font-semibold rounded-lg border border-gray-300 text-gray-600 hover:border-gray-400 transition disabled:opacity-50"
                          >
                            Discard
                          </button>
                          <span className="text-[11px] text-amber-600">
                            Unsaved order — pages renumber 1..N on save.
                          </span>
                        </div>
                      )}
                      <div className="flex items-center gap-3 mt-3">
                        <button
                          onClick={() => reprocess(r)}
                          disabled={busy || bulkBusy}
                          className="h-8 px-3 text-xs font-semibold rounded-lg bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 transition disabled:opacity-50"
                        >
                          Re-process (re-run detection)
                        </button>
                        <span className="text-[11px] text-gray-400">
                          Re-run rebuilds boxes on the corrected page set (page 1 = new first page) and
                          continues through OCR + marks.
                        </span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
        </>
      )}
    </div>
  );
}
