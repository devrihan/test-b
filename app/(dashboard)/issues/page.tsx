"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Bug, Loader2, RefreshCw } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useIssuesList } from "./hooks/useIssuesList";
import IssueRow from "./components/IssueRow";
import IssueFilters from "./components/IssueFilters";
import IssueDetail from "./components/IssueDetail";
import type { Issue } from "./lib/types";

export default function IssuesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [selectedIssue, setSelectedIssue] = useState<Issue | null>(null);
  const {
    issues,
    allIssues,
    loading,
    error,
    filters,
    setFilters,
    refresh,
    toggleStatus,
    updatingId,
    openCount,
    resolvedCount,
    assignees,
    updateIssueInList,
  } = useIssuesList();

  const dismissedRef = useRef(false);

  useEffect(() => {
    const id = searchParams.get("id");
    if (!id) { dismissedRef.current = false; return; }
    if (dismissedRef.current) return;
    if (allIssues.length > 0 && !selectedIssue) {
      const found = allIssues.find((i) => i.id === Number(id));
      if (found) setSelectedIssue(found);
    }
  }, [searchParams, allIssues, selectedIssue]);

  const [refreshing, setRefreshing] = useState(false);
  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleToggleStatus = useCallback(async (id: number, current: string) => {
    try {
      const updated = await toggleStatus(id, current);
      if (selectedIssue?.id === id && updated) {
        setSelectedIssue((prev) =>
          prev ? { ...prev, ...updated } as Issue : null,
        );
      }
    } catch {
      // API failed; selectedIssue stays unchanged
    }
  }, [toggleStatus, selectedIssue]);

  const handleIssueUpdated = useCallback((updated: Issue) => {
    setSelectedIssue(updated);
    updateIssueInList(updated);
  }, [updateIssueInList]);

  if (selectedIssue) {
    return (
      <div className="min-h-screen bg-white">
        <div className="max-w-6xl mx-auto px-8 py-8">
          <IssueDetail
            issue={selectedIssue}
            onBack={() => { dismissedRef.current = true; setSelectedIssue(null); router.replace("/issues"); }}
            onToggleStatus={handleToggleStatus}
            onIssueUpdated={handleIssueUpdated}
            updating={updatingId === selectedIssue.id}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <div className="max-w-5xl mx-auto px-8 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/")}
              className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 font-medium transition"
            >
              <ArrowLeft size={15} />
            </button>
            <h1 className="text-xl font-semibold text-gray-900">Issues</h1>
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 font-medium transition disabled:opacity-50"
            title="Refresh"
          >
            <RefreshCw size={15} className={refreshing ? "animate-spin" : ""} />
          </button>
        </div>

        <div className="border border-gray-200 rounded-lg overflow-hidden mt-5">
          <IssueFilters
            filters={filters}
            onChange={setFilters}
            openCount={openCount}
            resolvedCount={resolvedCount}
            assignees={assignees}
          />

          {loading && issues.length === 0 ? (
            <div className="flex items-center justify-center py-16 bg-white">
              <Loader2 size={20} className="animate-spin text-gray-400" />
            </div>
          ) : error ? (
            <div className="text-center py-16 bg-white">
              <p className="text-sm text-red-500 mb-2">{error}</p>
              <button onClick={refresh} className="text-xs text-blue-600 hover:underline">
                Try again
              </button>
            </div>
          ) : issues.length === 0 ? (
            <div className="text-center py-16 bg-white">
              <Bug size={28} className="mx-auto text-gray-300 mb-2" />
              <p className="text-sm text-gray-500 font-medium">No results matched your search</p>
              <p className="text-xs text-gray-400 mt-1">
                {filters.status !== "all" || filters.bug_type !== "all" || filters.priority !== "all" || filters.search
                  ? "Try different filters or clear your search"
                  : "Issues reported from any page will appear here"}
              </p>
            </div>
          ) : (
            <div className="bg-white">
              {issues.map((issue) => (
                <IssueRow
                  key={issue.id}
                  issue={issue}
                  onToggleStatus={handleToggleStatus}
                  updating={updatingId === issue.id}
                  onClick={() => setSelectedIssue(issue)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
