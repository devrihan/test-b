import { useCallback, useEffect, useMemo, useState } from "react";
import { listBugs, updateBugStatus } from "@/app/components/bug-report/bugsApi";
import type { Issue, IssueFilters } from "../lib/types";

export function useIssuesList() {
  const [allIssues, setAllIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<IssueFilters>({
    status: "open",
    bug_type: "all",
    priority: "all",
    assignee: "all",
    search: "",
  });
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const fetch_ = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await listBugs();
      setAllIssues((res.rows as Issue[]).filter((i) => i.bug_type === "bug"));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load issues");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  const openCount = useMemo(() => allIssues.filter((i) => i.status === "open").length, [allIssues]);
  const resolvedCount = useMemo(() => allIssues.filter((i) => i.status === "resolved").length, [allIssues]);

  const assignees = useMemo(() => {
    const map = new Map<string, string>();
    for (const i of allIssues) {
      if (i.assignee_id && i.assignee_name) map.set(i.assignee_id, i.assignee_name);
    }
    return Array.from(map, ([id, name]) => ({ id, name }));
  }, [allIssues]);

  const issues = useMemo(() => {
    let rows = allIssues;
    if (filters.status !== "all") rows = rows.filter((r) => r.status === filters.status);
    if (filters.bug_type !== "all") rows = rows.filter((r) => r.bug_type === filters.bug_type);
    if (filters.priority !== "all") rows = rows.filter((r) => r.priority === filters.priority);
    if (filters.assignee !== "all") rows = rows.filter((r) => r.assignee_id === filters.assignee);
    if (filters.search) {
      const q = filters.search.toLowerCase();
      rows = rows.filter((r) =>
        (r.title ?? "").toLowerCase().includes(q) ||
        (r.comments ?? "").toLowerCase().includes(q) ||
        (r.batch_id ?? "").toLowerCase().includes(q) ||
        (r.student_name ?? "").toLowerCase().includes(q) ||
        (r.reporter_name ?? "").toLowerCase().includes(q),
      );
    }
    return rows;
  }, [allIssues, filters]);

  const toggleStatus = useCallback(async (id: number, current: string) => {
    const next = current === "open" ? "resolved" : "open";
    setUpdatingId(id);
    try {
      const updated = await updateBugStatus(id, next as "open" | "resolved");
      setAllIssues((prev) =>
        prev.map((i) => (i.id === id ? { ...i, ...updated } as Issue : i)),
      );
      return updated;
    } finally {
      setUpdatingId(null);
    }
  }, []);

  const updateIssueInList = useCallback((updated: Issue) => {
    setAllIssues((prev) => prev.map((i) => (i.id === updated.id ? { ...i, ...updated } : i)));
  }, []);

  return {
    issues,
    allIssues,
    loading,
    error,
    filters,
    setFilters,
    refresh: fetch_,
    toggleStatus,
    updatingId,
    openCount,
    resolvedCount,
    assignees,
    updateIssueInList,
  };
}
