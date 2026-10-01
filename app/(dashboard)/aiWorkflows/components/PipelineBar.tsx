"use client";

// "Run end to end" — one button per section that starts (or nudges) the
// section pipeline: rebuild crops, park unreadable answers on the Ops TO-DO,
// re-read missing text, apply corrections, classify / re-code what needs it,
// and — on a deployment that writes the test dashboard — apply the results.
// On prod it stops at "pending apply" for a person.

import { useState } from "react";
import { Play } from "lucide-react";
import { Spinner, cn } from "@student-ds/ui";
import { startPipeline, type Health, type Prepare, type Run } from "../lib/api";

export function PipelineBar({
  qp,
  prepare,
  health,
  runs,
  onStarted,
  disabled,
}: {
  qp: number;
  prepare: Prepare;
  health: Health | null;
  runs: Run[];
  onStarted: (run: Run, signalled: boolean) => void;
  disabled: boolean;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const label = health?.target?.label ?? null;
  const autoApply = label === "test" && !!health?.target?.publisher;
  const running = new Set(
    runs.filter((r) => r.kind === "pipeline" && r.status === "running").map((r) => r.sections[0])
  );

  async function start(section: string) {
    setBusy(section);
    setError(null);
    try {
      const run = await startPipeline({ qp, section });
      onStarted(run, !!run.signalled);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-gray-900">Run a section end to end</h2>
          <p className="mt-0.5 text-xs text-gray-600">
            Rebuilds missing crops, parks answers with no box on the Ops TO-DO, re-reads
            missing text, classifies and re-codes what needs it, and looks again until every
            answer that lost marks is on the dashboard.{" "}
            {autoApply
              ? "This deployment writes the test dashboard, so it applies by itself."
              : "It stops at “pending apply” for a person to apply."}
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {prepare.sections.map((s) => {
            const isRunning = running.has(s.section);
            return (
              <button
                key={s.section}
                type="button"
                disabled={disabled || busy !== null}
                onClick={() => start(s.section)}
                title={
                  isRunning
                    ? `The pipeline for section ${s.section} is running — click to make it look again now`
                    : `Run section ${s.section} end to end`
                }
                className={cn(
                  "inline-flex items-center gap-1 rounded border px-2 py-1 text-xs font-medium",
                  isRunning
                    ? "border-sky-200 bg-sky-50 text-sky-800 hover:border-sky-400"
                    : "border-indigo-200 bg-indigo-50 text-indigo-800 hover:border-indigo-400",
                  "disabled:opacity-50"
                )}
              >
                {busy === s.section ? <Spinner className="size-3" /> : <Play className="size-3" />}
                {s.section}
                {isRunning && <span className="text-[10px] uppercase">live</span>}
              </button>
            );
          })}
        </div>
      </div>
      {error && <p className="mt-2 text-xs text-rose-800">{error}</p>}
    </div>
  );
}
