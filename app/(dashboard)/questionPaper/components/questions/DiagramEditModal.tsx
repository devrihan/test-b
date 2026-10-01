"use client";

import { X } from "lucide-react";
import DiagramEditor, { NormBBox } from "../../DiagramEditor";
import type { QuestionListItemDTO, DiagramBBox } from "../../lib/types";

interface DiagramEditModalProps {
  question: QuestionListItemDTO;
  onClose: () => void;
  onCommit: (bbox: NormBBox) => Promise<void>;
}

export default function DiagramEditModal({ question, onClose, onCommit }: DiagramEditModalProps) {
  if (!question.diagramBbox) return null;

  let parsed: DiagramBBox | null = null;
  try {
    parsed = JSON.parse(question.diagramBbox);
  } catch (e) {
    console.error("Failed to parse diagramBbox", e);
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl shadow-2xl p-6 w-[420px] max-w-[90vw]">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-gray-900">Fix Diagram Bounding Box</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <p className="text-sm text-red-600 bg-red-50 p-3 rounded-lg border border-red-200">
            Invalid diagram data. Please re-extract.
          </p>
        </div>
      </div>
    );
  }

  if (!parsed || !parsed.page_image_url) {
    return (
      <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
        <div className="bg-white rounded-2xl shadow-2xl p-6 w-[420px] max-w-[90vw]">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-bold text-gray-900">Fix Diagram Bounding Box</h3>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
          <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg border border-amber-200">
            Cannot edit this diagram because its original page image is missing.
            Please use &quot;Re-extract&quot; if the entire question needs fixing.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-2xl shadow-2xl p-6 w-[800px] max-w-[95vw] max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-bold text-gray-900">Fix Diagram Bounding Box</h3>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
          >
            <X size={18} />
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          Adjust the crop box below to capture the entire diagram. Click &quot;Save Crop&quot; when you are done.
        </p>
        <div className="border border-gray-200 rounded-lg p-2 bg-gray-50 relative min-h-[400px]">
          <DiagramEditor
            pageUrl={parsed.page_image_url}
            bbox={{ x1: parsed.x1, y1: parsed.y1, x2: parsed.x2, y2: parsed.y2 }}
            cropUrl={question.diagramCropUrl ?? null}
            onCommit={async (box) => {
              await onCommit(box);
              onClose();
            }}
          />
        </div>
      </div>
    </div>
  );
}
