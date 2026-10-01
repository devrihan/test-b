"use client";

interface OCRActionsProps {
  /** Whether OCR is loading (disables Fill) */
  loading: boolean;
  /** Whether there's text to fill */
  hasText: boolean;
  onRetry: () => void;
  onFill: () => void;
  onCancel: () => void;
}

export default function OCRActions({ loading, hasText, onRetry, onFill, onCancel }: OCRActionsProps) {
  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onRetry}
        disabled={loading}
        className="h-9 px-3 text-xs font-medium rounded-lg border border-gray-200
                   text-gray-600 bg-white hover:bg-gray-50
                   disabled:opacity-40 disabled:cursor-not-allowed transition"
      >
        Retry
      </button>

      <button
        onClick={onFill}
        disabled={loading || !hasText}
        className="h-9 px-4 text-xs font-semibold rounded-lg
                   bg-indigo-600 hover:bg-indigo-700 text-white
                   disabled:opacity-40 disabled:cursor-not-allowed transition flex-1"
      >
        Fill OCR
      </button>

      <button
        onClick={onCancel}
        className="h-9 px-3 text-xs font-medium rounded-lg border border-gray-200
                   text-gray-600 bg-white hover:bg-gray-50 transition"
      >
        Cancel
      </button>
    </div>
  );
}