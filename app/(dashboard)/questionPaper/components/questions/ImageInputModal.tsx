"use client";

import { useRef, useEffect, useCallback } from "react";
import { X, ScanLine } from "lucide-react";
import { useOCRExtraction } from "../../../../context/Ocrextractioncontext";

interface ImageInputModalProps {
  questionId: string;
  onClose: () => void;
}

export default function ImageInputModal({ questionId, onClose }: ImageInputModalProps) {
  const { startExtraction, addRegion } = useOCRExtraction();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    startExtraction(questionId);
  }, [questionId, startExtraction]);

  const handleImage = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64 = e.target?.result as string;
        addRegion({
          id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
          pageIndex: 0,
          cropRect: { x1: 0, y1: 0, x2: 1, y2: 1, width: 1, height: 1, pageIndex: 0 },
          image: base64,
        });
        onClose();
      };
      reader.readAsDataURL(file);
    },
    [addRegion, onClose],
  );

  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      if (!item) return;
      const file = item.getAsFile();
      if (file) handleImage(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [handleImage]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-[420px] max-w-[90vw]">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-semibold text-gray-900">Re-extract Question Text</h3>
          <button
            onClick={onClose}
            className="w-6 h-6 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <X size={14} />
          </button>
        </div>
        <p className="text-xs text-gray-500 mb-4">
          Screenshot the question from the PDF on the left, then paste or upload the image here.
        </p>
        <div
          className="border-2 border-dashed border-gray-200 rounded-xl p-10 text-center cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition"
          onClick={() => fileInputRef.current?.click()}
          onDrop={(e) => {
            e.preventDefault();
            const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith("image/"));
            if (file) handleImage(file);
          }}
          onDragOver={(e) => e.preventDefault()}
        >
          <ScanLine size={24} className="mx-auto mb-2 text-gray-300" />
          <p className="text-sm font-medium text-gray-500">Paste (Ctrl+V) or click to upload</p>
          <p className="text-xs text-gray-400 mt-1">Any image format</p>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) handleImage(file);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
