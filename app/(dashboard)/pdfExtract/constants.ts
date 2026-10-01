// Scale at which PDF pages are rendered in the viewer
export const  VIEW_SCALE = 1.5;

// Scale at which pages are re-rendered during extraction (higher = sharper PNG)
export const EXTR_SCALE = 2.5;

// Gap in px around the whole page stack
export const PAGE_GAP = 16;


// Padding in px around the whole page stack
export const PAGE_PAD = 24;

// 12 colors — one per question, cycles for Q13+
export const QUESTION_COLORS = [
  "#6366f1", // indigo
  "#ef4444", // red
  "#22c55e", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#84cc16", // lime
  "#e11d48", // rose
  "#0ea5e9", // sky
  "#a855f7", // purple
] as const;


export const getQuestionColor = (index: number): string =>
  QUESTION_COLORS[index % QUESTION_COLORS.length];