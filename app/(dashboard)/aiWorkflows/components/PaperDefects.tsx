"use client";

// Known defects of the paper: a wrong marking scheme, an ambiguous printed
// relation, mark totals that disagree between sections. Every brief written
// for this paper reads them, so an author never treats a scheme's mistake as
// the student's. Rows come from people here and from brief authors' own
// findings (source brief:<run>); retiring one hides it from future briefs.

import { useState } from "react";
import { ChevronDown, Plus, X } from "lucide-react";
import { Spinner, cn } from "@student-ds/ui";
import { useResource } from "../hooks/useApi";
import { addPaperDefect, errMsg, getPaperDefects, removePaperDefect, type PaperDefect } from "../lib/api";
import { relativeTime } from "../lib/readiness";

export function PaperDefects({ qp, disabled }: { qp: number; disabled: boolean }) {
  const defects = useResource((signal) => getPaperDefects(qp, signal), [qp]);
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<number | "add" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rows = defects.data?.defects ?? [];

  async function add() {
    setBusy("add");
    setError(null);
    try {
      await addPaperDefect(qp, { text: text.trim(), ...(question.trim() ? { question: Number(question) } : {}) });
      setText("");
      setQuestion("");
      defects.refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  async function retire(id: number) {
    setBusy(id);
    setError(null);
    try {
      await removePaperDefect(qp, id);
      defects.refresh();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="rounded-lg border border-gray-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left"
      >
        <span>
          <span className="text-sm font-semibold text-gray-900">Known defects of this paper</span>
          <span className="ml-2 text-xs text-gray-500">
            {defects.loading && !defects.data ? "loading…" : `${rows.length} recorded`} · read into every brief
          </span>
        </span>
        <ChevronDown className={cn("size-4 text-gray-500 transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="flex flex-col gap-3 border-t border-gray-200 px-4 py-3">
          <p className="text-xs text-gray-600">
            A wrong or incomplete marking scheme, an ambiguous printed question, mark totals that differ
            between sections. Brief authors copy these into the brief and never blame a student for them;
            what an author finds on its own is added here automatically.
          </p>
          {defects.error && <p className="text-xs text-rose-800">Could not load: {defects.error}</p>}
          {error && <p className="text-xs text-rose-800">{error}</p>}
          {rows.length > 0 && (
            <ul className="flex flex-col gap-1.5">
              {rows.map((d) => (
                <li key={d.id} className="flex items-start justify-between gap-3 rounded border border-gray-100 bg-gray-50 px-3 py-2 text-sm">
                  <div className="min-w-0">
                    <span className="font-medium text-gray-900">{d.question != null ? `Q${d.question}` : "Whole paper"}</span>
                    <span className="ml-2 text-gray-800">{d.text}</span>
                    <span className="mt-0.5 block text-[11px] text-gray-500">
                      {d.source}
                      {d.created_by ? ` · ${d.created_by}` : ""} · {relativeTime(d.created_at)}
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={disabled || busy !== null}
                    onClick={() => retire(d.id)}
                    title="Retire this defect — future briefs will not see it"
                    className="rounded border border-gray-200 bg-white p-1 text-gray-600 hover:border-rose-300 hover:text-rose-700 disabled:opacity-50"
                  >
                    {busy === d.id ? <Spinner className="size-3" /> : <X className="size-3" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap items-end gap-2">
            <label className="block w-24">
              <span className="block text-[11px] font-medium text-gray-700">Question</span>
              <input
                value={question}
                onChange={(e) => setQuestion(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="all"
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
              />
            </label>
            <label className="block min-w-[260px] flex-1">
              <span className="block text-[11px] font-medium text-gray-700">Defect</span>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="e.g. Q17.2 scheme stops at [a]; the question asks for a × b"
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
              />
            </label>
            <button
              type="button"
              disabled={disabled || busy !== null || text.trim().length < 3}
              onClick={add}
              className="inline-flex items-center gap-1 rounded border border-indigo-200 bg-indigo-50 px-2.5 py-1.5 text-sm font-medium text-indigo-800 hover:border-indigo-400 disabled:opacity-50"
            >
              {busy === "add" ? <Spinner className="size-3.5" /> : <Plus className="size-3.5" />}
              Add
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
