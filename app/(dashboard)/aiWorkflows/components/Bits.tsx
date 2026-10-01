"use client";

// Small pieces shared by every tab: message blocks, chips, and the coverage bar.

import * as React from "react";
import { Spinner, Tooltip, TooltipContent, TooltipTrigger, cn } from "@student-ds/ui";
import { AlertTriangle, Info } from "lucide-react";
import type { RunStatus, Stage } from "../lib/api";
import {
  STAGE_CLASS,
  STAGE_LABEL,
  STATUS_CLASS,
  STATUS_EXPLAIN,
  STATUS_LABEL,
  VERDICT_BAR,
  type Verdict,
} from "../lib/readiness";

/** A sentence in a box. Used for every empty, error and explanatory state. */
export function Note({
  tone = "info",
  title,
  children,
  className,
}: {
  tone?: "info" | "warn" | "error" | "plain";
  title?: string;
  children?: React.ReactNode;
  className?: string;
}) {
  const tones = {
    info: "bg-sky-50 border-sky-200 text-sky-900",
    warn: "bg-amber-50 border-amber-200 text-amber-900",
    error: "bg-rose-50 border-rose-200 text-rose-900",
    plain: "bg-gray-50 border-gray-200 text-gray-700",
  } as const;
  return (
    <div className={cn("rounded-lg border px-4 py-3 text-sm leading-relaxed", tones[tone], className)}>
      {title && (
        <div className="mb-1 flex items-center gap-1.5 font-semibold">
          {tone === "error" || tone === "warn" ? (
            <AlertTriangle className="size-4 shrink-0" />
          ) : (
            <Info className="size-4 shrink-0" />
          )}
          {title}
        </div>
      )}
      {children}
    </div>
  );
}

export function Loading({ what }: { what: string }) {
  return (
    <div className="flex items-center gap-2 px-1 py-8 text-sm text-gray-500">
      <Spinner className="size-4" />
      Loading {what}…
    </div>
  );
}

export function Failed({ what, error }: { what: string; error: string }) {
  return (
    <Note tone="error" title={`Could not load ${what}`}>
      {error}
    </Note>
  );
}

export function StageChip({ stage, label }: { stage: Stage; label?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
        STAGE_CLASS[stage] ?? STAGE_CLASS.pending
      )}
      title={`${label ?? ""} ${STAGE_LABEL[stage] ?? stage}`.trim()}
    >
      {label && <span className="font-semibold">{label}</span>}
      {STAGE_LABEL[stage] ?? stage}
    </span>
  );
}

export function StatusBadge({ status }: { status: RunStatus }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap",
            STATUS_CLASS[status] ?? STATUS_CLASS.done
          )}
        >
          {STATUS_LABEL[status] ?? status}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        {STATUS_EXPLAIN[status] ?? status}
      </TooltipContent>
    </Tooltip>
  );
}

/** A short horizontal bar with the percentage beside it. */
export function CoverageBar({
  value,
  verdict,
  className,
}: {
  value: number | null;
  verdict: Verdict;
  className?: string;
}) {
  const pct = value === null ? 0 : Math.round(value * 100);
  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <div className="h-1.5 w-full min-w-6 overflow-hidden rounded-full bg-black/10">
        <div
          className={cn("h-full rounded-full", VERDICT_BAR[verdict])}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-8 shrink-0 text-right text-[11px] tabular-nums">
        {value === null ? "—" : `${pct}%`}
      </span>
    </div>
  );
}

/** Label above a value, used all over the run drawer. */
export function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="text-[11px] font-medium tracking-wide text-gray-500 uppercase">
        {label}
      </div>
      <div className="mt-0.5 text-sm text-gray-900">{children}</div>
    </div>
  );
}
