"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { keys } from "@/app/lib/queryKeys";
import { urlKeys, URL_OPTIONS } from "@/app/lib/urlKeys";
import {
  getAnswerKeyPages,
  getAnswerKeyPreflight,
  type AnswerKeyPage,
  type PreflightQuestion,
} from "../lib/answerKeyApi";
import { ArrowLeft, Crosshair, Trash2, Zap, Loader2, CheckCircle, X, ZoomIn, ZoomOut } from "lucide-react";

import { useMarking }      from "../../pdfExtract/hooks/useMarking";
import { usePDFRenderer }  from "../../pdfExtract/hooks/usePDFRenderer";
import MarkerOverlays      from "../../pdfExtract/components/MarkerOverlays";
import { PAGE_GAP, PAGE_PAD } from "../../pdfExtract/constants";
import { getStoredToken }  from "@/app/lib/auth";
import QuestionSidebar from "../../pdfExtract/components/QuestionSidebar";

const API_BASE = process.env.NEXT_PUBLIC_BEAVER_API_URL ?? "http://localhost:4000";

// ─────────────────────────────────────────────────────────────────────────────

const NO_PAGES: AnswerKeyPage[] = [];
const NO_QUESTIONS: PreflightQuestion[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// Rotation-ratio math (mirrors useMarking.rotateBBoxes' "ccw" branch).
// Used to convert ratios drawn against a page's CURRENT (possibly rotated)
// view back into the original, unrotated image's ratio space, since cropping
// always happens against the original page image on the backend.

function rotateRatioCCW(x1: number, y1: number, x2: number, y2: number) {
  return { x1: y1, y1: 1 - x2, x2: y2, y2: 1 - x1 };
}

function unrotateRatios(x1: number, y1: number, x2: number, y2: number, angle: number) {
  let r = { x1, y1, x2, y2 };
  const steps = ((angle / 90) % 4 + 4) % 4;
  for (let i = 0; i < steps; i++) r = rotateRatioCCW(r.x1, r.y1, r.x2, r.y2);
  return r;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function AKBBoxPage() {
  const router   = useRouter();
  const renderer = usePDFRenderer();
  const marking  = useMarking();

  // Pages come from the API, not the URL.
  const [{ paperId }] = useQueryStates(urlKeys.answerKeyBbox, URL_OPTIONS);

  // Keyed by paperId, so a slow reply from a previous paper can't land here.
  const pagesQuery = useQuery({
    queryKey: keys.answerKey.pages(paperId),
    queryFn:  () => getAnswerKeyPages(paperId),
    enabled:  paperId > 0,
  });

  const preflightQuery = useQuery({
    queryKey: keys.answerKey.preflight(paperId),
    queryFn:  () => getAnswerKeyPreflight(paperId),
    enabled:  paperId > 0,
  });

  const loadedPages = pagesQuery.data ?? NO_PAGES;
  const questions   = preflightQuery.data ?? NO_QUESTIONS;

  // ── State ──────────────────────────────────────────────────────────────────
  // Covers the imperative half of startup, which the cache can't represent.
  const [initialising, setInitialising] = useState(true);
  const [extracting, setExtracting] = useState(false);
  const [toast, setToast]          = useState<{ msg: string; type: "success" | "error" | "info" } | null>(null);
  const [zoomPercent, setZoomPercent] = useState(100);

  const loading = pagesQuery.isPending || preflightQuery.isPending || initialising;

  // ── Refs ───────────────────────────────────────────────────────────────────
  const pdfScrollRef    = useRef<HTMLDivElement>(null);
  const isDragActive    = useRef(false);
  const lastMousePos    = useRef({ x: 0, y: 0 });
  const autoScrollRef   = useRef<number | null>(null);
  const rendererRef     = useRef(renderer);
  const markingRef      = useRef(marking);
  const toastTimer      = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pageRotationRef  = useRef<number[]>([]);
  const pageBaseWidthRef = useRef<number[]>([]);
  const zoomRef          = useRef(100);

  useEffect(() => { rendererRef.current = renderer; }, );
  useEffect(() => { markingRef.current  = marking;  }, );

  // ── Toast ──────────────────────────────────────────────────────────────────
  const showToast = useCallback((type: "success" | "error" | "info", msg: string) => {
    setToast({ type, msg });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }, []);

  // ── Page geometry refresh ──────────────────────────────────────────────────
  const refreshGeometry = useCallback(() => {
    const r = rendererRef.current;
    const m = markingRef.current;
    if (!r.pdfLoaded) return;
    r.measurePages();
    m.recalcAbsValues(
      r.pageOffsetsRef.current, r.pageHeightsRef.current,
      r.pageWidthsRef.current,  r.pageLeftsRef.current,
      r.imgIdToIndexRef.current,
    );
    r.bumpRenderTick();
  }, []);

  // ── Zoom ───────────────────────────────────────────────────────────────────
  const applyZoomToDom = useCallback(() => {
    const inner = rendererRef.current.pdfInnerRef.current;
    if (!inner) return;
    const wraps = inner.querySelectorAll<HTMLElement>(".pdf-page-wrap");
    wraps.forEach((wrap, i) => {
      const base = pageBaseWidthRef.current[i];
      if (!base) return;
      wrap.style.maxWidth = `${base * zoomRef.current / 100}px`;
    });
    refreshGeometry();
  }, [refreshGeometry]);

  const setZoom = useCallback((next: number) => {
    const clamped = Math.max(50, Math.min(300, next));
    zoomRef.current = clamped;
    setZoomPercent(clamped);
    applyZoomToDom();
  }, [applyZoomToDom]);

  const handleZoomIn    = useCallback(() => setZoom(zoomRef.current + 25), [setZoom]);
  const handleZoomOut   = useCallback(() => setZoom(zoomRef.current - 25), [setZoom]);
  const handleZoomReset = useCallback(() => setZoom(100), [setZoom]);

  // ── Rotate a single page (view-only — see unrotateRatios for crop mapping) ─
  const handleRotateView = useCallback((imgId: string, pageNumber: number, dir: "cw" | "ccw") => {
    const r = rendererRef.current;
    const m = markingRef.current;
    const inner   = r.pdfInnerRef.current;
    const origImg = r.imageFilesRef.current.get(imgId);
    if (!inner || !origImg) return;

    const pi = r.imgIdToIndexRef.current.get(imgId) ?? (pageNumber - 1);
    const curAngle = pageRotationRef.current[pi] ?? 0;
    const newAngle = ((curAngle + (dir === "cw" ? 90 : -90)) % 360 + 360) % 360;
    pageRotationRef.current[pi] = newAngle;

    const W = origImg.naturalWidth;
    const H = origImg.naturalHeight;
    const swapped = newAngle === 90 || newAngle === 270;

    const canvas = document.createElement("canvas");
    canvas.width  = swapped ? H : W;
    canvas.height = swapped ? W : H;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((newAngle * Math.PI) / 180);
    ctx.drawImage(origImg, -W / 2, -H / 2);

    const wraps = inner.querySelectorAll<HTMLElement>(".pdf-page-wrap");
    const wrap  = wraps[pi];
    const imgEl = wrap?.querySelector("img");
    if (!wrap || !imgEl) return;
    imgEl.src = canvas.toDataURL("image/png");

    const newBase = swapped ? H : W;
    pageBaseWidthRef.current[pi] = newBase;
    wrap.style.maxWidth = `${newBase * zoomRef.current / 100}px`;

    // Keep already-drawn boxes visually pinned to the same content
    m.rotateBBoxes(imgId, dir);

    refreshGeometry();
  }, [refreshGeometry]);

  // ── Canvas setup, once both queries have resolved ─────────────────────────
  // Runs once per paper; initedPaperRef de-dupes and gates the awaits.
  const initedPaperRef = useRef<number | null>(null);

  useEffect(() => {
    if (!paperId) return;
    const pages = pagesQuery.data;
    const qs    = preflightQuery.data;
    if (!pages || !qs) return;                    // wait for both
    if (initedPaperRef.current === paperId) return;

    if (!pages.length) {
      showToast("error", "No pages found. Go back and upload the AK PDF first.");
      setInitialising(false);
      return;
    }
    initedPaperRef.current = paperId;

    async function init() {
      setInitialising(true);
      try {
        pageRotationRef.current  = pages!.map(() => 0);
        pageBaseWidthRef.current = pages!.map(p => p.width);

        // 1. Load images into renderer
        const scans = pages!.map(p => ({
          img_id:        `page_${String(p.pageNumber).padStart(3, "0")}`,
          image_url:     p.url,
          page_number:   p.pageNumber,
          natural_width: p.width,
          natural_height: p.height,
        }));

        await renderer.loadImagesFromUrls(scans, "AK", showToast);
        if (initedPaperRef.current !== paperId) return;   // paper switched

        // 2. Seed marking questions
        marking.initQuestionsWithDb(
          qs!.map(q => ({
            questionKey:  String(q.question_number),
            questionText: q.question_text,
            maxMarks:     q.max_marks,
            isOptional:   false,
          }))
        );

        // 3. Render pages
        setTimeout(async () => {
          if (initedPaperRef.current !== paperId) return;
          await renderer.renderAllPages(false, () => {}, handleRotateView);
        }, 50);

      } catch (e: any) {
        showToast("error", e.message ?? "Failed to load");
      } finally {
        setInitialising(false);
      }
    }

    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperId, pagesQuery.data, preflightQuery.data]);

  // Surface fetch failures the way the old inline try/catch did.
  useEffect(() => {
    const err = pagesQuery.error ?? preflightQuery.error;
    if (!err) return;
    showToast("error", err instanceof Error ? err.message : "Failed to load");
    setInitialising(false);
  }, [pagesQuery.error, preflightQuery.error, showToast]);

  useEffect(() => {
    if (!renderer.pdfLoaded) return;
    const scroll = pdfScrollRef.current;
    const inner  = renderer.pdfInnerRef.current;
    if (!scroll || !inner) return;
    let raf: number | null = null;
    const schedule = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(refreshGeometry);
    };
    const obs = new ResizeObserver(schedule);
    obs.observe(scroll);
    obs.observe(inner);
    window.addEventListener("resize", schedule);
    schedule();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      obs.disconnect();
      window.removeEventListener("resize", schedule);
    };
  }, [renderer.pdfLoaded, renderer.pdfInnerRef, refreshGeometry]);

  // ── findPage ───────────────────────────────────────────────────────────────
  const findPage = useCallback((absX: number, absY: number) => {
    const r = rendererRef.current;
    for (let i = 0; i < r.numPagesRef.current; i++) {
      const top    = r.pageOffsetsRef.current[i];
      const bottom = top + r.pageHeightsRef.current[i];
      if (absY >= top && absY < bottom) {
        return {
          pageIndex: i,
          imgId:     r.pageImgIdsRef.current[i],
          xRatio:    (absX - r.pageLeftsRef.current[i]) / r.pageWidthsRef.current[i],
          yRatio:    (absY - top) / r.pageHeightsRef.current[i],
        };
      }
    }
    return null;
  }, []);

  // ── Mouse events ───────────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const r = rendererRef.current;
    const m = markingRef.current;
    if (!m.markModeRef.current || !r.pdfLoaded) return;
    e.preventDefault();
    r.measurePages();
    const scroll = pdfScrollRef.current!;
    const rect   = scroll.getBoundingClientRect();
    isDragActive.current = true;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    m.handleMouseDown(
      e.clientX - rect.left + scroll.scrollLeft,
      e.clientY - rect.top  + scroll.scrollTop - 44,
    );
  }, []);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!isDragActive.current) return;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
      const scroll = pdfScrollRef.current!;
      const rect   = scroll.getBoundingClientRect();
      markingRef.current.handleMouseMove(
        e.clientX - rect.left + scroll.scrollLeft,
        e.clientY - rect.top  + scroll.scrollTop - 44,
      );
    };
    const onUp = (e: MouseEvent) => {
      if (!isDragActive.current) return;
      isDragActive.current = false;
      const r = rendererRef.current;
      const m = markingRef.current;
      if (!r.pdfLoaded) return;
      r.measurePages();
      const scroll = pdfScrollRef.current!;
      const rect   = scroll.getBoundingClientRect();
      m.handleMouseUp(
        e.clientX - rect.left + scroll.scrollLeft,
        e.clientY - rect.top  + scroll.scrollTop - 44,
        findPage,
        r.pageWidthsRef.current,
        r.pageHeightsRef.current,
        r.pageOffsetsRef.current,
        r.pageLeftsRef.current,
        showToast,
        r.bumpRenderTick,
      );
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup",   onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup",   onUp);
    };
  }, [findPage, showToast]);

  // ── Auto scroll ────────────────────────────────────────────────────────────
  useEffect(() => {
    const zone = 80, speed = 15;
    const loop = () => {
      autoScrollRef.current = requestAnimationFrame(loop);
      if (!isDragActive.current) return;
      const scroll = pdfScrollRef.current;
      if (!scroll) return;
      const rect   = scroll.getBoundingClientRect();
      const mouseY = lastMousePos.current.y - rect.top;
      const mouseX = lastMousePos.current.x - rect.left;
      let dy = 0, dx = 0;

      if (mouseY > rect.height - zone) dy =  speed * ((mouseY - (rect.height - zone)) / zone);
      if (mouseY < zone && scroll.scrollTop > 0) dy = -speed * ((zone - mouseY) / zone);
      if (mouseX > rect.width  - zone) dx =  speed * ((mouseX - (rect.width  - zone)) / zone);
      if (mouseX < zone && scroll.scrollLeft > 0) dx = -speed * ((zone - mouseX) / zone);

      if (dy === 0 && dx === 0) return;
      scroll.scrollTop  += dy;
      scroll.scrollLeft += dx;
      markingRef.current.handleMouseMove(
        lastMousePos.current.x - rect.left + scroll.scrollLeft,
        lastMousePos.current.y - rect.top  + scroll.scrollTop - 44,
      );
    };
    autoScrollRef.current = requestAnimationFrame(loop);
    return () => { if (autoScrollRef.current) cancelAnimationFrame(autoScrollRef.current); };
  }, []);

  // ── Escape ─────────────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") marking.setMarkMode(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [marking]);

  // ── Extract All ────────────────────────────────────────────────────────────
  async function handleExtractAll() {
    const token = getStoredToken() ?? "";
    const base  = API_BASE;

    const boxedQuestions = marking.questions.filter(q => q.regions.length > 0);
    if (!boxedQuestions.length) {
      showToast("error", "Draw at least one box before extracting.");
      return;
    }

    setExtracting(true);
    showToast("info", `Cropping ${boxedQuestions.length} question(s)…`);

    try {
      // Step 1: Crop each question
      const crops: { questionId: number; questionNumber: string; cropUrl: string; maxMarks: number; questionType: string }[] = [];

      for (const q of boxedQuestions) {
        const canonical = questions.find(cq => String(cq.question_number) === String(q.questionKey));
        if (!canonical) continue;

        // Build regions array — one entry per drawn box (supports multi-page answers)
        const regionsPayload: { pageImageUrl: string; region: { x: number; y: number; width: number; height: number } }[] = [];
        for (const r of q.regions) {
          const pi      = rendererRef.current.imgIdToIndexRef.current.get(r.imgId) ?? 0;
          const pageUrl = loadedPages[pi]?.url;
          if (!pageUrl) continue;

          const actualW = loadedPages[pi]?.width  ?? rendererRef.current.pageWidthsRef.current[pi];
          const actualH = loadedPages[pi]?.height ?? rendererRef.current.pageHeightsRef.current[pi];

          // Boxes may have been drawn while the page view was rotated —
          // map them back to the original (unrotated) image's ratio space
          // before cropping, since the backend crops from the original.
          const angle = pageRotationRef.current[pi] ?? 0;
          const orig  = unrotateRatios(r.x1Ratio, r.y1Ratio, r.x2Ratio, r.y2Ratio, angle);

          console.log(`[AK-BBox] Q${q.questionKey} region page=${pi} actual=${actualW}x${actualH} ratios=${orig.x1.toFixed(3)},${orig.y1.toFixed(3)},${orig.x2.toFixed(3)},${orig.y2.toFixed(3)}`);

          regionsPayload.push({
            pageImageUrl: pageUrl,
            region: {
              x:      orig.x1 * actualW,
              y:      orig.y1 * actualH,
              width:  (orig.x2 - orig.x1) * actualW,
              height: (orig.y2 - orig.y1) * actualH,
            },
          });
        }

        if (!regionsPayload.length) continue;

        const cropRes = await fetch(
          `${base}/api/answer-key/${paperId}/crops`,
          {
            method:  "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
            body: JSON.stringify({
              questionNumber: q.questionKey,
              regions:        regionsPayload,
            }),
          }
        );

        if (!cropRes.ok) {
          const errData = await cropRes.json().catch(() => ({}));
          console.error(`[AK-BBox] Crop failed Q${q.questionKey}:`, errData);
          showToast("error", `Failed to crop Q${q.questionKey}: ${errData.error ?? cropRes.status}`);
          continue;
        }


        const cropData = await cropRes.json();
        crops.push({
          questionId:     canonical.id,
          questionNumber: q.questionKey,
          cropUrl:        cropData.cropUrl,
          maxMarks:       canonical.max_marks,
          questionType:   canonical.question_type ?? "",
        });
      }

      if (!crops.length) {
        showToast("error", "No crops succeeded.");
        return;
      }

      // Step 2: Extract answers from crops
      showToast("info", `Extracting answers from ${crops.length} crop(s)…`);

      const extractRes = await fetch(
        `${base}/api/answer-key/${paperId}/extract`,
        {
          method:  "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body:    JSON.stringify({ crops }),
        }
      );

      if (!extractRes.ok) {
        const err = await extractRes.json();
        showToast("error", err.error ?? "Extraction failed.");
        return;
      }

      showToast("success", "Extraction complete! Redirecting to review…");

      setTimeout(() => {
        router.push(`/answerKey?mode=review&paperId=${paperId}`);
      }, 1200);

    } catch (e: any) {
      showToast("error", e.message ?? "Extraction failed.");
    } finally {
      setExtracting(false);
    }
  }

  // ── Derived ────────────────────────────────────────────────────────────────
  const boxedCount   = marking.questions.filter(q => q.regions.length > 0).length;
  const totalQ       = marking.questions.length;
  const activeQ      = marking.questions.find(q => q.id === marking.activeQId);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 px-4 py-3 rounded-xl shadow-lg text-sm font-medium border ${
          toast.type === "success" ? "bg-green-50 border-green-200 text-green-800"
          : toast.type === "error" ? "bg-red-50 border-red-200 text-red-800"
          : "bg-indigo-50 border-indigo-200 text-indigo-800"
        }`}>
          {toast.msg}
          <button onClick={() => setToast(null)} className="ml-1 opacity-50 hover:opacity-100">
            <X size={13} />
          </button>
        </div>
      )}

      {/* ── Left sidebar ─────────────────────────────────────────────────── */}
      <div className="flex flex-col shrink-0 h-screen overflow-hidden">
        <div className="flex-1 min-h-0 [&>aside]:h-full">
        <QuestionSidebar
          questions={marking.questions}
          activeQId={marking.activeQId}
          markMode={marking.markMode}
          numQ={marking.questions.length}
          doneCount={boxedCount}
          onSelectQ={(id) => {
            marking.setActiveQId(id);
            marking.setMarkMode("drawing");
            const q = marking.questions.find(x => x.id === id);
            if (q?.regions.length) {
              pdfScrollRef.current?.scrollTo({ top: q.regions[0].absY1 - 120, behavior: "smooth" });
            }
          }}
          onBeginMark={(qId) => { marking.setActiveQId(qId); marking.setMarkMode("drawing"); }}
          onDeleteRegion={(qId, regionId) => marking.deleteRegion(qId, regionId, renderer.bumpRenderTick)}
          onClearQ={(qId) => marking.clearQuestion(qId, renderer.bumpRenderTick)}
          onDownloadOne={() => {}}
          onClearAll={() => marking.clearAll(renderer.bumpRenderTick)}
          onReset={() => marking.initQuestionsWithDb(marking.questions.map(q => ({ questionKey: q.questionKey, questionText: q.questionText, maxMarks: q.maxMarks, isOptional: false })))}
          onVerify={() => {}}
          onSetNa={() => {}}
          onFillRemainingNa={() => {}}
          mode="answerKey"
        />
        </div>

        {/* Extract All button */}
        <div className="p-3 border-t border-gray-100 shrink-0 bg-white">
          <button
            onClick={handleExtractAll}
            disabled={extracting || boxedCount === 0}
            className="w-full flex items-center justify-center gap-2 h-9 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed rounded-xl transition"
          >
            {extracting
              ? <><Loader2 size={13} className="animate-spin" /> Extracting…</>
              : <><Zap size={13} /> Extract All ({boxedCount})</>
            }
          </button>
        </div>
      </div>

      {/* ── Right panel ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col overflow-hidden">

        {/* Top bar */}
        <div className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-3 shrink-0 z-30">
          <button
            onClick={() => router.push("/answerKey")}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium transition"
          >
            <ArrowLeft size={15} /> Back
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <h1 className="text-sm font-bold text-gray-900">Answer Key — Draw Boxes</h1>
          <div className="w-px h-5 bg-gray-200" />
          <span className="text-xs text-gray-400">Paper #{paperId}</span>

          <div className="flex items-center gap-1 bg-gray-50 border border-gray-200 rounded-lg px-1 py-0.5">
            <button
              onClick={handleZoomOut}
              title="Zoom out"
              className="w-6 h-6 flex items-center justify-center rounded-md text-gray-500 hover:bg-white hover:text-indigo-600 transition"
            >
              <ZoomOut size={13} />
            </button>
            <button
              onClick={handleZoomReset}
              title="Reset zoom"
              className="text-[11px] font-semibold text-gray-500 w-10 text-center hover:text-indigo-600"
            >
              {zoomPercent}%
            </button>
            <button
              onClick={handleZoomIn}
              title="Zoom in"
              className="w-6 h-6 flex items-center justify-center rounded-md text-gray-500 hover:bg-white hover:text-indigo-600 transition"
            >
              <ZoomIn size={13} />
            </button>
          </div>

          <div className="flex-1" />

          {/* Active question indicator */}
          {activeQ && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">Drawing for:</span>
              <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg">
                Q{activeQ.questionKey} · {activeQ.maxMarks}M
              </span>
              <button
                onClick={() => marking.setMarkMode(
                  marking.markMode === "drawing" ? null : "drawing"
                )}
                className={`flex items-center gap-1.5 h-8 px-3 text-xs font-semibold rounded-lg border transition ${
                  marking.markMode === "drawing"
                    ? "bg-indigo-600 text-white border-indigo-600"
                    : "bg-white text-gray-600 border-gray-200 hover:border-indigo-400"
                }`}
              >
                <Crosshair size={12} />
                {marking.markMode === "drawing" ? "Drawing…" : "Draw Box"}
              </button>
            </div>
          )}

          {loading && (
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <Loader2 size={13} className="animate-spin" /> Loading…
            </div>
          )}
        </div>

        {/* Drawing mode banner */}
        {marking.markMode === "drawing" && activeQ && (
          <div className="h-9 bg-indigo-600 flex items-center justify-center gap-2 text-white text-xs font-semibold shrink-0">
            <Crosshair size={13} />
            Draw a box around Q{activeQ.questionKey}'s answer — click and drag on the page
            <button
              onClick={() => marking.setMarkMode(null)}
              className="ml-3 text-indigo-200 hover:text-white transition"
            >
              <X size={13} />
            </button>
          </div>
        )}

        {/* Page viewer */}
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
              style={{ gap: PAGE_GAP, padding: PAGE_PAD, minHeight: "100%", minWidth: "100%" }}
            >
              <MarkerOverlays
                questions={marking.questions}
                renderTick={renderer.renderTick}
                dragRect={marking.dragRect}
                activeQId={marking.activeQId}
                onDeleteRegion={(qId, regionId) =>
                  marking.deleteRegion(qId, regionId, renderer.bumpRenderTick)
                }
                onUpdateRegionPosition={(qId, regionId, newRatios) =>
                  marking.updateRegionPosition(
                    qId, regionId, newRatios,
                    renderer.pageOffsetsRef.current,
                    renderer.pageHeightsRef.current,
                    renderer.pageWidthsRef.current,
                    renderer.pageLeftsRef.current,
                    renderer.imgIdToIndexRef.current,
                    renderer.bumpRenderTick,
                  )
                }
                pageWidths={renderer.pageWidthsRef.current}
                pageHeights={renderer.pageHeightsRef.current}
                pageOffsets={renderer.pageOffsetsRef.current}
                pageLefts={renderer.pageLeftsRef.current}
                imgIdToIndex={renderer.imgIdToIndexRef.current}
                scrollContainerRef={pdfScrollRef}
                onMoveRegion={(qId, regionId, newX1Ratio, newY1Ratio) =>
                  marking.moveRegion(
                    qId, regionId, newX1Ratio, newY1Ratio,
                    renderer.pageOffsetsRef.current,
                    renderer.pageHeightsRef.current,
                    renderer.pageWidthsRef.current,
                    renderer.pageLeftsRef.current,
                    renderer.imgIdToIndexRef.current,
                    renderer.bumpRenderTick,
                  )
                }
                onSelectQuestion={(qId) => {
                  marking.setActiveQId(qId);
                  marking.setMarkMode(null);
                }}
              />
            </div>
          </div>
        )}

        {!renderer.pdfLoaded && !loading && (
          <div className="flex-1 flex items-center justify-center text-gray-300 text-sm">
            No pages loaded. Go back and upload the AK PDF.
          </div>
        )}
      </div>
    </div>
  );
}