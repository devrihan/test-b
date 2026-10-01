import { useState, useEffect, useCallback, useRef } from "react";
import { Question } from "../types";
import { getQuestionColor } from "../constants";

type HandlePosition = "nw" | "ne" | "sw" | "se" | "n" | "s" | "e" | "w";

const HANDLE_SIZE = 10;

const HANDLE_CURSORS: Record<HandlePosition, string> = {
  nw: "nwse-resize", ne: "nesw-resize",
  sw: "nesw-resize", se: "nwse-resize",
  n: "ns-resize", s: "ns-resize",
  e: "ew-resize", w: "ew-resize",
};

type ResizeDragState = {
  qId: number;
  regionId: string;
  handle: HandlePosition;
  startX1: number; startY1: number;
  startX2: number; startY2: number;
  mouseStartX: number; mouseStartY: number;
  pageIndex: number;
  pageWidth: number; pageHeight: number;
  pageOffset: number; pageLeft: number;
};

type MoveDragState = {
  qId: number;
  regionId: string;
  mouseStartX: number;
  mouseStartY: number;
  startX1: number;
  startY1: number;
  pageWidth: number;
  pageHeight: number;
};

type Props = {
  questions: Question[];
  renderTick: number;
  dragRect: {
    absX1: number; absY1: number;
    absX2: number; absY2: number;
  } | null;
  activeQId: number | null;
  onDeleteRegion?: (qId: number, regionId: string) => void;
  // New props for resize
  onUpdateRegionPosition?: (
    qId: number,
    regionId: string,
    newRatios: { x1Ratio: number; y1Ratio: number; x2Ratio: number; y2Ratio: number },
  ) => void;
  pageWidths?: number[];
  pageHeights?: number[];
  pageOffsets?: number[];
  pageLefts?: number[];
  imgIdToIndex?: Map<string, number>;
  scrollContainerRef?: React.RefObject<HTMLDivElement | null>;
  onVerifyQuestion?: (qId: number) => void;
  onSelectQuestion?: (qId: number) => void;
  onMoveRegion?: (
    qId: number,
    regionId: string,
    dxRatio: number,
    dyRatio: number,
  ) => void;
};

