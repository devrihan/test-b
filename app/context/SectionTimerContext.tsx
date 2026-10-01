"use client";

import { createContext, useContext, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { useBatchFilterContext } from "./BatchFilterContext";
import { useSectionTimer } from "../hooks/useSectionTimer";
import type { OpenSectionSession, OpsStatus, ReviewStage } from "../lib/reviewApi";

interface SectionTimerValue {
  onActivity: () => void;
  open: OpenSectionSession | null;
  makers: string[];
  checkers: string[];
  opsStatus: OpsStatus | null;
  done: () => Promise<boolean>;
  /** Null off the editor screens, where there is no section being worked on. */
  stage: ReviewStage | null;
}

const Ctx = createContext<SectionTimerValue | null>(null);

/** One timer for the screen: the editor's clicks and the filter bar's Done share a record. */
export function SectionTimerProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const stage: ReviewStage | null = pathname?.includes("/answerEditing")
    ? "marks_verification"
    : pathname?.includes("/pdfExtract")
      ? "chunking"
      : null;

  const { matchedBatch } = useBatchFilterContext();
  // Off the editor screens there is no section, so the hook stays dormant.
  const timer = useSectionTimer({
    batchId: stage ? (matchedBatch?.batch_id ?? null) : null,
    stage: stage ?? "marks_verification",
  });

  return <Ctx.Provider value={{ ...timer, stage }}>{children}</Ctx.Provider>;
}

export function useSectionTimerContext(): SectionTimerValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSectionTimerContext must be used within SectionTimerProvider");
  return v;
}
