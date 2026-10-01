"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronRight, PanelLeftClose, Pin, PinOff } from "lucide-react";
import type { BucketStatus } from "./lib";
import { columnsForPath, type TreeNode } from "./tree";

// Navigator — a collapsible, Finder-style "columns" drill-down that lives on the
// LEFT but does not permanently eat horizontal space.
//
//   collapsed  →  a slim rail (a handle + the current path as status dots)
//   open       →  Miller columns slide OVER the content (the detail dims behind);
//                 School → Grade → Subject·Exam → Section. Picking a section
//                 (a batch leaf) selects it and auto-collapses, handing the full
//                 width back to the batch detail.
//
// It opens on clicking the rail and closes on: picking a leaf, Esc, or clicking
// the scrim — unless "pinned" (kept open for rapid multi-batch triage).
//
// This is intentionally self-contained so it can later be promoted into a
// beaver-wide left navigator (see session follow-up): swap `roots`/`onSelectLeaf`
// for any TreeNode source and it works unchanged.

const DOT: Record<BucketStatus, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-rose-500",
  unknown: "bg-slate-400",
};

function StatusDot({ status, className = "" }: { status: BucketStatus; className?: string }) {
  return <span className={`rounded-full shrink-0 ${DOT[status]} ${className}`} />;
}

function countsTitle(n: TreeNode): string {
  const c = n.counts;
  const parts = [
    c.green && `${c.green} complete`,
    c.yellow && `${c.yellow} incomplete`,
    c.red && `${c.red} need review`,
    c.unknown && `${c.unknown} no-roster`,
  ].filter(Boolean);
  return parts.join(" · ") || "—";
}

function Row({
  node,
  active,
  onClick,
}: {
  node: TreeNode;
  active: boolean;
  onClick: () => void;
}) {
  const isLeaf = Boolean(node.batch);
  return (
    <button
      onClick={onClick}
      title={countsTitle(node)}
      className={`group/row flex items-center gap-2 w-full px-2.5 h-9 rounded-lg text-left transition ${
        active ? "bg-indigo-50 text-indigo-700" : "text-slate-700 hover:bg-slate-50"
      }`}
    >
      <StatusDot status={node.status} className="w-2 h-2" />
      <span className="flex-1 truncate text-sm font-medium">{node.label}</span>
      {isLeaf ? (
        <span className="text-[11px] tabular-nums text-slate-400">
          {node.batch!.arrived.length}/{node.batch!.expected ?? "?"}
        </span>
      ) : (
        <>
          <span className="text-[11px] tabular-nums text-slate-400">{node.leafCount}</span>
          <ChevronRight size={14} className={active ? "text-indigo-400" : "text-slate-300"} />
        </>
      )}
    </button>
  );
}

const COL_TITLES = ["School", "Grade", "Subject · Exam", "Section", "Batch"];

