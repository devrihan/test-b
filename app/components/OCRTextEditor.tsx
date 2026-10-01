"use client";
import LatexPreview from "./LatexPreview";
import { useState } from "react";

interface OCRTextEditorProps {
  /** The extracted/edited text */
  text: string;
  /** Whether OCR is still loading */
  loading: boolean;
  /** Called when user edits the text */
  onChange: (text: string) => void;
  /** Whether to display LaTeX preview */
  latexPreview?: boolean;
}

export default function OCRTextEditor({ text, loading, onChange, latexPreview, }: OCRTextEditorProps) {
  const [showPreview, setShowPreview] = useState(false);

  console.log({
  loading,
  showPreview,
  text,
});

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
  <p className="text-xs font-medium text-gray-500">
    Extracted text
  </p>

  <button
    type="button"
    onClick={() => setShowPreview((v) => !v)}
    className="text-xs px-2 py-1 rounded border border-gray-200 hover:bg-gray-50"
  >
    {showPreview ? "Hide LaTeX" : "Show LaTeX"}
  </button>
</div>

      {loading ? (
        <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-8 flex flex-col items-center gap-3">
          <span className="w-5 h-5 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin" />
          <p className="text-xs text-gray-400">Extracting text...</p>
        </div>
      ) : (
        <textarea
          value={text}
          onChange={(e) => onChange(e.target.value)}
          rows={6}
          placeholder="OCR result will appear here..."
          className="w-full text-sm text-gray-800 border border-gray-200 rounded-lg px-3 py-2.5
                     outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-300
                     resize-y bg-white leading-relaxed"
        />
      )}

      {!loading && showPreview  && text.trim() && (
        <div className="mt-3">
          <p className="text-xs font-medium text-gray-500 mb-2">
            LaTeX Preview
          </p>

          <div className="rounded-lg border border-gray-200 bg-gray-50 p-3 overflow-auto" >
            <LatexPreview text={text} />
          </div>
        </div>
      )}

    </div>
  );
}