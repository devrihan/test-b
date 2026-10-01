"use client";

import { AlertCircle, CheckCircle2, ChevronDown, Search } from "lucide-react";
import type { IssueFilters as Filters } from "../lib/types";

interface Props {
  filters: Filters;
  onChange: (f: Filters) => void;
  openCount: number;
  resolvedCount: number;
  assignees: { id: string; name: string }[];
}

export default function IssueFilters({ filters, onChange, openCount, resolvedCount, assignees }: Props) {
  return (
    <div className="bg-gray-50 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => onChange({ ...filters, status: "open" })}
            className={`flex items-center gap-1.5 text-sm font-medium transition ${
              filters.status === "open" ? "text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <AlertCircle size={15} />
            <span>{openCount} Open</span>
          </button>
          <button
            onClick={() => onChange({ ...filters, status: "resolved" })}
            className={`flex items-center gap-1.5 text-sm font-medium transition ${
              filters.status === "resolved" ? "text-gray-900" : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <CheckCircle2 size={15} />
            <span>{resolvedCount} Resolved</span>
          </button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search issues..."
              value={filters.search}
              onChange={(e) => onChange({ ...filters, search: e.target.value })}
              className="pl-8 pr-3 py-1.5 text-sm border border-gray-200 rounded-md bg-white text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400 focus:border-blue-400 w-48"
            />
          </div>

          <div className="relative">
            <select
              value={filters.priority}
              onChange={(e) => onChange({ ...filters, priority: e.target.value as Filters["priority"] })}
              className="appearance-none pl-3 pr-7 py-1.5 text-sm border border-gray-200 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer"
            >
              <option value="all">Priority</option>
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
              <option value="critical">Critical</option>
            </select>
            <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
          </div>

          {assignees.length > 0 && (
            <div className="relative">
              <select
                value={filters.assignee}
                onChange={(e) => onChange({ ...filters, assignee: e.target.value })}
                className="appearance-none pl-3 pr-7 py-1.5 text-sm border border-gray-200 rounded-md bg-white text-gray-700 focus:outline-none focus:ring-1 focus:ring-blue-400 cursor-pointer"
              >
                <option value="all">Assignee</option>
                {assignees.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
              <ChevronDown size={13} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
