import type { BugType, Priority } from "./types";

export const PRIORITY_COLORS: Record<Priority, string> = {
  low:      "bg-blue-100 text-blue-700 border-blue-200",
  medium:   "bg-yellow-100 text-yellow-800 border-yellow-200",
  high:     "bg-orange-100 text-orange-700 border-orange-200",
  critical: "bg-red-100 text-red-700 border-red-200",
};

export const BUG_TYPE_COLORS: Record<BugType, string> = {
  bug: "bg-red-50 text-red-700 border-red-200",
};

export const BUG_TYPE_LABELS: Record<BugType, string> = {
  bug: "bug",
};
