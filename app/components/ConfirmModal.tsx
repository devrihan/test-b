import React from 'react';
import { AlertTriangle, CheckCircle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onCancel?: () => void;
  iconType?: 'warning' | 'success';
}

export default function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  onConfirm,
  onCancel,
  iconType = "warning"
}: ConfirmModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-gray-900/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="p-5">
          <div className="flex items-start gap-4">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${iconType === 'success' ? 'bg-green-100' : 'bg-red-100'}`}>
              {iconType === 'success' ? (
                <CheckCircle className="text-green-600" size={20} />
              ) : (
                <AlertTriangle className="text-red-600" size={20} />
              )}
            </div>
            <div className="flex-1 min-w-0 pt-1">
              <h3 className="text-base font-bold text-gray-900 mb-1">{title}</h3>
              <p className="text-sm text-gray-500 leading-relaxed">{message}</p>
            </div>
            {onCancel && (
              <button onClick={onCancel} className="text-gray-400 hover:text-gray-600 transition-colors">
                <X size={18} />
              </button>
            )}
          </div>
        </div>
        <div className="bg-gray-50 px-5 py-4 border-t border-gray-100 flex items-center gap-3 justify-end">
          {onCancel && (
            <button
              onClick={onCancel}
              className="px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-200 bg-gray-100 rounded-lg transition-colors"
            >
              {cancelText}
            </button>
          )}
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-semibold text-white rounded-lg shadow-sm transition-colors ${
              iconType === 'success' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
