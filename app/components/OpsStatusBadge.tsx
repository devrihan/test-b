"use client";

import type { OpsStatus } from "@/app/lib/reviewApi";

// The one section status vocabulary, shared by the Ops Queue and the editor screens.
// Keys are the section task's states; failed/cancelled never occur on a review section.
export const OPS_STATUS_META: Partial<Record<OpsStatus, { label: string; dot: string; text: string }>> & {
  not_started: { label: string; dot: string; text: string };
} = {
  not_started: { label: "Not Started", dot: "bg-gray-400", text: "text-gray-600" },
  in_progress: { label: "Maker working", dot: "bg-blue-500", text: "text-blue-700" },
  waiting_for_check: { label: "Waiting for check", dot: "bg-yellow-400", text: "text-yellow-700" },
  needs_work: { label: "Needs work", dot: "bg-red-500", text: "text-red-700" },
  done: { label: "Checked", dot: "bg-green-500", text: "text-green-700" },
};

export function OpsStatusBadge({ status }: { status: OpsStatus }) {
  const m = OPS_STATUS_META[status] ?? OPS_STATUS_META.not_started;
  return (
    <span className={`inline-flex items-center gap-sp-sm whitespace-nowrap text-xs font-medium ${m.text}`}>
      <span className={`h-2 w-2 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}
