import { STAGES, STAGE_INDEX, isHumanGate, type StageId } from "../model/dams";
import type { BatchKey, StatusKind } from "../model/types";
import type { RiverEvent, RiverFeed } from "./types";

// ── Mock event source ──────────────────────────────────────────────────────
// LOCKED: "Start with a mock event feed." This simulator owns ground-truth
// pipeline state internally and emits fire-and-forget deltas that look like what
// real river would emit. The entire UI is driven from this until real events are
// wired. Tempo/scale/divergence here are DEFAULTS — tune freely.

// Tempo knobs — scaled DOWN from "a batch takes hours" so the wall visibly
// breathes within seconds during dev. Durations are ms of wall-clock.
const CONFIG = {
  tickMs: 350, // simulation heartbeat
  maxBatches: 16, // ~tens of batches in flight (assumption from the brief)
  newBatchEveryMs: [3000, 7000] as [number, number],
  papersPerBatch: [8, 30] as [number, number],
  // A freshly-created batch waits at the loading dock (queued, no papers uploaded
  // yet) before scanning begins — so "waiting" rafts are visibly PARKED in their
  // bay, then push off into the river once uploads start.
  uploadStartDelayMs: [5000, 14000] as [number, number],
  uploadPapersPerTick: [1, 3] as [number, number], // ops scanning rate (trickle)
  answerCount: [4, 8] as [number, number], // sticks per bundle (dark today)
  retireLingerMs: 3000, // how long a fully-done raft sits at the waterfall before exiting
  // Per-stage dwell. moor = time queued at the mooring (backlog); work = active.
  // Tuned so a batch takes ~60–120s end-to-end (the brief's "roughly hours",
  // compressed for the wall), and so the human gates DOMINATE the dwell — a
  // raft's lead bundle parks at BBox Review / Edit for a long time, which is what
  // spreads rafts across the spine instead of letting them all rush to Done.
  stage: {
    upload_scan: { moor: [200, 600], work: [600, 1500], fail: 0.0 },
    answer_chunking: { moor: [400, 1500], work: [3000, 7000], fail: 0.02 },
    // Human gates (beaver) are the bottleneck — long, jittery moor times so
    // bundles PILE UP here. That backlog is the point: it reads as "ops, act
    // here" and is the clickable review queue.
    bbox_review: { moor: [8000, 30000], work: [3000, 8000], fail: 0.0 },
    answer_extraction: { moor: [600, 2000], work: [4000, 10000], fail: 0.03 },
    answer_editing: { moor: [10000, 40000], work: [4000, 10000], fail: 0.0 },
    insight_generation: { moor: [800, 2500], work: [4000, 9000], fail: 0.01 },
  } as Record<string, { moor: [number, number]; work: [number, number]; fail: number }>,
  skipProb: 0.06, // chance a workflow skips an automated stage
};

const SCHOOLS = ["DPS", "NPS", "Vibgyor"];
const GRADES = ["Class 12", "Class 11", "Class 10"];
const SECTIONS = ["A", "B", "C"];
const SUBJECTS = ["Maths", "Science", "English"];
const EXAMS = ["July Unit Test", "Pre-board"];

const FIRST_NAMES = ["Aarav", "Diya", "Ishan", "Kavya", "Rohan", "Sara", "Vivaan", "Ananya", "Arjun", "Meera"];
const LAST_NAMES = ["Sharma", "Iyer", "Khan", "Reddy", "Nair", "Gupta", "Bose", "Menon"];

// Stages a paper actually flows through (excludes the bookend pseudo-stages).
const FLOW_STAGES = STAGES.filter((s) => s !== "queued" && s !== "done");

const rint = (lo: number, hi: number) => Math.floor(lo + Math.random() * (hi - lo + 1));
const pick = <T,>(a: readonly T[]): T => a[Math.floor(Math.random() * a.length)]!;
const shuffle = <T,>(a: T[]): T[] => {
  const r = [...a];
  for (let i = r.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [r[i], r[j]] = [r[j]!, r[i]!];
  }
  return r;
};

