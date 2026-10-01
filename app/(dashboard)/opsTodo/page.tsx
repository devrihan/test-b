"use client";

// Ops TO-DO — the answers only a person can unblock. Two kinds:
//   draw_bbox     an answer that lost marks but has no bounding box drawn, so
//                 nothing downstream (crop, OCR, classification) can happen.
//                 Closes itself when the box is saved in Answer Chunking.
//   verify_marks  the answer box and the marks grid disagree on the mark and the
//                 student's box marks do not add up to the recorded total, so the
//                 pipeline will not classify against it. Closes itself when a
//                 person sets the mark on the answer.
// The AI-workflows page and the section pipeline raise both.
//
// Not Manual Repair: that fixes whole booklets (pages, order, rotation). This
// is per answer.

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ExternalLink, RotateCcw, Trash2, XCircle } from "lucide-react";
import {
  getOpsTodos,
  opsTodoDismiss,
  opsTodoDone,
  opsTodoReopen,
  removeOpsTodo,
  type OpsTodoRow,
  type OpsTodoStatus,
} from "@/app/(dashboard)/pdfExtract/lib/beaverApi";

type Tab = "open" | "closed";

export default function OpsTodoPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("open");
  const [busyId, setBusyId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const open = useTodoList("open", true);
  const done = useTodoList("done", tab === "closed");
  const dismissed = useTodoList("dismissed", tab === "closed");

  const rows: OpsTodoRow[] = useMemo(
    () => (tab === "open" ? open.data ?? [] : [...(done.data ?? []), ...(dismissed.data ?? [])]),
    [tab, open.data, done.data, dismissed.data]
  );

  // Grouped by paper (batch), then student, so a person drawing boxes does one
  // booklet at a time rather than hopping between them.
  const groups = useMemo(() => {
    const byBatch = new Map<string, { head: OpsTodoRow; students: Map<string, OpsTodoRow[]> }>();
    for (const r of rows) {
      const g = byBatch.get(r.batch_id) ?? { head: r, students: new Map() };
      const list = g.students.get(r.student_id) ?? [];
      list.push(r);
      g.students.set(r.student_id, list);
      byBatch.set(r.batch_id, g);
    }
    return Array.from(byBatch.values()).sort((a, b) =>
      `${a.head.grade}${a.head.section}${a.head.subject}`.localeCompare(`${b.head.grade}${b.head.section}${b.head.subject}`)
    );
  }, [rows]);

  const refresh = () => Promise.all([open.reload(), done.reload(), dismissed.reload()]);

  async function act(id: number, fn: (id: number) => Promise<unknown>) {
    setBusyId(id);
    setError(null);
    try {
      await fn(id);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  }

  function openInChunking(r: OpsTodoRow) {
    const params = new URLSearchParams({ batchId: r.batch_id, studentId: r.student_id, q: r.question_key });
    if (r.school_name) params.set("school", r.school_name);
    if (r.grade) params.set("grade", r.grade);
    if (r.section) params.set("section", r.section);
    if (r.subject) params.set("subject", r.subject);
    if (r.exam_type) params.set("exam", r.exam_type);
    router.push(`/pdfExtract?${params.toString()}`);
  }

  const loading = tab === "open" ? open.isLoading : done.isLoading || dismissed.isLoading;
  const loadError = (tab === "open" ? open.error : done.error ?? dismissed.error) as Error | null;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-[1200px] px-6 py-6">
        <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Ops TO-DO</h1>
            <p className="mt-0.5 max-w-3xl text-sm text-gray-600">
              Answers only a person can unblock. <b>Draw a box</b>: the answer lost marks but has
              no bounding box, so it cannot be read or classified. <b>Check marks</b>: the answer
              box and the marks grid disagree and the student&apos;s marks do not add up, so the
              pipeline will not classify it until the mark is settled. Open the paper at the
              question, fix it, save — the entry closes itself.
            </p>
          </div>
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
            {(
              [
                ["open", `To do${open.data ? ` (${open.data.length})` : ""}`],
                ["closed", "Done & dismissed"],
              ] as [Tab, string][]
            ).map(([t, label]) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${
                  tab === t ? "bg-indigo-600 text-white" : "text-gray-600 hover:text-gray-900"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </header>

        {error && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            {error}
          </div>
        )}
        {loadError && (
          <div className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
            Could not load the list: {loadError.message}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-gray-500">Loading…</p>
        ) : groups.length === 0 ? (
          <div className="rounded-lg border border-gray-200 bg-white px-4 py-6 text-sm text-gray-600">
            {tab === "open"
              ? "Nothing to do. When the AI-workflows page finds an answer with no bounding box, it lands here."
              : "Nothing has been closed yet."}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {groups.map(({ head, students }) => (
              <section key={head.batch_id} className="rounded-lg border border-gray-200 bg-white">
                <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-gray-200 px-4 py-2.5">
                  <h2 className="text-sm font-semibold text-gray-900">
                    Grade {head.grade ?? "?"} · Section {head.section ?? "?"} · {head.subject ?? "?"}
                    {head.exam_type ? ` · ${head.exam_type}` : ""}
                  </h2>
                  <span className="font-mono text-[11px] text-gray-500">{head.batch_id}</span>
                </div>
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-gray-100 bg-gray-50/80 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
                      <th className="px-4 py-2">Student</th>
                      <th className="px-3 py-2">Roll</th>
                      <th className="px-3 py-2">Question</th>
                      <th className="px-3 py-2">Why</th>
                      <th className="px-3 py-2">Added</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {Array.from(students.values()).map((list) =>
                      list
                        .sort((a, b) => Number(a.question_key) - Number(b.question_key))
                        .map((r, i) => (
                          <tr key={r.id} className="border-b border-gray-100 align-top last:border-0">
                            <td className="px-4 py-2 font-medium text-gray-900">
                              {i === 0 ? r.student_name ?? r.student_id : ""}
                            </td>
                            <td className="px-3 py-2 text-gray-700">{i === 0 ? r.roll_number ?? "—" : ""}</td>
                            <td className="px-3 py-2 tabular-nums text-gray-900">
                              Q{r.question_key}
                              <span
                                className={`ml-1.5 rounded border px-1 py-0.5 text-[10px] font-medium ${
                                  r.kind === "verify_marks"
                                    ? "border-amber-200 bg-amber-50 text-amber-800"
                                    : "border-indigo-200 bg-indigo-50 text-indigo-800"
                                }`}
                              >
                                {r.kind === "verify_marks" ? "marks" : "bbox"}
                              </span>
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-600">
                              {r.reason ?? (r.kind === "verify_marks" ? "Mark in doubt." : "No bounding box drawn.")}
                              {r.status !== "open" && (
                                <span className="mt-0.5 block text-gray-400">
                                  {r.status} by {r.done_by ?? "—"}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs whitespace-nowrap text-gray-500">
                              {new Date(r.created_at).toLocaleDateString()} · {r.added_by ?? r.source ?? "—"}
                            </td>
                            <td className="px-3 py-2">
                              <div className="flex justify-end gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => openInChunking(r)}
                                  className="inline-flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-800 hover:border-indigo-400"
                                  title={
                                    r.kind === "verify_marks"
                                      ? "Open this paper at this question and settle the mark"
                                      : "Open this paper in Answer Chunking at this question"
                                  }
                                >
                                  <ExternalLink className="size-3" />
                                  {r.kind === "verify_marks" ? "Check marks" : "Draw"}
                                </button>
                                {r.status === "open" ? (
                                  <>
                                    <IconButton
                                      title="Mark done"
                                      busy={busyId === r.id}
                                      onClick={() => act(r.id, opsTodoDone)}
                                    >
                                      <CheckCircle2 className="size-3.5 text-emerald-700" />
                                    </IconButton>
                                    <IconButton
                                      title="Dismiss — nothing to draw (e.g. genuinely not attempted)"
                                      busy={busyId === r.id}
                                      onClick={() => act(r.id, opsTodoDismiss)}
                                    >
                                      <XCircle className="size-3.5 text-gray-600" />
                                    </IconButton>
                                  </>
                                ) : (
                                  <IconButton
                                    title="Reopen"
                                    busy={busyId === r.id}
                                    onClick={() => act(r.id, opsTodoReopen)}
                                  >
                                    <RotateCcw className="size-3.5 text-gray-700" />
                                  </IconButton>
                                )}
                                <IconButton
                                  title="Remove this entry"
                                  busy={busyId === r.id}
                                  onClick={() => act(r.id, removeOpsTodo)}
                                >
                                  <Trash2 className="size-3.5 text-rose-700" />
                                </IconButton>
                              </div>
                            </td>
                          </tr>
                        ))
                    )}
                  </tbody>
                </table>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** One status bucket of the list. Loads when `enabled` first becomes true and
 *  again on every `reload()`; a stale response from an earlier load is dropped. */
function useTodoList(status: OpsTodoStatus, enabled: boolean) {
  const [data, setData] = useState<OpsTodoRow[] | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setLoading] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setLoading(true);
    getOpsTodos({ status })
      .then((r) => { if (alive) { setData(r.rows); setError(null); } })
      .catch((e) => { if (alive) setError(e instanceof Error ? e : new Error(String(e))); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [status, enabled, tick]);

  const reload = useCallback(async () => {
    if (!enabled) return;
    setTick((t) => t + 1);
  }, [enabled]);

  return { data, error, isLoading, reload };
}

function IconButton({
  title,
  busy,
  onClick,
  children,
}: {
  title: string;
  busy: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={busy}
      onClick={onClick}
      className="rounded border border-gray-200 bg-white p-1 hover:border-gray-400 disabled:opacity-50"
    >
      {children}
    </button>
  );
}
