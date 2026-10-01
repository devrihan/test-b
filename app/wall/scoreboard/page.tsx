"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, RotateCw, AlertTriangle } from "lucide-react";
import WallNav from "../WallNav";
import StageLegend from "./StageLegend";
import StagePanel from "./StagePanel";
import SectionRow from "./SectionRow";
import ScopeNav from "./ScopeNav";
import ErrorDrawer from "./ErrorDrawer";
import {
  listBatches,
  loadBatchBucket,
  loadBatchReview,
  buildSections,
  totalMetrics,
  filterSections,
  scopeLabel,
  EMPTY_SCOPE,
  type Cell,
  type SectionBoard,
  type ReviewState,
  type Scope,
} from "./scanboard";
import { STAGE_DEFS, STAGE_ROLLUP, stageRollup, type StageKey } from "./phases";
import { mockSections } from "./mock";
import type { BucketData } from "./lib";
import type { Batch } from "@/app/(dashboard)/pdfExtract/lib/beaverApi";

const CONCURRENCY = 6;

// Resolve each batch (roster reconciliation + review state) a few at a time so the
// board fills progressively. The review fetch is best-effort (returns [] on failure).
async function resolveAll(
  batches: Batch[],
  onEach: (bucket: BucketData, review: Array<[string, ReviewState]>) => void,
) {
  let i = 0;
  async function worker() {
    while (i < batches.length) {
      const b = batches[i++];
      try {
        const [bucket, review] = await Promise.all([loadBatchBucket(b), loadBatchReview(b.batch_id)]);
        onEach(bucket, review);
      } catch {
        /* one batch failing shouldn't sink the board */
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
}

export default function ScoreboardPage() {
  const router = useRouter();
  const [batches, setBatches] = useState<Batch[] | null>(null);
  const [buckets, setBuckets] = useState<Map<string, BucketData>>(new Map());
  const [reviews, setReviews] = useState<Map<string, ReviewState>>(new Map());
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const reqId = useRef(0);

  // Interaction state. activeStage is nullable so every panel can collapse; openKey is
  // the section whose inline student list is expanded; focusedId the highlighted student.
  const [activeStage, setActiveStage] = useState<StageKey | null>("scanning");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [scope, setScope] = useState<Scope>(EMPTY_SCOPE);
  const [errorsOpen, setErrorsOpen] = useState(false);

  // Mock view (visit /wall/scoreboard?mock=1, dev only): skip the backend and render a
  // synthetic feed exercising every scoped status / error / roster case. Read at runtime
  // (not a build-time env var) so it works on the already-running dev server. Set in an
  // effect to avoid an SSR/client hydration mismatch.
  const [mock, setMock] = useState(false);
  const autoOpen = useRef(false);
  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const q = new URLSearchParams(window.location.search);
    // Lenient: any present, non-"0"/"false" value turns it on, so a stray char (e.g. a
    // trailing "." pasted into the URL → "1.") doesn't silently fall back to the backend.
    const on = (v: string | null) => v !== null && v !== "0" && v !== "false";
    if (on(q.get("mock"))) setMock(true);
    if (on(q.get("open"))) autoOpen.current = true; // dev preview: pre-expand 1st row
  }, []);

  const load = useCallback(async () => {
    const myReq = ++reqId.current;
    setLoadErr(null);
    setBuckets(new Map());
    setReviews(new Map());
    setBatches(null);
    if (mock) { setBatches([]); return; } // sections come from mockSections() below
    try {
      const list = await listBatches();
      if (myReq !== reqId.current) return;
      setBatches(list);
      resolveAll(list, (bd, review) => {
        if (myReq !== reqId.current) return;
        setBuckets((prev) => new Map(prev).set(bd.batch.batch_id, bd));
        if (review.length) {
          setReviews((prev) => {
            const next = new Map(prev);
            for (const [sid, st] of review) next.set(sid, st);
            return next;
          });
        }
      });
    } catch (e) {
      if (myReq !== reqId.current) return;
      setLoadErr(e instanceof Error ? e.message : "Failed to load batches");
    }
  }, [mock]);

  // Fetch on mount (legitimate data-fetch effect, not derived-state).
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  const sections = useMemo(
    () => (mock ? mockSections() : batches ? buildSections(batches, buckets, reviews) : []),
    [mock, batches, buckets, reviews],
  );
  // The scope-nav narrows what the board shows.
  const visible = useMemo(() => filterSections(sections, scope), [sections, scope]);
  const totals = useMemo(() => totalMetrics(visible), [visible]);
  // Papers in scope (flattened) + the scope phrase — drive each panel's rollup bar.
  const scopedCells = useMemo(() => visible.flatMap((s) => s.cells), [visible]);
  const scopeText = useMemo(() => scopeLabel(scope), [scope]);

  // Dev preview (?open=1): expand the first row once sections are in, so the inline
  // student list is visible on load. One-shot — the user can collapse/switch freely after.
  useEffect(() => {
    if (autoOpen.current && openKey === null && visible.length > 0) {
      autoOpen.current = false;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpenKey(visible[0].key);
    }
  }, [visible, openKey]);

  const pickCell = (section: SectionBoard, c: Cell) => { setOpenKey(section.key); setFocusedId(c.studentId); };
  // Click a row → toggle its inline list (accordion: one open at a time).
  const toggleRow = (section: SectionBoard) => {
    setOpenKey((cur) => (cur === section.key ? null : section.key));
    setFocusedId(null);
  };
  const toggleStage = (key: StageKey) => setActiveStage((cur) => (cur === key ? null : key));

  const resolved = buckets.size;
  const total = batches?.length ?? 0;

  return (
    <div className="flex flex-col h-screen bg-[#FFF7E6]">
      <WallNav
        center={
          <ScopeNav
            sections={sections}
            onFilter={setScope}
            onPickSection={(key) => { setOpenKey(key); setFocusedId(null); }}
          />
        }
      />

      {/* sub-header */}
      <div className="shrink-0 px-6 py-3 border-b border-slate-200 bg-white/70 backdrop-blur">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/wall")}
              className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium text-slate-600 hover:text-indigo-600 border border-slate-200 rounded-lg transition"
            >
              <ArrowLeft size={14} /> Back to Wall
            </button>
            <div>
              <h1 className="text-lg font-bold text-slate-800 leading-tight">Scanning Scoreboard</h1>
              <p className="text-xs text-slate-500">
                {batches
                  ? <>{visible.length} sections · {totals.papers} papers · {totals.completed} done · {totals.awaitingReview} awaiting review
                      {totals.blocking ? ` · ${totals.blocking} blocked` : ""}
                      {mock ? " · mock data" : total > 0 && resolved < total ? ` · ${resolved}/${total} loaded…` : ""}</>
                  : "Loading batches…"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setErrorsOpen((v) => !v)}
              className={`flex items-center gap-1.5 h-9 px-3.5 text-sm font-medium rounded-lg border transition ${
                errorsOpen ? "bg-rose-50 border-rose-200 text-rose-700" : "border-slate-200 text-slate-600 hover:bg-slate-50"
              }`}
            >
              <AlertTriangle size={15} /> Issues
              {(totals.blocking + totals.soft) > 0 && (
                <span className="grid place-items-center min-w-5 h-5 px-1 rounded-full bg-rose-600 text-white text-[11px] font-bold tabular-nums">
                  {totals.blocking + totals.soft}
                </span>
              )}
            </button>
            <button
              onClick={load}
              className="flex items-center gap-1.5 h-9 px-3.5 text-sm font-medium text-slate-600 border border-slate-200 hover:bg-slate-50 rounded-lg transition"
            >
              <RotateCw size={15} /> Refresh
            </button>
          </div>
        </div>
        <div className="mt-2.5">
          <StageLegend stage={activeStage ?? "scanning"} />
        </div>
      </div>

      {/* the separate pipeline-stage panels (accordion) + optional error roll-up drawer.
          `isolate` traps the cells' z-index layering inside the board, so badges never
          stack above the nav's scope-picker dropdown. */}
      <div className="flex-1 min-h-0 flex isolate">
        <div className="flex-1 min-w-0 flex gap-3 p-4 overflow-hidden">
        {loadErr ? (
          <div className="flex-1 grid place-items-center">
            <div className="text-center">
              <p className="text-sm text-rose-600 font-medium">{loadErr}</p>
              <button onClick={load} className="mt-3 h-9 px-4 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg">Retry</button>
            </div>
          </div>
        ) : (
          STAGE_DEFS.map((stage) => {
            const { done, total } = stageRollup(scopedCells, stage.key);
            return (
            <StagePanel
              key={stage.key}
              title={stage.title}
              enabled={stage.enabled}
              expanded={activeStage === stage.key}
              onToggle={() => toggleStage(stage.key)}
              rollup={<><span className="font-bold text-white tabular-nums">{done}/{total}</span> {STAGE_ROLLUP[stage.key]} {scopeText}</>}
              rollupCompact={`${done}/${total}`}
            >
              {stage.enabled ? (
                <div className="space-y-1">
                  {visible.map((s) => (
                    <SectionRow
                      key={s.key}
                      section={s}
                      stage={stage.key}
                      hoveredId={hoveredId}
                      focusedId={focusedId}
                      onHover={setHoveredId}
                      onPick={pickCell}
                      onToggle={toggleRow}
                      active={openKey === s.key}
                    />
                  ))}
                  {!batches &&
                    Array.from({ length: 8 }).map((_, i) => (
                      <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />
                    ))}
                  {batches && sections.length === 0 && (
                    <p className="text-center text-slate-400 py-10">No batches found.</p>
                  )}
                  {batches && sections.length > 0 && visible.length === 0 && (
                    <p className="text-center text-slate-400 py-10">No sections match this scope.</p>
                  )}
                </div>
              ) : (
                <div className="h-full grid place-items-center text-center px-6">
                  <p className="text-sm text-slate-400 max-w-xs">
                    <span className="font-semibold text-slate-500">{stage.title}</span> isn&apos;t wired yet —
                    the per-paper status for this stage lands in a later pass. The framework is here so it
                    slots straight in.
                  </p>
                </div>
              )}
            </StagePanel>
            );
          })
        )}
        </div>
        {errorsOpen && (
          <ErrorDrawer sections={visible} scope={scope} onClose={() => setErrorsOpen(false)} />
        )}
      </div>
    </div>
  );
}
