import type { StageId } from "../model/dams";
import type { BatchKey, StatusKind } from "../model/types";

// ── The event feed contract ────────────────────────────────────────────────
// LOCKED (data plane): the dashboard never sits in the pipeline's critical path.
// It is fed by fire-and-forget state-change events and never makes synchronous
// calls into Temporal activities/workflows. (This "observer-only" rule is about
// DATA only — the UX plane is an interactive hub that links OUT to beaver's
// review/config screens; see model/nav.ts.) Today a mock simulator implements
// this contract; later a real source (Redis pub/sub → SSE/WebSocket, a
// lightweight events table, or Temporal search attributes) implements the SAME
// contract, and nothing above the feed changes.
//
// Events are deltas (state CHANGES), not snapshots. The store folds them into
// the live entity model.

export type RiverEvent =
  | {
      type: "batch_created";
      t: number; // ms epoch — when the change happened at the source
      batchId: string;
      key: BatchKey;
      /** total answer papers this batch will hold (its capacity, known up front) */
      paperCount: number;
    }
  | {
      type: "paper_added"; // ops scanned/uploaded a paper into the batch
      t: number;
      batchId: string;
      paperId: string;
      rollNumber: string;
      studentName: string;
      /** how many answers (sticks) this paper will have — modeled, dark today */
      answerCount: number;
    }
  | {
      // A child changed stage and/or status. scope distinguishes the grain:
      //   "paper"  → live today (deepest live zoom = bundle)
      //   "answer" → "ready but dark": emitted by the mock to prove the data
      //              model holds it, but the store drops it unless answer-level
      //              rendering is explicitly enabled.
      type: "stage_changed";
      t: number;
      scope: "paper" | "answer";
      batchId: string;
      paperId: string;
      answerId?: string; // present iff scope === "answer"
      stage: StageId;
      status: StatusKind;
    }
  | {
      // The whole raft has gone over the waterfall — all bundles cleared the
      // final stage and it lingered briefly. The observer drops it from the wall.
      type: "batch_retired";
      t: number;
      batchId: string;
    };

/**
 * A feed of river events. Both the mock simulator and the future real source
 * implement this. `subscribe` returns an unsubscribe function.
 */
export interface RiverFeed {
  subscribe(handler: (e: RiverEvent) => void): () => void;
  start(): void;
  stop(): void;
}
