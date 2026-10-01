"use client";

import { useState } from "react";
import { Loader2, Plus, Save, X, Pencil } from "lucide-react";
import type { AcademicYear } from "../types";
import { API_BASE, authHeaders } from "../lib/api";
import { useCrudPanel } from "../hooks/useCrudPanel";
import { ErrorBanner } from "./ErrorBanner";

export function AcademicYearsPanel() {
  const { items, loading, error, setError, saving, editId, startEdit, cancelEdit, mutate } =
    useCrudPanel<AcademicYear>({
      endpoint: "/api/data-quality/academic-years",
      parseResponse: (d) => d.academicYears ?? [],
    });

  const [newYearFrom, setNewYearFrom] = useState("");
  const [newYearTo, setNewYearTo] = useState("");

  const [editYearFrom, setEditYearFrom] = useState("");
  const [editYearTo, setEditYearTo] = useState("");

  // returns parsed ints or sets an error and returns null — callers just check for null
  const validate = (yearFromStr: string, yearToStr: string): { from: number; to: number } | null => {
    const from = parseInt(yearFromStr, 10);
    const to = parseInt(yearToStr, 10);
    if (!yearFromStr || !yearToStr || isNaN(from) || isNaN(to)) {
      setError("Both Year From and Year To are required");
      return null;
    }
    if (to <= from) {
      setError("Year To must be greater than Year From");
      return null;
    }
    return { from, to };
  };

  const handleCreate = async () => {
    const parsed = validate(newYearFrom, newYearTo);
    if (!parsed) return;
    const ok = await mutate(() =>
      fetch(`${API_BASE}/api/data-quality/academic-years`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ yearFrom: parsed.from, yearTo: parsed.to }),
      })
    );
    if (ok) {
      setNewYearFrom("");
      setNewYearTo("");
    }
  };

  const handleUpdate = async (id: number) => {
    const parsed = validate(editYearFrom, editYearTo);
    if (!parsed) return;
    const ok = await mutate(() =>
      fetch(`${API_BASE}/api/data-quality/academic-years/${id}`, {
        method: "PUT",
        headers: authHeaders(true),
        body: JSON.stringify({ yearFrom: parsed.from, yearTo: parsed.to }),
      })
    );
    if (ok) cancelEdit();
  };

  const openEdit = (ay: AcademicYear) => {
    startEdit(ay.id);
    setEditYearFrom(String(ay.yearFrom));
    setEditYearTo(String(ay.yearTo));
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h2 className="text-base font-bold text-gray-900 mb-4">Add Academic Year</h2>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Year From <span className="text-red-400">*</span>
            </label>
            <input
              type="number" min="2000" max="2100"
              value={newYearFrom}
              onChange={e => setNewYearFrom(e.target.value)}
              placeholder="e.g. 2024"
              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg
                         focus:outline-none focus:border-indigo-400
                         focus:ring-2 focus:ring-indigo-500/10 transition"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Year To <span className="text-red-400">*</span>
            </label>
            <input
              type="number" min="2000" max="2100"
              value={newYearTo}
              onChange={e => setNewYearTo(e.target.value)}
              placeholder="e.g. 2025"
              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg
                         focus:outline-none focus:border-indigo-400
                         focus:ring-2 focus:ring-indigo-500/10 transition"
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={saving}
            className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40
                       disabled:cursor-not-allowed text-white text-sm font-semibold
                       rounded-lg transition flex items-center justify-center gap-1.5"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add
          </button>
        </div>
      </div>

      {error && <ErrorBanner message={error} />}

      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h2 className="text-base font-bold text-gray-900 mb-4">
          Academic Years {!loading && <span className="text-gray-400 font-medium">({items.length})</span>}
        </h2>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">No academic years configured yet.</p>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-3 py-2 font-semibold text-gray-600">Year From</th>
                  <th className="px-3 py-2 font-semibold text-gray-600">Year To</th>
                  <th className="px-3 py-2 font-semibold text-gray-600 w-px whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map(ay => (
                  <tr key={ay.id} className="border-t border-gray-100">
                    {editId === ay.id ? (
                      <>
                        <td className="px-3 py-2">
                          <input
                            type="number" min="2000" max="2100"
                            value={editYearFrom}
                            onChange={e => setEditYearFrom(e.target.value)}
                            className="w-full h-8 px-2 text-sm border border-gray-200 rounded-md
                                       focus:outline-none focus:border-indigo-400
                                       focus:ring-2 focus:ring-indigo-500/10 transition"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="number" min="2000" max="2100"
                            value={editYearTo}
                            onChange={e => setEditYearTo(e.target.value)}
                            className="w-full h-8 px-2 text-sm border border-gray-200 rounded-md
                                       focus:outline-none focus:border-indigo-400
                                       focus:ring-2 focus:ring-indigo-500/10 transition"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleUpdate(ay.id)}
                              disabled={saving}
                              className="flex items-center gap-1 h-8 px-2.5 bg-indigo-600
                                         hover:bg-indigo-700 disabled:opacity-40 text-white
                                         text-xs font-semibold rounded-md transition"
                            >
                              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
                            </button>
                            <button
                              onClick={cancelEdit}
                              className="flex items-center h-8 px-2 text-gray-500
                                         hover:text-gray-700 text-xs font-medium
                                         border border-gray-200 rounded-md transition"
                            >
                              <X size={12} />
                            </button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-3 py-2 text-gray-900">{ay.yearFrom}</td>
                        <td className="px-3 py-2 text-gray-900">{ay.yearTo}</td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => openEdit(ay)}
                            className="flex items-center gap-1 h-8 px-2.5 text-gray-600
                                       hover:text-indigo-600 text-xs font-medium border
                                       border-gray-200 hover:border-indigo-300 rounded-md transition"
                          >
                            <Pencil size={12} /> Edit
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
