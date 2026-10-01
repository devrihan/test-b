"use client";

// Hand-rolled fetch hooks, matching the pattern the rest of the dashboard uses
// (no react-query in this app).

import { useCallback, useEffect, useRef, useState } from "react";
import { errMsg } from "../lib/api";

export type Resource<T> = {
  data: T | null;
  loading: boolean;
  error: string | null;
  /** Refetch without clearing what is already on screen. */
  refresh: () => void;
};

/**
 * Runs `fetcher` whenever `deps` change. Set `enabled` to false to hold off
 * (e.g. until a paper has been picked).
 */
export function useResource<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: unknown[],
  enabled = true
): Resource<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  // Held in a ref so changing the closure does not itself trigger a refetch —
  // the dependency list passed in by the caller is the only trigger. Declared
  // before the fetching effect so the ref is current by the time that runs.
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    if (!enabled) {
      setData(null);
      setLoading(false);
      setError(null);
      return;
    }
    const ac = new AbortController();
    let live = true;
    setLoading(true);
    fetcherRef
      .current(ac.signal)
      .then((d) => {
        if (!live) return;
        setData(d);
        setError(null);
      })
      .catch((e) => {
        if (!live || ac.signal.aborted) return;
        setError(errMsg(e));
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
      ac.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, tick]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, refresh };
}

/** Calls `onTick` every `ms` while `active`, and pauses when the tab is hidden. */
export function usePoll(active: boolean, ms: number, onTick: () => void) {
  const cb = useRef(onTick);
  useEffect(() => {
    cb.current = onTick;
  });

  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => {
      if (document.visibilityState === "visible") cb.current();
    }, ms);
    return () => clearInterval(id);
  }, [active, ms]);
}
