"use client";

import { useState } from "react";
import { Loader2, Plus, Save, Pencil } from "lucide-react";
import { API_BASE, authHeaders } from "../lib/api";
import { useCrudPanel } from "../hooks/useCrudPanel";
import { ErrorBanner } from "./ErrorBanner";

export function SchoolsPanel() {
  const panel = useCrudPanel<{ id: number; name: string }>({
    endpoint: "/api/data-quality/schools",
  });

  const [newName, setNewName] = useState("");
  const [editName, setEditName] = useState("");

  const handleCreate = async () => {
    if (!newName.trim()) {
      panel.setError("School name is required");
      return;
    }
    const ok = await panel.mutate(() =>
      fetch(`${API_BASE}/api/data-quality/schools`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({ name: newName.trim() }),
      })
    );
    if (ok) setNewName("");
  };

  const handleUpdate = async (id: number) => {
    if (!editName.trim()) {
      panel.setError("School name is required");
      return;
    }
    const ok = await panel.mutate(() =>
      fetch(`${API_BASE}/api/data-quality/schools/${id}`, {
        method: "PUT",
        headers: authHeaders(true),
        body: JSON.stringify({ name: editName.trim() }),
      })
    );
    if (ok) panel.cancelEdit();
  };

  const startEdit = (school: { id: number; name: string }) => {
    panel.startEdit(school.id);
    setEditName(school.name);
  };

  return (
    <div className="space-y-4">
      {/* Create form */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h2 className="text-base font-bold text-gray-900 mb-4">Add School</h2>
        <div className="flex gap-3 items-end">
          <div className="flex-1">
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              School Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. KV"
              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg
                         focus:outline-none focus:border-indigo-400
                         focus:ring-2 focus:ring-indigo-500/10 transition"
            />
          </div>
          <button
            onClick={handleCreate}
            disabled={panel.saving}
            className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40
                       disabled:cursor-not-allowed text-white text-sm font-semibold
                       rounded-lg transition flex items-center justify-center gap-1.5 shrink-0"
          >
            {panel.saving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Plus size={14} />
            )}
            Add
          </button>
        </div>
      </div>

      {panel.error && <ErrorBanner message={panel.error} />}

      {/* Schools list */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h2 className="text-base font-bold text-gray-900 mb-4">
          Schools{" "}
          {!panel.loading && (
            <span className="text-gray-400 font-medium">
              ({panel.items.length})
            </span>
          )}
        </h2>

        {panel.loading ? (
          <div className="flex justify-center py-10 text-gray-400">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : panel.items.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">
            No schools found.
          </p>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-3 py-2 font-semibold text-gray-600">
                    Name
                  </th>
                  <th className="px-3 py-2 font-semibold text-gray-600 w-px whitespace-nowrap">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {panel.items.map((school) =>
                  panel.editId === school.id ? (
                    <tr key={`${school.id}-edit`}>
                      <td
                        colSpan={2}
                        className="p-5 bg-indigo-50/40 border-y border-indigo-100"
                      >
                        <div className="flex gap-4 items-end">
                          <div className="flex-1">
                            <label className="block text-xs font-semibold text-gray-700 mb-1.5">
                              School Name
                            </label>
                            <input
                              type="text"
                              value={editName}
                              onChange={(e) => setEditName(e.target.value)}
                              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-md
                                         focus:outline-none focus:border-indigo-400
                                         focus:ring-2 focus:ring-indigo-500/10 transition bg-white"
                            />
                          </div>
                          <div className="flex justify-end gap-2 shrink-0">
                            <button
                              onClick={panel.cancelEdit}
                              className="h-9 px-4 text-gray-600 hover:bg-gray-100/50
                                         text-sm font-semibold rounded-lg transition"
                            >
                              Cancel
                            </button>
                            <button
                              onClick={() => handleUpdate(school.id)}
                              disabled={panel.saving}
                              className="flex items-center gap-2 h-9 px-4 bg-indigo-600
                                         hover:bg-indigo-700 disabled:opacity-40 text-white
                                         text-sm font-semibold rounded-lg shadow-sm transition"
                            >
                              {panel.saving ? (
                                <Loader2 size={14} className="animate-spin" />
                              ) : (
                                <Save size={14} />
                              )}
                              Save
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={school.id} className="border-t border-gray-100">
                      <td className="px-3 py-2 text-gray-900 font-medium">
                        {school.name}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => startEdit(school)}
                          className="flex items-center gap-1 h-8 px-2.5 text-gray-600
                                     hover:text-indigo-600 text-xs font-medium border
                                     border-gray-200 hover:border-indigo-300 rounded-md transition"
                        >
                          <Pencil size={12} /> Edit
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
