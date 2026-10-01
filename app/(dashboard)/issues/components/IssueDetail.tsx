"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Edit3,
  Link2,
  Loader2,
  Paperclip,
  Pencil,
  Send,
  ShieldCheck,
  User,
  X,
} from "lucide-react";
import type { Issue, Attachment, ThreadComment } from "../lib/types";
import { PRIORITY_COLORS, BUG_TYPE_COLORS, BUG_TYPE_LABELS } from "../lib/constants";
import { listBugUsers, updateBug, verifyBug, addBugComment, editBugComment } from "@/app/components/bug-report/bugsApi";
import type { BugUser } from "@/app/components/bug-report/bugsApi";
import MentionTextarea, { renderWithMentions } from "./MentionTextarea";

const R2_BASE = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || process.env.R2_PUBLIC_URL || "";

function attachmentUrl(att: Attachment): string {
  if (att.key.startsWith("http")) return att.key;
  return `${R2_BASE}/${att.key}`;
}

function isImage(att: Attachment): boolean {
  return att.content_type.startsWith("image/");
}

function stripHtml(str: string): string {
  return str.replace(/<[^>]+>/g, "").trim();
}

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

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

interface Props {
  issue: Issue;
  onBack: () => void;
  onToggleStatus: (id: number, current: string) => void;
  onIssueUpdated: (updated: Issue) => void;
  updating: boolean;
}

