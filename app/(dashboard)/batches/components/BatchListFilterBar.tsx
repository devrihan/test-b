"use client";

import { useRouter } from "next/navigation";
import { ChevronDown, Layers, Plus, RefreshCw } from "lucide-react";
import { useBatchList } from "@/app/hooks/useBatchList";

// Rendered by the Header, but only on /batches — which is what keeps
// useBatchList (and its grade/subject/section params) off every other route.
export default function BatchListFilterBar({ loginUsername }: { loginUsername: string }) {
  const router = useRouter();
  const batchList = useBatchList();

  return (
    <div className="flex items-center gap-2 flex-wrap">

      <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 shrink-0">
        Filter:
      </span>

      {[
        { label: "Grade",   value: batchList.filterGrade,   options: batchList.grades,   set: batchList.setFilterGrade },
        { label: "Subject", value: batchList.filterSubject, options: batchList.subjects, set: batchList.setFilterSubject },
        { label: "Section", value: batchList.filterSection, options: batchList.sections, set: batchList.setFilterSection },
        { label: "Status",  value: batchList.filterStatus,  options: batchList.statuses, set: batchList.setFilterStatus },
      ].map(({ label, value, options, set }) => (
        <div key={label} className="relative">
          <select
            value    = {value}
            onChange = {e => set(e.target.value)}
            className={`h-8 pl-3 pr-8 text-xs font-medium rounded-lg border appearance-none cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 ${value ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-white border-gray-200 text-gray-500"}`}
          >
            <option value="">{label}</option>
            {options.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
        </div>
      ))}

      {(batchList.filterGrade || batchList.filterSection || batchList.filterSubject || batchList.filterStatus) && (
        <button
          onClick   = {batchList.clearFilters}
          className = "h-8 px-3 text-xs font-medium text-red-500 hover:text-red-600 border border-red-200 hover:border-red-300 rounded-lg transition"
        >
          Clear
        </button>
      )}

      <div className="w-px h-5 bg-gray-200 mx-1 shrink-0" />

      <button
        onClick   = {batchList.refresh}
        className = "flex items-center gap-1.5 h-8 px-3 bg-white border border-gray-200 text-gray-600 hover:border-indigo-400 hover:text-indigo-600 rounded-lg text-xs font-medium transition"
      >
        <RefreshCw size={12} /> Refresh
      </button>

      <button
        onClick   = {() => router.push("/batches/new")}
        className = "flex items-center gap-1.5 h-8 px-3 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition"
      >
        <Plus size={12} /> Create Batch
      </button>

      {loginUsername === "loamsupport" && (
        <button
          onClick   = {() => router.push("/batches/bulk")}
          className = "flex items-center gap-1.5 h-8 px-3 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition"
        >
          <Layers size={12} /> Bulk Batch Creation
        </button>
      )}

    </div>
  );
}
