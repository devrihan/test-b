"use client";

import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { CropRect } from "@/app/context/Ocrextractioncontext";


interface SelectionOverlayProps {
  /** Whether drag-to-select is active */
  active: boolean;
  /** All page image elements — needed to detect which page and compute coordinates */
  imageRefs: Map<number, HTMLImageElement>;
  safeImageRefs: Map<number, HTMLImageElement>;
  /** Scans data for natural dimensions */
  scans: { page_number: number; natural_width: number; natural_height: number }[];
  /** Called when user completes a drag selection */
  onSelect: (rect: CropRect, croppedBase64: string, pageIndex: number) => void;
  /** Called when user presses ESC */
  onCancel: () => void;
  scrollRef: RefObject<HTMLDivElement | null>;
  rotations: Map<number, number>;

}

export default function SelectionOverlay({
  active,
  imageRefs,
  safeImageRefs,
  scans,
  onSelect,
  onCancel,
  scrollRef,
  rotations,
}: SelectionOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const mouseClientYRef = useRef(0);

  // Drag state
  const [dragging, setDragging] = useState(false);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(null);
  const [targetPage, setTargetPage] = useState<number | null>(null);
  const [targetImg, setTargetImg] = useState<HTMLImageElement | null>(null);

  // ── Reset when active changes ──────────────────────────────
  useEffect(() => {
    if (!active) {
      setDragging(false);
      setStartPos(null);
      setCurrentPos(null);
      setTargetPage(null);
      setTargetImg(null);
    }
  }, [active]);

  // ── ESC key handler ────────────────────────────────────────
  useEffect(() => {
    if (!active) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [active, onCancel]);

  // ── Find which image the mouse is over ─────────────────────
  const findTargetImage = useCallback(
    (clientX: number, clientY: number) => {
      for (const [pageNum, img] of imageRefs.entries()) {
        const rect = img.getBoundingClientRect();
        console.log("CHECKING IMAGE", {
          pageNum,
          rect,
          clientX,
          clientY,
        });
        if (
          clientX >= rect.left &&
          clientX <= rect.right &&
          clientY >= rect.top &&
          clientY <= rect.bottom
        ) {
          return { pageNum, img, rect };
        }
      }
      return null;
    },
    [imageRefs]
  );

  const getContainerCoordinates = (clientX: number, clientY: number) => {
    if (!scrollRef.current) {
      return { x: clientX, y: clientY };
    }

    const containerRect = scrollRef.current.getBoundingClientRect();

    return {
      x: clientX - containerRect.left,
      y: clientY - containerRect.top + scrollRef.current.scrollTop,
    };
  };

  // ── Mouse handlers ─────────────────────────────────────────
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (!active || e.button !== 0) return;
      const target = findTargetImage(e.clientX, e.clientY);
      if (!target) return;

      e.preventDefault();

      const point = getContainerCoordinates(
        e.clientX,
        e.clientY
      );

      setDragging(true);
      setTargetPage(target.pageNum);
      setTargetImg(target.img);
      setStartPos(point);
      setCurrentPos(point);

    },
    [active, findTargetImage]
  );



  useEffect(() => {
    if (!dragging || !currentPos || !scrollRef.current) return;

    const container = scrollRef.current;
    const rect = container.getBoundingClientRect();
    const edgeZone = 40; // pixels from edge to trigger scroll
    const scrollSpeed = 15;

    let animId: number | null = null;

    const autoScroll = () => {
      const mouseY = mouseClientYRef.current;

      if (mouseY > rect.bottom - edgeZone) {
        container.scrollTop += scrollSpeed;
      } else if (mouseY < rect.top + edgeZone) {
        container.scrollTop -= scrollSpeed;
      } else {
        animId = null;
        return;
      }

      animId = requestAnimationFrame(autoScroll);
    };

    animId = requestAnimationFrame(autoScroll);

    return () => {
      if (animId) cancelAnimationFrame(animId);
    };
  }, [dragging, currentPos, scrollRef]);



  useEffect(() => {
    if (!dragging) return;

    const onMove = (e: MouseEvent) => {
      e.preventDefault();

      mouseClientYRef.current = e.clientY;

      const point = getContainerCoordinates(
        e.clientX,
        e.clientY
      );

      setCurrentPos(point);
    };

    const onUp = (e: MouseEvent) => {
      if (!startPos || !targetImg || targetPage === null) return;
      e.preventDefault();
      setDragging(false);

      const endPos = getContainerCoordinates(
        e.clientX,
        e.clientY
      );

      const imgRect = targetImg.getBoundingClientRect();
      const containerRect = scrollRef.current!.getBoundingClientRect();

      const imageLeft =
        imgRect.left - containerRect.left;

      const imageTop =
        imgRect.top -
        containerRect.top +
        scrollRef.current!.scrollTop;


      const scaleX = targetImg.naturalWidth / imgRect.width;
      const scaleY = targetImg.naturalHeight / imgRect.height;

      const x1 = (startPos.x - imageLeft) * scaleX;
      const y1 = (startPos.y - imageTop) * scaleY;

      const x2 = (endPos.x - imageLeft) * scaleX;
      const y2 = (endPos.y - imageTop) * scaleY;

      const clamp = (val: number, max: number) => Math.max(0, Math.min(val, max));
      const cx1 = clamp(Math.min(x1, x2), targetImg.naturalWidth);
      const cy1 = clamp(Math.min(y1, y2), targetImg.naturalHeight);
      const cx2 = clamp(Math.max(x1, x2), targetImg.naturalWidth);
      const cy2 = clamp(Math.max(y1, y2), targetImg.naturalHeight);

      const width = cx2 - cx1;
      const height = cy2 - cy1;

      if (width < 10 || height < 10) {
        setStartPos(null);
        setCurrentPos(null);
        return;
      }

      const cropRect: CropRect = {
        x1: cx1, y1: cy1,
        x2: cx2, y2: cy2,
        width, height,
        pageIndex: targetPage,
      };

      const originX = Math.min(cx1, cx2);
      const originY = Math.min(cy1, cy2);

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        const safeImg = safeImageRefs.get(targetPage);
        if (!safeImg) return;

        ctx.drawImage(safeImg, originX, originY, width, height, 0, 0, width, height);
        const base64 = canvas.toDataURL("image/png");
        onSelect(cropRect, base64, targetPage);
      }

      setStartPos(null);
      setCurrentPos(null);
      setTargetPage(null);
      setTargetImg(null);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);

    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, startPos, targetImg, targetPage, onSelect, safeImageRefs]);

  // ── Selection rectangle (screen coords) ────────────────────
  const selectionStyle = (): React.CSSProperties | null => {
    if (!dragging || !startPos || !currentPos || !overlayRef.current) return null;

    const left = Math.min(
      startPos.x,
      currentPos.x
    );

    const top = Math.min(
      startPos.y,
      currentPos.y
    );
    const width = Math.abs(currentPos.x - startPos.x);
    const height = Math.abs(currentPos.y - startPos.y);

    return {
      position: "absolute",
      left,
      top,
      width,
      height,
      border: "2px dashed #6366f1",
      backgroundColor: "rgba(99, 102, 241, 0.08)",
      borderRadius: 4,
      pointerEvents: "none",
      zIndex: 20,
    };
  };

  if (!active) return null;

  const rectStyle = selectionStyle();

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-10"
      style={{ height: scrollRef.current?.scrollHeight ?? "100%", cursor: "crosshair" }}
      onMouseDown={handleMouseDown}
    >
      {/* Dim overlay */}
      <div className="absolute inset-0 bg-black/10 pointer-events-none"
        style={{
          height: scrollRef.current?.scrollHeight ?? "100%",
        }} />

      {/* Hint text */}
      {!dragging && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-white/95 backdrop-blur-sm border border-gray-200 rounded-lg px-4 py-2 shadow-sm">
          <p className="text-xs font-medium text-gray-700 text-center">
            Drag to select answer region
          </p>
          <p className="text-[10px] text-gray-400 text-center mt-0.5">
            ESC to cancel
          </p>
        </div>
      )}

      {/* Selection rectangle */}
      {rectStyle && <div style={rectStyle} />}
    </div>
  );
}