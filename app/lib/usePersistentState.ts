"use client";
import { useState, useEffect, type Dispatch, type SetStateAction } from "react";

// First render always uses `initial` to avoid SSR hydration mismatch; stored value applies after mount.
export function usePersistentState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [state, setState]       = useState<T>(initial);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(key);
      if (raw != null) setState(JSON.parse(raw) as T);
    } catch { /* ignore */ }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  // guard prevents overwriting the stored value with `initial` on the first commit
  useEffect(() => {
    if (!hydrated) return;
    try { sessionStorage.setItem(key, JSON.stringify(state)); } catch { /* ignore */ }
  }, [key, state, hydrated]);

  return [state, setState];
}
