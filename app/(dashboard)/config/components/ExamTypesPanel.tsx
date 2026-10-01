"use client";

import { useState } from "react";
import { Loader2, Plus, Save, X, Pencil } from "lucide-react";
import { API_BASE, authHeaders } from "../lib/api";
import { useCrudPanel } from "../hooks/useCrudPanel";
import { ErrorBanner } from "./ErrorBanner";
import type { ExamType } from "../types";

export function ExamTypesPanel() {
  const { items, loading, error, setError, saving, editId, startEdit, cancelEdit, mutate } =
    useCrudPanel<ExamType>({
      endpoint: "/api/data-quality/exam-types",
      parseResponse: (d) => d.examTypes || [],
    });

  const [newName, setNewName] = useState("");
  const [editName, setEditName] = useState("");

  const handleCreate = async () => {
    if (!newName.trim()) {
      setError("Exam Type name is required");
      return;
    }
    const ok = await mutate(() =>
      fetch(`${API_BASE}/api/data-quality/exam-types`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ name: newName.trim() }),
      })
    );
    if (ok) setNewName("");
  };

  const beginEdit = (et: ExamType) => {
    setEditName(et.name);
    startEdit(et.id);
  };

  // wraps both hook cancelEdit and local editName so they always reset together
  const handleCancelEdit = () => {
    cancelEdit();
    setEditName("");
  };

  const handleUpdate = async (id: number) => {
    if (!editName.trim()) {
      setError("Exam Type name is required");
      return;
    }
    const ok = await mutate(() =>
      fetch(`${API_BASE}/api/data-quality/exam-types/${id}`, {
        method: "PUT",
        headers: authHeaders(true),
        body: JSON.stringify({ name: editName.trim() }),
      })
    );
    if (ok) {
      cancelEdit();
      setEditName("");
    }
  };

  return (
    <div className="space-y-4">
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h2 className="text-base font-bold text-gray-900 mb-4">Add Exam Type</h2>
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 items-end">
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Monthly Test"
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
          Exam Types{" "}
          {!loading && (
            <span className="text-gray-400 font-medium">({items.length})</span>
          )}
        </h2>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : items.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">
            No exam types configured yet.
          </p>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-3 py-2 font-semibold text-gray-600">Name</th>
                  <th className="px-3 py-2 font-semibold text-gray-600 w-px whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {items.map((et) => (
                  <tr key={et.id} className="border-t border-gray-100">
                    {editId === et.id ? (
                      <>
                        <td className="px-3 py-2">
                          <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full h-8 px-2 text-sm border border-gray-200 rounded-md
                                       focus:outline-none focus:border-indigo-400
                                       focus:ring-2 focus:ring-indigo-500/10 transition"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleUpdate(et.id)}
                              disabled={saving}
                              className="flex items-center gap-1 h-8 px-2.5 bg-indigo-600
                                         hover:bg-indigo-700 disabled:opacity-40 text-white
                                         text-xs font-semibold rounded-md transition"
                            >
                              {saving ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <Save size={12} />
                              )}
                              Save
                            </button>
                            <button
                              onClick={handleCancelEdit}
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
                        <td className="px-3 py-2 text-gray-900">{et.name}</td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => beginEdit(et)}
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
