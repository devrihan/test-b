import { AlertCircle } from "lucide-react";

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
      <AlertCircle size={14} className="text-red-500 mt-0.5 shrink-0" />
      <p className="text-xs text-red-600 font-medium">{message}</p>
    </div>
  );
}