export default function Navigator({
  roots,
  selectedKey,
  onSelectLeaf,
  initialPath = [],
  defaultOpen,
}: {
  roots: TreeNode[];
  selectedKey: string | null;
  onSelectLeaf: (node: TreeNode) => void;
  /** Pre-expanded column path (node keys per level) — for restore / deep-link. */
  initialPath?: string[];
  /** Force the drawer's initial open state (defaults to: open iff nothing selected). */
  defaultOpen?: boolean;
}) {
  // Start open when nothing is selected yet, so the first thing ops sees is the
  // drill-down inviting them in; collapses itself once a section is chosen.
  const [open, setOpen] = useState(() => defaultOpen ?? !selectedKey);
  const [pinned, setPinned] = useState(false);
  const [path, setPath] = useState<string[]>(initialPath);

  const columns = useMemo(() => columnsForPath(roots, path), [roots, path]);

  // Breadcrumb nodes along the current path (for the collapsed rail + drawer head).
  const crumbs = useMemo(
    () => path.map((key, i) => columns[i]?.find((n) => n.key === key)).filter(Boolean) as TreeNode[],
    [path, columns],
  );

  // Esc closes (unless pinned).
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pinned) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, pinned]);

  const handleRow = (level: number, node: TreeNode) => {
    setPath([...path.slice(0, level), node.key]);
    if (node.batch) {
      onSelectLeaf(node);
      if (!pinned) setOpen(false);
    }
  };

  return (
    <>
      {/* ── slim rail (always in flow) ───────────────────────────── */}
      <div className="relative z-30 shrink-0 w-12 border-r border-slate-200 bg-white/80 backdrop-blur flex flex-col items-center py-3 gap-3">
        <button
          onClick={() => setOpen(true)}
          aria-label="Open navigator"
          title="Browse schools → grades → exams → sections"
          className="grid place-items-center w-8 h-8 rounded-lg text-slate-500 hover:bg-indigo-50 hover:text-indigo-600 transition"
        >
          {/* three-column glyph echoing Finder's columns view */}
          <span className="flex gap-[3px]" aria-hidden>
            <span className="w-[3px] h-4 rounded-full bg-current opacity-90" />
            <span className="w-[3px] h-4 rounded-full bg-current opacity-60" />
            <span className="w-[3px] h-4 rounded-full bg-current opacity-30" />
          </span>
        </button>

        {/* current path as stacked status dots (full label on hover) */}
        {crumbs.length > 0 && (
          <button
            onClick={() => setOpen(true)}
            className="flex flex-col items-center gap-2 mt-1"
            aria-label="Current selection — open to change"
          >
            {crumbs.map((c) => (
              <StatusDot key={c.key} status={c.status} className="w-2.5 h-2.5" />
            ))}
          </button>
        )}

        <span className="mt-auto text-[10px] font-semibold uppercase tracking-widest text-slate-300 [writing-mode:vertical-rl] rotate-180 select-none">
          Browse
        </span>
      </div>

      {/* ── overlay: scrim + sliding columns drawer ──────────────── */}
      <div
        className={`absolute inset-0 z-20 ${open ? "" : "pointer-events-none"}`}
        aria-hidden={!open}
      >
        {/* scrim over the detail (click to close) */}
        <div
          onClick={() => !pinned && setOpen(false)}
          className={`absolute inset-0 bg-slate-900/20 backdrop-blur-[1px] transition-opacity duration-200 ${
            open ? "opacity-100" : "opacity-0"
          }`}
        />

        {/* drawer, anchored to the rail's right edge */}
        <div
          className={`absolute inset-y-0 left-12 flex flex-col bg-white shadow-2xl border-r border-slate-200
                      transition-transform duration-200 ease-out ${
                        open ? "translate-x-0" : "-translate-x-[110%]"
                      }`}
        >
          {/* drawer header: breadcrumb + pin + close */}
          <div className="shrink-0 flex items-center gap-2 px-3 h-12 border-b border-slate-100">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-400">Browse</span>
            <div className="flex-1 min-w-0 flex items-center gap-1 text-xs text-slate-500 truncate">
              {crumbs.length === 0 ? (
                <span className="text-slate-400">Pick a school to start</span>
              ) : (
                crumbs.map((c, i) => (
                  <span key={c.key} className="inline-flex items-center gap-1 min-w-0">
                    {i > 0 && <ChevronRight size={12} className="text-slate-300 shrink-0" />}
                    <span className="truncate max-w-[120px] font-medium text-slate-600">{c.label}</span>
                  </span>
                ))
              )}
            </div>
            <button
              onClick={() => setPinned((v) => !v)}
              aria-label={pinned ? "Unpin navigator" : "Pin navigator open"}
              title={pinned ? "Unpin (auto-close on select)" : "Pin open"}
              className={`grid place-items-center w-7 h-7 rounded-md transition ${
                pinned ? "bg-indigo-50 text-indigo-600" : "text-slate-400 hover:bg-slate-100"
              }`}
            >
              {pinned ? <Pin size={14} /> : <PinOff size={14} />}
            </button>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close navigator"
              className="grid place-items-center w-7 h-7 rounded-md text-slate-400 hover:bg-slate-100"
            >
              <PanelLeftClose size={15} />
            </button>
          </div>

          {/* the Finder columns */}
          <div className="flex-1 min-h-0 flex overflow-x-auto">
            {columns.map((col, level) => (
              <div
                key={level}
                className="w-52 shrink-0 flex flex-col border-r border-slate-100 last:border-r-0"
              >
                <div className="shrink-0 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100">
                  {COL_TITLES[level] ?? "Items"}
                </div>
                <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
                  {col.map((node) => (
                    <Row
                      key={node.key}
                      node={node}
                      active={path[level] === node.key || selectedKey === node.key}
                      onClick={() => handleRow(level, node)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}
