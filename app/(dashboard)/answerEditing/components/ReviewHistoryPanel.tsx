"use client";

import { useCallback, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "@/app/lib/queryKeys";
import { X } from "lucide-react";
import {
  getReviewHistory,
  listReviewComments,
  addReviewComment,
  type Outcome,
  type ReviewEvent,
  type ReviewComment,
  type TimeSpent,
  type ReviewHistory,
} from "@/app/lib/reviewApi";

const NO_EVENTS: ReviewEvent[] = [];
const NO_COMMENTS: ReviewComment[] = [];
const NO_TIME_SPENT: TimeSpent[] = [];

// ── Outcome → badge styling ─────────────────────────────────────────────────
const OUTCOME_LABEL: Record<Outcome, string> = {
  ai_unchanged: "Unchanged",
  ai_edited: "Edited",
  ai_cleared: "Cleared",
  written_from_blank: "Written from blank",
  ai_regenerated: "Regenerated",
};

const OUTCOME_BADGE: Record<Outcome, string> = {
  ai_unchanged: "bg-gray-100 text-gray-600 border border-gray-200",
  ai_edited: "bg-blue-100 text-blue-700 border border-blue-200",
  ai_cleared: "bg-amber-100 text-amber-700 border border-amber-200",
  written_from_blank: "bg-green-100 text-green-700 border border-green-200",
  ai_regenerated: "bg-purple-100 text-purple-700 border border-purple-200",
};

function fmtTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function fmtMs(ms: number): string {
  if (!ms || ms < 0) return "0m";
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}

// ── Diff block (plain old → new) ────────────────────────────────────────────
// react-diff-viewer-continued was skipped (React 19 peer-dep risk); a simple
// side-by-side old/new block is sufficient for Phase A.
function TextDiff({
  oldText,
  newText,
}: {
  oldText: string | null;
  newText: string | null;
}) {
  const before = oldText ?? "";
  const after = newText ?? "";
  if (before === after) {
    return (
      <pre className="whitespace-pre-wrap break-words rounded bg-gray-50 p-2 text-xs text-gray-600">
        {after || <span className="italic text-gray-400">(empty)</span>}
      </pre>
    );
  }
  return (
    <div className="grid grid-cols-2 gap-2">
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-red-500">
          Before
        </div>
        <pre className="whitespace-pre-wrap break-words rounded border border-red-100 bg-red-50 p-2 text-xs text-red-800">
          {before || <span className="italic text-gray-400">(empty)</span>}
        </pre>
      </div>
      <div>
        <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-green-600">
          After
        </div>
        <pre className="whitespace-pre-wrap break-words rounded border border-green-100 bg-green-50 p-2 text-xs text-green-800">
          {after || <span className="italic text-gray-400">(empty)</span>}
        </pre>
      </div>
    </div>
  );
}

function EventCard({ event }: { event: ReviewEvent }) {
  const marksChanged =
    event.old_value?.marks !== event.new_value?.marks;
  return (
    <li className="relative pl-6">
      {/* timeline dot */}
      <span className="absolute left-0 top-1.5 h-2.5 w-2.5 -translate-x-[3px] rounded-full border-2 border-white bg-gray-300 ring-1 ring-gray-200" />
      <div className="rounded-lg border border-gray-200 bg-white p-3 shadow-sm">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-semibold text-gray-700">
            Q{event.action_ref?.question_key}
          </span>
          <span
            className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${
              OUTCOME_BADGE[event.outcome] ??
              "bg-gray-100 text-gray-600 border border-gray-200"
            }`}
          >
            {OUTCOME_LABEL[event.outcome] ?? event.outcome}
          </span>
          <span className="ml-auto text-xs text-gray-400">
            {fmtTime(event.created_at)}
          </span>
        </div>
        <div className="mb-2 text-xs text-gray-500">
          by <span className="font-medium text-gray-700">{event.actor}</span>
          {marksChanged && (
            <span className="ml-2">
              marks{" "}
              <span className="font-medium text-red-600">
                {event.old_value?.marks ?? "–"}
              </span>{" "}
              →{" "}
              <span className="font-medium text-green-700">
                {event.new_value?.marks ?? "–"}
              </span>
            </span>
          )}
        </div>
        <TextDiff
          oldText={event.old_value?.ocr_text ?? null}
          newText={event.new_value?.ocr_text ?? null}
        />
      </div>
    </li>
  );
}

function TimeSpentSummary({ rows }: { rows: TimeSpent[] }) {
  if (!rows || rows.length === 0) return null;
  const totalMs = rows.reduce((s, r) => s + (r.active_ms ?? 0), 0);
  return (
    <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Time spent
        </span>
        <span className="text-sm font-semibold text-gray-800">
          {fmtMs(totalMs)}
        </span>
      </div>
      <ul className="space-y-1">
        {rows.map((r) => (
          <li
            key={r.actor}
            className="flex items-center justify-between text-xs text-gray-600"
          >
            <span className="truncate">{r.actor}</span>
            <span className="ml-2 shrink-0 text-gray-500">
              {fmtMs(r.active_ms)} · {r.sessions} session
              {r.sessions === 1 ? "" : "s"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CommentThread({
  comments,
  onAdd,
  adding,
}: {
  comments: ReviewComment[];
  onAdd: (body: string) => void;
  adding: boolean;
}) {
  const [draft, setDraft] = useState("");
  const submit = () => {
    const body = draft.trim();
    if (!body) return;
    onAdd(body);
    setDraft("");
  };
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {comments.length === 0 ? (
          <p className="text-xs italic text-gray-400">No comments yet.</p>
        ) : (
          comments.map((c) => (
            <div
              key={c.id}
              className="rounded-lg border border-gray-200 bg-white p-3"
            >
              <div className="mb-1 flex items-center gap-2">
                <span className="text-xs font-semibold text-gray-700">
                  {c.author}
                </span>
                {c.action_ref?.question_key && (
                  <span className="font-mono text-[11px] text-gray-400">
                    Q{c.action_ref.question_key}
                  </span>
                )}
                {c.resolved && (
                  <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-medium text-green-700">
                    resolved
                  </span>
                )}
                <span className="ml-auto text-[11px] text-gray-400">
                  {fmtTime(c.created_at)}
                </span>
              </div>
              <p className="whitespace-pre-wrap break-words text-sm text-gray-700">
                {c.body}
              </p>
            </div>
          ))
        )}
      </div>
      <div className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              submit();
            }
          }}
          rows={3}
          placeholder="Add a comment… (⌘/Ctrl+Enter to send)"
          className="w-full resize-y rounded-md border border-gray-300 p-2 text-sm focus:border-gray-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={submit}
          disabled={adding || !draft.trim()}
          className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
        >
          {adding ? "Adding…" : "Add comment"}
        </button>
      </div>
    </div>
  );
}

interface ReviewHistoryPanelProps {
  batchId: string;
  studentId: string;
  /** When false, the panel is closed and renders nothing. */
  open: boolean;
  onClose: () => void;
}

export default function ReviewHistoryPanel({
  batchId,
  studentId,
  open,
  onClose,
}: ReviewHistoryPanelProps) {
  const queryClient = useQueryClient();
  const [actionError, setError] = useState<string | null>(null);

  // batchId + studentId are in the key, and the panel only fetches while it is
  // open — so a slow reply for a previously-viewed paper can't land here.
  const historyQuery = useQuery({
    queryKey: keys.review.history(batchId, studentId),
    queryFn: () => getReviewHistory({ batchId, studentId }),
    enabled: open && !!batchId && !!studentId,
  });

  const events = historyQuery.data?.events ?? NO_EVENTS;
  const comments = historyQuery.data?.comments ?? NO_COMMENTS;
  const timeSpent = historyQuery.data?.time_spent ?? NO_TIME_SPENT;
  const loading = historyQuery.isPending;
  const error =
    actionError ??
    (historyQuery.error instanceof Error ? historyQuery.error.message : null);

  const addCommentMutation = useMutation({
    mutationFn: async (body: string) => {
      await addReviewComment({ batchId, studentId, body });
      // Re-fetch comments so we show the server-authored row (author, id, ts).
      return listReviewComments({ batchId, studentId });
    },
    onSuccess: fresh =>
      queryClient.setQueryData<ReviewHistory>(
        keys.review.history(batchId, studentId),
        prev => (prev ? { ...prev, comments: fresh } : prev),
      ),
    onError: e =>
      setError(e instanceof Error ? e.message : "Failed to add comment"),
  });

  const adding = addCommentMutation.isPending;

  const handleAddComment = useCallback(
    async (body: string) => {
      if (!batchId || !studentId) return;
      setError(null);
      try {
        await addCommentMutation.mutateAsync(body);
      } catch {
        /* surfaced via onError */
      }
    },
    [batchId, studentId, addCommentMutation]
  );

  if (!open) return null;

  return (
    <>
      {/* backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/20"
        onClick={onClose}
        aria-hidden
      />
      {/* drawer */}
      <aside className="fixed right-0 top-0 z-50 flex h-full w-[440px] max-w-[90vw] flex-col border-l border-gray-200 bg-white shadow-xl">
        <header className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-800">
              Review history
            </h2>
            <p className="text-xs text-gray-400">
              Batch {batchId} · Student {studentId}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          {loading && (
            <p className="text-sm text-gray-400">Loading history…</p>
          )}
          {error && (
            <p className="rounded-md bg-red-50 p-2 text-sm text-red-600">
              {error}
            </p>
          )}

          {!loading && !error && (
            <>
              <TimeSpentSummary rows={timeSpent} />

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Timeline ({events.length})
                </h3>
                {events.length === 0 ? (
                  <p className="text-xs italic text-gray-400">
                    No edit events recorded.
                  </p>
                ) : (
                  <ol className="space-y-3 border-l border-gray-200">
                    {events.map((ev) => (
                      <EventCard key={ev.id} event={ev} />
                    ))}
                  </ol>
                )}
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Comments ({comments.length})
                </h3>
                <CommentThread
                  comments={comments}
                  onAdd={handleAddComment}
                  adding={adding}
                />
              </section>
            </>
          )}
        </div>
      </aside>
    </>
  );
}
