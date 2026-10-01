import { STAGES, STAGE_INDEX, type StageId } from "../model/dams";
import type { Batch, BatchProgress, Paper, StatusKind } from "../model/types";
import type { RiverEvent, RiverFeed } from "../feed/types";

// ── Live entity store ──────────────────────────────────────────────────────
// Folds the feed's deltas into the live entity model and exposes a subscribable
// snapshot. Framework-agnostic (no React/Pixi) so it ports straight into beaver.
//
// Answer grain is "ready but dark": answer-scope events are accepted into the
// model but NOT rendered unless `renderAnswerLayer` is turned on. Today the
// store simply records that a paper's answers reached a stage; it does not build
// out individual Answer objects until the answer layer is enabled, keeping the
// default wall light (thousands of sticks would otherwise accumulate).

export interface RiverStoreOptions {
  /** Turn on once real answer-level events exist and the stick layer is drawn. */
  renderAnswerLayer?: boolean;
}

export class RiverStore {
  private batches = new Map<string, Batch>();
  private papers = new Map<string, Paper>(); // paperId → paper (flat index)
  private snapshot: Batch[] | null = null; // cached array identity for useSyncExternalStore
  private listeners = new Set<() => void>();
  private unsubFeed: (() => void) | null = null;
  readonly renderAnswerLayer: boolean;

  constructor(opts: RiverStoreOptions = {}) {
    this.renderAnswerLayer = opts.renderAnswerLayer ?? false;
  }

  /** Attach to a feed. Returns a detach function. */
  connect(feed: RiverFeed): () => void {
    this.unsubFeed = feed.subscribe((e) => this.apply(e));
    feed.start();
    return () => this.detach();
  }

  detach() {
    this.unsubFeed?.();
    this.unsubFeed = null;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /**
   * Cached snapshot for useSyncExternalStore: returns the SAME array reference
   * until the next event mutates state. Without this, a fresh array per call
   * makes React's snapshot comparison always see "changed" → infinite re-render.
   */
  getBatches(): Batch[] {
    if (this.snapshot === null) this.snapshot = [...this.batches.values()];
    return this.snapshot;
  }

  getProgress(batchId: string): BatchProgress | null {
    const b = this.batches.get(batchId);
    return b ? computeProgress(b) : null;
  }

  /**
   * Replace a batch's papers with the REAL roster fetched on drill-in (Phase 3).
   * Overview rafts carry synthetic count-derived placeholder papers; on drill we
   * swap them for actual students so per-paper identity + action deep-links use
   * real `student_id`s. No-op if the batch isn't loaded (e.g. retired mid-fetch).
   */
  setRealPapers(batchId: string, papers: Paper[]): void {
    const b = this.batches.get(batchId);
    if (!b) return;
    for (const p of b.papers) this.papers.delete(p.id);
    b.papers = papers;
    for (const p of papers) this.papers.set(p.id, p);
    this.notify();
  }

  // ── event folding ──────────────────────────────────────────────────────--

  private apply(e: RiverEvent) {
    switch (e.type) {
      case "batch_created": {
        if (!this.batches.has(e.batchId)) {
          this.batches.set(e.batchId, {
            id: e.batchId,
            key: e.key,
            createdAt: e.t,
            paperCount: e.paperCount,
            papers: [],
          });
        }
        break;
      }
      case "paper_added": {
        const b = this.batches.get(e.batchId);
        if (!b || this.papers.has(e.paperId)) break;
        const paper: Paper = {
          id: e.paperId,
          batchId: e.batchId,
          rollNumber: e.rollNumber,
          studentName: e.studentName,
          stage: "upload_scan",
          status: "processing",
          answers: [], // dark: populated only when renderAnswerLayer is on
        };
        b.papers.push(paper);
        this.papers.set(paper.id, paper);
        break;
      }
      case "stage_changed": {
        if (e.scope === "answer") {
          // "ready but dark" — accept silently. Only materialize Answer objects
          // when the answer layer is enabled, else just ignore to stay light.
          if (this.renderAnswerLayer) this.applyAnswer(e);
          break;
        }
        const p = this.papers.get(e.paperId);
        if (!p) break;
        p.stage = e.stage;
        p.status = e.status;
        break;
      }
      case "batch_retired": {
        const b = this.batches.get(e.batchId);
        if (b) {
          for (const p of b.papers) this.papers.delete(p.id);
          this.batches.delete(e.batchId);
        }
        break;
      }
    }
    this.notify();
  }

  private applyAnswer(e: Extract<RiverEvent, { type: "stage_changed" }>) {
    const p = this.papers.get(e.paperId);
    if (!p || !e.answerId) return;
    let a = p.answers.find((x) => x.id === e.answerId);
    if (!a) {
      a = { id: e.answerId, paperId: p.id, questionNumber: p.answers.length + 1, stage: e.stage, status: e.status };
      p.answers.push(a);
    } else {
      a.stage = e.stage;
      a.status = e.status;
    }
  }

  private notify() {
    this.snapshot = null; // invalidate cached snapshot → next getBatches() rebuilds once
    for (const fn of this.listeners) fn();
  }
}

// ── derived view ───────────────────────────────────────────────────────────

/**
 * Compute the render-facing progress of a raft:
 *   frontier  = furthest dam any paper has reached → the raft's position
 *   straggler = earliest non-done dam still holding a paper → the tail cue
 * Both are needed so a 39/40-done raft blocked by one stuck paper still shows
 * its lagging tail and never reads as finished.
 */
export function computeProgress(b: Batch): BatchProgress {
  const countsByStage: Partial<Record<StageId, number>> = {};
  let frontierIdx = STAGE_INDEX["queued"];
  let stragglerIdx = STAGE_INDEX["done"];
  let failed = 0;
  let done = 0;

  for (const p of b.papers) {
    const idx = STAGE_INDEX[p.stage];
    countsByStage[p.stage] = (countsByStage[p.stage] ?? 0) + 1;
    if (idx > frontierIdx) frontierIdx = idx;
    if (p.status === "failed") failed++;
    if (p.stage === "done") done++;
    // straggler = earliest dam still holding a NOT-done paper
    else if (idx < stragglerIdx) stragglerIdx = idx;
  }

  // If every paper is done, straggler collapses to the waterfall too.
  if (done === b.papers.length && b.papers.length > 0) stragglerIdx = STAGE_INDEX["done"];

  return {
    frontier: STAGES[frontierIdx]!,
    straggler: STAGES[Math.min(stragglerIdx, frontierIdx)]!,
    countsByStage,
    total: b.papers.length,
    failed,
    done,
  };
}

export type { StatusKind };
