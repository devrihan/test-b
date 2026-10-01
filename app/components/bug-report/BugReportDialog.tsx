"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "../../../src/ds/components/ui/dialog";
import { Button } from "../../../src/ds/components/ui/button";
import { Badge } from "../../../src/ds/components/ui/badge";
import { Textarea } from "../../../src/ds/components/ui/textarea";
import {
  Upload,
  X,
  Loader2,
  Check,
  ChevronDown,
  ExternalLink,
} from "lucide-react";
import { useBugReport } from "./BugReportContext";
import {
  createBug,
  getToken,
  listBugUsers,
  type Priority,
  type CreateBugPayload,
  type Attachment,
  type BugUser,
} from "./bugsApi";

const BEAVER_BASE =
  process.env.NEXT_PUBLIC_BEAVER_API_URL ?? "http://localhost:4000";


const PRIORITIES: { value: Priority; label: string; color: string }[] = [
  { value: "low",      label: "Low",      color: "bg-gray-100 text-gray-700" },
  { value: "medium",   label: "Medium",   color: "bg-blue-100 text-blue-700" },
  { value: "high",     label: "High",     color: "bg-orange-100 text-orange-700" },
  { value: "critical", label: "Critical", color: "bg-red-100 text-red-700" },
];

interface FileWithPreview {
  file: File;
  preview: string;
}

async function uploadFile(file: File): Promise<Attachment> {
  const token = getToken();
  let res: Response;
  try {
    res = await fetch(`${BEAVER_BASE}/api/bugs/upload`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        filenames: [file.name],
        content_types: [file.type || "application/octet-stream"],
      }),
    });
  } catch {
    throw new Error(`Failed to upload "${file.name}" — check your connection.`);
  }
  if (!res.ok) throw new Error(`Failed to upload "${file.name}". Please try again.`);
  const { urls } = await res.json();
  const { key, uploadUrl } = urls[0];

  let put: Response;
  try {
    put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type || "application/octet-stream" },
      body: file,
    });
  } catch {
    throw new Error(`Failed to upload "${file.name}" — check your connection.`);
  }
  if (!put.ok) throw new Error(`Failed to upload "${file.name}". Please try again.`);

  return {
    key,
    filename: file.name,
    content_type: file.type || "application/octet-stream",
    size: file.size,
  };
}

