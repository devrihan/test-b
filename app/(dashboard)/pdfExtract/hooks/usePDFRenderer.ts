import { useRef, useState, useCallback } from "react";
import { PAGE_GAP, PAGE_PAD } from "../constants";
import { rotateStudentPage } from "../lib/beaverApi";

const BEAVER_BASE = process.env.NEXT_PUBLIC_BEAVER_API_URL ?? "http://localhost:4000";
const getProxyImageUrl = (url: string, w?: number) =>
  `${BEAVER_BASE}/api/proxy-image?url=${encodeURIComponent(url)}${w ? `&w=${w}` : ""}`;

// Display rendition width (px) for scan pages — the proxy downscales + WebPs
// them to a fraction of the original bytes. Display-only: bbox coords are
// float ratios, and OCR crops are cut server-side from the ORIGINAL images,
// so this never touches OCR input resolution (300 dpi preserved).
const PAGE_RENDITION_W = 1800;

export function usePDFRenderer() {

  // ── Refs ────────────────────────────────────────────────────
  const imageFilesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const imgIdToIndexRef = useRef<Map<string, number>>(new Map());
  const numPagesRef = useRef<number>(0);
  const pageOffsetsRef = useRef<number[]>([]);
  const pageHeightsRef = useRef<number[]>([]);
  const pageWidthsRef = useRef<number[]>([]);
  const pageLeftsRef = useRef<number[]>([]);
  const pageImgIdsRef = useRef<string[]>([]);
  // Display size of each page (rendition width × scaled height), known from the
  // pages API BEFORE the image bytes arrive. Lets renderAllPages lay pages out
  // with the right aspect ratio while they are still downloading, so bboxes
  // can be positioned and the operator can start work on page 1 immediately.
  const pageDimsRef = useRef<Map<string, { w: number; h: number }>>(new Map());
  const pdfInnerRef = useRef<HTMLDivElement | null>(null);
  const previewLineRef = useRef<HTMLDivElement | null>(null);

  // Identity stamp (#199): which answer paper the currently-loaded pages belong to.
  // Set only when pages are committed; cleared on reset. Makes "whose pages am I
  // holding?" machine-checkable so a save can't target a different student.
  const loadedStudentIdRef = useRef<string | null>(null);
  const loadedBatchIdRef = useRef<string | null>(null);
  // True iff img_id is one of the currently-loaded pages (region-provenance check).
  const hasImgId = useCallback((imgId: string) => imgIdToIndexRef.current.has(imgId), []);

  // ── State ───────────────────────────────────────────────────
  const [pdfLoaded, setPdfLoaded] = useState(false);
  const [fileName, setFileName] = useState("");
  const [pageCountLabel, setPageCountLabel] = useState("");
  const [renderTick, setRenderTick] = useState(0);

  const bumpRenderTick = useCallback(() => {
    setRenderTick(t => t + 1);
  }, []);

  // ── Recalculate page offsets ────────────────────────────────
  const measurePages = useCallback(() => {
    const inner = pdfInnerRef.current;
    if (!inner) return;

    const wraps = Array.from(
      inner.querySelectorAll<HTMLElement>(".pdf-page-wrap")
    );

    pageOffsetsRef.current = wraps.map(wrap => wrap.offsetTop);
    pageLeftsRef.current = wraps.map(wrap => wrap.offsetLeft);
    pageWidthsRef.current = wraps.map(wrap => wrap.offsetWidth);
    pageHeightsRef.current = wraps.map(wrap => wrap.offsetHeight);
  }, []);

  const recalcOffsets = useCallback(() => {
    let cumY = PAGE_PAD;
    for (let i = 0; i < numPagesRef.current; i++) {
      pageOffsetsRef.current[i] = cumY;
      cumY += pageHeightsRef.current[i] + PAGE_GAP;
    }
  }, []);

  // ── Load one image from File ────────────────────────────────
  const loadImage = (file: File): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
  };

  // ── Render all images ───────────────────────────────────────
  const renderAllPages = useCallback(async (
    keepMarks: boolean,
    recalcMarkAbsY: () => void,
    onRotate?: (imgId: string, pageNum: number, dir: "cw" | "ccw") => void,
  ) => {
    const inner = pdfInnerRef.current;
    const previewLine = previewLineRef.current;
    if (!inner) return;

    inner.querySelectorAll(".pdf-page-wrap").forEach(el => el.remove());
    pageOffsetsRef.current = [];
    pageHeightsRef.current = [];
    pageWidthsRef.current = [];
    pageLeftsRef.current = [];
    pageImgIdsRef.current = [];

    let cumY = PAGE_PAD;

    let pi = 0;
    for (const [imgId, imgEl] of imageFilesRef.current) {
      // A still-downloading image reports 0×0; fall back to the dims the pages
      // API told us so the page box is laid out at its final size right away.
      const known = pageDimsRef.current.get(imgId);
      const W = imgEl.naturalWidth || known?.w || 0;
      const H = imgEl.naturalHeight || known?.h || 0;

      const wrap = document.createElement("div");
      wrap.className = "pdf-page-wrap";
      wrap.style.cssText = `
        position: relative;
        flex-shrink: 0;
        width: 100%;
        max-width: ${W}px;
        box-shadow: 0 2px 16px rgba(0,0,0,.1), 0 1px 4px rgba(0,0,0,.06);
        border-radius: 6px;
        background: #fff;
      `;

      const lbl = document.createElement("div");
      lbl.style.cssText = `
        position: absolute;
        top: -22px; left: 0;
        font-size: 11px;
        color: #9ca3af;
        font-weight: 500;
        user-select: none;
      `;
      lbl.textContent = `Page ${pi + 1}`;
      wrap.appendChild(lbl);

      if (onRotate) {
        const ctrl = document.createElement("div");
        ctrl.style.cssText = `
          position: absolute;
          top: -24px; right: 0;
          display: flex;
          gap: 6px;
          align-items: center;
        `;

        const btnCW = document.createElement("button");
        btnCW.innerHTML = "↻";
        btnCW.title = "Rotate Clockwise";
        btnCW.style.cssText = `
          background: #f3f4f6;
          border: 1px solid #e5e7eb;
          border-radius: 4px;
          width: 20px;
          height: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          font-size: 11px;
          color: #4b5563;
          font-weight: bold;
          transition: all 0.2s;
        `;
        btnCW.onmouseover = () => { btnCW.style.background = "#e5e7eb"; btnCW.style.color = "#1f2937"; };
        btnCW.onmouseout = () => { btnCW.style.background = "#f3f4f6"; btnCW.style.color = "#4b5563"; };
        
        const currentPageNum = pi + 1;
        const currentImgId = imgId;
        btnCW.onclick = (e) => {
          e.preventDefault();
          onRotate(currentImgId, currentPageNum, "cw");
        };

        const btnCCW = document.createElement("button");
        btnCCW.innerHTML = "↺";
        btnCCW.title = "Rotate Counter-Clockwise";
        btnCCW.style.cssText = btnCW.style.cssText;
        btnCCW.onmouseover = () => { btnCCW.style.background = "#e5e7eb"; btnCCW.style.color = "#1f2937"; };
        btnCCW.onmouseout = () => { btnCCW.style.background = "#f3f4f6"; btnCCW.style.color = "#4b5563"; };
        btnCCW.onclick = (e) => {
          e.preventDefault();
          onRotate(currentImgId, currentPageNum, "ccw");
        };

        ctrl.appendChild(btnCCW);
        ctrl.appendChild(btnCW);
        wrap.appendChild(ctrl);
      }

      // ── crossOrigin needed for canvas extraction ──
      const img = document.createElement("img");
      img.crossOrigin = "anonymous";
      img.src = imgEl.src;
      img.style.cssText = `
        display: block;
        width: 100%;
        height: auto;
        border-radius: 6px;
        pointer-events: none;
        user-select: none;
        background: #fff;
      `;
      // Reserve the final height before the bytes arrive (progressive load) —
      // width:100% + this ratio gives the same box the decoded image will fill.
      if (W > 0 && H > 0) img.style.aspectRatio = `${W} / ${H}`;
      wrap.appendChild(img);

      inner.insertBefore(wrap, previewLine);

      pageOffsetsRef.current.push(cumY);
      pageHeightsRef.current.push(H);
      pageWidthsRef.current.push(W);
      pageImgIdsRef.current.push(imgId);
      cumY += H + PAGE_GAP;
      pi++;
    }

    measurePages();
    if (keepMarks) recalcMarkAbsY();
    setRenderTick(t => t + 1);
  }, [measurePages]);

  // ── Load images from local File objects ─────────────────────
  const loadImages = useCallback(async (
    files: FileList | File[],
    onToast: (t: "success" | "error" | "info", m: string) => void,
    append: boolean = false,
  ) => {
    if (!files || files.length === 0) {
      onToast("error", "No images selected");
      return;
    }

    try {
      const sortedFiles = Array.from(files).sort((a, b) =>
        a.name.localeCompare(b.name, undefined, { numeric: true })
      );

      const newImages = await Promise.all(
        sortedFiles.map(f => loadImage(f))
      );

      const existingCount = append ? imageFilesRef.current.size : 0;
      const imageMap = append
        ? new Map(imageFilesRef.current)
        : new Map<string, HTMLImageElement>();
      const indexMap = append
        ? new Map(imgIdToIndexRef.current)
        : new Map<string, number>();

      newImages.forEach((img, i) => {
        const globalIndex = existingCount + i;
        const imgId = `img_${String(globalIndex + 1).padStart(3, "0")}`;
        imageMap.set(imgId, img);
        indexMap.set(imgId, globalIndex);
      });

      imageFilesRef.current = imageMap;
      imgIdToIndexRef.current = indexMap;
      numPagesRef.current = imageMap.size;

      const total = imageMap.size;
      setFileName(`${total} image${total !== 1 ? "s" : ""}`);
      setPageCountLabel(`${total} page${total !== 1 ? "s" : ""}`);
      setPdfLoaded(true);

      onToast(
        "success",
        append
          ? `Added ${newImages.length} image${newImages.length !== 1 ? "s" : ""} — ${total} total`
          : `Loaded ${total} image${total !== 1 ? "s" : ""}`
      );
    } catch (err) {
      onToast("error", "Could not load images. Are they valid image files?");
      console.error(err);
    }
  }, []);

  // ── NEW: Load images from R2 URLs (progressive) ─────────────
  // Commits the page set as soon as the image elements exist and resolves once
  // the FIRST page has decoded — the rest stream in behind it. Previously this
  // awaited Promise.all over every page, so a 15-page student showed a blocking
  // "Loading student…" overlay until the slowest download finished.
  // Requires natural_width/natural_height on every scan (the pages API always
  // sends them); if any are missing it falls back to waiting for all pages so
  // layout never runs with unknown sizes.
  const loadImagesFromUrls = useCallback(async (
    scans: {
      img_id: string;
      image_url: string;
      page_number: number;
      natural_width?: number;
      natural_height?: number;
      file_size_kb?: number;
    }[],
    studentName: string,
    onToast: (t: "success" | "error" | "info", m: string) => void,
    identity?: { studentId: string; batchId: string },
    // #199: image downloads run to completion even after a newer load has
    // reset the renderer. Checked right before committing the refs so a stale
    // load can never overwrite the newer student's pages.
    isStale?: () => boolean,
  ) => {
    if (!scans || scans.length === 0) {
      onToast("error", "No pages found for this student");
      return;
    }

    try {
      onToast("info", `Loading ${scans.length} pages from cloud…`);

      // Sort by page_number to guarantee correct order
      const sorted = [...scans].sort((a, b) => a.page_number - b.page_number);

      const imageMap = new Map<string, HTMLImageElement>();
      const indexMap = new Map<string, number>();
      const dimsMap = new Map<string, { w: number; h: number }>();
      let allDimsKnown = true;

      // Kick off every download (via proxy for CORS; downscaled rendition).
      // Each promise resolves true/false rather than rejecting so one bad page
      // never aborts the whole student.
      const loads = sorted.map((s, i) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        const done = new Promise<boolean>(resolve => {
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
        });
        // Build cache-busted URL using size/dimensions as a stable revision
        const rev = `${s.file_size_kb || 0}_${s.natural_width || 0}_${s.natural_height || 0}`;
        const urlWithRev = `${s.image_url}?rev=${rev}`;
        img.src = getProxyImageUrl(urlWithRev, PAGE_RENDITION_W);

        imageMap.set(s.img_id, img);
        indexMap.set(s.img_id, i);
        const w = s.natural_width || 0;
        const h = s.natural_height || 0;
        if (w > 0 && h > 0) {
          // The proxy never enlarges, so the decoded rendition is min(w, W) wide.
          const dw = Math.min(w, PAGE_RENDITION_W);
          dimsMap.set(s.img_id, { w: dw, h: Math.round(h * dw / w) });
        } else {
          allDimsKnown = false;
        }
        return done;
      });

      if (isStale?.()) return;

      imageFilesRef.current = imageMap;
      imgIdToIndexRef.current = indexMap;
      pageDimsRef.current = dimsMap;
      numPagesRef.current = imageMap.size;
      loadedStudentIdRef.current = identity?.studentId ?? null;
      loadedBatchIdRef.current = identity?.batchId ?? null;

      const total = imageMap.size;
      setFileName(`${studentName} · ${total} pages`);
      setPageCountLabel(`${total} page${total !== 1 ? "s" : ""}`);
      setPdfLoaded(true);

      // Hand control back once page 1 is on screen (or everything settled).
      const allDone = Promise.all(loads);
      if (allDimsKnown) {
        await Promise.race([loads[0], allDone]);
      } else {
        await allDone;
      }
      if (isStale?.()) return;

      // Final status once the rest have streamed in.
      void allDone.then(results => {
        if (isStale?.()) return;
        const failed = results.filter(ok => !ok).length;
        if (failed > 0) {
          onToast("error", `${failed} of ${total} page${total !== 1 ? "s" : ""} failed to load. Check your connection.`);
        } else {
          onToast("success", `Loaded ${total} pages for ${studentName}`);
        }
      });

    } catch (err) {
      onToast("error", "Could not load images from cloud. Check your connection.");
      console.error(err);
    }
  }, []);

  // ── NEW: Reset renderer ─────────────────────────────────────
  const resetRenderer = useCallback(() => {
    imageFilesRef.current = new Map();
    imgIdToIndexRef.current = new Map();
    numPagesRef.current = 0;
    pageOffsetsRef.current = [];
    pageHeightsRef.current = [];
    pageWidthsRef.current = [];
    pageLeftsRef.current = [];
    pageImgIdsRef.current = [];
    pageDimsRef.current = new Map();
    loadedStudentIdRef.current = null;
    loadedBatchIdRef.current = null;
    setPdfLoaded(false);
    setFileName("");
    setPageCountLabel("");
    setRenderTick(0);

    const inner = pdfInnerRef.current;
    if (inner) {
      inner.querySelectorAll(".pdf-page-wrap").forEach(el => el.remove());
    }
  }, []);

  // ── NEW: Rotate a single page ──────────────────────────────
  const rotatePage = useCallback(async (
    batchId: string,
    studentId: string,
    imgId: string,
    pageNumber: number,
    direction: "cw" | "ccw",
    onToast: (t: "success" | "error" | "info", msg: string) => void,
    recalcMarkAbsY: () => void,
    onRotate?: (imgId: string, pageNum: number, dir: "cw" | "ccw") => void,
  ) => {
    try {
      onToast("info", `Rotating Page ${pageNumber}…`);
      
      // 1. Call API
      const res = await rotateStudentPage(batchId, studentId, pageNumber, direction);
      
      // 2. Load the newly rotated image from storage with cache buster
      const cacheBustedUrl = `${res.page.image_url}?t=${Date.now()}`;
      
      const newImg = await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "anonymous";
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = getProxyImageUrl(cacheBustedUrl, PAGE_RENDITION_W);
      });
      
      // 3. Update the map ref (+ the known display dims — rotation swaps them)
      if (imageFilesRef.current.has(imgId)) {
        imageFilesRef.current.set(imgId, newImg);
        pageDimsRef.current.set(imgId, { w: newImg.naturalWidth, h: newImg.naturalHeight });
      }
      
      // 4. Force redraw/re-render all pages, keeping existing marks
      await renderAllPages(true, recalcMarkAbsY, onRotate);
      
      onToast("success", `Page ${pageNumber} rotated successfully!`);
    } catch (err) {
      onToast("error", "Failed to rotate page. Please try again.");
      console.error(err);
    }
  }, [renderAllPages]);


  // ── Return everything ───────────────────────────────────────
  return {
    imageFilesRef,
    imgIdToIndexRef,
    numPagesRef,
    pageOffsetsRef,
    pageHeightsRef,
    pageWidthsRef,
    pageLeftsRef,
    pageImgIdsRef,
    loadedStudentIdRef,
    loadedBatchIdRef,
    hasImgId,
    pdfInnerRef,
    previewLineRef,
    pdfLoaded,
    fileName,
    pageCountLabel,
    renderTick,
    loadImages,
    loadImagesFromUrls,  // ← NEW
    resetRenderer,       // ← NEW
    rotatePage,          // ← NEW
    renderAllPages,
    measurePages,
    recalcOffsets,
    bumpRenderTick,
  };
}
