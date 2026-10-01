"use client";

import type { Dispatch, SetStateAction } from "react";

/* ── Batch Options ────────────────────────────────────────────
   Scan preprocessing, detection and marks-extraction options that
   are identical between single and bulk batch creation. Extracted
   so both screens stay in sync when options are added or changed.
   ───────────────────────────────────────────────────────────── */

export type BatchOptionsForm = {
  grading_grid_mode: "table" | "none";
  skip_bbox_flow: boolean;
  sheet_type: "booklet" | "a4";
  margin_pct: string;
  rotate_pages: boolean;
  rotate_a4_pages: boolean;
};

export default function BatchOptions<T extends BatchOptionsForm>({
  form,
  setForm,
}: {
  form: T;
  setForm: Dispatch<SetStateAction<T>>;
}) {
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-2">
        Scan Preprocessing
      </label>

      {/* Sheet type — Booklet vs A4 (mutually exclusive) */}
      <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition mb-2">
        <input
          type="radio"
          name="sheet_type"
          checked={form.sheet_type === "booklet"}
          onChange={() => setForm(prev => ({ ...prev, sheet_type: "booklet", margin_pct: "6" }))}
          className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
        />
        <div>
          <span className="text-sm font-medium text-gray-700">
            Booklet scan (split pages horizontally and reorder)
          </span>
          <p className="text-xs text-gray-500 mt-0.5">
            For scanned booklets where each scan contains two pages. Will split and reorder to natural page sequence.
          </p>
        </div>
      </label>

      <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition mb-2">
        <input
          type="radio"
          name="sheet_type"
          checked={form.sheet_type === "a4"}
          onChange={() => setForm(prev => ({ ...prev, sheet_type: "a4" }))}
          className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
        />
        <div>
          <span className="text-sm font-medium text-gray-700">
            A4
          </span>
          <p className="text-xs text-gray-500 mt-0.5">
            For single-page A4 answer sheets. Set the label margin width below.
          </p>
        </div>
      </label>

      {/* Margin width — fixed at 6% for booklet, editable for A4 */}
      <div className="p-3 border border-gray-200 rounded-lg mb-3">
        <span className="text-sm font-medium text-gray-700">Margin width</span>
        <div className="flex items-center gap-2 mt-1.5">
          <input
            type="number"
            min={1}
            max={50}
            step={0.1}
            value={form.margin_pct}
            disabled={form.sheet_type === "booklet"}
            onChange={(e) => setForm(prev => ({ ...prev, margin_pct: e.target.value }))}
            onBlur={(e) => {
              const n = parseFloat(e.target.value);
              const clamped = isNaN(n) ? 6 : Math.min(50, Math.max(1, n));
              setForm(prev => ({ ...prev, margin_pct: String(clamped) }));
            }}
            className="w-20 px-2 py-1 border border-gray-300 rounded-md text-sm font-mono focus:ring-indigo-500 focus:border-indigo-500 disabled:bg-gray-100 disabled:text-gray-400"
          />
          <span className="text-sm text-gray-600">% of page width</span>
        </div>
        <p className="text-xs text-gray-500 mt-1">
          Left margin scanned for question labels during bbox detection. Fixed at 6% for booklet scans; editable (1–50%) for A4.
        </p>
      </div>

      {/* Rotate Pages Checkbox */}
      <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition mb-3">
        <input
          type="checkbox"
          checked={form.rotate_pages}
          onChange={(e) => setForm(prev => ({ ...prev, rotate_pages: e.target.checked }))}
          className="mt-0.5 text-indigo-600 focus:ring-indigo-500 rounded"
        />
        <div>
          <span className="text-sm font-medium text-gray-700">
            Rotate pages as per booklet scan sequence
          </span>
          <p className="text-xs text-gray-500 mt-0.5">
            Apply alternating 90°/-90° rotation for booklet scans where pages alternate orientation.
          </p>
        </div>
      </label>

      {/* Rotate A4 Pages Checkbox */}
      <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition mb-3">
        <input
          type="checkbox"
          checked={form.rotate_a4_pages}
          onChange={(e) => setForm(prev => ({ ...prev, rotate_a4_pages: e.target.checked }))}
          className="mt-0.5 text-indigo-600 focus:ring-indigo-500 rounded"
        />
        <div>
          <span className="text-sm font-medium text-gray-700">
            Rotate pages for A4 scan
          </span>
          <p className="text-xs text-gray-500 mt-0.5">
            Apply alternating -90°/90° rotation for A4 duplex scans where pages alternate orientation.
          </p>
        </div>
      </label>

      <label className="block text-xs font-semibold text-gray-600 mb-2 mt-4">
        Detection Options
      </label>

      {/* Skip BBox Flow Checkbox */}
      <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition mb-3">
        <input
          type="checkbox"
          checked={form.skip_bbox_flow}
          onChange={(e) => setForm(prev => ({ ...prev, skip_bbox_flow: e.target.checked }))}
          className="mt-0.5 text-indigo-600 focus:ring-indigo-500 rounded"
        />
        <div>
          <span className="text-sm font-medium text-gray-700">
            Skip answer region detection
          </span>
          <p className="text-xs text-gray-500 mt-0.5">
            Send full pages to OCR without detecting individual answer regions.
            {form.skip_bbox_flow && (
              <span className="text-amber-600 block mt-1">
                Note: Per-answer marks extraction from red ink is disabled in this mode.
              </span>
            )}
          </p>
        </div>
      </label>

      {/* Marks Extraction Method */}
      <label className="block text-xs font-semibold text-gray-600 mb-2 mt-4">
        Marks Extraction Method
      </label>
      <div className="space-y-2">
        <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition">
          <input
            type="radio"
            name="grading_grid_mode"
            value="table"
            checked={form.grading_grid_mode === "table"}
            onChange={() => setForm(prev => ({ ...prev, grading_grid_mode: "table" }))}
            className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
          />
          <div>
            <span className="text-sm font-medium text-gray-700">
              Extract from table on first page
            </span>
            <p className="text-xs text-gray-500 mt-0.5">
              Uses AI to read the grading grid table on the first page of each answer sheet
            </p>
          </div>
        </label>

        <label className="flex items-start gap-3 p-3 border border-gray-200 rounded-lg cursor-pointer hover:border-indigo-300 hover:bg-indigo-50/30 transition">
          <input
            type="radio"
            name="grading_grid_mode"
            value="none"
            checked={form.grading_grid_mode === "none"}
            onChange={() => setForm(prev => ({ ...prev, grading_grid_mode: "none" }))}
            className="mt-0.5 text-indigo-600 focus:ring-indigo-500"
          />
          <div>
            <span className="text-sm font-medium text-gray-700">
              {form.skip_bbox_flow ? "No marks extraction" : "Auto-extract from OCR only"}
            </span>
            <p className="text-xs text-gray-500 mt-0.5">
              {form.skip_bbox_flow
                ? "No automatic marks extraction — marks will need to be entered manually"
                : "Marks are automatically extracted from red ink via OCR when processing individual answers"
              }
            </p>
          </div>
        </label>
      </div>
    </div>
  );
}