export default function BugReportDialog() {
  const { open, setOpen, context } = useBugReport();

  const [priority, setPriority] = useState<Priority>("medium");
  const [title, setTitle] = useState("");
  const [comments, setComments] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [assigneeName, setAssigneeName] = useState("");
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [users, setUsers] = useState<BugUser[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [uploadingFiles, setUploadingFiles] = useState(false);
  const [success, setSuccess] = useState<{ id?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [duplicateId, setDuplicateId] = useState<number | null>(null);
  const [assigneeOpen, setAssigneeOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const assigneeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      listBugUsers()
        .then((data) => setUsers(data.users))
        .catch(() => setUsers([]));
    }
  }, [open]);

  // Close assignee dropdown on outside click
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

  const reset = useCallback(() => {
    setPriority("medium");
    setTitle("");
    setComments("");
    setAssigneeId("");
    setAssigneeName("");
    setFiles((prev) => {
      prev.forEach((f) => { if (f.preview) URL.revokeObjectURL(f.preview); });
      return [];
    });
    setSuccess(null);
    setError(null);
    setDuplicateId(null);
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    setTimeout(reset, 200);
  }, [setOpen, reset]);

  const handleFileAdd = useCallback((newFiles: FileList | null) => {
    if (!newFiles) return;
    const MAX_FILE_SIZE = 20 * 1024 * 1024;
    const valid: File[] = [];
    for (const f of Array.from(newFiles)) {
      if (f.size > MAX_FILE_SIZE) {
        setError(`"${f.name}" is too large (${Math.round(f.size / 1024 / 1024)}MB). Max 20MB per file.`);
        continue;
      }
      valid.push(f);
    }
    if (valid.length === 0) return;
    const added: FileWithPreview[] = valid.map((f) => ({
      file: f,
      preview: f.type.startsWith("image/") ? URL.createObjectURL(f) : "",
    }));
    setFiles((prev) => [...prev, ...added]);
  }, []);

  const handlePaste = useCallback((e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imageFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith("image/")) {
        const file = items[i].getAsFile();
        if (file) {
          const named = new File(
            [file],
            `screenshot-${Date.now()}.png`,
            { type: file.type },
          );
          imageFiles.push(named);
        }
      }
    }
    if (imageFiles.length === 0) return;
    e.preventDefault();
    const added: FileWithPreview[] = imageFiles.map((f) => ({
      file: f,
      preview: URL.createObjectURL(f),
    }));
    setFiles((prev) => [...prev, ...added]);
  }, []);

  useEffect(() => {
    if (!open) return;
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [open, handlePaste]);

  const handleFileRemove = useCallback((idx: number) => {
    setFiles((prev) => {
      const removed = prev[idx];
      if (removed?.preview) URL.revokeObjectURL(removed.preview);
      return prev.filter((_, i) => i !== idx);
    });
  }, []);

  const handleSubmit = async () => {
    if (!title.trim()) {
      setError("Please add a title.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      let attachments: Attachment[] = [];
      if (files.length > 0) {
        setUploadingFiles(true);
        attachments = await Promise.all(files.map((f) => uploadFile(f.file)));
        setUploadingFiles(false);
      }

      const payload: CreateBugPayload = {
        bug_type: "bug",
        priority,
        title: title.trim() || undefined,
        comments: comments.trim() || undefined,
        assignee_id: assigneeId || undefined,
        assignee_name: assigneeName || undefined,
        page_url: context.page_url || undefined,
        batch_id: context.batch_id || undefined,
        student_id: context.student_id || undefined,
        exam_id: context.exam_id || undefined,
        attachments,
      };

      const bug = await createBug(payload);
      setSuccess({ id: bug.id });
    } catch (err: unknown) {
      const msg = (err as Error)?.message ?? "Something went wrong. Please try again.";
      setError(msg);
      const body = (err as { body?: { existing_id?: number } })?.body;
      if (body?.existing_id) setDuplicateId(body.existing_id);
      setUploadingFiles(false);
    } finally {
      setSubmitting(false);
    }
  };

  const contextChips = [
    context.batch_id && { label: "Batch", value: context.batch_name || context.batch_id },
    context.student_id && { label: "Student", value: context.student_name || context.student_id },
    context.exam_id && { label: "Exam", value: context.exam_id },
  ].filter(Boolean) as { label: string; value: string }[];

  if (success) {
    return (
      <Dialog open={open} onOpenChange={handleClose}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
          <div className="flex flex-col items-center gap-4 py-4">
            <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
              <Check size={24} className="text-green-600" />
            </div>
            <p className="text-lg font-semibold text-gray-800">Bug Reported</p>
            <p className="text-sm text-gray-500 text-center">
              Bug #{success.id} has been saved.
            </p>
            <a
              href={`/issues?id=${success.id}`}
              className="text-sm text-blue-600 hover:underline font-medium"
            >
              View Issue →
            </a>
            <Button variant="outline" onClick={handleClose} className="mt-2">
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto" onPointerDownOutside={(e) => e.preventDefault()} onInteractOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Report a Bug</DialogTitle>
        </DialogHeader>

        {/* Context chips */}
        {contextChips.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {contextChips.map((c) => (
              <Badge
                key={c.label}
                variant="secondary"
                className="text-xs font-normal"
              >
                {c.label}: {c.value.length > 20 ? c.value.slice(0, 20) + "…" : c.value}
              </Badge>
            ))}
          </div>
        )}

        <div className="grid gap-4">
          <div>
            <label className="text-xs font-medium text-gray-600 mb-1.5 block">
              Priority
            </label>
            <div className="flex gap-2">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition ${
                    priority === p.value
                      ? p.color + " ring-2 ring-offset-1 ring-indigo-400"
                      : "bg-gray-50 text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1.5 block">
              Title <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short summary of the bug"
              maxLength={100}
              className="w-full h-9 px-3 rounded-md border border-gray-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 transition"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1.5 block">
              Description
            </label>
            <Textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              placeholder="Steps to reproduce, what you expected, what happened instead..."
              rows={3}
              className="text-sm resize-none"
            />
          </div>

          <div ref={assigneeRef} className="relative">
            <label className="text-xs font-medium text-gray-600 mb-1.5 block">
              Assign to
            </label>
            <button
              type="button"
              onClick={() => setAssigneeOpen((v) => !v)}
              className="flex items-center justify-between w-full h-9 px-3 rounded-md border border-gray-200 bg-white text-sm hover:border-gray-300 transition"
            >
              <span className={assigneeName ? "text-gray-800" : "text-gray-400"}>
                {assigneeName || "Unassigned"}
              </span>
              <ChevronDown size={14} className="text-gray-400" />
            </button>
            {assigneeOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-48 overflow-y-auto">
                <button
                  type="button"
                  onClick={() => {
                    setAssigneeId("");
                    setAssigneeName("");
                    setAssigneeOpen(false);
                  }}
                  className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50"
                >
                  Unassigned
                </button>
                {users.map((u) => (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => {
                      setAssigneeId(u.id);
                      setAssigneeName(u.display_name?.trim() || u.email);
                      setAssigneeOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition ${
                      assigneeId === u.id ? "bg-indigo-50 text-indigo-700" : "text-gray-700"
                    }`}
                  >
                    {u.display_name?.trim() || u.email}
                    {u.display_name?.trim() && (
                      <span className="text-xs text-gray-400 ml-2">{u.email}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-gray-600 mb-1.5 block">
              Evidence
            </label>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf"
              onChange={(e) => handleFileAdd(e.target.files)}
              className="hidden"
            />
            {files.length === 0 ? (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-6 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center gap-1.5 text-gray-400 hover:border-gray-300 hover:text-gray-500 transition"
              >
                <Upload size={20} />
                <span className="text-xs">Click to attach or Ctrl+V to paste a screenshot</span>
              </button>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-2">
                  {files.map((f, i) => (
                    <div
                      key={i}
                      className="relative group w-16 h-16 rounded-lg border border-gray-200 overflow-hidden bg-gray-50"
                    >
                      {f.preview ? (
                        <img
                          src={f.preview}
                          alt={f.file.name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-[10px] text-gray-400 px-1 text-center">
                          {f.file.name.split(".").pop()?.toUpperCase()}
                        </div>
                      )}
                      <button
                        type="button"
                        onClick={() => handleFileRemove(i)}
                        className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                >
                  + Add more
                </button>
              </div>
            )}
          </div>
        </div>

        {error && (
          <div className={`text-sm px-3 py-2 rounded-md ${
            error.startsWith("Already reported")
              ? "text-amber-700 bg-amber-50 border border-amber-200"
              : "text-red-600 bg-red-50"
          }`}>
            <p>{error}</p>
            {error.startsWith("Already reported") && (
              <a
                href={`/issues${duplicateId ? `?id=${duplicateId}` : ""}`}
                className="inline-flex items-center gap-1 mt-1.5 text-xs text-blue-600 hover:text-blue-800 hover:underline font-medium"
              >
                View open requests <ExternalLink size={10} />
              </a>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 size={14} className="animate-spin mr-1.5" />
                {uploadingFiles ? "Uploading…" : "Saving…"}
              </>
            ) : (
              "Save Bug"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
