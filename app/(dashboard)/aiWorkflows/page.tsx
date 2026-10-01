"use client";

// AI workflows — where the team prepares, starts, watches and applies the
// error-classification runs and OCR sweeps that run as Temporal workflows.
//
// Everything on this page is scoped to one question paper, kept in the URL as
// ?qp= so a link to a paper is shareable and a refresh lands back where it was.
// The tab and the open run live in the URL too, for the same reason.
//
// All data comes from beaver-api's /api/ai-workflows/* endpoints, which proxy
// through to heron. Identity comes from the bearer token, never from a field.

import { Suspense, useCallback, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Toaster, toast } from "sonner";
import {
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TooltipProvider,
  cn,
} from "@student-ds/ui";
import {
  getHealth,
  getLanes,
  getPrepare,
  listPapers,
  listRuns,
  type Run,
} from "./lib/api";
import { useResource, usePoll } from "./hooks/useApi";
import { HealthStrip, UnconfiguredBanner, isUnconfigured } from "./components/HealthStrip";
import { PaperPicker, PaperSummary, noPaperChosen } from "./components/PaperPicker";
import { PrepareGrid } from "./components/PrepareGrid";
import { PipelineBar } from "./components/PipelineBar";
import { PaperDefects } from "./components/PaperDefects";
import { PushPaper } from "./components/PushPaper";
import { PrepareSweep } from "./components/PrepareSweep";
import { RunsTable } from "./components/RunsTable";
import { RunDrawer } from "./components/RunDrawer";
import { CellDrawer, type CellTarget } from "./components/CellDrawer";
import { LanesTable } from "./components/LanesTable";
import {
  StartClassificationDrawer,
  type StartOutcome,
} from "./components/StartClassificationDrawer";
import { Failed, Loading, Note } from "./components/Bits";

type Tab = "prepare" | "runs" | "lanes";
type PrepareMode = "classification" | "sweep";

