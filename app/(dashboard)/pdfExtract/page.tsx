"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { keys } from "@/app/lib/queryKeys";
import { ArrowLeft, Download, HelpCircle, X, Save, Package, CheckCircle, ChevronDown } from "lucide-react";

import { usePDFRenderer } from "./hooks/usePDFRenderer";
import { useMarking } from "./hooks/useMarking";
import { useSectionTimerContext } from "@/app/context/SectionTimerContext";
import { useExtraction } from "./hooks/useExtraction";
import { useBatchFilterContext } from "@/app/context/BatchFilterContext";

import MarkingBanner from "./components/MarkingBanner";
import MarkerOverlays from "./components/MarkerOverlays";
import QuestionSidebar from "./components/QuestionSidebar";
import HelpModal from "./components/HelpModal";
import ConfirmModal from "./components/ConfirmModal";
import ReviewGateControl from "@/app/components/ReviewGateControl";
import ManualRepairButton from "@/app/components/ManualRepairButton";

import { PAGE_GAP, PAGE_PAD } from "./constants";
import {
  getStudentPages,
  getStudentBBoxes,
  saveBBoxes,
  getQuestionsByExam,
  BBoxSavePayload,
  verifyBBoxWithRegions,
  downloadStudentBBoxesZip,
  removeStudent,
} from "@/app/(dashboard)/pdfExtract/lib/beaverApi";
import { getUserRoles } from "@/app/lib/auth";

