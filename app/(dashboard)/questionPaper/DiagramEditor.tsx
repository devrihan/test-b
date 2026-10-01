"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

export interface NormBBox {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/* ── Diagram editor ───────────────────────────────────────────
   Shows the question-paper page with the auto-detected whole-
   question rectangle overlaid. The box can be dragged (move) or
   resized (bottom-right handle). On release the parent re-crops
   via onCommit (which calls the beaver-api crop endpoint).
   All coordinates are normalized 0..1 of the page image.
   ───────────────────────────────────────────────────────────── */

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export default function DiagramEditor({
  pageUrl,
  bbox,
  cropUrl,
  onCommit,
}: {
  pageUrl: string;
  bbox: NormBBox;
  cropUrl: string | null;
  onCommit: (b: NormBBox) => Promise<void>;
}) {
  const imgRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<NormBBox>(bbox);
  const [saving, setSaving] = useState(false);
  // drag state: which interaction + the pointer/box anchor at mousedown
  const drag = useRef<null | { mode: "move" | "resize"; sx: number; sy: number; start: NormBBox }>(null);

  // Keep local box in sync when the parent supplies a new one.
  useEffect(() => { setBox(bbox); }, [bbox.x1, bbox.y1, bbox.x2, bbox.y2]); // eslint-disable-line react-hooks/exhaustive-deps

  const toNorm = (clientX: number, clientY: number) => {
    if (!imgRef.current) return null;
    const rect = imgRef.current.getBoundingClientRect();
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    };
  };

  const onPointerDown = (mode: "move" | "resize") => (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const norm = toNorm(e.clientX, e.clientY);
    if (!norm) return;
    drag.current = { mode, sx: norm.x, sy: norm.y, start: { ...box } };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!drag.current) return;
      const norm = toNorm(e.clientX, e.clientY);
      if (!norm) return;
      const { x, y } = norm;
      const d = drag.current;
      if (d.mode === "move") {
        const dx = x - d.sx, dy = y - d.sy;
        const w = d.start.x2 - d.start.x1, h = d.start.y2 - d.start.y1;
        let nx1 = clamp01(d.start.x1 + dx), ny1 = clamp01(d.start.y1 + dy);
        nx1 = Math.min(nx1, 1 - w); ny1 = Math.min(ny1, 1 - h);
        setBox({ x1: nx1, y1: ny1, x2: nx1 + w, y2: ny1 + h });
      } else {
        setBox({ x1: d.start.x1, y1: d.start.y1, x2: Math.max(d.start.x1 + 0.02, x), y2: Math.max(d.start.y1 + 0.02, y) });
      }
    };
    const onUp = async () => {
      if (!drag.current) return;
      drag.current = null;
      // Auto-save removed; user must click "Save Crop"
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [box]); // Removed onCommit from dependency array since onUp no longer calls it

  const handleSaveCrop = async () => {
    setSaving(true);
    try {
      await onCommit(box);
    } finally {
      setSaving(false);
    }
  };

  const pct = (a: number, b: number) => `${(a - b) * 100}%`;

  return (
    <div className="flex flex-col sm:flex-row gap-3">
      {/* Page with overlay */}
      <div ref={imgRef} className="relative w-full sm:w-2/3 select-none rounded-lg overflow-hidden border border-gray-200">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={pageUrl} alt="Question paper page" className="w-full block pointer-events-none" draggable={false} />
        <div
          onMouseDown={onPointerDown("move")}
          className="absolute border-2 border-amber-500 bg-amber-400/15 cursor-move"
          style={{
            left:   `${box.x1 * 100}%`,
            top:    `${box.y1 * 100}%`,
            width:  pct(box.x2, box.x1),
            height: pct(box.y2, box.y1),
          }}
        >
          <div
            onMouseDown={onPointerDown("resize")}
            className="absolute -right-1.5 -bottom-1.5 w-3 h-3 bg-amber-600 border border-white rounded-sm cursor-se-resize"
          />
        </div>
      </div>

      {/* Crop preview and actions */}
      <div className="w-full sm:w-1/3 flex flex-col">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Cropped diagram</p>
        <div className="flex-1">
          {cropUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={cropUrl} alt="Diagram crop" className="w-full rounded-lg border border-gray-200 object-contain max-h-56" />
          ) : (
            <div className="text-[11px] text-gray-400 border border-dashed border-gray-200 rounded-lg p-3">
              Adjust the box to generate a crop.
            </div>
          )}
        </div>
        
        <div className="mt-4">
          <button
            onClick={handleSaveCrop}
            disabled={saving}
            className="w-full flex items-center justify-center gap-2 bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 px-4 py-2 rounded-lg text-sm font-semibold transition shadow-sm"
          >
            {saving ? (
              <><Loader2 size={16} className="animate-spin" /> Saving...</>
            ) : (
              "Save Crop"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