function AiWorkflowsPage() {
  const router = useRouter();
  const params = useSearchParams();

  const qp = params.get("qp");
  const tab = (params.get("tab") as Tab) || "prepare";
  const openRunId = params.get("run");
  const [prepareMode, setPrepareMode] = useState<PrepareMode>("classification");

  const setParam = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) next.delete(k);
        else next.set(k, v);
      }
      router.replace(`/aiWorkflows?${next.toString()}`, { scroll: false });
    },
    [params, router]
  );

  // ── Data ────────────────────────────────────────────────────────────────

  const health = useResource(getHealth, []);
  const papers = useResource(listPapers, []);
  const prepare = useResource(
    (signal) => getPrepare(qp!, signal),
    [qp],
    !!qp
  );
  const runs = useResource(
    (signal) => listRuns({ qp: qp!, limit: 200 }, signal),
    [qp],
    !!qp
  );
  const lanes = useResource(getLanes, [], tab === "lanes");

  const [runsRefreshedAt, setRunsRefreshedAt] = useState<number | null>(null);
  const refreshRuns = useCallback(() => {
    runs.refresh();
    setRunsRefreshedAt(Date.now());
  }, [runs]);

  const anyRunning = (runs.data ?? []).some((r) => r.status === "running");
  usePoll(anyRunning && !!qp, 10_000, refreshRuns);
  usePoll(tab === "lanes", 15_000, lanes.refresh);

  // The paper id round-trips through the URL, so compare it as a string.
  const paper = useMemo(
    () => papers.data?.find((p) => String(p.qp) === qp) ?? null,
    [papers.data, qp]
  );

  const unconfigured = isUnconfigured(health.data);

  // Whether the open run's question has a brief from some earlier run, which
  // is what decides if "reuse a brief" is worth offering.
  const openRunBriefs = useMemo(() => {
    if (!openRunId || !prepare.data) return false;
    const question = (runs.data ?? []).find((r) => r.id === openRunId)?.question;
    if (question == null) return false;
    const q = prepare.data.questions.find((x) => x.question === question);
    return (q?.briefs.length ?? 0) > 0;
  }, [openRunId, prepare.data, runs.data]);

  // ── Starting runs ───────────────────────────────────────────────────────

  const [selected, setSelected] = useState<Set<number>>(new Set());
  /** Which questions the start drawer is open for, and anything pre-set. */
  const [starting, setStarting] = useState<{
    questions: number[];
    sections?: string[];
    brief?: "reuse" | "author";
    /** From the cell drawer: one section, these students, classify or recode. */
    subset?: { section: string; studentIds: string[]; task: "classify" | "recode" };
  } | null>(null);
  /** The cell open answer by answer, if any. */
  const [openCell, setOpenCell] = useState<CellTarget | null>(null);
  const showCell = useCallback(
    (question: number, section: string, preselect?: "uncoded") => {
      setParam({ run: null });
      setOpenCell({ question, section, preselect: preselect ? [preselect] : undefined });
    },
    [setParam]
  );

  const toggle = (q: number) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(q)) next.delete(q);
      else next.add(q);
      return next;
    });

  const toggleAll = (questions: number[], on: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur);
      for (const q of questions) {
        if (on) next.add(q);
        else next.delete(q);
      }
      return next;
    });

  const onStarted = (outcomes: StartOutcome[]) => {
    const ok = outcomes.filter((o) => o.run);
    const bad = outcomes.filter((o) => o.error);
    if (ok.length)
      toast.success(
        ok.length === 1
          ? `Run ${ok[0].run!.id} started on Q${ok[0].question}.`
          : `${ok.length} runs started.`
      );
    for (const b of bad)
      toast.error(`Q${b.question} did not start`, { description: b.error });
    if (ok.length) {
      setSelected(new Set());
      refreshRuns();
      prepare.refresh();
      if (ok.length === 1) setParam({ tab: "runs", run: ok[0].run!.id });
      else setParam({ tab: "runs" });
    }
  };

  const onSweepStarted = (run: Run) => {
    toast.success(`OCR sweep ${run.id} started.`);
    refreshRuns();
    setParam({ tab: "runs", run: run.id });
  };

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <TooltipProvider delayDuration={200}>
      <Toaster position="top-right" richColors />
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-[1400px] px-6 py-6">
          <header className="mb-5 flex flex-col gap-3">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <h1 className="text-xl font-bold text-gray-900">AI workflows</h1>
                <p className="mt-0.5 max-w-3xl text-sm text-gray-600">
                  Have an agent read the answers that lost marks and say what went
                  wrong with each one, or re-read the scans to correct the stored
                  text. Nothing reaches teachers until someone applies a run.
                </p>
              </div>
              <div className="shrink-0 pt-1">
                <HealthStrip
                  health={health.data}
                  loading={health.loading}
                  error={health.error}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-4">
              <PaperPicker
                papers={papers.data}
                loading={papers.loading}
                error={papers.error}
                value={qp}
                onChange={(id) => {
                  setSelected(new Set());
                  setParam({ qp: id, run: null });
                }}
              />
              {paper && (
                <PaperSummary
                  paper={paper}
                  sections={prepare.data?.sections.map((s) => s.section)}
                />
              )}
            </div>

            {unconfigured && <UnconfiguredBanner />}
            {papers.error && (
              <Failed what="the paper list" error={papers.error} />
            )}
          </header>

          <Tabs
            value={tab}
            onValueChange={(v) => setParam({ tab: v })}
            className="w-full"
          >
            <TabsList className="mb-4">
              <TabsTrigger value="prepare">Prepare</TabsTrigger>
              <TabsTrigger value="runs">
                Runs
                {anyRunning && (
                  <span className="ml-1.5 inline-flex items-center gap-1 text-xs text-sky-700">
                    <Spinner className="size-3" />
                    {(runs.data ?? []).filter((r) => r.status === "running").length}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="lanes">Lanes</TabsTrigger>
            </TabsList>

            <TabsContent value="prepare">
              {!qp ? (
                noPaperChosen()
              ) : paper && paper.on_dashboard === false ? (
                <PushPaper
                  paper={paper}
                  onPushed={() => {
                    papers.refresh();
                    prepare.refresh();
                  }}
                />
              ) : prepare.loading && !prepare.data ? (
                <Loading what="this paper's readiness checks" />
              ) : prepare.error ? (
                <Failed what="the readiness checks" error={prepare.error} />
              ) : prepare.data ? (
                <div className="flex flex-col gap-4">
                  <div className="inline-flex w-fit rounded-lg border border-gray-200 bg-white p-0.5">
                    {(
                      [
                        ["classification", "Classify errors"],
                        ["sweep", "OCR sweep"],
                      ] as [PrepareMode, string][]
                    ).map(([mode, label]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => setPrepareMode(mode)}
                        className={cn(
                          "rounded-md px-3 py-1.5 text-sm font-medium transition",
                          prepareMode === mode
                            ? "bg-indigo-600 text-white"
                            : "text-gray-600 hover:text-gray-900"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  {prepareMode === "classification" && (
                    <PipelineBar
                      qp={Number(qp)}
                      prepare={prepare.data}
                      health={health.data}
                      runs={runs.data ?? []}
                      disabled={unconfigured}
                      onStarted={(run, signalled) => {
                        toast.success(
                          signalled
                            ? `The pipeline for section ${run.sections?.[0] ?? ""} is already running; it will look again now.`
                            : `Section ${run.sections?.[0] ?? ""} pipeline started.`
                        );
                        refreshRuns();
                        setParam({ tab: "runs", run: run.id });
                      }}
                    />
                  )}

                  {prepareMode === "classification" && <PaperDefects qp={Number(qp)} disabled={unconfigured} />}

                  {prepareMode === "classification" ? (
                    <PrepareGrid
                      prepare={prepare.data}
                      selected={selected}
                      onToggle={toggle}
                      onToggleAll={toggleAll}
                      onStartOne={(q) => setStarting({ questions: [q] })}
                      onStartSelected={() =>
                        setStarting({
                          questions: [...selected].sort((a, b) => a - b),
                        })
                      }
                      onOpenRun={(id) => setParam({ tab: "runs", run: id })}
                      onOpenCell={showCell}
                      disabled={unconfigured}
                      onChanged={() => prepare.refresh()}
                    />
                  ) : (
                    <PrepareSweep
                      prepare={prepare.data}
                      onStarted={onSweepStarted}
                      disabled={unconfigured}
                    />
                  )}
                </div>
              ) : null}
            </TabsContent>

            <TabsContent value="runs">
              {!qp ? (
                noPaperChosen()
              ) : (
                <RunsTable
                  runs={runs.data}
                  loading={runs.loading}
                  error={runs.error}
                  onOpen={(id) => setParam({ run: id })}
                  onRefresh={refreshRuns}
                  lastRefreshed={runsRefreshedAt}
                />
              )}
            </TabsContent>

            <TabsContent value="lanes">
              <LanesTable
                lanes={lanes.data}
                loading={lanes.loading}
                error={lanes.error}
                onRefresh={lanes.refresh}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      {prepare.data && starting && (
        <StartClassificationDrawer
          key={`${starting.questions.join(",")}-${starting.brief ?? ""}-${
            starting.sections?.join(",") ?? ""
          }-${starting.subset ? `${starting.subset.section}:${starting.subset.task}:${starting.subset.studentIds.length}` : ""}`}
          prepare={prepare.data}
          questions={starting.questions}
          initialSections={starting.sections}
          initialBrief={starting.brief}
          subset={starting.subset}
          open={!!starting}
          onClose={() => setStarting(null)}
          onDone={onStarted}
        />
      )}

      {prepare.data && (
        <CellDrawer
          prepare={prepare.data}
          target={openCell}
          open={!!openCell}
          onClose={() => setOpenCell(null)}
          onStartSubset={({ question, section, studentIds, task }) => {
            setOpenCell(null);
            setStarting({
              questions: [question],
              sections: [section],
              subset: { section, studentIds, task },
              // Re-coding wants the brief's code list, not a new brief: reuse
              // when one exists. Otherwise the drawer picks its usual default.
              ...(task === "recode" ? { brief: "reuse" as const } : {}),
            });
          }}
          onSweepStarted={(run) => {
            setOpenCell(null);
            onSweepStarted(run);
          }}
          onOpenRun={(id) => {
            setOpenCell(null);
            setParam({ tab: "runs", run: id });
          }}
          onChanged={() => prepare.refresh()}
          disabled={unconfigured}
        />
      )}

      <RunDrawer
        runId={openRunId}
        open={!!openRunId}
        onClose={() => setParam({ run: null })}
        briefsAvailable={openRunBriefs}
        onStartAgain={
          prepare.data
            ? ({ question, sections, brief }) => {
                setParam({ run: null });
                setStarting({ questions: [question], sections, brief });
              }
            : undefined
        }
        onOpenCell={showCell}
        onChanged={() => {
          refreshRuns();
          prepare.refresh();
        }}
      />
    </TooltipProvider>
  );
}

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 px-6 py-6">
          <Note tone="plain">Loading AI workflows…</Note>
        </div>
      }
    >
      <AiWorkflowsPage />
    </Suspense>
  );
}