export default function PDFExtractPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const renderer = usePDFRenderer();
  const sectionTimer = useSectionTimerContext();
  const marking = useMarking(sectionTimer.onActivity);
  const extraction = useExtraction();
  const {
    matchedBatch,
    selectedStudentId,
    students,
    registerOpen,
    setLoadingPages,
  } = useBatchFilterContext();

  // ── Local state ───────────────────────────────────────────
  const [numQ, setNumQ] = useState(32);
  const [showHelp, setShowHelp] = useState(false);
  const [ocrInProgress, setOcrInProgress] = useState(false);
  const [isStudentLoading, setIsStudentLoading] = useState(false);
  const [savingBBoxes, setSavingBBoxes] = useState(false);
  const [bboxesSaved, setBboxesSaved] = useState(false);
  const [downloadingCrops, setDownloadingCrops] = useState(false);
  const [deletingStudent, setDeletingStudent] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [verificationComplete, setVerificationComplete] = useState(false);
  const [ocrDropdownOpen, setOcrDropdownOpen] = useState(false);
  const [ocrSelectedKeys, setOcrSelectedKeys] = useState<Set<string>>(new Set());
  const ocrDropdownRef = useRef<HTMLDivElement>(null);
  const [apiMode, setApiMode] = useState(false);
  const [toast, setToast] = useState<{
    msg: string; type: "success" | "error" | "info";
  } | null>(null);

  const [confirmModal, setConfirmModal] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    confirmLabel?: string;
    variant?: "danger" | "primary" | "warning";
  } | null>(null);

  // ── Refs ──────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);
  const pdfScrollRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const autoScrollRef = useRef<number | null>(null);
  const isDragActive = useRef(false);
  const lastMousePos = useRef({ x: 0, y: 0 });
  const rendererStateRef = useRef(renderer);
  const markingStateRef = useRef(marking);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const shiftHeldRef = useRef(false);
  // Which student is actually rendered on screen, and which one a load is
  // currently in flight for. These drive the loading overlay and keep the
  // dropdown switch and the deep-link auto-open from double-loading.
  const renderedStudentIdRef = useRef<string | null>(null);
  const openingStudentIdRef = useRef<string | null>(null);

  // #199: the single source of truth for the loaded paper. Pages (renderer),
  // regions (marking), and save-target all read this one object, so they can't
  // drift. `loadTokenRef` cancels stale loads; `loadedKeyRef` de-dupes reloads.
  const [session, setSession] = useState<{ batchId: string; studentId: string; studentName: string } | null>(null);
  const loadTokenRef = useRef(0);
  const loadedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    return () => { if (pollingRef.current) clearInterval(pollingRef.current); };
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ocrDropdownRef.current && !ocrDropdownRef.current.contains(e.target as Node)) {
        setOcrDropdownOpen(false);
      }
    };
    if (ocrDropdownOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [ocrDropdownOpen]);

  useEffect(() => {
    rendererStateRef.current = renderer;
    markingStateRef.current = marking;
  });

  // ── Reset saved/verified states when questions change ─────
  const lastSavedQuestionsRef = useRef<string>("");
  useEffect(() => {
    if (!bboxesSaved) return;
    // Serialize current questions state for comparison
    const currentState = JSON.stringify(marking.questions.map(q => ({
      regions: q.regions.map(r => r.regionId),
      isNa: q.isNa,
    })));
    if (lastSavedQuestionsRef.current && currentState !== lastSavedQuestionsRef.current) {
      // Questions changed after save - reset states
      setBboxesSaved(false);
      setVerificationComplete(false);
    }
  }, [marking.questions, bboxesSaved]);

  // Track questions state when saved
  useEffect(() => {
    if (bboxesSaved) {
      lastSavedQuestionsRef.current = JSON.stringify(marking.questions.map(q => ({
        regions: q.regions.map(r => r.regionId),
        isNa: q.isNa,
      })));
    }
  }, [bboxesSaved, marking.questions]);

  // ── Toast ─────────────────────────────────────────────────
  const showToast = useCallback((
    type: "success" | "error" | "info", msg: string,
  ) => {
    setToast({ type, msg });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // ── OCR Polling ───────────────────────────────────────────
  const startOcrPolling = useCallback((batchId: string, studentId: string) => {
    if (pollingRef.current) clearInterval(pollingRef.current);

    setOcrInProgress(true);
    let attempts = 0;
    pollingRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await getStudentBBoxes(batchId, studentId);
        const allDone = res.bboxes.length > 0 && res.bboxes.every(b => b.ocr_completed_at !== null);

        if (allDone) {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
          setOcrInProgress(false);
          showToast("success", "OCR extraction completed successfully!");
        } else if (attempts > 60) {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
          setOcrInProgress(false);
          showToast("error", "OCR extraction timed out.");
        }
      } catch (e) {
        // Log to console only for actual errors, but let's be careful with console logs as per user feedback
      }
    }, 5000);
  }, [showToast]);

  // ── Manual page rotation ──────────────────────────────────
  const handlePageRotate = useCallback(async (
    imgId: string,
    pageNum: number,
    dir: "cw" | "ccw",
  ) => {
    if (!matchedBatch || !selectedStudentId) return;

    if (marking.markMode) {
      showToast("error", "Please cancel drawing mode (Esc) before rotating.");
      return;
    }

    const scroll = pdfScrollRef.current;

    setSavingBBoxes(true);

    try {
      // 1. Mathematically rotate bounding boxes on the client first
      marking.rotateBBoxes(imgId, dir);

      // 2. Call backend rotation and re-draw elements
      await renderer.rotatePage(
        matchedBatch.batch_id,
        selectedStudentId,
        imgId,
        pageNum,
        dir,
        showToast,
        () => {
          if (renderer.pdfLoaded) {
            marking.recalcAbsValues(
              renderer.pageOffsetsRef.current,
              renderer.pageHeightsRef.current,
              renderer.pageWidthsRef.current,
              renderer.pageLeftsRef.current,
              renderer.imgIdToIndexRef.current,
            );
          }
        },
        handlePageRotate
      );

      // 3. Keep viewport centered on the rotated page to prevent jumping to top
      if (scroll) {
        setTimeout(() => {
          const wraps = scroll.querySelectorAll(".pdf-page-wrap");
          const target = wraps[pageNum - 1] as HTMLElement;
          if (target) {
            target.scrollIntoView({ block: "center", behavior: "auto" });
          }
        }, 50);
      }
    } catch (e) {
      showToast("error", "Rotation failed");
    } finally {
      setSavingBBoxes(false);
    }
  }, [matchedBatch, selectedStudentId, renderer, marking, showToast]);


  // ── Load local images ─────────────────────────────────────
  const handleImagesLoad = useCallback(async (
    files: FileList,
    append: boolean = false,
  ) => {
    await renderer.loadImages(files, showToast, append);
    if (!append) marking.initQuestions(numQ);
    setApiMode(false);
    setTimeout(async () => {
      await renderer.renderAllPages(false, () => { });
    }, 50);
  }, [renderer, showToast, marking, numQ]);

  // ── Open student from filter bar ──────────────────────────
  const handleOpenStudent = useCallback(async () => {
    if (!matchedBatch || !selectedStudentId) return;

    const student = students.find(s => s.student_id === selectedStudentId);
    if (!student) return;

    // #199: capture the intended identity + a fresh token. A newer load (student
    // switch) bumps loadTokenRef so this run's commits are discarded. Clear the
    // previous paper up-front so nothing stale can be drawn/saved while loading.
    const batchId = matchedBatch.batch_id;
    const studentId = selectedStudentId;
    const token = ++loadTokenRef.current;
    const isStale = () => loadTokenRef.current !== token;

    renderer.resetRenderer();
    marking.clearAll(() => {});
    setSession(null);

    try {
      setLoadingPages(true);
      setIsStudentLoading(true);
      openingStudentIdRef.current = studentId;

      // Kick off the independent fetches together — pages, existing bboxes and
      // question metadata don't depend on each other; they're awaited in the
      // original apply order below, but the network time overlaps.
      const pagesPromise = getStudentPages(batchId, studentId);
      const bboxPromise = getStudentBBoxes(batchId, studentId).catch(() => null); // no bboxes yet
      // Keyed by exam, not student: one request per batch, not per student.
      const questionsPromise =
        queryClient.fetchQuery({
          queryKey: keys.aggregated.questions({
            schoolId: matchedBatch.school_id,
            grade:    matchedBatch.grade,
            exam:     matchedBatch.exam_type,
          }),
          queryFn: () => getQuestionsByExam(
            matchedBatch.school_id, matchedBatch.grade, matchedBatch.exam_type,
          ),
        })
          .catch(err => {
            console.error("Failed to fetch exact question keys from Data Quality API:", err);
            return null;
          });

      // 1. Fetch pages
      const pagesRes = await pagesPromise;
      if (isStale()) return;
      if (!pagesRes.scans?.length) {
        showToast("error", "No pages found for this student");
        setIsStudentLoading(false);
        return;
      }

      // 2. Load images from R2 (stamped with this student's identity).
      // isStale is checked inside, right before the refs are committed — an
      // overlapping newer load can't have its pages overwritten by this one.
      await renderer.loadImagesFromUrls(
        pagesRes.scans,
        student.student_name,
        showToast,
        { studentId, batchId },
        isStale,
      );
      if (isStale()) return;
      setApiMode(true);
      setBboxesSaved(false);
      setVerificationComplete(false);

      // Reset OCR state and clear polling on switch
      setOcrInProgress(false);
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }

      // If student is already processing, start polling automatically
      if (student.status === "processing" || student.status === "ocr_running") {
        startOcrPolling(batchId, studentId);
      }

      // 3. Init questions with INTEGER question keys from batch metadata.
      // BBox detection draws one rectangle per integer (case-study Q36 with its
      // sub-parts, OR pair Q21.1/Q21.2 — all under a single Q21 box). UI shows
      // the same integer keys so verifier sees one entry per physical question.
      const totalQ = student.total_questions || matchedBatch.total_questions || numQ;

      let questionKeys: string[] | undefined;
      try {
        const meta = typeof matchedBatch.metadata === "string"
          ? JSON.parse(matchedBatch.metadata)
          : matchedBatch.metadata;
        // Prefer pre-computed integer list. Fall back to deriving from the full
        // split list for batches cached before the integer field existed.
        questionKeys = meta?.integer_question_numbers;
        if (!Array.isArray(questionKeys) || questionKeys.length === 0) {
          const fullList: string[] | undefined = meta?.question_numbers;
          if (Array.isArray(fullList) && fullList.length > 0) {
            const seen = new Set<string>();
            const out: string[] = [];
            for (const q of fullList) {
              const n = Math.floor(parseFloat(String(q)));
              if (!Number.isFinite(n)) continue;
              const s = String(n);
              if (!seen.has(s)) { seen.add(s); out.push(s); }
            }
            questionKeys = out;
          }
        }
      } catch { /* ignore parse errors */ }

      console.log("[DEBUG] batch metadata:", matchedBatch.metadata, "integer questionKeys:", questionKeys?.length);

      marking.initQuestions(totalQ, questionKeys);
      setNumQ(questionKeys?.length || totalQ);

      // 4. Fetch Question Texts from aggregatedData API and fold by integer base
      // so case-study sub-parts and OR halves collapse into the parent integer.
      try {
        const qRes = await questionsPromise;
        if (qRes && Array.isArray(qRes) && qRes.length > 0) {
          // Group by integer base, preserving first-seen order. is_optional rolls
          // up (true if any sub is optional). Question text is the first sub's
          // text — the verifier only needs to identify which physical question
          // they're looking at, not read all sub-parts here.
          type Acc = { questionKey: string; isOptional: boolean; questionText: string; maxMarks: number; firstOrd: number; subQs: any[] };
          const byInteger = new Map<string, Acc>();
          qRes.forEach((q: { questionNumber?: number | string; isOptional?: boolean; questionText?: string }, idx: number) => {
            const qn = q.questionNumber?.toString() || "";
            if (!qn) return;
            const n = Math.floor(parseFloat(qn));
            if (!Number.isFinite(n)) return;
            const intBase = String(n);
            const existing = byInteger.get(intBase);
            if (existing) {
              existing.isOptional = existing.isOptional || Boolean(q.isOptional);
              // Store sub-questions so we can properly compute the max marks later
              existing.subQs.push(q);
            } else {
              byInteger.set(intBase, {
                questionKey: intBase,
                isOptional: Boolean(q.isOptional),
                questionText: q.questionText || "",
                maxMarks: 0, // Computed at the end
                firstOrd: idx,
                subQs: [q]
              });
            }
          });
          if (byInteger.size > 0) {
            const dbItems = Array.from(byInteger.values())
              .sort((a, b) => a.firstOrd - b.firstOrd)
              .map((acc) => {
                let finalMarks = 0;
                let maxOrMarks = 0;
                for (const sub of acc.subQs) {
                  const mMarks = Number((sub as any).maxMarks) || 0;
                  if (sub.isOptional) {
                    maxOrMarks = Math.max(maxOrMarks, mMarks);
                  } else {
                    finalMarks += mMarks;
                  }
                }
                finalMarks += maxOrMarks;
                return { 
                  questionKey: acc.questionKey, 
                  isOptional: acc.isOptional, 
                  questionText: acc.questionText, 
                  maxMarks: finalMarks 
                };
              });
            console.log("[DEBUG] Re-initializing questions with integer-collapsed DB keys:", dbItems.length);
            marking.initQuestionsWithDb(dbItems);
            setNumQ(dbItems.length);
          }
        }
      } catch (err) {
        console.error("Failed to fetch exact question keys from Data Quality API:", err);
      }

      // 5. Render pages then load bboxes
      setTimeout(async () => {
        if (isStale()) return;
        await renderer.renderAllPages(false, () => { }, handlePageRotate);

        try {
          const bboxRes = await bboxPromise;
          if (isStale()) return;
          if (bboxRes && bboxRes.bboxes?.length > 0) {
            marking.loadFromBackend(
              bboxRes.bboxes,
              renderer.pageOffsetsRef.current,
              renderer.pageHeightsRef.current,
              renderer.pageWidthsRef.current,
              renderer.pageLeftsRef.current,
              renderer.imgIdToIndexRef.current,
            );
            showToast("info", `Loaded ${bboxRes.bboxes.length} existing bbox(es)`);
          }
        } catch {
          // No bboxes yet
        } finally {
          if (!isStale()) {
            renderedStudentIdRef.current = studentId;
            // Commit the session: pages, regions and save-target now all agree.
            setSession({ batchId, studentId, studentName: student.student_name });
            setIsStudentLoading(false);
          }
        }
      }, 100);

    } catch (err) {
      setIsStudentLoading(false);
      showToast("error", err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoadingPages(false);
    }
  }, [matchedBatch, selectedStudentId, students, renderer, marking, showToast, numQ, setLoadingPages, queryClient]);

  // ── #199: neutralize the shared onOpenStudent callback on this page ──
  // The dropdown's onOpenStudent (BatchFilterBar) is consumed by the Answer
  // Editing editor. Here we drive loading declaratively (below), so register a
  // no-op to ensure a stale handler from another page can't fire against this one.
  useEffect(() => {
    registerOpen(() => {});
  }, [registerOpen]);

  // ── Show the loading overlay the instant the selection diverges ──────
  // Whether the student changed via the top dropdown or by navigating in
  // from another page, the previously-loaded paper must not linger on
  // screen while the new student's pages/bboxes fetch. handleOpenStudent
  // records the rendered student and clears the overlay when it finishes.
  useEffect(() => {
    if (selectedStudentId && selectedStudentId !== renderedStudentIdRef.current) {
      setIsStudentLoading(true);
      setOcrSelectedKeys(new Set());
      setOcrDropdownOpen(false);
    }
  }, [selectedStudentId]);

  // ── Deep link to a question (?q=16) ──
  // The Ops TO-DO sends a person here to draw one specific box. Once the
  // paper's questions are in, select that question and — if nothing is drawn
  // for it yet — go straight into drawing. One-shot: the param is cleared so a
  // later click in the sidebar is not fought over.
  const [urlQuestion, setUrlQuestion] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("q") ?? "";
  });
  const deepLinkedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!urlQuestion || marking.questions.length === 0) return;
    const key = `${matchedBatch?.batch_id ?? ""}|${selectedStudentId}|${urlQuestion}`;
    if (deepLinkedRef.current === key) return;
    const want = urlQuestion.trim().replace(/^q/i, "");
    const target = marking.questions.find(
      (x) => x.questionKey.replace(/^q/i, "").split("_OR_")[0] === want
    );
    if (!target) return;
    deepLinkedRef.current = key;
    marking.setActiveQId(target.id);
    marking.setMarkMode(target.regions.length === 0 ? "drawing" : null);
    if (target.regions.length > 0) {
      pdfScrollRef.current?.scrollTo({ top: target.regions[0].absY1 - 100, behavior: "smooth" });
    }
    setUrlQuestion("");
    const url = new URL(window.location.href);
    url.searchParams.delete("q");
    window.history.replaceState(window.history.state, "", url.toString());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlQuestion, marking.questions, matchedBatch?.batch_id, selectedStudentId]);

  // ── #199: declarative, race-safe load keyed on identity ──
  // Any change of (batch, student) — dropdown switch, deep-link, or back/forward —
  // triggers the atomic load once the roster is present. handleOpenStudent resets
  // first and token-guards its commits, so a rapid switch only ever commits the
  // final student's pages. Replaces the 50ms setTimeout + onOpenStudent race.
  useEffect(() => {
    if (!matchedBatch || !selectedStudentId) return;
    if (!students.some(s => s.student_id === selectedStudentId)) return; // wait for roster
    const key = `${matchedBatch.batch_id}|${selectedStudentId}`;
    if (loadedKeyRef.current === key) return; // already loaded this exact paper
    loadedKeyRef.current = key;
    handleOpenStudent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedBatch?.batch_id, selectedStudentId, students]);

  // ── Download crops ─────────────────────────────────────────
  // Mirrors the Answer Editing screen's "Download crops" button. Requires the
  // bboxes to be saved first — otherwise the zip would reflect stale/absent
  // server state rather than the operator's current boxes.
  useEffect(() => { setIsAdmin(getUserRoles().includes("ADMIN")); }, []);

  // Delete the loaded student from the batch (admin only). Same effect as the
  // "Remove from batch" action on the batch-detail screen.
  const handleDeleteStudent = useCallback(async () => {
    if (!matchedBatch || !selectedStudentId || deletingStudent) return;
    const student = students.find(s => s.student_id === selectedStudentId);
    const label = student ? `${student.student_name} (${student.roll_number})` : "this student";
    if (!window.confirm(`Delete ${label} from this batch? This removes the student and their pages. This cannot be undone.`)) return;
    setDeletingStudent(true);
    try {
      await removeStudent(matchedBatch.batch_id, selectedStudentId);
      showToast("success", "Student deleted from batch");
      router.push(`/batches/${matchedBatch.batch_id}`);
    } catch (e) {
      showToast("error", e instanceof Error ? e.message : "Failed to delete student");
      setDeletingStudent(false);
    }
  }, [matchedBatch, selectedStudentId, students, deletingStudent, showToast, router]);

  const handleDownloadCrops = useCallback(async () => {
    if (!matchedBatch || !selectedStudentId || downloadingCrops) return;
    if (!bboxesSaved) {
      showToast("error", "Save the crops first before downloading.");
      return;
    }
    setDownloadingCrops(true);
    try {
      const { blob, filename, skipped } = await downloadStudentBBoxesZip(
        matchedBatch.batch_id,
        selectedStudentId,
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Defer revoke so Safari/Firefox have time to start the download.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast(
        "success",
        skipped
          ? `Downloaded with ${skipped.split(",").length} skipped question(s).`
          : "Crops downloaded",
      );
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Failed to download crops");
    } finally {
      setDownloadingCrops(false);
    }
  }, [matchedBatch, selectedStudentId, downloadingCrops, bboxesSaved, showToast]);

  // ── Save bboxes ────────────────────────────────────────────
  const handleSaveBBoxes = useCallback(async (triggerOcr: boolean, ocrQuestionKeys?: string[], ocrOnly?: boolean) => {
    if (!matchedBatch || !selectedStudentId) return;

    const questionsWithRegions = marking.questions.filter(q => q.regions.length > 0 || q.isNa);
    if (!questionsWithRegions.length) {
      showToast("error", "No bboxes or NA marks drawn yet");
      return;
    }

    if (triggerOcr && !ocrOnly && !ocrQuestionKeys && questionsWithRegions.length < numQ) {
      setConfirmModal({
        title: "Verify All Questions",
        message: "Some questions are missing marks. Please ensure all questions are marked or set as NA for full OCR extraction.",
        variant: "warning",
        confirmLabel: "Save & Continue",
        onConfirm: () => {
          setConfirmModal(null);
          performSave(questionsWithRegions, true);
        }
      });
      return;
    }

    performSave(questionsWithRegions, triggerOcr, ocrQuestionKeys, ocrOnly);
  }, [matchedBatch, selectedStudentId, marking.questions, numQ, showToast, startOcrPolling]);

  const performSave = useCallback(async (questionsWithRegions: any[], triggerOcr: boolean, ocrQuestionKeys?: string[], ocrOnly?: boolean) => {
    if (!matchedBatch || !selectedStudentId) return;

    // #199 invariant: the loaded session, the current selection, and the renderer's
    // stamped identity must be the SAME paper before we save — otherwise refuse.
    if (!session || session.studentId !== selectedStudentId ||
        renderer.loadedStudentIdRef.current !== session.studentId) {
      showToast("error", "Pages are still loading or out of sync — reopen the student before saving.");
      return;
    }
    // Every region must belong to a currently-loaded page of THIS student.
    const foreign = questionsWithRegions
      .flatMap(q => q.regions ?? [])
      .filter((r: any) => r?.imgId && !renderer.hasImgId(r.imgId));
    if (foreign.length > 0) {
      showToast("error", "Some boxes reference pages that aren't this student's — not saving.");
      return;
    }

    try {
      setSavingBBoxes(true);

      const payload: BBoxSavePayload[] = questionsWithRegions.map(q => ({
        question_key: q.questionKey,
        source: q.source,
        verified: q.verified,
        manually_edited: q.regions.some((r: any) => r.source === "manual"),
        max_marks: q.maxMarks ?? null,
        regions: q.regions.map((r: any) => ({
          region_id: r.regionId,
          img_id: r.imgId,
          order: r.order,
          confidence: r.confidence,
          bbox: {
            x1: r.x1Ratio,
            y1: r.y1Ratio,
            x2: r.x2Ratio,
            y2: r.y2Ratio,
          },
        })),
      }));

      await saveBBoxes(session.batchId, session.studentId, payload, triggerOcr, ocrQuestionKeys, ocrOnly);

      // Mark as saved (for enabling verification button)
      setBboxesSaved(true);

      if (triggerOcr) {
        const count = ocrQuestionKeys ? ocrQuestionKeys.length : payload.length;
        showToast("success", `OCR extraction started for ${count} question(s)! Redirecting to batch details...`);
        // Navigate back to batch details page to see OCR progress
        setTimeout(() => {
          router.push(`/batches/${session.batchId}`);
        }, 1000);
      } else {
        showToast("success", `Saved ${payload.length} question(s) to server ✓`);
      }
    } catch (err) {
      showToast("error", err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingBBoxes(false);
    }
  }, [matchedBatch, selectedStudentId, session, renderer, numQ, showToast, router]);

  // ── Per-question verify (Answer Chunking hot path) ─────────
  // Enter / ✓ / overlay-verify all funnel here. Sends ONLY this question's
  // regions to a single endpoint that upserts + verifies in one transaction.
  // Before this, each verify re-POSTed every question on the paper and then
  // PATCHed the one flag — two requests and ~N+12 sequential DB queries.
  // Returns true on success; shows a toast and returns false otherwise.
  const verifyOneQuestion = useCallback(async (qId: number): Promise<boolean> => {
    const q = marking.questionsRef.current.find(x => x.id === qId);
    if (!q) return false;

    // #199 invariant: refuse if selection/renderer drifted mid-load.
    if (!session || session.studentId !== selectedStudentId ||
        renderer.loadedStudentIdRef.current !== session.studentId) {
      showToast("error", "Pages are still loading or out of sync — reopen the student before saving.");
      return false;
    }
    // Every region must belong to a currently-loaded page of THIS student.
    if (q.regions.some(r => r.imgId && !renderer.hasImgId(r.imgId))) {
      showToast("error", "This box references a page that isn't this student's — not saving.");
      return false;
    }

    try {
      await verifyBBoxWithRegions(session.batchId, session.studentId, q.questionKey, {
        source: q.source,
        manually_edited: q.regions.some(r => r.source === "manual"),
        regions: q.regions.map(r => ({
          region_id: r.regionId,
          img_id: r.imgId,
          order: r.order,
          confidence: r.confidence,
          bbox: { x1: r.x1Ratio, y1: r.y1Ratio, x2: r.x2Ratio, y2: r.y2Ratio },
        })),
      });
      marking.verifyQuestion(qId, "teacher");
      setBboxesSaved(true); // keep save state in sync
      return true;
    } catch (err) {
      showToast("error", err instanceof Error && err.message
        ? `Failed to verify Q${q.questionKey}: ${err.message}`
        : `Failed to verify Q${q.questionKey}`);
      return false;
    }
  }, [marking, session, selectedStudentId, renderer, showToast]);

  // ── Drag and drop ──────────────────────────────────────────
  useEffect(() => {
    const over = (e: DragEvent) => e.preventDefault();
    const drop = (e: DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (!files?.length) return;
      const imgs = Array.from(files).filter(f => f.type.startsWith("image/"));
      if (imgs.length > 0) {
        const dt = new DataTransfer();
        imgs.forEach(f => dt.items.add(f));
        handleImagesLoad(dt.files, false);
      }
    };
    document.addEventListener("dragover", over);
    document.addEventListener("drop", drop);
    return () => {
      document.removeEventListener("dragover", over);
      document.removeEventListener("drop", drop);
    };
  }, [handleImagesLoad]);

  // ── Escape ─────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      marking.setMarkMode(null);
      isDragActive.current = false;
      if (autoScrollRef.current) {
        cancelAnimationFrame(autoScrollRef.current);
        autoScrollRef.current = null;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [marking]);

  // Shift Key
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === "Shift") shiftHeldRef.current = true; };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") {
        shiftHeldRef.current = false;
        marking.setMarkMode(null);
      }
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [marking]);


  // Prevent Shift+Wheel from scrolling horizontally during draw mode
  useEffect(() => {
    const scroll = pdfScrollRef.current;
    if (!scroll) return;

    const onWheel = (e: WheelEvent) => {
      if (e.shiftKey && marking.markMode) {
        e.preventDefault();
        scroll.scrollTop += e.deltaY || e.deltaX;
      }
    };

    scroll.addEventListener("wheel", onWheel, { passive: false });
    return () => scroll.removeEventListener("wheel", onWheel);
  }, [marking.markMode]);

  // ── findPage ───────────────────────────────────────────────
  const refreshPageGeometry = useCallback(() => {
    const currentRenderer = rendererStateRef.current;
    const currentMarking = markingStateRef.current;

    if (!currentRenderer.pdfLoaded) return;
    currentRenderer.measurePages();
    currentMarking.recalcAbsValues(
      currentRenderer.pageOffsetsRef.current,
      currentRenderer.pageHeightsRef.current,
      currentRenderer.pageWidthsRef.current,
      currentRenderer.pageLeftsRef.current,
      currentRenderer.imgIdToIndexRef.current,
    );
    currentRenderer.bumpRenderTick();
  }, []);

  useEffect(() => {
    if (!renderer.pdfLoaded) return;

    const scroll = pdfScrollRef.current;
    const inner = renderer.pdfInnerRef.current;
    if (!scroll || !inner) return;

    let raf: number | null = null;
    const scheduleRefresh = () => {
      if (raf !== null) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(refreshPageGeometry);
    };

    const observer = new ResizeObserver(scheduleRefresh);
    observer.observe(scroll);
    observer.observe(inner);
    window.addEventListener("resize", scheduleRefresh);
    scheduleRefresh();

    return () => {
      if (raf !== null) cancelAnimationFrame(raf);
      observer.disconnect();
      window.removeEventListener("resize", scheduleRefresh);
    };
  }, [refreshPageGeometry, renderer.pdfLoaded, renderer.pdfInnerRef]);

  const findPage = useCallback((absX: number, absY: number) => {
    for (let i = 0; i < renderer.numPagesRef.current; i++) {
      const top = renderer.pageOffsetsRef.current[i];
      const bottom = top + renderer.pageHeightsRef.current[i];
      if (absY >= top && absY < bottom) {
        return {
          pageIndex: i,
          imgId: renderer.pageImgIdsRef.current[i],
          xRatio: (absX - renderer.pageLeftsRef.current[i]) / renderer.pageWidthsRef.current[i],
          yRatio: (absY - top) / renderer.pageHeightsRef.current[i],
        };
      }
    }
    let nearest = 0, nearestDist = Infinity;
    for (let i = 0; i < renderer.numPagesRef.current; i++) {
      const top = renderer.pageOffsetsRef.current[i];
      const bottom = top + renderer.pageHeightsRef.current[i];
      const dist = Math.min(Math.abs(absY - top), Math.abs(absY - bottom));
      if (dist < nearestDist) { nearestDist = dist; nearest = i; }
    }
    const nearTop = renderer.pageOffsetsRef.current[nearest];
    const nearHeight = renderer.pageHeightsRef.current[nearest];
    const nearWidth = renderer.pageWidthsRef.current[nearest];
    return {
      pageIndex: nearest,
      imgId: renderer.pageImgIdsRef.current[nearest],
      xRatio: (absX - renderer.pageLeftsRef.current[nearest]) / nearWidth,
      yRatio: Math.max(0, Math.min(1, (absY - nearTop) / nearHeight)),
    };
  }, [renderer]);

  // ── Mouse down ─────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const currentRenderer = rendererStateRef.current;
    const currentMarking = markingStateRef.current;

    if (!currentMarking.markModeRef.current || !currentRenderer.pdfLoaded) return;
    e.preventDefault();
    currentRenderer.measurePages();
    const scroll = pdfScrollRef.current!;
    const rect = scroll.getBoundingClientRect();
    isDragActive.current = true;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    currentMarking.handleMouseDown(
      e.clientX - rect.left + scroll.scrollLeft,
      e.clientY - rect.top + scroll.scrollTop - 44,
    );
  }, []);

  // ── Mouse move + up ────────────────────────────────────────
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragActive.current) return;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      const scroll = pdfScrollRef.current!;
      const rect = scroll.getBoundingClientRect();
      marking.handleMouseMove(
        e.clientX - rect.left + scroll.scrollLeft,
        e.clientY - rect.top + scroll.scrollTop - 44,
      );
    };
    const onUp = (e: MouseEvent) => {
      if (!isDragActive.current) return;
      isDragActive.current = false;
      if (autoScrollRef.current) { cancelAnimationFrame(autoScrollRef.current); autoScrollRef.current = null; }
      if (!renderer.pdfLoaded) return;
      renderer.measurePages();
      const scroll = pdfScrollRef.current!;
      const rect = scroll.getBoundingClientRect();
      marking.handleMouseUp(
        e.clientX - rect.left + scroll.scrollLeft,
        e.clientY - rect.top + scroll.scrollTop - 44,
        findPage,
        renderer.pageWidthsRef.current,
        renderer.pageHeightsRef.current,
        renderer.pageOffsetsRef.current,
        renderer.pageLeftsRef.current,
        showToast,
        renderer.bumpRenderTick,
      );
      if (shiftHeldRef.current) {
        marking.setMarkMode("drawing");
      }
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [marking, renderer, findPage, showToast]);

  // ── Auto scroll ────────────────────────────────────────────
  useEffect(() => {
    const zone = 80, speed = 12;
    const loop = () => {
      autoScrollRef.current = requestAnimationFrame(loop);
      if (!isDragActive.current) return;
      const scroll = pdfScrollRef.current;
      if (!scroll) return;
      const rect = scroll.getBoundingClientRect();
      const mouseY = lastMousePos.current.y - rect.top;
      const mouseX = lastMousePos.current.x - rect.left;
      let dy = 0, dx = 0;
      if (mouseY > rect.height - zone) dy = speed * ((mouseY - (rect.height - zone)) / zone);
      if (mouseY < zone) dy = -speed * ((zone - mouseY) / zone);
      if (mouseX > rect.width - zone) dx = speed * ((mouseX - (rect.width - zone)) / zone);
      if (mouseX < zone) dx = -speed * ((zone - mouseX) / zone);
      if (dy === 0 && dx === 0) return;
      scroll.scrollTop += dy;
      scroll.scrollLeft += dx;
      marking.handleMouseMove(
        lastMousePos.current.x - rect.left + scroll.scrollLeft,
        lastMousePos.current.y - rect.top + scroll.scrollTop - 44,
      );
    };
    autoScrollRef.current = requestAnimationFrame(loop);
    return () => { if (autoScrollRef.current) cancelAnimationFrame(autoScrollRef.current); };
  }, [marking]);

  // ── Listen for the spacebar key press ──────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        marking.setMarkMode(null);
        isDragActive.current = false;
        if (autoScrollRef.current) {
          cancelAnimationFrame(autoScrollRef.current);
          autoScrollRef.current = null;
        }
      }

      if (e.key === " " && marking.activeQId !== null && !marking.markMode) {
        e.preventDefault();
        marking.setMarkMode("drawing");
      }

      // Enter → verify+save current question, then advance to next
      if (e.key === "Enter" && marking.activeQId !== null && !marking.markMode
        && !(e.target instanceof HTMLInputElement)) {
        e.preventDefault();
        const currentQId = marking.activeQId;
        const currentQ = marking.questionsRef.current.find(x => x.id === currentQId);

        // Verify+save current question if it has regions (one round-trip; the
        // request runs in the background so Enter feels instant — the same as
        // before, but without re-sending every other question's bboxes).
        if (currentQ && currentQ.regions.length > 0
          && apiMode && matchedBatch && selectedStudentId) {
          void verifyOneQuestion(currentQId!);
        }

        // Advance to next question
        const currentIndex = marking.questions.findIndex(q => q.id === currentQId);
        if (currentIndex < marking.questions.length - 1) {
          const nextQ = marking.questions[currentIndex + 1];
          marking.setActiveQId(nextQ.id);
          marking.setMarkMode(null);

          if (nextQ.regions.length > 0) {
            pdfScrollRef.current?.scrollTo({
              top: nextQ.regions[0].absY1 - 100,
              behavior: "smooth",
            });
          }
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [marking, apiMode, matchedBatch, selectedStudentId, verifyOneQuestion]);

  // ── Derived ────────────────────────────────────────────────
  const doneCount = marking.questions.filter(q => q.regions.length > 0 || q.isNa).length;
  const canExtract = doneCount > 0 && !extraction.extracting;
  const canSave = apiMode && doneCount > 0 && !savingBBoxes;

  const allVerified = marking.questions.every(q =>
    (q.regions.length > 0 && q.verified) || q.isNa
  );

  // ════════════════════════════════════════════════════════
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">

      {/* ── Student loading overlay — blocks all interaction ── */}
      {isStudentLoading && (
        <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white/70 backdrop-blur-sm pointer-events-all select-none">
          <div className="flex flex-col items-center gap-4">
            <div className="w-10 h-10 rounded-full border-4 border-indigo-200 border-t-indigo-600 animate-spin" />
            <p className="text-sm font-semibold text-gray-700">Loading student…</p>
            <p className="text-xs text-gray-400">Please wait while pages and bboxes are prepared</p>
          </div>
        </div>
      )}

      {toast && (
        <div className={`
          fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3
          rounded-xl shadow-lg text-sm font-medium border
          ${toast.type === "success" ? "bg-green-50 border-green-200 text-green-800"
            : toast.type === "error" ? "bg-red-50 border-red-200 text-red-800"
              : "bg-indigo-50 border-indigo-200 text-indigo-800"}
        `}>
          <span>{toast.type === "success" ? "✓" : toast.type === "error" ? "✕" : "↻"}</span>
          {toast.msg}
          <button onClick={() => setToast(null)} className="ml-1 opacity-50 hover:opacity-100 transition">
            <X size={13} />
          </button>
        </div>
      )}

      {showHelp && <HelpModal onClose={() => setShowHelp(false)} />}

      <QuestionSidebar
        questions={marking.questions}
        activeQId={marking.activeQId}
        markMode={marking.markMode}
        numQ={numQ}
        doneCount={doneCount}
        onSelectQ={(id) => {
          if (marking.activeQId === id && !marking.markMode) {
            marking.setActiveQId(null);
          } else {
            marking.setActiveQId(id);
            marking.setMarkMode(null);

            // Auto-scroll to the question's first bbox
            const q = marking.questions.find(x => x.id === id);
            if (q && q.regions.length > 0) {
              const firstRegion = q.regions[0];
              pdfScrollRef.current?.scrollTo({
                top: firstRegion.absY1 - 100,
                behavior: "smooth",
              });
            }
          }
        }}
        onBeginMark={(qId, mode) => { marking.setActiveQId(qId); marking.setMarkMode(mode); }}
        onDeleteRegion={(qId, regionId) => marking.deleteRegion(qId, regionId, renderer.bumpRenderTick)}
        onClearQ={(qId) => marking.clearQuestion(qId, renderer.bumpRenderTick)}
        onDownloadOne={(qId) => {
          const q = marking.questionsRef.current.find(x => x.id === qId);
          if (!q || q.regions.length === 0) return;
          const cleanKey = q.questionKey.replace(/^q/i, "").split("_OR_")[0];
          extraction.downloadOne(q.regions, renderer.imageFilesRef.current, `${cleanKey}.png`, showToast);
        }}
        onClearAll={() => {
          if (!marking.questions.some(q => q.regions.length > 0)) return;
          setConfirmModal({
            title: "Clear All Marks",
            message: "Permanently clear all bounding boxes and NA marks? This cannot be undone.",
            variant: "danger",
            confirmLabel: "Clear All",
            onConfirm: () => {
              setConfirmModal(null);
              sectionTimer.onActivity();
              marking.clearAll(renderer.bumpRenderTick);
            }
          });
        }}
        onReset={() => {
          const hasMarks = marking.questions.some(q => q.regions.length > 0);
          if (hasMarks) {
            setConfirmModal({
              title: "Reset Questions",
              message: `Reset all marks and set question count to ${numQ}? All current progress will be lost.`,
              variant: "danger",
              confirmLabel: "Reset",
              onConfirm: () => {
                setConfirmModal(null);
                marking.initQuestions(numQ);
              }
            });
          } else {
            marking.initQuestions(numQ);
          }
        }}
        onVerify={async (qId) => {
          if (!(apiMode && matchedBatch && selectedStudentId)) return;
          const q = marking.questionsRef.current.find(x => x.id === qId);
          if (!q) return;
          // One round-trip: this question's regions + verified flag.
          const ok = await verifyOneQuestion(qId);
          if (!ok) return;

          // Auto-advance to next question
          const currentQuestions = marking.questionsRef.current;
          const currentIndex = currentQuestions.findIndex(x => x.id === qId);
          if (currentIndex < currentQuestions.length - 1) {
            const nextQ = currentQuestions[currentIndex + 1];
            marking.setActiveQId(nextQ.id);
            marking.setMarkMode(null);

            if (nextQ.regions.length > 0) {
              pdfScrollRef.current?.scrollTo({
                top: nextQ.regions[0].absY1 - 100,
                behavior: "smooth",
              });
            }
          }

          showToast("success", `Q${q.questionKey} verified & saved`);
        }}
        onSetNa={(qId) => marking.setQuestionNa(qId, renderer.bumpRenderTick)}
        onFillRemainingNa={() => marking.fillRemainingNa(renderer.bumpRenderTick)}
      />

      <div className="flex-1 flex flex-col overflow-hidden">

        <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-3 shrink-0 z-30">

          <button onClick={() => router.push("/")}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium transition shrink-0">
            <ArrowLeft size={15} /> Back
          </button>

          <div className="w-px h-5 bg-gray-200 shrink-0" />

          <div className="flex items-center gap-2 min-w-0">
            {renderer.fileName && (
              <span className="px-2 py-0.5 bg-gray-100 text-gray-500 text-xs rounded-md font-medium truncate max-w-[180px]">
                {renderer.fileName}{renderer.pageCountLabel && ` · ${renderer.pageCountLabel}`}
              </span>
            )}
            {apiMode && (
              <span className="px-2 py-0.5 bg-green-50 text-green-700 border border-green-200 text-[10px] font-bold rounded-md shrink-0">
                CLOUD
              </span>
            )}
            {ocrInProgress && (
              <div className="flex items-center gap-1.5 px-2 py-0.5 bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold rounded-md animate-pulse shrink-0">
                <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full" />
                EXTRACTING TEXT
              </div>
            )}
          </div>

          <div className="flex-1" />

          <div className="flex items-center gap-2 shrink-0">
            <span className="text-xs text-gray-500 font-medium">Questions:</span>
            <input
              type="number" min={1} max={200} value={numQ}
              onChange={e => setNumQ(parseInt(e.target.value) || 32)}
              onKeyDown={e => {
                if (e.key !== "Enter") return;
                const hasMarks = marking.questions.some(q => q.regions.length > 0);
                if (hasMarks) {
                  setConfirmModal({
                    title: "Reset Questions",
                    message: `Increasing or decreasing the question count will reset all current marks. Are you sure you want to reset to ${numQ} questions?`,
                    variant: "danger",
                    confirmLabel: "Reset & Change",
                    onConfirm: () => {
                      setConfirmModal(null);
                      marking.initQuestions(numQ);
                    }
                  });
                } else {
                  marking.initQuestions(numQ);
                }
              }}
              className="w-14 h-8 px-2 text-center text-sm text-gray-900 bg-white border border-gray-200 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 transition"
            />
          </div>

          <div className="w-px h-5 bg-gray-200 shrink-0" />

          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
            onChange={e => { if (e.target.files?.length) handleImagesLoad(e.target.files, false); e.target.value = ""; }} />

          {renderer.pdfLoaded && !apiMode && (
            <>
              <button onClick={() => addMoreInputRef.current?.click()}
                className="flex items-center gap-1.5 h-8 px-3 bg-white border border-gray-200 text-gray-600 hover:border-indigo-400 hover:text-indigo-600 rounded-lg text-sm font-medium transition shrink-0">
                + More
              </button>
              <input ref={addMoreInputRef} type="file" accept="image/*" multiple className="hidden"
                onChange={e => { if (e.target.files?.length) handleImagesLoad(e.target.files, true); e.target.value = ""; }} />
            </>
          )}

          <button onClick={() => setShowHelp(true)}
            className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-400 hover:text-indigo-600 hover:border-indigo-400 transition shrink-0">
            <HelpCircle size={15} />
          </button>

          {apiMode && (
            <div className="flex items-center gap-2">
              {/* Maker-checker gate (chunking stage) — Make / Check for this paper (#97/t092). */}
              {matchedBatch && selectedStudentId && (
                <ReviewGateControl
                  batchId={matchedBatch.batch_id}
                  studentId={selectedStudentId}
                  stage="chunking"
                />
              )}

              {/* Send to error bucket for Manual Repair (bucket icon) */}
              {matchedBatch && selectedStudentId && (
                <ManualRepairButton
                  batchId={matchedBatch.batch_id}
                  studentId={selectedStudentId}
                  onError={(msg) => showToast("error", msg)}
                />
              )}

              {/* Delete student from batch — admin only (same as batch-detail "Remove from batch") */}
              {isAdmin && matchedBatch && selectedStudentId && (
                <button
                  onClick={handleDeleteStudent}
                  disabled={deletingStudent}
                  className="flex items-center justify-center h-8 w-8 text-red-600 border border-red-200 hover:bg-red-50 rounded-xl transition shrink-0 disabled:opacity-50"
                  title={deletingStudent ? "Deleting…" : "Delete this student from the batch"}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                    <path d="M10 11v6M14 11v6" />
                  </svg>
                </button>
              )}

              <button
                onClick={() => handleSaveBBoxes(false)}
                disabled={!canSave || savingBBoxes}
                className="flex items-center gap-1.5 h-8 px-3 text-gray-500 hover:text-indigo-600 border border-gray-200 hover:border-indigo-200 rounded-xl text-sm font-semibold transition shrink-0"
                title="Save progress to database without starting OCR"
              >
                <Save size={13} />
                {savingBBoxes ? "Saving…" : "Save Progress"}
              </button>

              <button
                onClick={handleDownloadCrops}
                disabled={downloadingCrops}
                className="flex items-center gap-1.5 h-8 px-3 text-gray-500 hover:text-indigo-600 border border-gray-200 hover:border-indigo-200 rounded-xl text-sm font-semibold transition shrink-0 disabled:opacity-50"
                title={bboxesSaved ? "Download a zip of every saved crop" : "Save the crops first to download"}
              >
                <Download size={13} />
                {downloadingCrops ? "Downloading…" : "Crops"}
              </button>

              <button
                onClick={() => {
                  if (savingBBoxes) {
                    showToast("info", "Save in progress, please wait…");
                    return;
                  }
                  if (!bboxesSaved) {
                    showToast("error", "Save bboxes first before verifying.");
                    return;
                  }
                  if (!allVerified) {
                    const unverifiedCount = marking.questions.filter(q =>
                      q.regions.length > 0 && !q.verified && !q.isNa
                    ).length;
                    const emptyCount = marking.questions.filter(q =>
                      q.regions.length === 0 && !q.isNa
                    ).length;
                    let msg = "Please verify all questions first. ";
                    if (unverifiedCount > 0) msg += `${unverifiedCount} unverified. `;
                    if (emptyCount > 0) msg += `${emptyCount} without bboxes or NA.`;
                    showToast("error", msg.trim());
                    return;
                  }
                  setVerificationComplete(true);
                }}
                disabled={verificationComplete}
                className={`flex items-center gap-1.5 h-8 px-3 rounded-xl text-sm font-semibold transition shrink-0 ${verificationComplete
                  ? "bg-green-100 text-green-700 border border-green-300"
                  : "text-gray-500 hover:text-green-600 border border-gray-200 hover:border-green-300"
                  }`}
                title={
                  savingBBoxes ? "Save in progress, please wait…"
                    : !bboxesSaved ? "Save regions first"
                      : !allVerified ? "Verify all questions individually first"
                        : verificationComplete ? "Verification complete"
                          : "Mark all regions as verified"
                }
              >
                <CheckCircle size={13} />
                {verificationComplete ? "Verified" : "Verify regions"}
              </button>

              {/* OCR Extraction Button */}
              {(() => {
                const currentStudent = students.find(s => s.student_id === selectedStudentId);
                const isOcrDone = currentStudent?.status === "ocr_completed" || currentStudent?.status === "completed";
                const allQuestionKeys = marking.questions
                  .filter(q => q.regions.length > 0 || q.isNa)
                  .map(q => q.questionKey);
                const allSelected = ocrSelectedKeys.size === allQuestionKeys.length && allQuestionKeys.every(k => ocrSelectedKeys.has(k));

                if (isOcrDone) {
                  return (
                    <>
                      <div className="relative" ref={ocrDropdownRef}>
                        <div className="flex items-center">
                          <button
                            onClick={() => {
                              const keys = ocrSelectedKeys.size > 0 ? Array.from(ocrSelectedKeys) : undefined;
                              const count = keys ? keys.length : allQuestionKeys.length;
                              const isSelective = keys && keys.length < allQuestionKeys.length;
                              setConfirmModal({
                                title: "Rerun OCR",
                                message: isSelective
                                  ? `This will re-extract text for ${count} selected question(s). Any manually edited OCR text for those questions will be overwritten.\n\nAre you sure you want to continue?`
                                  : "This will re-extract text on all bounding boxes for this student. Any manually edited OCR text will be overwritten.\n\nAre you sure you want to continue?",
                                variant: "warning",
                                confirmLabel: `Rerun OCR (${count})`,
                                onConfirm: () => {
                                  setConfirmModal(null);
                                  handleSaveBBoxes(true, isSelective ? keys : undefined, true);
                                },
                              });
                            }}
                            disabled={savingBBoxes}
                            className="flex items-center gap-1.5 h-8 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-l-xl shadow-lg shadow-indigo-100 transition shrink-0"
                            title="Re-run OCR on selected questions"
                          >
                            <Package size={13} />
                            {savingBBoxes ? "Rerunning…" : ocrSelectedKeys.size > 0 && ocrSelectedKeys.size < allQuestionKeys.length
                              ? `Rerun OCR (${ocrSelectedKeys.size})`
                              : "Rerun OCR"}
                          </button>
                          <button
                            onClick={() => {
                              if (!ocrDropdownOpen && ocrSelectedKeys.size === 0) {
                                setOcrSelectedKeys(new Set(allQuestionKeys));
                              }
                              setOcrDropdownOpen(prev => !prev);
                            }}
                            disabled={savingBBoxes}
                            className="flex items-center h-8 px-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white rounded-r-xl border-l border-indigo-500 transition shrink-0"
                          >
                            <ChevronDown size={14} />
                          </button>
                        </div>
                        {ocrDropdownOpen && (
                          <div className="absolute right-0 top-full mt-1 w-56 max-h-72 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-xl z-50 py-1">
                            <label className="flex items-center gap-2 px-3 py-1.5 hover:bg-gray-50 cursor-pointer border-b border-gray-100">
                              <input
                                type="checkbox"
                                checked={allSelected}
                                onChange={() => {
                                  setOcrSelectedKeys(allSelected ? new Set() : new Set(allQuestionKeys));
                                }}
                                className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                              />
                              <span className="text-sm font-semibold text-gray-700">Select All</span>
                            </label>
                            {allQuestionKeys.map(key => (
                              <label key={key} className="flex items-center gap-2 px-3 py-1 hover:bg-gray-50 cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={ocrSelectedKeys.has(key)}
                                  onChange={() => {
                                    setOcrSelectedKeys(prev => {
                                      const next = new Set(prev);
                                      next.has(key) ? next.delete(key) : next.add(key);
                                      return next;
                                    });
                                  }}
                                  className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                                />
                                <span className="text-sm text-gray-600">Q{key.replace(/_OR_\d+$/, " (OR)")}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={() => {
                          const params = new URLSearchParams({
                            batchId: matchedBatch!.batch_id,
                            studentId: selectedStudentId!,
                            ...(matchedBatch!.school_name && { school: matchedBatch!.school_name }),
                            ...(matchedBatch!.grade && { grade: matchedBatch!.grade }),
                            ...(matchedBatch!.section && { section: matchedBatch!.section }),
                            ...(matchedBatch!.subject && { subject: matchedBatch!.subject }),
                            ...(matchedBatch!.exam_type && { exam: matchedBatch!.exam_type }),
                          });
                          router.push(`/answerEditing?${params.toString()}`);
                        }}
                        className="flex items-center gap-1.5 h-8 px-4 bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-xl text-sm font-semibold shrink-0 transition"
                      >
                        <CheckCircle size={13} />
                        Edit Answers →
                      </button>
                    </>
                  );
                }

                return (
                  <button
                    onClick={() => handleSaveBBoxes(true)}
                    disabled={!verificationComplete || savingBBoxes}
                    className="flex items-center gap-1.5 h-8 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl shadow-lg shadow-indigo-100 transition shrink-0"
                    title={!verificationComplete ? "Verify bboxes first" : "Save and trigger OCR extraction workflow"}
                  >
                    <Package size={13} />
                    Extract Text
                  </button>
                );
              })()}
            </div>
          )}

          {/* <button
            onClick={() => extraction.extractAll(marking.questionsRef, renderer.imageFilesRef.current, showToast)}
            disabled={!canExtract}
            className="flex items-center gap-1.5 h-8 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition shrink-0">
            <Download size={13} />
            {extraction.extracting ? `${extraction.extractProgress}%…` : "Extract ZIP"}
          </button> */}

        </header>

        {confirmModal && (
          <ConfirmModal
            title={confirmModal.title}
            message={confirmModal.message}
            confirmLabel={confirmModal.confirmLabel}
            variant={confirmModal.variant}
            onConfirm={confirmModal.onConfirm}
            onCancel={() => setConfirmModal(null)}
          />
        )}

        {extraction.extracting && (
          <div className="h-0.5 bg-gray-100 shrink-0">
            <div className="h-full bg-indigo-500 transition-all duration-300" style={{ width: `${extraction.extractProgress}%` }} />
          </div>
        )}

        <div className="flex-1 flex flex-col overflow-hidden relative">

          <MarkingBanner
            markMode={marking.markMode}
            activeQId={marking.activeQId}
            onCancel={() => marking.setMarkMode(null)}
          />

          {!renderer.pdfLoaded && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <p className="text-gray-400 text-sm font-medium">
                  Use the filter above to select a student
                </p>
                <p className="text-gray-300 text-xs mt-1">
                  School → Grade → Section → Subject → Exam → Student
                </p>
              </div>
            </div>
          )}

          {renderer.pdfLoaded && (
            <div
              ref={pdfScrollRef}
              className={`flex-1 overflow-auto bg-gray-100 ${marking.markMode ? "cursor-crosshair" : ""}`}
              style={{ paddingTop: 44 }}
              onMouseDown={handleMouseDown}
            >
              <div
                ref={renderer.pdfInnerRef}
                className="relative flex flex-col items-center"
                style={{
                  gap: PAGE_GAP,
                  padding: PAGE_PAD,
                  minHeight: "100%",
                  minWidth: "100%",

                }}
              >
                <MarkerOverlays
                  questions={marking.questions}
                  renderTick={renderer.renderTick}
                  dragRect={marking.dragRect}
                  activeQId={marking.activeQId}
                  onDeleteRegion={(qId, regionId) => {
                    marking.deleteRegion(qId, regionId, renderer.bumpRenderTick);
                    marking.unverifyQuestion(qId);
                  }}
                  onUpdateRegionPosition={(qId, regionId, newRatios) => {
                    marking.updateRegionPosition(
                      qId,
                      regionId,
                      newRatios,
                      renderer.pageOffsetsRef.current,
                      renderer.pageHeightsRef.current,
                      renderer.pageWidthsRef.current,
                      renderer.pageLeftsRef.current,
                      renderer.imgIdToIndexRef.current,
                      renderer.bumpRenderTick,
                    );
                  }}
                  pageWidths={renderer.pageWidthsRef.current}
                  pageHeights={renderer.pageHeightsRef.current}
                  pageOffsets={renderer.pageOffsetsRef.current}
                  pageLefts={renderer.pageLeftsRef.current}
                  imgIdToIndex={renderer.imgIdToIndexRef.current}
                  scrollContainerRef={pdfScrollRef}
                  onMoveRegion={(qId, regionId, newX1Ratio, newY1Ratio) => {
                    marking.moveRegion(
                      qId, regionId, newX1Ratio, newY1Ratio,
                      renderer.pageOffsetsRef.current,
                      renderer.pageHeightsRef.current,
                      renderer.pageWidthsRef.current,
                      renderer.pageLeftsRef.current,
                      renderer.imgIdToIndexRef.current,
                      renderer.bumpRenderTick,
                    );
                  }}
                  onSelectQuestion={(qId) => {
                    marking.setActiveQId(qId);
                    marking.setMarkMode(null);
                  }}
                  onVerifyQuestion={async (qId) => {
                    if (apiMode && matchedBatch && selectedStudentId) {
                      await verifyOneQuestion(qId);
                    } else {
                      marking.verifyQuestion(qId, "teacher");
                    }
                  }}
                />
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
