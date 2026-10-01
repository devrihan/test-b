import { AlertTriangle, ArrowRight, Save } from 'lucide-react';
import React from 'react';

interface BottomBarProps {
  dirtyCount: number;
  ocrTotal?: number;
  correctedTotal?: number | string;
  onSave: () => void;
  saveLabel?: string;
}

export default function BottomBar({
  dirtyCount,
  ocrTotal,
  correctedTotal,
  onSave,
  saveLabel = "Save Student",
}: BottomBarProps) {

  return (
    <div className="bg-white border-t border-gray-200 px-6 py-3 flex items-center justify-between shrink-0">

      <div className="flex items-center gap-2 text-sm">
        {dirtyCount > 0 ? (
          <>
            <AlertTriangle size={14} className="text-amber-500 shrink-0" />
            <span className="text-amber-600 font-medium">
              {dirtyCount} question{dirtyCount > 1 ? "s" : ""} edited
            </span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-500">
              Total: <span className="font-semibold text-gray-800">{correctedTotal}</span>
            </span>
          </>
        ) : (
          <>
            <span className="text-gray-400">No changes made</span>
            <span className="text-gray-300">·</span>
            <span className="text-gray-500">
              Total: <span className="font-semibold text-gray-800">{correctedTotal}</span>
            </span>
          </>
        )}
      </div>

      <button
        onClick={onSave}
        className="flex items-center gap-2 h-9 px-5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition"
      >
        <Save size={14} />
        {saveLabel}
        <ArrowRight size={14} />
      </button>
    </div>
  );
}