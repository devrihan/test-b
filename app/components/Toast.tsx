"use client";

import { useEffect } from "react";
import { CheckCircle2, XCircle, X } from "lucide-react";


interface ToastProps {
  message: string;
  type: "success" | "error";
  onClose: () => void;
  duration?: number; // ms, default 3000
}



export default function Toast({
  message,
  type,
  onClose,
  duration = 3000,
}: ToastProps) {
 
  // Auto-close after duration
  useEffect(() => {
    const timer = setTimeout(onClose, duration);
    return () => clearTimeout(timer);
  }, [duration, onClose]);
 
  return (
    <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 rounded-xl shadow-lg text-sm font-medium transition-all ${
      type === "success"
        ? "bg-gray-900 text-white"
        : "bg-red-600 text-white"
    }`}>
      {type === "success"
        ? <CheckCircle2 size={16} className="text-green-400 shrink-0" />
        : <XCircle size={16} className="text-red-200 shrink-0" />
      }
      <span>{message}</span>
      <button onClick={onClose} className="ml-2 opacity-60 hover:opacity-100 transition">
        <X size={14} />
      </button>
    </div>
  );
}