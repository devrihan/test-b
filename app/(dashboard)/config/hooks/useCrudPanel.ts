import { useState, useCallback } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE, authHeaders } from "../lib/api";
import { keys } from "@/app/lib/queryKeys";

type ParseResponse<T> = (data: any) => T[];

interface UseCrudPanelOptions<T> {
  endpoint: string;
  params?: Record<string, string>;
  parseResponse?: ParseResponse<T>;
}

async function fetchList<T>(
  endpoint: string,
  params: Record<string, string> | undefined,
  parseResponse: ParseResponse<T> | undefined
): Promise<T[]> {
  const qs = params
    ? new URLSearchParams(Object.entries(params).filter(([, v]) => v)).toString()
    : "";
  const url = `${API_BASE}${endpoint}${qs ? `?${qs}` : ""}`;
  const res = await fetch(url, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Failed to load (${res.status})`);
  const data = await res.json();
  return parseResponse ? parseResponse(data) : data;
}

/**
 * Shared state + fetch logic for every CRUD panel on the config page.
 * Reads go through TanStack Query; `editId` and validation messages stay local.
 */
export function useCrudPanel<T>({
  endpoint,
  params,
  parseResponse,
}: UseCrudPanelOptions<T>) {
  const queryClient = useQueryClient();
  const queryKey = keys.config.panel(endpoint, params);

  const [editId, setEditId] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const query = useQuery({
    queryKey,
    queryFn: () => fetchList<T>(endpoint, params, parseResponse),
  });

  const mutation = useMutation({
    mutationFn: async (fn: () => Promise<Response>) => {
      const res = await fn();
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error ?? `Request failed (${res.status})`);
      }
      return res;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey }),
  });

  const { reset: resetMutation } = mutation;

  const setError = useCallback(
    (message: string | null) => {
      setFormError(message);
      resetMutation();
    },
    [resetMutation]
  );

  const mutate = useCallback(
    async (fn: () => Promise<Response>): Promise<boolean> => {
      setFormError(null);
      try {
        await mutation.mutateAsync(fn);
        return true;
      } catch {
        return false;
      }
    },
    [mutation]
  );

  const startEdit = useCallback(
    (id: number) => {
      setEditId(id);
      setError(null);
    },
    [setError]
  );

  const cancelEdit = useCallback(() => {
    setEditId(null);
    setError(null);
  }, [setError]);

  const refresh = useCallback(
    () => queryClient.invalidateQueries({ queryKey }),
    [queryClient, queryKey]
  );

  const error =
    formError ??
    (mutation.error instanceof Error ? mutation.error.message : null) ??
    (query.error instanceof Error ? query.error.message : null);

  return {
    items: query.data ?? [],
    loading: query.isPending,
    error,
    setError,
    saving: mutation.isPending,
    editId,
    startEdit,
    cancelEdit,
    refresh,
    mutate,
  };
}
