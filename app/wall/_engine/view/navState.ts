import type { Zone } from "./camera";
import type { StageId } from "../model/dams";

// ── Nav state: the single source of truth for "what's selected / where am I" ─
// Both the canvas (focus ring, camera) and the accessible DOM mirror read from
// this, so keyboard and screen-reader navigation stay in lockstep with the
// visuals instead of being a parallel bolt-on. Subscribable like RiverStore,
// with a cached snapshot for useSyncExternalStore.

// Semantic-zoom depth, broad→deep:
//   schools ⊃ grades ⊃ subjects ⊃ exams ⊃ batches(rafts) ⊃ papers(global a-papers)
//   raft = off-ladder leaf (one raft's bundles), reached by click/Enter on a raft.
// Default = batches.
export type ViewLevel =
  | "schools"
  | "grades"
  | "subjects"
  | "exams"
  | "batches"
  | "papers"
  | "raft";

export interface NavSnapshot {
  level: ViewLevel;
  containerId: string | null; // the raft we've drilled into (when level === "raft")
  focusedId: string | null; // focused entity: a raft id at batches, a bundle id inside a raft
  /** Stage whose sequence line is hovered (line OR its HTML chip). Transient. */
  hoverDam: StageId | null;
  /** Stage soft-selected by keyboard (L/R after a raft is focused). */
  stageFocus: StageId | null;
  zone: Zone;
  zoom: number;
  /** last thing that changed, phrased for an aria-live announcement */
  announce: string;
}

export class NavState {
  private snap: NavSnapshot = {
    level: "batches",
    containerId: null,
    focusedId: null,
    hoverDam: null,
    stageFocus: null,
    zone: "river",
    zoom: 1,
    announce: "",
  };
  private listeners = new Set<() => void>();

  get(): NavSnapshot {
    return this.snap;
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private set(patch: Partial<NavSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const fn of this.listeners) fn();
  }

  setFocus(id: string | null, announce: string): void {
    // navigating rafts/units drops any stage soft-selection
    this.set({ focusedId: id, stageFocus: null, announce });
  }
  /** Hover a sequence line (or its HTML chip) → glow it. */
  setHoverDam(stage: StageId | null): void {
    if (this.snap.hoverDam === stage) return;
    this.set({ hoverDam: stage });
  }
  /** Keyboard soft-select of a stage line (L/R after a raft is focused). */
  setStageFocus(stage: StageId | null, announce: string): void {
    this.set({ stageFocus: stage, announce });
  }
  /** Switch to an aggregate / batches / papers level (clears the raft container + focus). */
  setLevel(level: ViewLevel, focusedId: string | null, announce: string): void {
    this.set({ level, containerId: null, focusedId, stageFocus: null, announce });
  }
  /** Drill into a raft → show its bundles; focus moves to a bundle. */
  drillInto(containerId: string, focusedId: string | null, announce: string): void {
    this.set({ level: "raft", containerId, focusedId, stageFocus: null, announce });
  }
  /** Pop back to the batches level; focus returns to the raft we were inside. */
  drillOut(focusedId: string | null, announce: string): void {
    this.set({ level: "batches", containerId: null, focusedId, stageFocus: null, announce });
  }
  setZone(zone: Zone, announce: string): void {
    this.set({ zone, announce });
  }
  setZoom(zoom: number, announce: string): void {
    this.set({ zoom, announce });
  }
}
