"use client";

import { useState } from "react";
import { Loader2, Plus, Save, X, Pencil, ChevronDown } from "lucide-react";
import type { SchoolOption, GradeOption, Section } from "../types";
import { API_BASE, authHeaders } from "../lib/api";
import { useCrudPanel } from "../hooks/useCrudPanel";
import { SmartSelect } from "./SmartSelect";
import { ErrorBanner } from "./ErrorBanner";

export function SectionsPanel({ schools, grades }: { schools: SchoolOption[]; grades: GradeOption[] }) {
  const [filterSchool, setFilterSchool] = useState("");
  const [filterGrade, setFilterGrade] = useState("");

  // params passed here re-trigger load whenever filterSchool/filterGrade changes
  const { items: sections, loading, error, setError, saving, editId, startEdit, cancelEdit, mutate } =
    useCrudPanel<Section>({
      endpoint: "/api/data-quality/sections",
      params: { schoolId: filterSchool, gradeId: filterGrade },
    });

  // Create-form state
  const [newSchool, setNewSchool] = useState("");
  const [newGrade, setNewGrade] = useState("");
  const [newName, setNewName] = useState("");

  // Inline-edit state
  const [editSchool, setEditSchool] = useState("");
  const [editGrade, setEditGrade] = useState("");
  const [editName, setEditName] = useState("");

  const schoolOpts = schools.map((s) => ({ label: s.name, value: String(s.id) }));
  const gradeOpts = grades.map((g) => ({ label: g.name, value: String(g.id) }));

  const schoolName = (id: number) => schools.find((s) => s.id === id)?.name ?? `#${id}`;
  const gradeName = (id: number) => grades.find((g) => g.id === id)?.name ?? `#${id}`;

  const handleCreate = async () => {
    if (!newSchool || !newGrade || !newName.trim()) {
      setError("School, grade and section name are all required");
      return;
    }
    const ok = await mutate(() =>
      fetch(`${API_BASE}/api/data-quality/sections`, {
        method: "POST",
        headers: authHeaders(true),
        body: JSON.stringify({
          schoolId: Number(newSchool),
          gradeId: Number(newGrade),
          name: newName.trim(),
        }),
      })
    );
    if (ok) {
      setNewSchool("");
      setNewGrade("");
      setNewName("");
    }
  };

  const beginEdit = (s: Section) => {
    setEditSchool(String(s.schoolId));
    setEditGrade(String(s.gradeId));
    setEditName(s.name);
    startEdit(s.id);
  };

  const handleCancelEdit = () => {
    cancelEdit();
    setEditSchool("");
    setEditGrade("");
    setEditName("");
  };

  const handleUpdate = async (id: number) => {
    if (!editSchool || !editGrade || !editName.trim()) {
      setError("School, grade and section name are all required");
      return;
    }
    const ok = await mutate(() =>
      fetch(`${API_BASE}/api/data-quality/sections/${id}`, {
        method: "PUT",
        headers: authHeaders(true),
        body: JSON.stringify({
          schoolId: Number(editSchool),
          gradeId: Number(editGrade),
          name: editName.trim(),
        }),
      })
    );
    // handleCancelEdit resets editId; without it the row stays in edit mode with empty inputs after refresh
    if (ok) handleCancelEdit();
  };

  return (
    <div className="space-y-4">
      {/* Create form */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <h2 className="text-base font-bold text-gray-900 mb-4">Add Section</h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-3">
          <SmartSelect
            label="School" required
            value={newSchool} options={schoolOpts}
            placeholder="Select school" helperText="No schools loaded"
            onChange={setNewSchool}
          />
          <SmartSelect
            label="Grade" required
            value={newGrade} options={gradeOpts}
            placeholder="Select grade" helperText="No grades loaded"
            onChange={setNewGrade}
          />
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1.5">
              Section Name <span className="text-red-400">*</span>
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. A"
              className="w-full h-9 px-3 text-sm border border-gray-200 rounded-lg
                         focus:outline-none focus:border-indigo-400
                         focus:ring-2 focus:ring-indigo-500/10 transition"
            />
          </div>
        </div>
        <button
          onClick={handleCreate}
          disabled={saving}
          className="h-9 px-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40
                     disabled:cursor-not-allowed text-white text-sm font-semibold
                     rounded-lg transition flex items-center justify-center gap-1.5"
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          Add Section
        </button>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* Sections list with filter controls */}
      <div className="bg-white border border-gray-200 rounded-2xl p-6">
        <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
          <h2 className="text-base font-bold text-gray-900">
            Sections {!loading && <span className="text-gray-400 font-medium">({sections.length})</span>}
          </h2>

          <div className="flex items-center gap-2">
            <div className="relative">
              <select
                value={filterSchool}
                onChange={(e) => setFilterSchool(e.target.value)}
                className={`h-8 pl-3 pr-8 text-xs font-medium rounded-lg border appearance-none
                            cursor-pointer transition focus:outline-none focus:ring-2
                            focus:ring-indigo-500/20 focus:border-indigo-400
                            ${filterSchool
                    ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                    : "bg-white border-gray-200 text-gray-500"}`}
              >
                <option value="">All schools</option>
                {schoolOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
            </div>

            <div className="relative">
              <select
                value={filterGrade}
                onChange={(e) => setFilterGrade(e.target.value)}
                className={`h-8 pl-3 pr-8 text-xs font-medium rounded-lg border appearance-none
                            cursor-pointer transition focus:outline-none focus:ring-2
                            focus:ring-indigo-500/20 focus:border-indigo-400
                            ${filterGrade
                    ? "bg-indigo-50 border-indigo-300 text-indigo-700"
                    : "bg-white border-gray-200 text-gray-500"}`}
              >
                <option value="">All grades</option>
                {gradeOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
            </div>

            {(filterSchool || filterGrade) && (
              <button
                onClick={() => { setFilterSchool(""); setFilterGrade(""); }}
                className="h-8 px-3 text-xs font-medium text-red-500 hover:text-red-600
                           border border-red-200 hover:border-red-300 rounded-lg transition"
              >
                Clear
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-10 text-gray-400">
            <Loader2 size={18} className="animate-spin" />
          </div>
        ) : sections.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">No sections match the current filters.</p>
        ) : (
          <div className="border border-gray-200 rounded-lg overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 text-left">
                  <th className="px-3 py-2 font-semibold text-gray-600">School</th>
                  <th className="px-3 py-2 font-semibold text-gray-600">Grade</th>
                  <th className="px-3 py-2 font-semibold text-gray-600">Section</th>
                  <th className="px-3 py-2 font-semibold text-gray-600 w-px whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((s) => (
                  <tr key={s.id} className="border-t border-gray-100">
                    {editId === s.id ? (
                      <>
                        <td className="px-3 py-2">
                          <SmartSelect label="" value={editSchool} options={schoolOpts} placeholder="School" onChange={setEditSchool} />
                        </td>
                        <td className="px-3 py-2">
                          <SmartSelect label="" value={editGrade} options={gradeOpts} placeholder="Grade" onChange={setEditGrade} />
                        </td>
                        <td className="px-3 py-2">
                          <input
                            type="text" value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full h-9 px-2 text-sm border border-gray-200 rounded-md
                                       focus:outline-none focus:border-indigo-400
                                       focus:ring-2 focus:ring-indigo-500/10 transition"
                          />
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            <button
                              onClick={() => handleUpdate(s.id)} disabled={saving}
                              className="flex items-center gap-1 h-8 px-2.5 bg-indigo-600
                                         hover:bg-indigo-700 disabled:opacity-40 text-white
                                         text-xs font-semibold rounded-md transition"
                            >
                              {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />} Save
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
                        <td className="px-3 py-2 text-gray-900">{schoolName(s.schoolId)}</td>
                        <td className="px-3 py-2 text-gray-500">{gradeName(s.gradeId)}</td>
                        <td className="px-3 py-2 text-gray-900 font-medium">{s.name}</td>
                        <td className="px-3 py-2">
                          <button
                            onClick={() => beginEdit(s)}
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
