import { X } from "lucide-react";
import { MarkMode } from "../types";

type Props = {
  markMode:  MarkMode;
  activeQId: number | null;
  onCancel:  () => void;
};

export default function MarkingBanner({ markMode, activeQId, onCancel }: Props) {
  if (!markMode || activeQId === null) return null;

  return (
    <div className="absolute top-0 left-0 right-0 h-11 bg-amber-400 flex items-center gap-3 px-4 z-40 shadow-sm">
      <span className="w-2 h-2 rounded-full bg-amber-900/50 animate-ping" />
      <span className="text-sm font-bold text-amber-900">
        Q{activeQId} — drag a rectangle around the answer
      </span>
      <span className="text-xs text-amber-800/75 hidden sm:block">
        (hold mouse, drag to select, release to save)
      </span>
      <button
        onClick={onCancel}
        className="ml-auto flex items-center gap-1.5 text-xs font-bold text-amber-900 bg-amber-500/30 hover:bg-amber-500/50 px-3 py-1 rounded-lg transition"
      >
        <X size={12} /> Cancel (Esc)
      </button>
    </div>
  );
}