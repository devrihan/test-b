"use client";

import { Scan } from "lucide-react";

interface ExtractButtonProps {
  /** Which question this button belongs to */
  questionId: string;
  /** Whether selection mode is currently active for THIS question */
  isActive?: boolean;
  /** Whether OCR is currently loading for this question */
  isLoading?: boolean;
  /** Called when user clicks — parent should enter selection mode */
  onExtract: (questionId: string) => void;
  /** Optional: compact mode hides label, shows icon only */
  compact?: boolean;
}


export default function ExtractButton({
  questionId,
  isActive = false,
  isLoading = false,
  onExtract,
  compact = false,
}: ExtractButtonProps) {
  const disabled = isActive || isLoading;
 
  return (
    <button
      onClick={() => !disabled && onExtract(questionId)}
      disabled={disabled}
      title={
        isLoading
          ? "Extracting..."
          : isActive
          ? "Select region on answer sheet"
          : "Extract from sheet"
      }
      className={`
        inline-flex items-center gap-1.5 text-xs font-medium rounded-lg
        transition-all duration-150 select-none
        ${compact ? "px-2 py-1.5" : "px-2.5 py-1.5"}
        ${
          isActive
            ? "bg-indigo-100 text-indigo-700 ring-1 ring-indigo-300 cursor-default"
            : isLoading
            ? "bg-gray-100 text-gray-400 cursor-wait"
            : "bg-gray-50 text-gray-500 hover:bg-indigo-50 hover:text-indigo-600 border border-gray-200 hover:border-indigo-200 cursor-pointer"
        }
      `}
    >
      {isLoading ? (
        <span className="w-3.5 h-3.5 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
      ) : (
        <Scan size={14} className={isActive ? "text-indigo-500" : ""} />
      )}
      {!compact && (
        <span>{isLoading ? "Extracting..." : isActive ? "Selecting..." : "Extract"}</span>
      )}
    </button>
  );
}