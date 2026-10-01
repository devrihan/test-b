import { useState, useCallback, useRef } from "react";
import { Question, Region, MarkMode } from "../types";

/** `onEdit` fires on every change the operator makes; the section timer starts on the first one. */
export function useMarking(onEdit?: () => void) {

  // ── State ──────────────────────────────────────────────
  const [questions, setQuestions] = useState<Question[]>([]);
  const [activeQId, setActiveQId] = useState<number | null>(null);
  const [markMode, setMarkMode] = useState<MarkMode>(null);
  const [dragRect, setDragRect] = useState<{
    absX1: number; absY1: number;
    absX2: number; absY2: number;
  } | null>(null);

  // ── Refs (for event handlers — avoid stale closures) ───
  const questionsRef = useRef<Question[]>([]);
  const activeQIdRef = useRef<number | null>(null);
  const markModeRef = useRef<MarkMode>(null);
  const isDraggingRef = useRef(false);
  const onEditRef = useRef(onEdit);
  onEditRef.current = onEdit;
  const dragStartRef = useRef<{ absX: number; absY: number } | null>(null);

  // ── Keep refs in sync with state ───────────────────────
  const updateMarkMode = useCallback((mode: MarkMode) => {
    markModeRef.current = mode;
    setMarkMode(mode);
  }, []);

  const updateActiveQId = useCallback((id: number | null) => {
    activeQIdRef.current = id;
    setActiveQId(id);
  }, []);

  // ── Generate unique region ID ───────────────────────────
  const generateRegionId = () =>
    `r_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  // ── Initialise empty questions ──────────────────────────
  const initQuestions = useCallback((n: number, questionKeys?: string[],) => {
    const qs: Question[] = questionKeys && questionKeys.length > 0
      ? questionKeys.map((key, i) => {
        const countSoFar = questionKeys.slice(0, i).filter(k => k === key).length;
        const uniqueKey = countSoFar > 0 ? `${key}_OR_${countSoFar}` : key;
        return {
          id: i + 1,
          questionKey: uniqueKey,
          source: "manual",
          verified: false,
          verifiedBy: null,
          regions: [],
          isNa: false,
          isOrQuestion: countSoFar > 0,
          maxMarks: null,
        };
      })
      : Array.from({ length: n }, (_, i) => ({
        id: i + 1,
        questionKey: `${i + 1}`,
        source: "manual",
        verified: false,
        verifiedBy: null,
        regions: [],
        isNa: false,
        isOrQuestion: false,
        maxMarks: null,
      }));
    questionsRef.current = qs;
    setQuestions(qs);
    updateActiveQId(null);
    updateMarkMode(null);
  }, [updateActiveQId, updateMarkMode]);

  // ── Initialise empty questions with DB details ──────────
  const initQuestionsWithDb = useCallback((dbItems: { questionKey: string; isOptional?: boolean; questionText?: string; maxMarks?: number | null }[]) => {
    const qs: Question[] = dbItems.map((item, i) => {
      const key = item.questionKey;
      const countSoFar = dbItems.slice(0, i).filter(d => d.questionKey === key).length;
      const uniqueKey = countSoFar > 0 ? `${key}_OR_${countSoFar}` : key;
      return {
        id: i + 1,
        questionKey: uniqueKey,
        source: "manual",
        verified: false,
        verifiedBy: null,
        regions: [],
        isNa: false,
        isOrQuestion: countSoFar > 0,
        questionText: item.questionText,
        isOptional: item.isOptional ?? false,
        maxMarks: item.maxMarks ?? null,
      };
    });
    questionsRef.current = qs;
    setQuestions(qs);
    updateActiveQId(null);
    updateMarkMode(null);
  }, [updateActiveQId, updateMarkMode]);

  // ── Load regions from backend ───────────────────────────
  // Called when teacher opens a student that already has AI boxes
  const loadFromBackend = useCallback((
    backendChunks: {
      question_key: string;
      source: "ai" | "manual";
      verified: boolean;
      verified_by: string | null;
      regions: {
        region_id: string;
        img_id: string;
        order: number;
        confidence: number | null;
        source?: "ai" | "manual";
        bbox: {
          x1: number; y1: number;
          x2: number; y2: number;
        };
      }[];
    }[],
    pageOffsets: number[],
    pageHeights: number[],
    pageWidths: number[],
    pageLefts: number[],
    imgIdToIndex: Map<string, number>,
  ) => {
    setQuestions(prev => {
      if (!backendChunks || backendChunks.length === 0) {
        return prev;
      }

      // Sort chunks logically so that numbers order correctly (e.g., 2 before 10)
      const sortedChunks = [...backendChunks].sort((a, b) => {
        const numA = parseFloat(a.question_key.replace(/[^0-9.]/g, ''));
        const numB = parseFloat(b.question_key.replace(/[^0-9.]/g, ''));
        if (!isNaN(numA) && !isNaN(numB) && numA !== numB) {
          return numA - numB;
        }
        return a.question_key.localeCompare(b.question_key);
      });

      const next: Question[] = prev.map((q, index) => {
        // Try to find the corresponding chunk by matching the key.
        // If lengths match and we cannot find it by key, we can fall back to the index.
        let chunk = sortedChunks.find(c => {
          const pkStr = String(q.questionKey).toUpperCase().replace(/[^0-9.]/g, '');
          const ckStr = String(c.question_key).toUpperCase().replace(/[^0-9.]/g, '');
          if (pkStr && ckStr) return pkStr === ckStr;
          return String(q.questionKey).toUpperCase() === String(c.question_key).toUpperCase();
        });

        if (!chunk && sortedChunks.length === prev.length) {
          chunk = sortedChunks[index];
        }

        if (!chunk) return q;

        const regions: Region[] = chunk.regions.map(r => {
          const pageIndex = imgIdToIndex.get(r.img_id) ?? 0;
          const pH = pageHeights[pageIndex];
          const pW = pageWidths[pageIndex];
          const pO = pageOffsets[pageIndex];
          const pageLeft = pageLefts[pageIndex] ?? 0;

          return {
            regionId: r.region_id,
            imgId: r.img_id,
            order: r.order,
            source: r.source ?? chunk.source,
            confidence: r.confidence,
            x1Ratio: r.bbox.x1,
            y1Ratio: r.bbox.y1,
            x2Ratio: r.bbox.x2,
            y2Ratio: r.bbox.y2,
            absX1: r.bbox.x1 * pW + pageLeft,
            absY1: r.bbox.y1 * pH + pO,
            absX2: r.bbox.x2 * pW + pageLeft,
            absY2: r.bbox.y2 * pH + pO,
          };
        });

        return {
          ...q,
          source: chunk.source,
          verified: chunk.verified,
          verifiedBy: chunk.verified_by,
          regions,
          isNa: chunk.verified && chunk.regions.length === 0,
        };
      });

      questionsRef.current = next;
      return next;
    });
  }, []);

  // ── Set Question Texts from API ─────────────────────────
  const setQuestionTexts = useCallback((texts: Record<string, string>) => {
    setQuestions(prev => {
      const next = prev.map(q => {
        // Strip non-numeric/dot characters for matching (e.g. Q35.2 -> 35.2, 5_OR_1 -> 5)
        const cleanKeyStr = q.questionKey.toUpperCase().replace(/[^0-9.]/g, '');
        const keyNum = parseFloat(cleanKeyStr);
        // Find the best match: Exact match by questionKey or numeric match
        const matchingText = texts[q.questionKey] || texts[keyNum.toString()];

        if (matchingText && matchingText !== q.questionText) {
          return { ...q, questionText: matchingText };
        }
        return q;
      });
      questionsRef.current = next;
      return next;
    });
  }, []);

  // ── Mouse down — start drag ─────────────────────────────
  const handleMouseDown = useCallback((
    absX: number,
    absY: number,
  ) => {
    if (!markModeRef.current || activeQIdRef.current === null) return;
    onEditRef.current?.();
    isDraggingRef.current = true;
    dragStartRef.current = { absX, absY };
    setDragRect({ absX1: absX, absY1: absY, absX2: absX, absY2: absY });
  }, []);

  // ── Mouse move — update live rectangle ─────────────────
  const handleMouseMove = useCallback((
    absX: number,
    absY: number,
  ) => {
    if (!isDraggingRef.current || !dragStartRef.current) return;
    const { absX: sx, absY: sy } = dragStartRef.current;
    setDragRect({
      absX1: Math.min(sx, absX), absY1: Math.min(sy, absY),
      absX2: Math.max(sx, absX), absY2: Math.max(sy, absY),
    });
  }, []);

  // ── Mouse up — save rectangle as new region ─────────────
  const handleMouseUp = useCallback((
    absX: number,
    absY: number,
    findPage: (absX: number, absY: number) => {
      pageIndex: number;
      imgId: string;
      xRatio: number;
      yRatio: number;
    } | null,
    pageWidths: number[],
    pageHeights: number[],
    pageOffsets: number[],
    pageLefts: number[],
    onToast: (t: "success" | "error" | "info", m: string) => void,
    onTick: () => void,
  ) => {
    if (!isDraggingRef.current || !dragStartRef.current) return;
    isDraggingRef.current = false;

    const start = dragStartRef.current;
    dragStartRef.current = null;

    const x1abs = Math.min(start.absX, absX);
    const y1abs = Math.min(start.absY, absY);
    const x2abs = Math.max(start.absX, absX);
    const y2abs = Math.max(start.absY, absY);

    // Ignore tiny accidental clicks
    if ((x2abs - x1abs) < 10 || (y2abs - y1abs) < 10) {
      setDragRect(null);
      return;
    }

    const hit = findPage(x1abs, y1abs);
    if (!hit) { setDragRect(null); return; }

    const qId = activeQIdRef.current!;
    const qi = qId - 1;

    // Calculate ratios
    const pageW = pageWidths[hit.pageIndex];
    const pageH = pageHeights[hit.pageIndex];
    const pageTop = pageOffsets[hit.pageIndex];
    const pageLeft = pageLefts[hit.pageIndex] ?? 0;

    const x1Ratio = Math.max(0, Math.min(1, (x1abs - pageLeft) / pageW));
    const y1Ratio = Math.max(0, Math.min(1,
      (y1abs - pageTop) / pageH
    ));
    const x2Ratio = Math.max(0, Math.min(1, (x2abs - pageLeft) / pageW));
    const y2Ratio = Math.max(0, Math.min(1,
      (y2abs - pageTop) / pageH
    ));

    // Build new region
    const newRegion: Region = {
      regionId: generateRegionId(),
      imgId: hit.imgId,
      order: (questionsRef.current[qi]?.regions.length ?? 0) + 1,
      source: "manual",
      confidence: null,
      x1Ratio, y1Ratio,
      x2Ratio, y2Ratio,
      absX1: x1Ratio * pageW + pageLeft,
      absY1: y1Ratio * pageH + pageTop,
      absX2: x2Ratio * pageW + pageLeft,
      absY2: y2Ratio * pageH + pageTop,
    };

    setQuestions(prev => {
      const next = [...prev];
      const q = { ...next[qi] };
      q.regions = [...q.regions, newRegion];
      q.isNa = false;
      q.verified = true;  // Auto-verify when manually drawn
      next[qi] = q;
      questionsRef.current = next;

      onToast(
        "success",
        `${qId} region ${q.regions.length} added!`
      );
      return next;
    });

    setDragRect(null);
    updateMarkMode(null);
    onTick();
  }, [updateMarkMode]);

  // ── Delete one specific region ──────────────────────────
  const deleteRegion = useCallback((
    qId: number,
    regionId: string,
    onTick: () => void,
  ) => {
    onEditRef.current?.();
    setQuestions(prev => {
      const next = [...prev];
      const q = { ...next[qId - 1] };

      // Remove region and re-number order
      q.regions = q.regions
        .filter(r => r.regionId !== regionId)
        .map((r, i) => ({ ...r, order: i + 1 }));

      next[qId - 1] = q;
      questionsRef.current = next;
      return next;
    });
    onTick();
  }, []);


  // ── Resize / reposition a region ──────────────────────
  const updateRegionPosition = useCallback((
    qId: number,
    regionId: string,
    newRatios: { x1Ratio: number; y1Ratio: number; x2Ratio: number; y2Ratio: number },
    pageOffsets: number[],
    pageHeights: number[],
    pageWidths: number[],
    pageLefts: number[],
    imgIdToIndex: Map<string, number>,
    onTick: () => void,
  ) => {
    onEditRef.current?.();
    setQuestions(prev => {
      const next = [...prev];
      const qi = qId - 1;
      const q = { ...next[qi] };
      q.regions = q.regions.map(r => {
        if (r.regionId !== regionId) return r;

        const pi = imgIdToIndex.get(r.imgId) ?? 0;
        const pH = pageHeights[pi];
        const pW = pageWidths[pi];
        const pO = pageOffsets[pi];
        const pL = pageLefts[pi] ?? 0;

        // Clamp ratios to [0, 1]
        const x1 = Math.max(0, Math.min(1, newRatios.x1Ratio));
        const y1 = Math.max(0, Math.min(1, newRatios.y1Ratio));
        const x2 = Math.max(0, Math.min(1, newRatios.x2Ratio));
        const y2 = Math.max(0, Math.min(1, newRatios.y2Ratio));

        return {
          ...r,
          x1Ratio: Math.min(x1, x2),
          y1Ratio: Math.min(y1, y2),
          x2Ratio: Math.max(x1, x2),
          y2Ratio: Math.max(y1, y2),
          absX1: Math.min(x1, x2) * pW + pL,
          absY1: Math.min(y1, y2) * pH + pO,
          absX2: Math.max(x1, x2) * pW + pL,
          absY2: Math.max(y1, y2) * pH + pO,
        };
      });

      // Mark as manually edited and unverify since geometry changed
      q.verified = false;
      q.verifiedBy = null;

      next[qi] = q;
      questionsRef.current = next;
      return next;
    });
    onTick();
  }, []);

  // ── Move a region to new absolute position ────────────
  const moveRegion = useCallback((
    qId: number,
    regionId: string,
    newX1Ratio: number,
    newY1Ratio: number,
    pageOffsets: number[],
    pageHeights: number[],
    pageWidths: number[],
    pageLefts: number[],
    imgIdToIndex: Map<string, number>,
    onTick: () => void,
  ) => {
    onEditRef.current?.();
    setQuestions(prev => {
      const next = [...prev];
      const qi = qId - 1;
      const q = { ...next[qi] };
      q.regions = q.regions.map(r => {
        if (r.regionId !== regionId) return r;

        const pi = imgIdToIndex.get(r.imgId) ?? 0;
        const pH = pageHeights[pi];
        const pW = pageWidths[pi];
        const pO = pageOffsets[pi];
        const pL = pageLefts[pi] ?? 0;

        const w = r.x2Ratio - r.x1Ratio;
        const h = r.y2Ratio - r.y1Ratio;

        let x1 = Math.max(0, Math.min(1 - w, newX1Ratio));
        let y1 = Math.max(0, Math.min(1 - h, newY1Ratio));

        return {
          ...r,
          x1Ratio: x1, y1Ratio: y1,
          x2Ratio: x1 + w, y2Ratio: y1 + h,
          absX1: x1 * pW + pL, absY1: y1 * pH + pO,
          absX2: (x1 + w) * pW + pL, absY2: (y1 + h) * pH + pO,
        };
      });

      q.verified = false;
      q.verifiedBy = null;
      next[qi] = q;
      questionsRef.current = next;
      return next;
    });
    onTick();
  }, []);



  // ── Clear all regions for one question ──────────────────
  const clearQuestion = useCallback((
    qId: number,
    onTick: () => void,
  ) => {
    onEditRef.current?.();
    setQuestions(prev => {
      const next = [...prev];
      next[qId - 1] = { ...next[qId - 1], regions: [], verified: false, isNa: false };
      questionsRef.current = next;
      return next;
    });
    onTick();
  }, []);

  // ── Clear all questions ─────────────────────────────────
  const clearAll = useCallback((onTick: () => void) => {
    setQuestions(prev => {
      const next = prev.map(q => ({
        ...q, regions: [], verified: false, verifiedBy: null, isNa: false,
      }));
      questionsRef.current = next;
      return next;
    });
    updateActiveQId(null);
    updateMarkMode(null);
    onTick();
  }, [updateActiveQId, updateMarkMode]);

  // ── Set question as NA ──────────────────────────────────
  const setQuestionNa = useCallback((
    qId: number,
    onTick: () => void,
  ) => {
    onEditRef.current?.();
    setQuestions(prev => {
      const next = [...prev];
      next[qId - 1] = { ...next[qId - 1], regions: [], verified: true, isNa: true };
      questionsRef.current = next;
      return next;
    });
    onTick();
  }, []);

  // ── Fill remaining empty questions as NA ────────────────
  const fillRemainingNa = useCallback((onTick: () => void) => {
    onEditRef.current?.();
    setQuestions(prev => {
      const next = prev.map(q => {
        if (q.regions.length === 0) {
          return { ...q, verified: true, isNa: true };
        }
        return q;
      });
      questionsRef.current = next;
      return next;
    });
    onTick();
  }, []);

  // ── Mark question as verified ───────────────────────────
  const verifyQuestion = useCallback((
    qId: number,
    by: string,
  ) => {
    onEditRef.current?.();
    setQuestions(prev => {
      const next = [...prev];
      next[qId - 1] = {
        ...next[qId - 1],
        verified: true,
        verifiedBy: by,
      };
      questionsRef.current = next;
      return next;
    });
  }, []);

  // ── Mark Unverify question──────
  const unverifyQuestion = useCallback((qId: number) => {
    onEditRef.current?.();
    setQuestions(prev => {
      const next = [...prev];
      next[qId - 1] = { ...next[qId - 1], verified: false, verifiedBy: null };
      questionsRef.current = next;
      return next;
    });
  }, []);

  // ── Recalculate abs values after screen resize ──────────
  const recalcAbsValues = useCallback((
    pageOffsets: number[],
    pageHeights: number[],
    pageWidths: number[],
    pageLefts: number[],
    imgIdToIndex: Map<string, number>,
  ) => {
    setQuestions(prev => {
      const next = prev.map(q => ({
        ...q,
        regions: q.regions.map(r => {
          const pi = imgIdToIndex.get(r.imgId) ?? 0;
          const pH = pageHeights[pi];
          const pW = pageWidths[pi];
          const pO = pageOffsets[pi];
          const pageLeft = pageLefts[pi] ?? 0;
          return {
            ...r,
            absX1: r.x1Ratio * pW + pageLeft,
            absY1: r.y1Ratio * pH + pO,
            absX2: r.x2Ratio * pW + pageLeft,
            absY2: r.y2Ratio * pH + pO,
          };
        }),
      }));
      questionsRef.current = next;
      return next;
    });
  }, []);

  // ── Rotate bounding boxes mathematically ────────────────
  const rotateBBoxes = useCallback((
    imgId: string,
    direction: "cw" | "ccw"
  ) => {
    setQuestions(prev => {
      const next = prev.map(q => ({
        ...q,
        regions: q.regions.map(r => {
          if (r.imgId !== imgId) return r;

          if (direction === "cw") {
            return {
              ...r,
              x1Ratio: 1 - r.y2Ratio,
              y1Ratio: r.x1Ratio,
              x2Ratio: 1 - r.y1Ratio,
              y2Ratio: r.x2Ratio,
            };
          } else {
            return {
              ...r,
              x1Ratio: r.y1Ratio,
              y1Ratio: 1 - r.x2Ratio,
              x2Ratio: r.y2Ratio,
              y2Ratio: 1 - r.x1Ratio,
            };
          }
        }),
      }));
      questionsRef.current = next;
      return next;
    });
  }, []);

  return {
    questions,
    setQuestions,
    activeQId,
    markMode,
    dragRect,
    questionsRef,
    activeQIdRef,
    markModeRef,
    initQuestions,
    initQuestionsWithDb,
    loadFromBackend,
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    deleteRegion,
    clearQuestion,
    clearAll,
    verifyQuestion,
    unverifyQuestion,
    recalcAbsValues,
    rotateBBoxes,
    setQuestionNa,
    fillRemainingNa,
    setMarkMode: updateMarkMode,
    setActiveQId: updateActiveQId,
    setQuestionTexts,
    updateRegionPosition,
    moveRegion,
  };
}