export default function IssueDetail({ issue, onBack, onToggleStatus, onIssueUpdated, updating }: Props) {
  const isResolved = issue.status === "resolved";
  const [users, setUsers] = useState<BugUser[]>([]);
  const [assigneeOpen, setAssigneeOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editTitle, setEditTitle] = useState(issue.title || "");
  const [editComments, setEditComments] = useState(issue.comments || "");
  const [editPriority, setEditPriority] = useState(issue.priority);
  const [saving, setSaving] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [editingCommentIdx, setEditingCommentIdx] = useState<number | null>(null);
  const [editCommentBody, setEditCommentBody] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const assigneeRef = useRef<HTMLDivElement>(null);

  const thread: ThreadComment[] = issue.thread || [];
  const descriptionText = issue.comments ? stripHtml(issue.comments) : "";

  useEffect(() => {
    listBugUsers().then((res) => setUsers(res.users)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!assigneeOpen) return;
    function handleClick(e: MouseEvent) {
      if (assigneeRef.current && !assigneeRef.current.contains(e.target as Node)) {
        setAssigneeOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [assigneeOpen]);

  const handleAssign = useCallback(async (user: BugUser | null) => {
    setAssigneeOpen(false);
    setSaving(true);
    setActionError(null);
    try {
      const updated = await updateBug(issue.id, {
        assignee_id: user?.id ?? null,
        assignee_name: user ? (user.display_name || user.email) : null,
      });
      onIssueUpdated({ ...issue, ...updated } as Issue);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to update assignee");
    }
    setSaving(false);
  }, [issue, onIssueUpdated]);

  const handleSaveEdit = useCallback(async () => {
    setSaving(true);
    setActionError(null);
    try {
      const updated = await updateBug(issue.id, {
        title: editTitle || undefined,
        comments: editComments || undefined,
        priority: editPriority,
      });
      onIssueUpdated({ ...issue, ...updated } as Issue);
      setEditing(false);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to save changes");
    }
    setSaving(false);
  }, [issue, editTitle, editComments, editPriority, onIssueUpdated]);

  const handlePostComment = useCallback(async () => {
    if (!newComment.trim()) return;
    setPosting(true);
    setActionError(null);
    try {
      const updated = await addBugComment(issue.id, newComment.trim());
      onIssueUpdated({ ...issue, ...updated } as Issue);
      setNewComment("");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to add comment");
    }
    setPosting(false);
  }, [issue, newComment, onIssueUpdated]);

  const handleEditComment = useCallback(async () => {
    if (editingCommentIdx === null || !editCommentBody.trim()) return;
    setSaving(true);
    setActionError(null);
    try {
      const updated = await editBugComment(issue.id, editingCommentIdx, editCommentBody.trim());
      onIssueUpdated({ ...issue, ...updated } as Issue);
      setEditingCommentIdx(null);
      setEditCommentBody("");
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to edit comment");
    }
    setSaving(false);
  }, [issue, editingCommentIdx, editCommentBody, onIssueUpdated]);

  const handleVerify = useCallback(async (clear = false) => {
    setSaving(true);
    setActionError(null);
    try {
      const updated = await verifyBug(issue.id, clear);
      onIssueUpdated({ ...issue, ...updated } as Issue);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Failed to update verification");
    }
    setSaving(false);
  }, [issue, onIssueUpdated]);

  const contextLine = [issue.grade, issue.section, issue.subject].filter(Boolean).join(" · ");

  return (
    <div>
      {/* Back */}
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium mb-5 transition"
      >
        <ArrowLeft size={15} />
        <span>Back to issues</span>
      </button>

      {/* Error banner */}
      {actionError && (
        <div className="mb-4 flex items-center justify-between px-3 py-2 text-sm text-red-700 bg-red-50 border border-red-200 rounded-md">
          <span>{actionError}</span>
          <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-600 ml-2"><X size={14} /></button>
        </div>
      )}

      {/* Header */}
      <div className="mb-6">
        {editing ? (
          <input
            value={editTitle}
            onChange={(e) => setEditTitle(e.target.value)}
            className="w-full text-xl font-bold text-gray-900 border border-blue-300 rounded-lg px-3 py-2 mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
            placeholder="Issue title"
          />
        ) : (
          <div className="flex items-start gap-3 mb-3">
            <h1 className="text-xl font-bold text-gray-900 leading-tight flex-1">
              {issue.title || stripHtml(issue.comments || "").slice(0, 100) || `Issue #${issue.id}`}
              <span className="text-gray-400 font-normal ml-2">#{issue.id}</span>
            </h1>
            <button
              onClick={() => { setEditing(true); setEditTitle(issue.title || ""); setEditComments(issue.comments || ""); setEditPriority(issue.priority); }}
              className="shrink-0 mt-0.5 flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-white border border-gray-200 rounded-md hover:border-blue-300 hover:text-blue-600 transition"
            >
              <Edit3 size={13} />
              Edit
            </button>
          </div>
        )}

        {/* Status bar with close/reopen */}
        <div className="flex items-center gap-3 flex-wrap">
          <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold text-white ${isResolved ? "bg-purple-600" : "bg-green-600"}`}>
            {isResolved ? <CheckCircle2 size={13} /> : <AlertCircle size={13} />}
            {isResolved ? "Resolved" : "Open"}
          </span>
          <span className="text-sm text-gray-500">
            <span className="font-medium text-gray-700">{issue.reporter_name}</span>
            {" opened this issue "}
            <span title={formatDate(issue.created_at)}>{timeAgo(issue.created_at)}</span>
            {issue.updated_at !== issue.created_at && (
              <span className="text-gray-400"> · edited <span title={formatDate(issue.updated_at)}>{timeAgo(issue.updated_at)}</span></span>
            )}
          </span>
          {!editing && (
            <button
              onClick={() => onToggleStatus(issue.id, issue.status)}
              disabled={updating}
              className={`ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition disabled:opacity-50 border ${
                isResolved
                  ? "text-green-700 border-green-200 bg-green-50 hover:bg-green-100"
                  : "text-purple-700 border-purple-200 bg-purple-50 hover:bg-purple-100"
              }`}
            >
              {updating ? <Loader2 size={13} className="animate-spin" /> : isResolved ? <AlertCircle size={13} /> : <CheckCircle2 size={13} />}
              {isResolved ? "Reopen" : "Close issue"}
            </button>
          )}
        </div>
      </div>

      <div className="border-t border-gray-200 pt-6">
        <div className="flex gap-8 items-start">
          {/* Main content */}
          <div className="flex-1 min-w-0">
            {/* Description */}
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 px-4 py-2.5 flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                  <User size={12} className="text-blue-600" />
                </div>
                <span className="text-sm font-semibold text-gray-700">{issue.reporter_name}</span>
                <span className="text-xs text-gray-400" title={formatDate(issue.created_at)}>
                  commented {timeAgo(issue.created_at)}
                </span>
              </div>
              <div className="px-4 py-4">
                {editing ? (
                  <textarea
                    value={editComments}
                    onChange={(e) => setEditComments(e.target.value)}
                    rows={5}
                    className="w-full text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 leading-relaxed resize-y"
                    placeholder="Description"
                  />
                ) : descriptionText ? (
                  <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{descriptionText}</p>
                ) : (
                  <p className="text-sm text-gray-400 italic">No description provided.</p>
                )}

                {issue.attachments.filter(isImage).length > 0 && (
                  <div className="mt-4 space-y-3">
                    {issue.attachments.filter(isImage).map((att) => (
                      <a key={att.key} href={attachmentUrl(att)} target="_blank" rel="noopener noreferrer"
                        className="block border border-gray-200 rounded-lg overflow-hidden hover:border-blue-300 transition">
                        <img src={attachmentUrl(att)} alt={att.filename} className="w-full h-auto object-contain bg-gray-50" />
                      </a>
                    ))}
                  </div>
                )}

                {issue.attachments.filter((a) => !isImage(a)).length > 0 && (
                  <div className="mt-4 space-y-1.5">
                    {issue.attachments.filter((a) => !isImage(a)).map((att) => (
                      <a key={att.key} href={attachmentUrl(att)} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-2 text-sm text-blue-600 hover:underline">
                        <Paperclip size={13} className="text-gray-400" />
                        {att.filename}
                        <span className="text-xs text-gray-400">({(att.size / 1024).toFixed(0)} KB)</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Thread comments */}
            {thread.length > 0 && (
              <div className="mt-5 space-y-3">
                {thread.map((c, i) => (
                  <div key={i} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 border-b border-gray-200 px-4 py-2 flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center">
                        <User size={12} className="text-purple-600" />
                      </div>
                      <span className="text-sm font-semibold text-gray-700">{c.user_name}</span>
                      <span className="text-xs text-gray-400" title={formatDate(c.created_at)}>
                        commented {timeAgo(c.created_at)}
                      </span>
                      <div className="flex-1" />
                      {editingCommentIdx !== i && (
                        <button
                          onClick={() => { setEditingCommentIdx(i); setEditCommentBody(c.body); }}
                          className="text-gray-400 hover:text-blue-600 transition p-0.5"
                          title="Edit comment"
                        >
                          <Pencil size={12} />
                        </button>
                      )}
                    </div>
                    <div className="px-4 py-3">
                      {editingCommentIdx === i ? (
                        <div>
                          <MentionTextarea
                            value={editCommentBody}
                            onChange={setEditCommentBody}
                            users={users}
                            rows={3}
                            className="w-full text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 leading-relaxed resize-y mb-2"
                          />
                          <div className="flex items-center gap-2">
                            <button onClick={handleEditComment} disabled={saving || !editCommentBody.trim()}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-50">
                              {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
                              Save
                            </button>
                            <button onClick={() => { setEditingCommentIdx(null); setEditCommentBody(""); }}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition">
                              <X size={12} /> Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">{renderWithMentions(c.body)}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Empty state */}
            {thread.length === 0 && !editing && (
              <div className="mt-5 flex items-center gap-2 text-xs text-gray-400 py-3">
                <Clock size={12} />
                No comments yet — be the first to comment.
              </div>
            )}

            {/* Add comment */}
            <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
              <div className="p-4">
                <MentionTextarea
                  value={newComment}
                  onChange={setNewComment}
                  users={users}
                  rows={3}
                  placeholder="Leave a comment... (type @ to mention)"
                  className="w-full text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-400 leading-relaxed resize-y mb-3"
                />
                <div className="flex items-center">
                  <button
                    onClick={handlePostComment}
                    disabled={posting || !newComment.trim()}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-green-600 text-white hover:bg-green-700 transition disabled:opacity-50"
                  >
                    {posting ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    Comment
                  </button>
                </div>
              </div>
            </div>

            {/* Edit save/cancel */}
            {editing && (
              <div className="mt-4 pt-4 border-t border-gray-200 flex items-center gap-3">
                <button onClick={handleSaveEdit} disabled={saving}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition disabled:opacity-50">
                  {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                  Save changes
                </button>
                <button onClick={() => setEditing(false)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium text-gray-600 border border-gray-200 hover:bg-gray-50 transition">
                  <X size={14} /> Cancel
                </button>
              </div>
            )}
          </div>

          {/* Sidebar — sticky */}
          <div className="w-72 shrink-0 sticky top-8">
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <tbody>
                  {/* Assignee */}
                  <tr className="border-b border-gray-100">
                    <td className="px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap align-middle w-24">Assignee</td>
                    <td className="px-4 py-3 align-middle">
                      <div className="relative" ref={assigneeRef}>
                        <button
                          onClick={() => setAssigneeOpen(!assigneeOpen)}
                          className="w-full flex items-center justify-between gap-2 px-2 py-1 text-sm border border-gray-200 rounded-md hover:border-blue-300 transition bg-white"
                        >
                          {issue.assignee_name ? (
                            <span className="text-gray-700 truncate">{issue.assignee_name}</span>
                          ) : (
                            <span className="text-gray-400">Unassigned</span>
                          )}
                          <ChevronDown size={12} className="text-gray-400 shrink-0" />
                        </button>
                        {assigneeOpen && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-10 max-h-48 overflow-y-auto">
                            <button onClick={() => handleAssign(null)}
                              className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50 transition">
                              Unassign
                            </button>
                            {users.map((u) => (
                              <button key={u.id} onClick={() => handleAssign(u)}
                                className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition ${
                                  issue.assignee_id === u.id ? "bg-blue-50 text-blue-700" : "text-gray-700"
                                }`}>
                                {u.display_name?.trim() || u.email}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Verified By */}
                  <tr className="border-b border-gray-100">
                    <td className="px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap align-middle w-24">Verified</td>
                    <td className="px-4 py-3 align-middle">
                      {issue.verified_by_name ? (
                        <div className="flex items-center justify-between gap-1">
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-green-700">
                            <ShieldCheck size={13} className="text-green-600" />
                            {issue.verified_by_name}
                          </span>
                          <button
                            onClick={() => handleVerify(true)}
                            disabled={saving}
                            className="text-gray-400 hover:text-red-500 transition p-0.5"
                            title="Remove verification"
                          >
                            <X size={11} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handleVerify(false)}
                          disabled={saving}
                          className="inline-flex items-center gap-1.5 px-2 py-1 text-xs text-gray-500 border border-dashed border-gray-300 rounded-md hover:border-green-400 hover:text-green-600 transition disabled:opacity-50"
                        >
                          <ShieldCheck size={12} />
                          Verify
                        </button>
                      )}
                    </td>
                  </tr>

                  {/* Type */}
                  <tr className="border-b border-gray-100">
                    <td className="px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap align-middle">Type</td>
                    <td className="px-4 py-3 align-middle">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${BUG_TYPE_COLORS[issue.bug_type]}`}>
                        {BUG_TYPE_LABELS[issue.bug_type]}
                      </span>
                    </td>
                  </tr>

                  {/* Priority */}
                  <tr className="border-b border-gray-100">
                    <td className="px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap align-middle">Priority</td>
                    <td className="px-4 py-3 align-middle">
                      {editing ? (
                        <select value={editPriority} onChange={(e) => setEditPriority(e.target.value as typeof editPriority)}
                          className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white">
                          <option value="low">low</option>
                          <option value="medium">medium</option>
                          <option value="high">high</option>
                          <option value="critical">critical</option>
                        </select>
                      ) : (
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${PRIORITY_COLORS[issue.priority]}`}>
                          {issue.priority}
                        </span>
                      )}
                    </td>
                  </tr>

                  {/* Student */}
                  {(issue.student_name || issue.student_id) && (
                    <tr className="border-b border-gray-100">
                      <td className="px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap align-top">Student</td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-gray-800">{issue.student_name || issue.student_id?.slice(0, 8) + "..."}</p>
                        {contextLine && <p className="text-xs text-gray-500 mt-0.5">{contextLine}</p>}
                      </td>
                    </tr>
                  )}

                  {/* Batch */}
                  {issue.batch_id && (
                    <tr className="border-b border-gray-100">
                      <td className="px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap align-middle">Batch</td>
                      <td className="px-4 py-3 text-xs text-gray-600 font-mono break-all">
                        {issue.batch_id.replace(/^batch_/, "")}
                      </td>
                    </tr>
                  )}

                  {/* Page */}
                  {issue.page_url && (
                    <tr className="border-b border-gray-100">
                      <td className="px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap align-middle">Page</td>
                      <td className="px-4 py-3">
                        <a
                          href={issue.page_url}
                          className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline break-all"
                        >
                          <Link2 size={11} className="shrink-0" />
                          {(() => { try { const u = new URL(issue.page_url, "http://x"); return u.pathname === "/" ? "Home" : u.pathname.replace(/^\//, ""); } catch { return issue.page_url; } })()}
                        </a>
                      </td>
                    </tr>
                  )}

                  {/* Created */}
                  <tr className="border-b border-gray-100">
                    <td className="px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap align-middle">Created</td>
                    <td className="px-4 py-3 text-xs text-gray-600" title={formatDate(issue.created_at)}>
                      {formatDate(issue.created_at)}
                    </td>
                  </tr>

                  {/* Updated */}
                  {issue.updated_at !== issue.created_at && (
                    <tr>
                      <td className="px-4 py-3 text-xs font-medium text-gray-500 whitespace-nowrap align-middle">Updated</td>
                      <td className="px-4 py-3 text-xs text-gray-600" title={formatDate(issue.updated_at)}>
                        {formatDate(issue.updated_at)}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
