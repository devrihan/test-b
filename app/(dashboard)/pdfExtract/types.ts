/** A single mark placed on the PDF — now a full rectangle, not just Y */
export type Region = {
  regionId: string;      // "r1", "r2", "r3"
  imgId: string;      // "img_001"
  order: number;      // 1, 2, 3, 4
  confidence: number | null;
  source: "ai" | "manual";

  // Bbox ratios — permanent truth
  x1Ratio: number;
  y1Ratio: number;
  x2Ratio: number;
  y2Ratio: number;

  // Abs values — for display only
  absX1: number;
  absY1: number;
  absX2: number;
  absY2: number;
};

// ── One question with its regions ─────────────────────────
export type Question = {
  id: number;
  questionKey: string;
  source: "ai" | "manual";
  verified: boolean;
  verifiedBy: string | null;
  regions: Region[];
  isNa: boolean;
  isOrQuestion: boolean;
  questionText?: string;
  isOptional?: boolean;
  maxMarks?: number | null;
};

/** Marking state machine */
export type MarkMode = "drawing" | null;

/** Toast notification */
export type ToastType = "success" | "error" | "info";

export type ToastPayload = {
  msg: string;
  type: ToastType;
} | null;