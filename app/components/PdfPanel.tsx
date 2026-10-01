"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { RotateCw, RotateCcw } from "lucide-react";
import { CropRect,OCRRegion, useOCRExtraction } from "@/app/context/Ocrextractioncontext";
import SelectionOverlay from "../components/Selectionoverlay";


interface StudentPage {
  img_id:        string;
  page_number:   number;
  image_url:     string;
  natural_width: number;
  natural_height:number;
  file_size_kb?: number;
}

// Stable per-content revision (same scheme as usePDFRenderer): a re-run
// regenerates the image at the same URL, so the proxy needs a stamp that
// changes with the content to cache hard without ever serving stale pages.
const pageUrlWithRev = (s: StudentPage) =>
  `${s.image_url}?rev=${s.file_size_kb || 0}_${s.natural_width || 0}_${s.natural_height || 0}`;

interface PdfPanelProps {
  studentName: string;
  scans:       StudentPage[];
  loading?:    boolean;
}

export default function PdfPanel({ studentName, scans, loading }: PdfPanelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [safeImages, setSafeImages] =
  useState<Map<number, HTMLImageElement>>(new Map());

  const [imageRefs] = useState<Map<number, HTMLImageElement>>(() => new Map());

  const [rotations, setRotations] = useState<Map<number, number>>(() => new Map());

  const [croppableImages, setCroppableImages] = useState<Map<number, HTMLImageElement>>(() => new Map());

  const [rotatedImages, setRotatedImages] = useState<Map<number, string>>(() => new Map());

useEffect(() => { setRotations(new Map()); }, [studentName]);

const handleRotate = useCallback((pageNumber: number, dir: "cw" | "ccw") => {
  setRotations(prev => {
    const next = new Map(prev);
    const cur = next.get(pageNumber) || 0;
    next.set(pageNumber, (cur + (dir === "cw" ? 90 : -90) + 360) % 360);
    return next;
  });
}, []);

  const setImageRef = useCallback(
     (pageNumber: number, el: HTMLImageElement | null) => {
       if (el) {
         imageRefs.set(pageNumber, el);
       } else {
        imageRefs.delete(pageNumber);
     }
   },
  [imageRefs]
);

const {
  selectionMode,
  addRegion,
  setCropRect,
  cancel,
} = useOCRExtraction();

  // Scroll to top when student changes
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [studentName]);

  // The same-origin "safe" images are only needed to feed the rotate/crop
  // canvas (reading pixels off a cross-origin image taints the canvas). Plain
  // viewing renders straight from the <img> tags below, which lazy-load as the
  // user scrolls. So we defer this full-batch preload until the user actually
  // rotates a page or enters selection mode, instead of paying it on every
  // student switch.
  const needsCanvasImages = selectionMode || rotations.size > 0;

  useEffect(() => {
  if (!needsCanvasImages) return;

  const loadSafeImages = async () => {
    const map = new Map<number, HTMLImageElement>();

    await Promise.all(
      scans.map(
        (scan) =>
          new Promise<void>((resolve, reject) => {
            const img = new Image();

            // img.crossOrigin = "anonymous";

            img.onload = () => {
              map.set(scan.page_number, img);
              resolve();
            };

            img.onerror = reject;

            img.src = `/api/proxy-image?url=${encodeURIComponent(pageUrlWithRev(scan))}`;
          })
      )
    );

    setSafeImages(map);
  };

  if (scans.length > 0) {
    loadSafeImages();
  }
}, [scans, needsCanvasImages]);


