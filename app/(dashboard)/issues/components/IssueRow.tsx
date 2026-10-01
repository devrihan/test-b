"use client";

import { AlertCircle, CheckCircle2, Loader2, Paperclip } from "lucide-react";
import type { Issue } from "../lib/types";
import { PRIORITY_COLORS, BUG_TYPE_COLORS, BUG_TYPE_LABELS } from "../lib/constants";

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} minute${mins !== 1 ? "s" : ""} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs !== 1 ? "s" : ""} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days !== 1 ? "s" : ""} ago`;
  return new Date(iso).toLocaleDateString();
}

function stripHtml(str: string): string {
  return str.replace(/<[^>]+>/g, "").trim();
}

interface Props {
  issue: Issue;
  onToggleStatus: (id: number, current: string) => void;
  updating: boolean;
  onClick: () => void;
}

export default function IssueRow({ issue, onToggleStatus, updating, onClick }: Props) {
  const isResolved = issue.status === "resolved";

  return (
    <div className="flex items-start gap-3 px-4 py-3 border-b border-gray-200 hover:bg-gray-50 transition-colors cursor-pointer" onClick={onClick}>
      <button
        onClick={(e) => { e.stopPropagation(); onToggleStatus(issue.id, issue.status); }}
        disabled={updating}
        className="mt-0.5 shrink-0 transition disabled:opacity-50"
        title={isResolved ? "Reopen" : "Resolve"}
      >
        {updating ? (
          <Loader2 size={16} className="animate-spin text-gray-400" />
        ) : isResolved ? (
          <CheckCircle2 size={16} className="text-purple-500" />
        ) : (
          <AlertCircle size={16} className="text-green-600" />
        )}
      </button>

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`text-sm font-semibold ${isResolved ? "text-gray-500" : "text-gray-900"} hover:text-blue-600 cursor-pointer`}>
            {issue.title || stripHtml(issue.comments || "").slice(0, 80) || `Issue #${issue.id}`}
          </span>

          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-medium border ${BUG_TYPE_COLORS[issue.bug_type]}`}>
            {BUG_TYPE_LABELS[issue.bug_type]}
          </span>
          <span className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[11px] font-medium border ${PRIORITY_COLORS[issue.priority]}`}>
            {issue.priority}
          </span>

          {issue.attachments.length > 0 && (
            <span className="inline-flex items-center gap-0.5 text-[11px] text-gray-400">
              <Paperclip size={11} /> {issue.attachments.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 mt-1 text-xs text-gray-500">
          <span>#{issue.id}</span>
          <span className="text-gray-300">·</span>
          <span>opened {timeAgo(issue.created_at)} by {issue.reporter_name}</span>
          {issue.student_name && (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-gray-600 font-medium">{issue.student_name}</span>
              {(issue.grade || issue.section) && (
                <span className="text-gray-400">
                  ({[issue.grade, issue.section].filter(Boolean).join("-")})
                </span>
              )}
            </>
          )}
          {issue.batch_id && (
            <>
              <span className="text-gray-300">·</span>
              <span className="truncate max-w-[200px] text-gray-400" title={issue.batch_id}>
                {issue.batch_id.replace(/^batch_/, "").slice(0, 25)}
              </span>
            </>
          )}
          {issue.assignee_name && (
            <>
              <span className="text-gray-300">·</span>
              <span className="text-blue-600">{issue.assignee_name}</span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