let seq = 0;
const uid = (p: string) => `${p}_${(++seq).toString(36)}`;

// Internal ground-truth a paper carries through the sim (NOT the store's model).
interface SimPaper {
  id: string;
  batchId: string;
  stageIdx: number; // index into STAGES
  phase: "moor" | "work" | "terminal";
  nextAt: number; // wall-clock ms when the current phase resolves
  answerCount: number;
  failed: boolean;
}

interface SimBatch {
  id: string;
  key: BatchKey;
  toUpload: number; // papers still waiting to be scanned in
  uploadAt: number; // wall-clock ms when scanning begins (parked at the dock until then)
  papers: SimPaper[];
  retireAt?: number; // set once fully done → exits the wall after the linger
}

export class MockRiverFeed implements RiverFeed {
  private handlers = new Set<(e: RiverEvent) => void>();
  private timer: ReturnType<typeof setInterval> | null = null;
  private batches: SimBatch[] = [];
  private retiring: string[] = []; // batch ids retired this tick, swept after the loop
  private keyPool: BatchKey[] = [];
  private nextBatchAt = 0;

  subscribe(handler: (e: RiverEvent) => void): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  start(): void {
    if (this.timer) return;
    this.keyPool = shuffle(this.allKeys());
    this.nextBatchAt = Date.now(); // spawn the first batch immediately
    this.timer = setInterval(() => this.tick(), CONFIG.tickMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  // ── internals ────────────────────────────────────────────────────────────

  private emit(e: RiverEvent) {
    for (const h of this.handlers) h(e);
  }

  private allKeys(): BatchKey[] {
    const keys: BatchKey[] = [];
    for (const school of SCHOOLS)
      for (const grade of GRADES)
        for (const section of SECTIONS)
          for (const subject of SUBJECTS) for (const exam of EXAMS) keys.push({ school, grade, section, subject, exam });
    return keys;
  }

  private tick() {
    const now = Date.now();
    this.maybeSpawnBatch(now);
    for (const b of this.batches) {
      this.uploadPapers(b, now);
      for (const p of b.papers) this.advancePaper(b, p, now);
      this.maybeRetire(b, now);
    }
    // Sweep retired batches out of the sim (collected this tick).
    if (this.retiring.length) {
      const drop = new Set(this.retiring);
      this.batches = this.batches.filter((b) => !drop.has(b.id));
      this.retiring = [];
    }
  }

  /**
   * A raft goes over the waterfall once ALL its bundles are done (the resolved
   * reassembly rule: no partial completion). It lingers briefly so the
   * completion is visible, then exits — freeing its key back to the pool so a
   * fresh raft can enter. This rolling cycle is what keeps the wall alive.
   */
  private maybeRetire(b: SimBatch, now: number) {
    if (b.retireAt === undefined) {
      const allDone = b.toUpload === 0 && b.papers.length > 0 && b.papers.every((p) => STAGES[p.stageIdx] === "done");
      if (allDone) b.retireAt = now + CONFIG.retireLingerMs;
      return;
    }
    if (now >= b.retireAt) {
      this.emit({ type: "batch_retired", t: now, batchId: b.id });
      this.keyPool.unshift(b.key); // recycle the (school,grade,section,subject,exam) combo
      this.retiring.push(b.id);
    }
  }

  private maybeSpawnBatch(now: number) {
    if (now < this.nextBatchAt) return;
    if (this.batches.length >= CONFIG.maxBatches || this.keyPool.length === 0) return;
    const key = this.keyPool.pop()!;
    const paperCount = rint(CONFIG.papersPerBatch[0], CONFIG.papersPerBatch[1]);
    const batch: SimBatch = {
      id: uid("batch"),
      key,
      toUpload: paperCount,
      uploadAt: now + rint(CONFIG.uploadStartDelayMs[0], CONFIG.uploadStartDelayMs[1]),
      papers: [],
    };
    this.batches.push(batch);
    this.emit({ type: "batch_created", t: now, batchId: batch.id, key, paperCount });
    this.nextBatchAt = now + rint(CONFIG.newBatchEveryMs[0], CONFIG.newBatchEveryMs[1]);
  }

  private uploadPapers(b: SimBatch, now: number) {
    if (now < b.uploadAt) return; // still parked at the dock (queued)
    if (b.toUpload <= 0) return;
    const n = Math.min(b.toUpload, rint(CONFIG.uploadPapersPerTick[0], CONFIG.uploadPapersPerTick[1]));
    for (let i = 0; i < n; i++) {
      const id = uid("paper");
      const answerCount = rint(CONFIG.answerCount[0], CONFIG.answerCount[1]);
      this.emit({
        type: "paper_added",
        t: now,
        batchId: b.id,
        paperId: id,
        rollNumber: String(rint(1, 60)).padStart(3, "0"),
        studentName: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
        answerCount,
      });
      // A freshly scanned paper enters the flow at the first stage.
      const p: SimPaper = {
        id,
        batchId: b.id,
        stageIdx: STAGE_INDEX["upload_scan"],
        phase: "work",
        nextAt: now + rint(...CONFIG.stage["upload_scan"]!.work),
        answerCount,
        failed: false,
      };
      b.papers.push(p);
      this.emit(this.paperEvent(p, "processing", now));
    }
    b.toUpload -= n;
  }

  private advancePaper(b: SimBatch, p: SimPaper, now: number) {
    if (p.phase === "terminal" || now < p.nextAt) return;
    const stage = STAGES[p.stageIdx]!;

    if (p.phase === "moor") {
      // Done queuing at the mooring → start working.
      p.phase = "work";
      p.nextAt = now + rint(...CONFIG.stage[stage]!.work);
      this.emit(this.paperEvent(p, "processing", now));
      return;
    }

    // phase === "work": the stage's work just finished. Fail, or move on.
    const cfg = CONFIG.stage[stage]!;
    if (Math.random() < cfg.fail) {
      p.phase = "terminal";
      p.failed = true;
      this.emit(this.paperEvent(p, "failed", now));
      return;
    }

    // Emit the answer (stick) layer at extraction — "ready but dark" data.
    if (stage === "answer_extraction") {
      for (let q = 1; q <= p.answerCount; q++) {
        this.emit({
          type: "stage_changed",
          t: now,
          scope: "answer",
          batchId: b.id,
          paperId: p.id,
          answerId: `${p.id}#${q}`,
          stage,
          status: "done",
        });
      }
    }

    const target = this.nextFlowStage(p.stageIdx);
    if (target === null) {
      p.phase = "terminal";
      p.stageIdx = STAGE_INDEX["done"];
      this.emit(this.paperEvent(p, "done", now));
      return;
    }
    // Enter the next stage and moor there.
    p.stageIdx = STAGE_INDEX[target];
    p.phase = "moor";
    p.nextAt = now + rint(...CONFIG.stage[target]!.moor);
    this.emit(this.paperEvent(p, "waiting", now));
  }

  /** Next stage in the flow, honoring random skips of automated stages. */
  private nextFlowStage(fromIdx: number): StageId | null {
    let idx = fromIdx + 1;
    while (idx < STAGES.length) {
      const s = STAGES[idx]!;
      if (s === "done") return null;
      // Only automated stages may be skipped; human gates always run.
      if (!isHumanGate(s) && Math.random() < CONFIG.skipProb && idx + 1 < STAGES.length) {
        idx++;
        continue;
      }
      return s;
    }
    return null;
  }

  private paperEvent(p: SimPaper, status: StatusKind, now: number): RiverEvent {
    return {
      type: "stage_changed",
      t: now,
      scope: "paper",
      batchId: p.batchId,
      paperId: p.id,
      stage: STAGES[p.stageIdx]!,
      status,
    };
  }
}

void FLOW_STAGES; // reserved for upcoming layout work; referenced to satisfy noUnusedLocals
