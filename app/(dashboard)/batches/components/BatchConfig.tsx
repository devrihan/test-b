"use client";

import type { Batch } from "../../pdfExtract/lib/beaverApi";

/* ── Batch config display helpers ──────────────────────────────
   The question-paper set and the preprocessing/detection options are
   persisted at create time (set_name column + metadata) but were never
   surfaced back to operators. These small presentational pieces render
   them, and are shared by the queue list and the batch detail page so
   both stay consistent when options are added or changed.
   ───────────────────────────────────────────────────────────── */

/** Derive a flat list of human-readable config chips from a batch's metadata. */
export function getConfigItems(batch: Batch): { label: string; value: string }[] {
  const items: { label: string; value: string }[] = [];

  const pp = batch.metadata?.preprocessing;
  if (pp) {
    // sheet_type is the source of truth; fall back to legacy booklet_scan.
    const sheet = pp.sheet_type ?? (pp.booklet_scan ? "booklet" : "a4");
    items.push({ label: "Sheet", value: sheet === "booklet" ? "Booklet" : "A4" });
    if (sheet === "a4" && pp.margin_pct != null) {
      items.push({ label: "Margin", value: `${pp.margin_pct}%` });
    }
    if (pp.rotate_pages)    items.push({ label: "Rotate", value: "Booklet seq" });
    if (pp.rotate_a4_pages) items.push({ label: "Rotate", value: "A4 duplex" });
  }

  const grid = batch.metadata?.grading_grid_mode;
  if (grid) {
    items.push({ label: "Marks", value: grid === "table" ? "Grid table" : "OCR / manual" });
  }
  if (batch.metadata?.skip_bbox_flow) {
    items.push({ label: "Detection", value: "Skip regions" });
  }

  return items;
}

/** Prominent "Set A" pill. Renders nothing when the batch has no set. */
export function SetBadge({ setName, className = "" }: { setName?: string | null; className?: string }) {
  if (!setName) return null;
  return (
    <span
      className={`shrink-0 inline-flex items-center text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 ${className}`}
      title="Question paper set"
    >
      Set {setName}
    </span>
  );
}

/** Inline chip row of config options. `dense` shrinks padding for list rows. */
export function ConfigChips({ batch, dense = false }: { batch: Batch; dense?: boolean }) {
  const items = getConfigItems(batch);
  if (items.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((it, i) => (
        <span
          key={`${it.label}-${i}`}
          className={`inline-flex items-center gap-1 rounded-md bg-gray-100 text-gray-600 ${
            dense ? "text-[10px] px-1.5 py-0.5" : "text-xs px-2 py-1"
          }`}
        >
          <span className="font-semibold text-gray-400">{it.label}</span>
          <span className="font-medium text-gray-700">{it.value}</span>
        </span>
      ))}
    </div>
  );
}
