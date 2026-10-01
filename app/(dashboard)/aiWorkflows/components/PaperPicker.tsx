"use client";

// Searchable paper picker. Only papers with scanned batches come back from the
// API, so an empty list means nothing has been scanned yet — say so.

import { useMemo, useRef, useState, useEffect } from "react";
import { Spinner, cn } from "@student-ds/ui";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { paperName, type Paper } from "../lib/api";

export function PaperPicker({
  papers,
  loading,
  error,
  value,
  onChange,
}: {
  papers: Paper[] | null;
  loading: boolean;
  error: string | null;
  value: string | null;
  onChange: (qpId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // The paper id lives in the URL, so it arrives as a string.
  const selected = papers?.find((p) => String(p.qp) === value) ?? null;

  const matches = useMemo(() => {
    const list = papers ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((p) =>
      [p.display_name, p.grade, p.subject, p.exam, p.exam_type, p.qp]
        .filter((v) => v != null)
        .join(" ")
        .toLowerCase()
        .includes(q)
    );
  }, [papers, query]);

  return (
    <div className="relative w-full max-w-md" ref={boxRef}>
      <button
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          setQuery("");
        }}
        disabled={loading || !!error}
        className="flex w-full items-center justify-between gap-3 rounded-lg border border-gray-300 bg-white px-3 py-2 text-left text-sm shadow-xs transition hover:border-gray-400 disabled:cursor-not-allowed disabled:bg-gray-50 disabled:text-gray-400"
      >
        <span className="min-w-0 flex-1">
          {loading ? (
            <span className="flex items-center gap-2 text-gray-500">
              <Spinner className="size-3.5" /> Loading papers…
            </span>
          ) : error ? (
            <span className="text-rose-700">Could not load the paper list</span>
          ) : selected ? (
            <span className="block truncate">
              <span className="font-semibold text-gray-900">
                Grade {selected.grade} · {selected.subject}
              </span>
              <span className="text-gray-500"> — {paperName(selected)}</span>
            </span>
          ) : (
            <span className="text-gray-500">Choose a paper to work on…</span>
          )}
        </span>
        <ChevronsUpDown className="size-4 shrink-0 text-gray-400" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center gap-2 border-b border-gray-100 px-3 py-2">
            <Search className="size-4 shrink-0 text-gray-400" />
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by grade, subject or exam"
              className="w-full bg-transparent text-sm outline-none placeholder:text-gray-400"
            />
          </div>
          <div className="max-h-80 overflow-y-auto">
            {matches.length === 0 ? (
              <p className="px-3 py-4 text-sm text-gray-500">
                {papers && papers.length === 0
                  ? "No papers have scanned batches yet. Scan a batch first, then come back here."
                  : `Nothing matches “${query}”.`}
              </p>
            ) : (
              matches.map((p) => {
                const on = String(p.qp) === value;
                return (
                  <button
                    key={p.qp}
                    type="button"
                    onClick={() => {
                      onChange(String(p.qp));
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-gray-50",
                      on && "bg-indigo-50/60"
                    )}
                  >
                    <Check
                      className={cn(
                        "mt-0.5 size-4 shrink-0",
                        on ? "text-indigo-600" : "text-transparent"
                      )}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium text-gray-900">
                        Grade {p.grade} · {p.subject} — {paperName(p)}
                      </span>
                      <span className="block text-xs text-gray-500">
                        paper {p.qp} · {p.batches} batch{p.batches === 1 ? "" : "es"} ·{" "}
                        {p.students} student{p.students === 1 ? "" : "s"} ·{" "}
                        {p.sections} section{p.sections === 1 ? "" : "s"}
                      </span>
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Restates which paper everything below is scoped to. Section letters come
 * from the readiness response when it has loaded — the paper list only carries
 * a count.
 */
export function PaperSummary({
  paper,
  sections,
}: {
  paper: Paper;
  sections?: string[];
}) {
  return (
    <p className="text-xs text-gray-500">
      Paper {paper.qp} · {paper.exam}
      {paper.exam_date ? ` · sat ${paper.exam_date}` : ""}
      {paper.max_marks ? ` · ${paper.max_marks} marks` : ""} · {paper.students}{" "}
      student{paper.students === 1 ? "" : "s"} across {paper.sections} section
      {paper.sections === 1 ? "" : "s"}
      {sections?.length ? ` (${sections.join(" ")})` : ""}
    </p>
  );
}

export function noPaperChosen() {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-white px-6 py-12 text-center">
      <p className="text-sm font-medium text-gray-900">Pick a paper to begin</p>
      <p className="mt-1 text-sm text-gray-500">
        Everything on this page is scoped to one question paper. Choose one above
        and its questions, runs and readiness checks will appear here.
      </p>
    </div>
  );
}
