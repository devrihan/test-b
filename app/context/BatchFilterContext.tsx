"use client";

import { createContext, useContext, ReactNode, useRef, useCallback, useMemo, useState, Suspense } from "react";
import { useBatchFilter, UseBatchFilterReturn } from "@/app/(dashboard)/pdfExtract/hooks/useBatchFilter";

interface BatchFilterContextValue extends UseBatchFilterReturn {
  onOpenStudent:   () => void;
  registerOpen:    (fn: () => void) => void;
  loadingPages:    boolean;
  setLoadingPages: (v: boolean) => void;
}

const BatchFilterContext = createContext<BatchFilterContextValue | null>(null);

// useBatchFilter reads the URL, and this provider sits in the dashboard layout —
// above every route — so without a boundary those pages fail to prerender.
function BatchFilterProviderInner({ children }: { children: ReactNode }) {
  const batchFilter                     = useBatchFilter();
  const [loadingPages, setLoadingPages] = useState(false);

  // Ref, so registering the callback doesn't re-render.
  const openFnRef = useRef<(() => void) | null>(null);

  const registerOpen = useCallback((fn: () => void) => {
    openFnRef.current = fn;
  }, []);

  const onOpenStudent = useCallback(() => {
    openFnRef.current?.();
  }, []);

  // A fresh object here would redraw every consumer on every render.
  const value = useMemo(
    () => ({ ...batchFilter, onOpenStudent, registerOpen, loadingPages, setLoadingPages }),
    [batchFilter, onOpenStudent, registerOpen, loadingPages, setLoadingPages]
  );

  return (
    <BatchFilterContext.Provider value={value}>
      {children}
    </BatchFilterContext.Provider>
  );
}

export function BatchFilterProvider({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={null}>
      <BatchFilterProviderInner>{children}</BatchFilterProviderInner>
    </Suspense>
  );
}

export function useBatchFilterContext(): BatchFilterContextValue {
  const ctx = useContext(BatchFilterContext);
  if (!ctx) throw new Error("useBatchFilterContext must be used inside BatchFilterProvider");
  return ctx;
}
