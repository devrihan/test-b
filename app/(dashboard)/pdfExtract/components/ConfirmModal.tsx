import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";

type Props = {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "primary" | "warning";
  onConfirm: () => void;
  onCancel: () => void;
  // Optional extra content (e.g. an opt-in checkbox) rendered between the
  // message and the buttons.
  children?: ReactNode;
};

export default function ConfirmModal({
  title,
  message,
  confirmLabel = "Continue",
  cancelLabel = "Cancel",
  variant = "primary",
  onConfirm,
  onCancel,
  children,
}: Props) {
  const btnColor = variant === "danger" ? "bg-red-600 hover:bg-red-700 shadow-red-100" 
                 : variant === "warning" ? "bg-amber-600 hover:bg-amber-700 shadow-amber-100"
                 : "bg-indigo-600 hover:bg-indigo-700 shadow-indigo-100";
  
  const iconBg = variant === "danger" ? "bg-red-50 text-red-600"
               : variant === "warning" ? "bg-amber-50 text-amber-600"
               : "bg-indigo-50 text-indigo-600";

  return (
    <div className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div 
        className="bg-white rounded-3xl shadow-2xl w-full max-w-sm overflow-hidden border border-white/20 animate-in fade-in zoom-in-95 duration-200"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-8 text-center">
          <div className={`w-14 h-14 mx-auto rounded-2xl ${iconBg} flex items-center justify-center mb-5 rotate-3`}>
            <AlertCircle size={32} />
          </div>
          
          <h3 className="text-xl font-bold text-gray-900 mb-3 tracking-tight">{title}</h3>
          <p className="text-sm text-gray-500 leading-relaxed whitespace-pre-wrap">
            {message}
          </p>
          {children && <div className="mt-4 text-left">{children}</div>}
        </div>
        
        <div className="px-8 pb-8 flex flex-col gap-3">
          <button
            onClick={onConfirm}
            className={`w-full h-12 ${btnColor} text-white font-bold rounded-2xl shadow-lg transition transform hover:scale-[1.02] active:scale-[0.98]`}
          >
            {confirmLabel}
          </button>
          <button
            onClick={onCancel}
            className="w-full h-12 text-sm font-bold text-gray-400 hover:text-gray-600 hover:bg-gray-50 rounded-2xl transition"
          >
            {cancelLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