useEffect(() => {
  const map = new Map<number, HTMLImageElement>();
  let cancelled = false;

  const tasks = Array.from(safeImages.entries()).map(([pageNum, origImg]) => {
    const deg = rotations.get(pageNum) || 0;

    if (deg === 0) {
      map.set(pageNum, origImg);
      return Promise.resolve();
    }

    return new Promise<void>((resolve) => {
      const isVertical = deg === 90 || deg === 270;
      const canvas = document.createElement("canvas");
      canvas.width = isVertical ? origImg.naturalHeight : origImg.naturalWidth;
      canvas.height = isVertical ? origImg.naturalWidth : origImg.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((deg * Math.PI) / 180);
      ctx.drawImage(origImg, -origImg.naturalWidth / 2, -origImg.naturalHeight / 2);

      const dataUrl = canvas.toDataURL("image/png");
const rotImg = new Image();
rotImg.onload = () => {
  if (!cancelled) map.set(pageNum, rotImg);
  resolve();
};
rotImg.src = dataUrl;
    });
  });

  Promise.all(tasks).then(() => {
  if (!cancelled) {
    setCroppableImages(map);
    const urlMap = new Map<number, string>();
    for (const [pageNum, img] of map.entries()) {
      if (rotations.get(pageNum)) urlMap.set(pageNum, img.src);
    }
    setRotatedImages(urlMap);
  }
});

  return () => { cancelled = true; };
}, [safeImages, rotations]);


const handleSelect = useCallback(
  (
    rect: CropRect,
    croppedBase64: string,
    pageIndex: number
  ) => {
    setCropRect?.(rect);

    addRegion?.({
      id: `${Date.now()}-${Math.random()}`,
      pageIndex,
      cropRect: rect,
      image: croppedBase64,
    });
  },
  [setCropRect, addRegion]
);

const handleCancel = useCallback(() => {
  cancel?.();
}, [cancel]);


  return (
    <div className="flex flex-col h-full">

      {/* Header */}
      <div className="shrink-0 px-5 py-3 border-b border-gray-100 flex items-center justify-between bg-white">
        <div>
          <p className="text-sm font-semibold text-gray-800">Answer Sheet</p>
          <p className="text-xs text-gray-400 mt-0.5">{studentName}</p>
        </div>
        {scans.length > 0 && (
          <span className="text-xs text-gray-400 font-medium">
            {scans.length} page{scans.length !== 1 ? "s" : ""}
          </span>
        )}
      </div>

      {/* Body */}
      <div ref={scrollRef} className="relative flex-1 overflow-y-auto bg-gray-100 p-3 space-y-3">

        {loading && (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-gray-400">Loading pages...</p>
          </div>
        )}

        {!loading && scans.length === 0 && (
          <div className="flex items-center justify-center h-full">
            <p className="text-xs text-gray-400 text-center">
              No pages found for this student.
            </p>
          </div>
        )}

        {!loading && scans.map((scan) => {
  const deg = rotations.get(scan.page_number) || 0;
  const isVertical = deg === 90 || deg === 270;
  return (
    <div key={scan.img_id} className="relative z-0">
      <div className="flex items-center justify-between mb-1">
        <p className="text-[10px] text-gray-400 font-medium">
          Page {scan.page_number}
        </p>
        <div className="flex items-center gap-1">
          <button
            onClick={() => handleRotate(scan.page_number, "ccw")}
            className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition"
            title="Rotate left"
          >
            <RotateCcw size={14} />
          </button>
          <button
            onClick={() => handleRotate(scan.page_number, "cw")}
            className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition"
            title="Rotate right"
          >
            <RotateCw size={14} />
          </button>
        </div>
      </div>
      <div className="rounded-lg shadow-sm border border-gray-200 bg-white overflow-hidden">
  <img
    ref={(el) => setImageRef(scan.page_number, el)}
    src={rotatedImages.get(scan.page_number) ?? `/api/proxy-image?url=${encodeURIComponent(pageUrlWithRev(scan))}`}
    alt={`Page ${scan.page_number}`}
    loading="lazy"
    style={{ width: "100%" }}
  />
</div>
    </div>
  );
})}
        {/* ADD THIS */}
        <SelectionOverlay
          active={selectionMode}
          imageRefs={imageRefs}
          safeImageRefs={croppableImages}
          scans={scans}
          scrollRef={scrollRef}
          onSelect={handleSelect}
          onCancel={handleCancel}
          rotations={rotations}
        />

      </div>
    </div>
  );
}