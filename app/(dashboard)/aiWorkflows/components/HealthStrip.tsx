"use client";

// The four things this page depends on, as dots. When none of them is even
// configured the page is useless, so that case gets one sentence instead of
// four identical red dots.

import { Tooltip, TooltipContent, TooltipTrigger, cn } from "@student-ds/ui";
import type { Dependency, DependencyKey, Health } from "../lib/api";
import { Note } from "./Bits";

const DEPENDENCIES: { key: DependencyKey; label: string; what: string }[] = [
  {
    key: "temporal",
    label: "Temporal",
    what: "Runs the workflows. Without it nothing can be started or watched.",
  },
  {
    key: "ledger",
    label: "Run ledger",
    what: "The database that records every run, its stages and its artifacts.",
  },
  {
    key: "loam_ops",
    label: "Pipeline database",
    what: "Where scanned answers and their text come from. The readiness checks read this.",
  },
  {
    key: "loam_db",
    label: "Dashboard database",
    what: "Where applied results are written. Only needed when you apply a run.",
  },
];

function dotClass(d: Dependency | undefined): string {
  if (!d || !d.configured) return "bg-gray-300";
  return d.ok ? "bg-emerald-500" : "bg-rose-500";
}

function dotWords(d: Dependency | undefined): string {
  if (!d) return "No answer from the health check.";
  if (!d.configured) return "Not set up in this environment.";
  if (d.ok) return "Reachable and healthy.";
  return d.error || "Configured but not reachable.";
}

export function HealthStrip({
  health,
  loading,
  error,
}: {
  health: Health | null;
  loading: boolean;
  error: string | null;
}) {
  if (loading)
    return <span className="text-xs text-gray-400">Checking dependencies…</span>;

  if (error)
    return (
      <span className="text-xs text-rose-700">
        Health check failed: {error}
      </span>
    );

  if (!health) return null;

  const target = health.target;
  const targetLabel = (target?.label ?? "").trim().toLowerCase();

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      {target && (target.label || target.loam_db_host) && (
        // Which dashboard an apply writes to. The deployment sets the label; the
        // host is there so a wrong label is still visible to a careful reader.
        <Tooltip>
          <TooltipTrigger asChild>
            <span
              className={cn(
                "cursor-default rounded border px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide",
                targetLabel === "prod"
                  ? "border-rose-300 bg-rose-50 text-rose-800"
                  : targetLabel
                    ? "border-emerald-300 bg-emerald-50 text-emerald-800"
                    : "border-gray-300 bg-gray-50 text-gray-700"
              )}
            >
              applies → {target.label ?? "unlabelled"}
            </span>
          </TooltipTrigger>
          <TooltipContent className="max-w-xs">
            <span className="block font-semibold">Where an applied run is written</span>
            <span className="block">
              Dashboard database host: {target.loam_db_host ?? "not reported"}.
            </span>
            {targetLabel === "prod" && (
              <span className="mt-1 block">
                This is the live dashboard teachers see. Applies here are real.
              </span>
            )}
          </TooltipContent>
        </Tooltip>
      )}
      {DEPENDENCIES.map(({ key, label, what }) => {
        const d = health.dependencies?.[key];
        return (
          <Tooltip key={key}>
            <TooltipTrigger asChild>
              <span className="flex cursor-default items-center gap-1.5 text-xs text-gray-600">
                <span className={cn("size-2 shrink-0 rounded-full", dotClass(d))} />
                {label}
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              <span className="block font-semibold">{label}</span>
              <span className="block">{what}</span>
              <span className="mt-1 block opacity-80">{dotWords(d)}</span>
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

/** True when not one dependency is configured — the whole feature is off here. */
export function isUnconfigured(health: Health | null): boolean {
  if (!health) return false;
  return DEPENDENCIES.every(
    ({ key }) => health.dependencies?.[key]?.configured === false
  );
}

export function UnconfiguredBanner() {
  return (
    <Note tone="warn" title="AI workflows are not set up in this environment">
      None of the four things this page needs — Temporal, the run ledger, the
      pipeline database or the dashboard database — is configured on this
      beaver-api. Nothing can be started or read here until an admin sets them
      up. The rest of the page is shown read-only so you can see its shape.
    </Note>
  );
}