export default function MarkerOverlays({
  questions,
  renderTick,
  dragRect,
  activeQId,
  onDeleteRegion,
  onUpdateRegionPosition,
  pageWidths,
  pageHeights,
  pageOffsets,
  pageLefts,
  imgIdToIndex,
  scrollContainerRef,
  onMoveRegion,
  onVerifyQuestion,
  onSelectQuestion,
}: Props) {

  const [resizeDrag, setResizeDrag] = useState<ResizeDragState | null>(null);
  const [resizeActiveRegion, setResizeActiveRegion] = useState<string | null>(null);
  const resizeDragRef = useRef<ResizeDragState | null>(null);
  resizeDragRef.current = resizeDrag;

  const [moveDrag, setMoveDrag] = useState<MoveDragState | null>(null);
  const moveDragRef = useRef<MoveDragState | null>(null);
  moveDragRef.current = moveDrag;

  const didMoveRef = useRef(false);
  const clickHandledTimestamp = useRef(0);

  const intentionalResizeRef = useRef<string | null>(null);

  useEffect(() => {
    if (intentionalResizeRef.current) {
      setResizeActiveRegion(intentionalResizeRef.current);
      intentionalResizeRef.current = null;
    } else {
      setResizeActiveRegion(null);
    }
  }, [activeQId]);


  const prevResizeRef = useRef<{ regionId: string; qId: number } | null>(null);

  useEffect(() => {
    if (prevResizeRef.current && !resizeActiveRegion) {
      if (onVerifyQuestion) onVerifyQuestion(prevResizeRef.current.qId);
    }
    if (resizeActiveRegion) {
      const q = questions.find(q => q.regions.some(r => r.regionId === resizeActiveRegion));
      if (q) prevResizeRef.current = { regionId: resizeActiveRegion, qId: q.id };
    } else {
      prevResizeRef.current = null;
    }
  }, [resizeActiveRegion, questions, onVerifyQuestion]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setResizeActiveRegion(null);
      if ((e.key === "Delete" || e.key === "Backspace") && resizeActiveRegion && onDeleteRegion && activeQId) {
        e.preventDefault();
        onDeleteRegion(activeQId, resizeActiveRegion);
        setResizeActiveRegion(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [resizeActiveRegion, onDeleteRegion, activeQId]);

  const onUp = () => setResizeDrag(null);

  const handleResizeStart = useCallback((
    e: React.MouseEvent,
    qId: number,
    region: { regionId: string; imgId: string; x1Ratio: number; y1Ratio: number; x2Ratio: number; y2Ratio: number },
    handle: HandlePosition,
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (!pageWidths || !pageHeights || !pageOffsets || !pageLefts || !imgIdToIndex) return;
    const pi = imgIdToIndex.get(region.imgId) ?? 0;
    const scroll = scrollContainerRef?.current;
    if (!scroll) return;
    const rect = scroll.getBoundingClientRect();
    const absX = e.clientX - rect.left + scroll.scrollLeft;
    const absY = e.clientY - rect.top + scroll.scrollTop - 44;
    setResizeDrag({
      qId, regionId: region.regionId, handle,
      startX1: region.x1Ratio, startY1: region.y1Ratio,
      startX2: region.x2Ratio, startY2: region.y2Ratio,
      mouseStartX: absX, mouseStartY: absY,
      pageIndex: pi, pageWidth: pageWidths[pi], pageHeight: pageHeights[pi],
      pageOffset: pageOffsets[pi], pageLeft: pageLefts[pi] ?? 0,
    });
  }, [pageWidths, pageHeights, pageOffsets, pageLefts, imgIdToIndex, scrollContainerRef]);

  useEffect(() => {
    if (!resizeDrag) return;
    const onMove = (e: MouseEvent) => {
      const drag = resizeDragRef.current;
      if (!drag || !onUpdateRegionPosition) return;
      const scroll = scrollContainerRef?.current;
      if (!scroll) return;
      const rect = scroll.getBoundingClientRect();
      const absX = e.clientX - rect.left + scroll.scrollLeft;
      const absY = e.clientY - rect.top + scroll.scrollTop - 44;
      const dxRatio = (absX - drag.mouseStartX) / drag.pageWidth;
      const dyRatio = (absY - drag.mouseStartY) / drag.pageHeight;
      let { startX1: x1, startY1: y1, startX2: x2, startY2: y2 } = drag;
      switch (drag.handle) {
        case "nw": x1 += dxRatio; y1 += dyRatio; break;
        case "ne": x2 += dxRatio; y1 += dyRatio; break;
        case "sw": x1 += dxRatio; y2 += dyRatio; break;
        case "se": x2 += dxRatio; y2 += dyRatio; break;
        case "n": y1 += dyRatio; break;
        case "s": y2 += dyRatio; break;
        case "w": x1 += dxRatio; break;
        case "e": x2 += dxRatio; break;
      }
      const minRatio = 10 / Math.max(drag.pageWidth, drag.pageHeight);
      if (x2 - x1 < minRatio) { if (drag.handle.includes("w")) x1 = x2 - minRatio; else x2 = x1 + minRatio; }
      if (y2 - y1 < minRatio) { if (drag.handle.includes("n")) y1 = y2 - minRatio; else y2 = y1 + minRatio; }
      onUpdateRegionPosition(drag.qId, drag.regionId, { x1Ratio: x1, y1Ratio: y1, x2Ratio: x2, y2Ratio: y2 });
    };
    const onUp = () => setResizeDrag(null);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => { document.removeEventListener("mousemove", onMove); document.removeEventListener("mouseup", onUp); };
  }, [resizeDrag, onUpdateRegionPosition, scrollContainerRef]);

  const handleMoveStart = useCallback((
    e: React.MouseEvent,
    qId: number,
    region: { regionId: string; imgId: string; x1Ratio: number; y1Ratio: number },
  ) => {
    e.stopPropagation();
    e.preventDefault();
    if (!pageWidths || !pageHeights || !pageOffsets || !pageLefts || !imgIdToIndex) return;
    const pi = imgIdToIndex.get(region.imgId) ?? 0;
    const scroll = scrollContainerRef?.current;
    if (!scroll) return;
    const rect = scroll.getBoundingClientRect();
    didMoveRef.current = false;
    setMoveDrag({
      qId, regionId: region.regionId,
      mouseStartX: e.clientX - rect.left + scroll.scrollLeft,
      mouseStartY: e.clientY - rect.top + scroll.scrollTop - 44,
      startX1: region.x1Ratio, startY1: region.y1Ratio,
      pageWidth: pageWidths[pi], pageHeight: pageHeights[pi],
    });
  }, [pageWidths, pageHeights, pageOffsets, pageLefts, imgIdToIndex, scrollContainerRef]);

  useEffect(() => {
    if (!moveDrag) return;
    const onMove = (e: MouseEvent) => {
      didMoveRef.current = true;
      const drag = moveDragRef.current;
      if (!drag || !onMoveRegion) return;
      const scroll = scrollContainerRef?.current;
      if (!scroll) return;
      const rect = scroll.getBoundingClientRect();
      const absX = e.clientX - rect.left + scroll.scrollLeft;
      const absY = e.clientY - rect.top + scroll.scrollTop - 44;
      onMoveRegion(drag.qId, drag.regionId,
        drag.startX1 + (absX - drag.mouseStartX) / drag.pageWidth,
        drag.startY1 + (absY - drag.mouseStartY) / drag.pageHeight,
      );
    };
    const onUp = () => setMoveDrag(null);
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    return () => {
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
  }, [moveDrag, onMoveRegion, scrollContainerRef]);


  const handles: HandlePosition[] = ["nw", "ne", "sw", "se", "n", "s", "e", "w"];

  const getHandleStyle = (
    handle: HandlePosition, absX1: number, absY1: number, absX2: number, absY2: number,
  ): React.CSSProperties => {
    const w = absX2 - absX1;
    const h = absY2 - absY1;
    const half = HANDLE_SIZE / 2;
    let left = 0, top = 0;
    switch (handle) {
      case "nw": left = absX1 - half; top = absY1 - half; break;
      case "ne": left = absX2 - half; top = absY1 - half; break;
      case "sw": left = absX1 - half; top = absY2 - half; break;
      case "se": left = absX2 - half; top = absY2 - half; break;
      case "n": left = absX1 + w / 2 - half; top = absY1 - half; break;
      case "s": left = absX1 + w / 2 - half; top = absY2 - half; break;
      case "w": left = absX1 - half; top = absY1 + h / 2 - half; break;
      case "e": left = absX2 - half; top = absY1 + h / 2 - half; break;
    }
    return {
      position: "absolute", left, top,
      width: HANDLE_SIZE, height: HANDLE_SIZE,
      background: "#fff", border: "2px solid #6366f1",
      borderRadius: 2, cursor: HANDLE_CURSORS[handle],
      pointerEvents: "auto", zIndex: 35,
    };
  };


  return (
    <>
      {/* ── Saved question regions ── */}
      {questions.map((q, qi) => {
        const c = getQuestionColor(qi);
        const isActive = activeQId === q.id;

        return (
          <div
            key={`overlay-${q.id}-${renderTick}`}
            style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
          >
            {q.regions.map((region, ri) => (
              <div key={`${qi}-${ri}`}>

                {/* Rectangle — click to select and resize */}
                <div
                  onClick={(e) => {
                    if (didMoveRef.current) { didMoveRef.current = false; return; }
                    const now = e.timeStamp;
                    if (now - clickHandledTimestamp.current < 50) return;
                    clickHandledTimestamp.current = now;
                    e.stopPropagation();
                    intentionalResizeRef.current = region.regionId;
                    if (onSelectQuestion) onSelectQuestion(q.id);
                    setResizeActiveRegion(region.regionId);
                  }}
                  onMouseDown={(e) => {
                    if (resizeActiveRegion === region.regionId && onMoveRegion) {
                      handleMoveStart(e, q.id, region);
                    }
                  }}
                  style={{
                    position: "absolute",
                    left: region.absX1,
                    top: region.absY1,
                    width: region.absX2 - region.absX1,
                    height: region.absY2 - region.absY1,
                    border: `2px solid ${c}`,
                    background: isActive ? `${c}30` : `${c}18`,
                    borderRadius: 3,
                    zIndex: 10,
                    outline: resizeActiveRegion === region.regionId ? `3px solid #6366f1` : isActive ? `3px solid ${c}55` : "none",
                    pointerEvents: "auto",
                    cursor: resizeActiveRegion === region.regionId ? "grab" : "pointer",
                  }}
                />

                {/* Order badge */}
                <div style={{
                  position: "absolute",
                  left: region.absX1,
                  top: region.absY1 - 20,
                  background: c,
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 700,
                  fontFamily: "monospace",
                  padding: "1px 7px",
                  borderRadius: 3,
                  whiteSpace: "nowrap",
                  zIndex: 20,
                  pointerEvents: "none",
                }}>
                  {q.questionKey.replace(/^q/i, "").split("_OR_")[0]} · r{region.order}
                  {region.source === "ai" && (
                    <span style={{
                      marginLeft: 4,
                      opacity: 0.8,
                      fontSize: 9,
                    }}>
                      AI {region.confidence !== null
                        ? `${Math.round(region.confidence * 100)}%`
                        : ""}
                    </span>
                  )}
                </div>

                {/* Resize handles — only when this region is in resize mode */}
                {resizeActiveRegion === region.regionId && onUpdateRegionPosition && (
                  <>
                    {handles.map(h => (
                      <div
                        key={`handle-${h}`}
                        style={getHandleStyle(h, region.absX1, region.absY1, region.absX2, region.absY2)}
                        onMouseDown={(e) => handleResizeStart(e, q.id, region, h)}
                      />
                    ))}
                  </>
                )}

                {/* Unverified indicator — small dot on top right */}
                {region.source === "ai" && !q.verified && (
                  <div style={{
                    position: "absolute",
                    left: region.absX2 - 15,
                    top: region.absY1 - 8,
                    width: 10,
                    height: 10,
                    borderRadius: "50%",
                    background: "#f59e0b",
                    border: "2px solid #fff",
                    zIndex: 30,
                  }} />
                )}

              </div>
            ))}
          </div>
        );
      })}

      {/* ── Live drag rectangle ── */}
      {dragRect && (
        <div style={{
          position: "absolute",
          left: dragRect.absX1,
          top: dragRect.absY1,
          width: Math.max(dragRect.absX2 - dragRect.absX1, 0),
          height: Math.max(dragRect.absY2 - dragRect.absY1, 0),
          border: "2px dashed #6366f1",
          background: "rgba(99,102,241,.08)",
          borderRadius: 3,
          pointerEvents: "none",
          zIndex: 30,
        }} />
      )}
    </>
  );
}
