"use client";

import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

export interface BugContext {
  page_url: string | null;
  batch_id: string | null;
  batch_name: string | null;
  student_id: string | null;
  student_name: string | null;
  exam_id: string | null;
}

interface BugReportState {
  open: boolean;
  setOpen: (v: boolean) => void;
  context: BugContext;
  setContext: (ctx: Partial<BugContext>) => void;
}

const BugReportCtx = createContext<BugReportState | null>(null);

export function useBugReport() {
  const ctx = useContext(BugReportCtx);
  if (!ctx) throw new Error("useBugReport must be inside BugReportProvider");
  return ctx;
}

export function BugReportProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [context, setContextRaw] = useState<BugContext>({
    page_url: null,
    batch_id: null,
    batch_name: null,
    student_id: null,
    student_name: null,
    exam_id: null,
  });

  const setContext = useCallback(
    (partial: Partial<BugContext>) =>
      setContextRaw((prev) => ({ ...prev, ...partial })),
    [],
  );

  const value = useMemo(
    () => ({ open, setOpen, context, setContext }),
    [open, context, setContext],
  );

  return (
    <BugReportCtx.Provider value={value}>{children}</BugReportCtx.Provider>
  );
}
