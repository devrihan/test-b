"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ChevronDown, ChevronUp, Cog, Filter as FilterIcon, User, X } from "lucide-react";
import { Application, Container, TextureSource } from "pixi.js";
import { isHumanGate, STAGE_LABEL, STAGES, type StageId } from "../model/dams";
import { LoggingNavResolver, paperAction, type NavIntent, type NavResolver } from "../model/nav";
import type { Batch, Paper } from "../model/types";
import { computeProgress, RiverStore } from "../store/riverStore";
import { MockRiverFeed } from "../feed/mockFeed";
import type { RiverFeed } from "../feed/types";
import { COLORS, STAGE_TINT } from "./palette";
import {
  drawScene,
  drawDamSpine,
  damDisplayLabel,
  EMPTY_FILTER,
  filterActive,
  isAggLevel,
  allPaperIds,
  orderedFloatingPapers,
  type SceneHandlers,
  type WallFilter,
} from "./scene";
import { computeColumns, gradeLabel, raftLabelOf, type Bay, type WallDims } from "./layout";
import {
  applyCamera,
  clampZoom,
  makeCamera,
  stepCamera,
  type Camera,
  type WorldMetrics,
} from "./camera";
import { NavState, type ViewLevel } from "./navState";
import { describeBundle, describeRaft, neighbor, orderedBundleIds, orderedRaftIds } from "./navigation";
import { buildAggregate, type AggContainer } from "./aggregate";

TextureSource.defaultOptions.scaleMode = "nearest";

// Module-singletons so feed/store/nav survive StrictMode remounts and HMR.
let activeFeed: RiverFeed | null = null;
const store = new RiverStore();
// `nav` + `fetchRealStudents` are INJECTABLE seams: standalone/mock leaves the
// logging stub + no roster fetch; beaver injects a real resolver (router.push) and
// a students fetcher via props (set in the component body, read live by the effect
// closures below). Module-scoped `let` so reassignment reaches existing closures.
let nav: NavResolver = new LoggingNavResolver();
let fetchRealStudents: ((batchId: string) => Promise<Paper[]>) | null = null;
// Returns the loam_db onboarded-roster size for a batch (the metric denominator),
// or null when unavailable (no school_id / tokenless kiosk / fetch failed).
let fetchOnboardedFn: ((batchId: string) => Promise<number | null>) | null = null;
const navState = new NavState();

// The granularity ladder, broad→deep. `raft` is OFF the ladder (a leaf reached by
// clicking/Enter on a raft at the `batches` level).
const LADDER: ViewLevel[] = ["schools", "grades", "subjects", "exams", "batches", "papers"];

// The dam (gate) stages — every stage except the intake shore (queued) and the
// waterfall (done). These get a drawn sequence line + an HTML label chip.
const DAM_STAGES: StageId[] = STAGES.filter((s) => s !== "queued" && s !== "done");

// Colour Key shown in help — the STATUS the little cells flag (NOT the stage ramp):
// failed cells go red, actively-working cells carry an amber mark.
const COLOR_KEY: { label: string; color: string }[] = [
  { label: "Failed", color: "#d62828" }, // COLORS.failed
  { label: "In progress", color: "#e0a020" },
];

// Labels for the bottom-bar buttons + title line.
const LEVEL_NOUN: Record<ViewLevel, string> = {
  schools: "schools",
  grades: "grades",
  subjects: "subjects",
  exams: "exams",
  batches: "batches",
  papers: "a-papers",
  raft: "raft",
};

// Grammar: render `<n> <noun>` with the noun singularized when n === 1. Naive
// trailing-"s" stripping produces wrong words ("batches" → "batche"), so map the
// plurals the wall actually uses to their correct singulars explicitly.
const SINGULAR: Record<string, string> = {
  schools: "school",
  grades: "grade",
  sections: "section",
  subjects: "subject",
  exams: "exam",
  batches: "batch",
  "a-papers": "a-paper",
};
function singularize(pluralNoun: string): string {
  return SINGULAR[pluralNoun] ?? pluralNoun;
}
function plural(n: number, pluralNoun: string): string {
  return `${n} ${n === 1 ? singularize(pluralNoun) : pluralNoun}`;
}

interface Totals {
  schools: number;
  grades: number;
  subjects: number;
  exams: number;
  batches: number;
  papers: number;
  failed: number;
}

const EMPTY_TOTALS: Totals = { schools: 0, grades: 0, subjects: 0, exams: 0, batches: 0, papers: 0, failed: 0 };

interface HoverDetail {
  title: string;
  subtitle?: string;
  rows?: { k: string; v: string }[];
  stages?: { label: string; n: number }[];
  /** Optional "do the next thing" button: batch → management page; paper → its
   *  stage-relevant action (Mark bboxes / Edit answers). */
  action?: { label: string; intent: NavIntent };
}

// Human-readable stage range: "Scan" if uniform, "Scan → OCR" if it spans stages.
// Replaces the opaque "frontier"/"tail" jargon in the hover card.
const stageRange = (tail: StageId, head: StageId): string =>
  tail === head ? STAGE_LABEL[head] : `${STAGE_LABEL[tail]} → ${STAGE_LABEL[head]}`;

// Flatten a HoverDetail into the single signboard line: title, optional subtitle,
// then each detail row's value ("Failed" gets its key back so a bare count reads).
// Joined by middots — e.g. "DPSE 12-A Maths Midterm · 24/30 loaded · Scan → OCR · 2 failed".
function hoverLine(d: HoverDetail): string {
  const parts: string[] = [d.title];
  if (d.subtitle) parts.push(d.subtitle);
  for (const r of d.rows ?? []) parts.push(r.k === "Failed" ? `${r.v} failed` : r.v);
  return parts.join("  ·  ");
}

const byId = (id: string | null): Batch | undefined =>
  id ? store.getBatches().find((b) => b.id === id) : undefined;

// distinct option lists for the filter widget (computed off loaded batches)
function distinct(batches: Batch[], pick: (b: Batch) => string): string[] {
  return [...new Set(batches.map(pick))].sort((a, b) => (a < b ? -1 : 1));
}

export function RiverWall({
  feed,
  nav: navProp,
  fetchStudents,
  fetchOnboarded,
}: {
  feed?: RiverFeed;
  nav?: NavResolver;
  fetchStudents?: (batchId: string) => Promise<Paper[]>;
  fetchOnboarded?: (batchId: string) => Promise<number | null>;
} = {}) {
  // Wire the injectable seams from props into the module-scoped vars the effect's
  // closures read. Idempotent assignment each render (mirrors the feed singleton).
  if (navProp) nav = navProp;
  fetchRealStudents = fetchStudents ?? null;
  fetchOnboardedFn = fetchOnboarded ?? null;

  const hostRef = useRef<HTMLDivElement>(null);
  const wallRef = useRef<HTMLDivElement>(null);
  const keyHandlerRef = useRef<((e: React.KeyboardEvent) => void) | null>(null);
  const actionsRef = useRef<{
    zoomIn: () => void;
    zoomOut: () => void;
    setGranularity: (l: ViewLevel) => void;
  } | null>(null);
  // filter lives in a ref the ticker reads (so a redraw picks it up) AND in React
  // state (so the widget re-renders). filterRef is the live value for drawScene.
  const filterRef = useRef<WallFilter>(EMPTY_FILTER);
  // Hovered loading-bay key (ticker-read, like filterRef) → drives the
  // hover-to-highlight: a redraw dims every entity not inside this bay.
  const bayHoverRef = useRef<string | null>(null);

  const [totals, setTotals] = useState<Totals>(EMPTY_TOTALS);
  const [hover, setHover] = useState<HoverDetail | null>(null);
  const [filter, setFilter] = useState<WallFilter>(EMPTY_FILTER);
  const [help, setHelp] = useState(true);
  const [filterOpen, setFilterOpen] = useState(false); // collapsed by default
  // Canvas size (px) so the HTML dam-label chips can be positioned at the dam
  // columns (computeColumns). Updated on mount + resize from the effect.
  const [cdims, setCdims] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // The hovered unit's details show as ONE LINE on the signboard (the wood control
  // box), replacing the search field while hovering. The clear is DEBOUNCED so the
  // cursor can travel from a raft down to the signboard's inline action button
  // without the line vanishing first (Pixi pointerout schedules the clear; the
  // signboard's onMouseEnter cancels it).
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHoverClear = () => {
    if (hoverTimerRef.current) { clearTimeout(hoverTimerRef.current); hoverTimerRef.current = null; }
  };
  const scheduleHoverClear = () => {
    cancelHoverClear();
    hoverTimerRef.current = setTimeout(() => setHover(null), 220);
  };
  const showHover = (d: HoverDetail | null) => {
    if (d) { cancelHoverClear(); setHover(d); } else scheduleHoverClear();
  };

  // Kiosk/screenshot escape: `?help=0` in the URL starts the help dialog CLOSED.
  // Default (no param) keeps the dialog open on every load. Client-only (mount).
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (new URLSearchParams(window.location.search).get("help") === "0") setHelp(false);
  }, []);
  const [opts, setOpts] = useState<{ schools: string[]; grades: string[]; sections: string[]; subjects: string[]; exams: string[] }>({
    schools: [],
    grades: [],
    sections: [],
    subjects: [],
    exams: [],
  });

  const navSnap = useSyncExternalStore(
    (cb) => navState.subscribe(cb),
    () => navState.get(),
  );

  // keep the ticker-visible ref in sync + force a redraw when the filter changes
  useEffect(() => {
    filterRef.current = filter;
    navState.setFocus(navState.get().focusedId, ""); // nudge → dirty → redraw
  }, [filter]);

  // At the global a-papers level every paper is shown individually, so hydrate the
  // REAL roster for ALL loaded batches (once each) → real roll numbers on the cards
  // instead of count-derived placeholders. No-op on the mock feed (no fetcher).
  const hydratedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (navSnap.level !== "papers" || !fetchRealStudents) return;
    for (const b of store.getBatches()) {
      if (hydratedRef.current.has(b.id)) continue;
      hydratedRef.current.add(b.id);
      fetchRealStudents(b.id)
        .then((papers) => { if (papers.length) store.setRealPapers(b.id, papers); })
        .catch(() => hydratedRef.current.delete(b.id));
    }
  }, [navSnap.level, navSnap.announce]);

  // Fetch the onboarded-roster size (metric denominator) once per batch; the raft
  // hover reads onboardedRef. Failures (no school_id / tokenless kiosk / down
  // backend) leave the entry unset → the hover falls back to the uploaded count.
  const onboardedRef = useRef<Map<string, number>>(new Map());
  const onboardedReqRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!fetchOnboardedFn) return;
    for (const b of store.getBatches()) {
      if (onboardedReqRef.current.has(b.id)) continue;
      onboardedReqRef.current.add(b.id);
      fetchOnboardedFn(b.id)
        .then((n) => { if (n != null) onboardedRef.current.set(b.id, n); })
        .catch(() => onboardedReqRef.current.delete(b.id));
    }
  }, [navSnap.announce]);

  useEffect(() => {
    const host = hostRef.current!;
    const world = new Container();
    const scene = new Container();
    world.addChild(scene);
    // FIXED dam spine — sits ON TOP of the scrolling world (added to the stage below),
    // drawn in screen space so the gate lines always span the viewport and the dam
    // structures stay in the middle band with the HTML chips.
    const damSpine = new Container();

    let app: Application | null = null;
    let cancelled = false;
    let dirty = true;
    let spineDirty = true; // redraw the fixed spine on camera move / glow change / resize
    let cleanupExtra: (() => void) | null = null;

    const metrics = (): WorldMetrics => ({ zoneW: host.clientWidth, height: host.clientHeight });
    const dims = (): WallDims => ({ width: host.clientWidth, height: host.clientHeight });

    let cam: Camera = makeCamera(metrics());
    let target: Camera = { ...cam };
    // Vertical content extent of the last drawn scene (world coords) — drives the
    // wheel-pan clamp so you can scroll the whole river but not off into the void.
    let contentTop = 0;
    let contentBottom = metrics().height;

    // ── actions shared by mouse + keyboard ──────────────────────────────────
    const frameRiver = () => {
      const base = makeCamera(metrics());
      target.x = base.x;
      target.y = base.y;
      target.zoom = base.zoom;
    };
    const openBeaver = (b: Batch) => {
      const frontier = computeProgress(b).frontier;
      const intent: NavIntent = isHumanGate(frontier)
        ? { kind: "reviewStage", stage: frontier, batchId: b.id, key: b.key }
        : { kind: "inspectBatch", batchId: b.id };
      nav.navigate(intent);
    };
    const openPaper = (b: Batch, p: Paper) => {
      const intent: NavIntent = { kind: "reviewStage", stage: p.stage, batchId: b.id, paperId: p.id, key: b.key };
      nav.navigate(intent);
    };
    // drill into a raft → its bundles (off-ladder leaf). Content rebind + camera reset.
    const drillInto = (b: Batch) => {
      const ids = orderedBundleIds(b);
      navState.drillInto(b.id, ids[0] ?? null, `Inside ${describeRaft(b)}`);
      frameRiver();
      dirty = true;
      // Phase 3: hydrate the REAL student roster (real student_id + status→stage) so
      // the drilled view + per-paper action deep-links use real identities instead of
      // the overview's count-derived placeholders. No-op on the mock feed.
      if (fetchRealStudents) {
        void fetchRealStudents(b.id)
          .then((papers) => { if (papers.length) { store.setRealPapers(b.id, papers); dirty = true; } })
          .catch(() => {});
      }
    };

    const raftHover = (b: Batch): HoverDetail => {
      const p = computeProgress(b);
      // Faiza's metric: uploaded papers / onboarded roster (loam_db). When the
      // onboarded count is resolved, show "X / Y uploaded" so ops can spot a
      // mismatch (too many / too few papers); otherwise just the uploaded count.
      const onboarded = onboardedRef.current.get(b.id);
      const uploadedRow =
        onboarded != null
          ? { k: "Uploaded", v: `${b.paperCount} / ${onboarded}` }
          : { k: "Uploaded", v: `${b.paperCount}` };
      return {
        title: raftLabelOf(b),
        rows: [
          uploadedRow,
          { k: "Stage", v: stageRange(p.straggler, p.frontier) },
          ...(p.failed ? [{ k: "Failed", v: String(p.failed) }] : []),
        ],
        stages: STAGES.filter((s) => (p.countsByStage[s] ?? 0) > 0).map((s) => ({
          label: STAGE_LABEL[s],
          n: p.countsByStage[s]!,
        })),
        // batch → its management page (/batches/{id})
        action: { label: "Open batch →", intent: { kind: "inspectBatch", batchId: b.id } },
      };
    };
    const bundleHover = (b: Batch, p: Paper): HoverDetail => ({
      title: `Roll ${p.rollNumber} · ${p.studentName}`,
      subtitle: `${b.key.subject} · ${b.key.exam}`,
      rows: [
        { k: "Stage", v: STAGE_LABEL[p.stage] },
        { k: "Status", v: p.status },
      ],
      // student → the next available step for its stage (Mark bboxes / Edit answers)
      action: paperAction(p.stage, b.id, p.id, b.key) ?? undefined,
    });
    // Hover on a free-floating paper in the global a-papers view. These are overview
    // placeholders (no real student id yet) → show the BATCH + stage and offer
    // "Open batch →"; the real per-student action lives after drilling in.
    const floatingPaperHover = (b: Batch, p: Paper): HoverDetail => ({
      // After hydration these are real students → show roll + name; the action stays
      // batch-level (Open batch →) since per-student deep-links live in the drilled view.
      title: `Roll ${p.rollNumber} · ${p.studentName}`,
      subtitle: raftLabelOf(b),
      rows: [{ k: "Stage", v: STAGE_LABEL[p.stage] }],
      action: { label: "Open batch →", intent: { kind: "inspectBatch", batchId: b.id } },
    });
    const containerHover = (c: AggContainer): HoverDetail => ({
      title: c.breadcrumb ? `${c.breadcrumb} ▸ ${c.label}` : c.label,
      rows: [
        { k: c.childKind, v: String(c.cells.length) },
        { k: "Papers", v: String(c.totalPapers) },
        { k: "Stage", v: stageRange(c.straggler, c.frontier) },
        ...(c.failed ? [{ k: "Failed", v: String(c.failed) }] : []),
      ],
    });

    // ── center-on-bay: recenter VERTICALLY on this group's rafts only. NO zoom,
    // NO horizontal move — it's a "scroll to this group" for tall lists. ─────────
    const panToBay = (bay: Bay) => {
      target.y = bay.center;
      navState.setFocus(navState.get().focusedId, `Centered on ${bay.label}`);
      dirty = true;
    };

    const handlers: SceneHandlers = {
      onPickRaft: (b) => {
        // At papers level a "raft" is a paper-group head → drill into that batch.
        drillInto(b);
        wallRef.current?.focus();
      },
      onHoverRaft: (b) => showHover(b ? raftHover(b) : null),
      onPickBundle: (b, p) => {
        navState.setFocus(p.id, `Opened paper ${p.rollNumber}`);
        openPaper(b, p);
      },
      onHoverBundle: (b, p) => showHover(p ? bundleHover(b, p) : null),
      onHoverPaper: (b, p) => showHover(p ? floatingPaperHover(b, p) : null),
      onPickContainer: (id) => {
        navState.setFocus(id, "");
        zoomIn();
      },
      onHoverContainer: (c) => showHover(c ? containerHover(c) : null),
      onPickBay: (bay) => {
        panToBay(bay);
        wallRef.current?.focus();
      },
      onHoverBay: (bay) => {
        // Highlight this bay's entities, dim the rest — set the ticker-read key and
        // mark the scene dirty so the next frame redraws with the new dimming.
        bayHoverRef.current = bay?.key ?? null;
        dirty = true;
      },
      onPickDam: (stage) => {
        // Batch-agnostic: open the whole stage's review/edit page.
        nav.navigate({ kind: "reviewStage", stage, batchId: "" });
        wallRef.current?.focus();
      },
      onHoverDam: (stage) => navState.setHoverDam(stage),
    };

    // ── keyboard model ──────────────────────────────────────────────────────
    // Focus order depends on depth: aggregate containers / paper-groups / rafts / bundles.
    const focusOrder = (): string[] => {
      const v = navState.get();
      if (v.level === "raft" && v.containerId) {
        const b = byId(v.containerId);
        return b ? orderedBundleIds(b) : [];
      }
      if (v.level === "papers") return allPaperIds(store.getBatches());
      if (isAggLevel(v.level)) return buildAggregate(store.getBatches(), v.level).map((c) => c.id);
      return orderedRaftIds(store.getBatches(), dims());
    };
    const announceFocus = (id: string | null) => {
      const v = navState.get();
      if (!id) return "Empty";
      if (v.level === "raft" && v.containerId) {
        const p = byId(v.containerId)?.papers.find((x) => x.id === id);
        return p ? `Focused ${describeBundle(p)}` : "Focused";
      }
      if (v.level === "papers") {
        const it = orderedFloatingPapers(store.getBatches()).find((x) => x.p.id === id);
        return it ? `Focused ${describeBundle(it.p)} · ${it.b.key.exam}` : "Focused";
      }
      if (isAggLevel(v.level)) {
        const c = buildAggregate(store.getBatches(), v.level).find((x) => x.id === id);
        return c ? `Focused ${c.label}` : "Focused";
      }
      const b = byId(id);
      return b ? `Focused ${describeRaft(b)}` : "Focused";
    };

    // ── granularity ladder: schools › grades › subjects › exams › batches › papers ──
    const setGranularity = (level: ViewLevel) => {
      navState.setLevel(level, null, `Granularity: ${LEVEL_NOUN[level]}`);
      frameRiver();
      dirty = true;
    };
    const zoomOut = () => {
      const v = navState.get();
      if (v.level === "raft") {
        navState.drillOut(v.containerId, "Batches"); // → batches
      } else {
        const i = LADDER.indexOf(v.level);
        const next = LADDER[Math.max(0, i - 1)];
        if (next && next !== v.level) navState.setLevel(next, null, `Granularity: ${LEVEL_NOUN[next]}`);
      }
      frameRiver();
      dirty = true;
    };
    const zoomIn = () => {
      const v = navState.get();
      if (v.level === "raft") {
        // leaf action: open the focused paper
        const b = byId(v.containerId);
        const p = b?.papers.find((x) => x.id === v.focusedId);
        if (b && p) openPaper(b, p);
        return;
      }
      if (v.level === "batches") {
        // deepest live drill on the ladder enters a raft (off-ladder)
        const b = byId(v.focusedId);
        if (b) {
          drillInto(b);
          return;
        }
      }
      const i = LADDER.indexOf(v.level);
      const next = LADDER[Math.min(LADDER.length - 1, i + 1)];
      if (next && next !== v.level) {
        navState.setLevel(next, null, `Granularity: ${LEVEL_NOUN[next]}`);
        frameRiver();
        dirty = true;
      }
    };
    const focusBy = (step: number) => {
      const next = neighbor(focusOrder(), navState.get().focusedId, step);
      navState.setFocus(next, announceFocus(next));
      dirty = true;
    };
    const focusEnd = (which: "first" | "last") => {
      const ids = focusOrder();
      const id = which === "first" ? ids[0] ?? null : ids[ids.length - 1] ?? null;
      navState.setFocus(id, announceFocus(id));
      dirty = true;
    };
    // ── L/R model (zones removed) ────────────────────────────────────────────
    // Nothing soft-selected  → L/R PANS the canvas horizontally (only does anything
    //                          when zoomed in; at 1× the river fills the width).
    // A raft/container focused → L/R soft-selects the nearest STAGE line (enter stage mode).
    // A stage soft-selected   → L/R jumps stage→stage. (U/D returns to rafts — setFocus
    //                          clears stageFocus.)
    const isRaftLevel = () => {
      const l = navState.get().level;
      return l === "batches" || isAggLevel(l);
    };
    const nearestDam = (fr: StageId): StageId => {
      if (DAM_STAGES.includes(fr)) return fr;
      return STAGES.indexOf(fr) <= STAGES.indexOf(DAM_STAGES[0]!) ? DAM_STAGES[0]! : DAM_STAGES[DAM_STAGES.length - 1]!;
    };
    const panX = (dir: number) => {
      const m = metrics();
      const visHalf = m.zoneW / target.zoom / 2;
      const lo = visHalf;
      const hi = m.zoneW - visHalf;
      if (hi <= lo) return; // nothing to pan at this zoom
      target.x = Math.max(lo, Math.min(hi, target.x + (dir * 140) / target.zoom));
      dirty = true;
    };
    const stageOrPan = (dir: number) => {
      const v = navState.get();
      if (v.stageFocus) {
        const i = DAM_STAGES.indexOf(v.stageFocus);
        const next = DAM_STAGES[Math.max(0, Math.min(DAM_STAGES.length - 1, i + dir))]!;
        navState.setStageFocus(next, `Stage ${STAGE_LABEL[next]}`);
        dirty = true;
      } else if (v.focusedId && isRaftLevel()) {
        const b = byId(v.focusedId);
        const start = b ? nearestDam(computeProgress(b).frontier) : DAM_STAGES[0]!;
        navState.setStageFocus(start, `Stage ${STAGE_LABEL[start]} selected`);
        dirty = true;
      } else {
        panX(dir);
      }
    };
    const resetView = () => {
      frameRiver();
      navState.setLevel("batches", null, "Reset view");
      dirty = true;
    };

    const onKeyDown = (e: React.KeyboardEvent) => {
      switch (e.key) {
        case "ArrowDown": focusBy(1); break; // U/D navigates rafts/units (clears stage soft-select)
        case "ArrowUp": focusBy(-1); break;
        case "ArrowLeft": case "[": stageOrPan(-1); break;
        case "ArrowRight": case "]": stageOrPan(1); break;
        case "Home": focusEnd("first"); break;
        case "End": focusEnd("last"); break;
        case "Enter": case " ": {
          const v = navState.get();
          if (v.stageFocus) handlers.onPickDam(v.stageFocus); // open the soft-selected stage's page
          else zoomIn();
          break;
        }
        case "+": case "=": zoomIn(); break; // granularity deeper
        case "-": case "_": zoomOut(); break; // granularity broader
        case "o": case "O": {
          const v = navState.get();
          if (v.level === "batches") {
            const b = byId(v.focusedId);
            if (b) openBeaver(b);
          }
          break;
        }
        case "Escape": {
          const v = navState.get();
          if (v.stageFocus) {
            navState.setStageFocus(null, "Stage deselected");
            dirty = true;
            break;
          }
          if (v.level === "raft") {
            navState.drillOut(v.containerId, "Batches");
            frameRiver();
            dirty = true;
          } else if (v.level !== "batches") {
            setGranularity("batches");
          } else {
            navState.setFocus(null, "Selection cleared");
            dirty = true;
          }
          break;
        }
        case "0": resetView(); break;
        case "?": setHelp(true); break;
        default: return;
      }
      e.preventDefault();
    };
    keyHandlerRef.current = onKeyDown;
    actionsRef.current = { zoomIn, zoomOut, setGranularity };

    (async () => {
      const a = new Application();
      await a.init({
        background: COLORS.river, // clear color = water, so no light margin can show
        antialias: false,
        autoDensity: true,
        resolution: window.devicePixelRatio || 1,
        width: host.clientWidth,
        height: host.clientHeight,
      });
      if (cancelled) return a.destroy(true, { children: true });
      app = a;
      a.stage.addChild(world);
      a.stage.addChild(damSpine); // on top of the world (fixed screen overlay)
      host.appendChild(a.canvas);
      a.canvas.setAttribute("aria-hidden", "true");

      // Plain wheel = SCROLL the river vertically (granularity lives on the ±
      // buttons / +- keys only). Cmd/Ctrl+wheel = camera magnify (continuous zoom).
      const onWheel = (e: WheelEvent) => {
        e.preventDefault();
        if (e.ctrlKey || e.metaKey) {
          target.zoom = clampZoom(target.zoom * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
          navState.setZoom(Math.round(target.zoom * 100) / 100, `Zoom ${target.zoom.toFixed(1)}×`);
          return;
        }
        // Pan in WORLD units (÷zoom keeps scroll speed consistent at any zoom),
        // clamped so the visible window stays within the drawn content. When the
        // content is shorter than the viewport, lock to its vertical centre.
        const visHalf = metrics().height / target.zoom / 2;
        const lo = contentTop + visHalf;
        const hi = contentBottom - visHalf;
        const next = target.y + e.deltaY / target.zoom;
        target.y = hi <= lo ? (contentTop + contentBottom) / 2 : Math.max(lo, Math.min(hi, next));
      };
      a.canvas.addEventListener("wheel", onWheel, { passive: false });

      const unsubStore = store.subscribe(() => (dirty = true));
      const unsubNav = navState.subscribe(() => { dirty = true; spineDirty = true; }); // glow lives in navState
      if (!activeFeed) activeFeed = feed ?? new MockRiverFeed();
      const detach = store.connect(activeFeed);
      const ro = new ResizeObserver(() => {
        if (!app) return;
        app.renderer.resize(host.clientWidth, host.clientHeight);
        const base = makeCamera(metrics());
        target.x = base.x;
        cam.x = target.x;
        setCdims({ width: host.clientWidth, height: host.clientHeight });
        dirty = true;
        spineDirty = true;
      });
      ro.observe(host);
      setCdims({ width: host.clientWidth, height: host.clientHeight }); // initial
      cleanupExtra = () => {
        a.canvas.removeEventListener("wheel", onWheel);
        unsubStore();
        unsubNav();
        detach();
        ro.disconnect();
      };

      a.ticker.add(() => {
        const moving = stepCamera(cam, target);
        applyCamera(world, cam, a.screen.width, a.screen.height);
        // FIXED dam spine (screen space): redraw while the camera moves, on glow
        // change, or on resize — it tracks horizontal pan/zoom but stays full-height.
        if (moving || spineDirty) {
          spineDirty = false;
          const sn = navState.get();
          drawDamSpine(
            damSpine, computeColumns(dims()), cam.x, cam.zoom,
            a.screen.width, a.screen.height,
            sn.hoverDam ?? sn.stageFocus ?? null, handlers,
          );
        }
        if (!dirty && !moving) return;
        dirty = false;
        const batches = store.getBatches();
        const snap = navState.get();
        // Over-upload alarm: uploaded (paperCount) exceeds the onboarded roster.
        const alarmBatchIds = new Set<string>();
        for (const b of batches) {
          const ob = onboardedRef.current.get(b.id);
          if (ob != null && b.paperCount > ob) alarmBatchIds.add(b.id);
        }
        drawScene(scene, batches, dims(), handlers, {
          level: snap.level,
          containerId: snap.containerId,
          focusedId: snap.focusedId,
          filter: filterRef.current,
          bayHover: bayHoverRef.current,
          hoverDam: snap.hoverDam,
          stageFocus: snap.stageFocus,
          alarmBatchIds,
        });
        // Cache the scene's vertical extent for the wheel-pan clamp. (The flanking
        // zone stubs span only [top,bottom], so they don't inflate the Y bounds.)
        const lb = scene.getLocalBounds();
        contentTop = lb.y;
        contentBottom = lb.y + lb.height;
        // Re-clamp the camera so a granularity/zoom change that shrinks content
        // doesn't strand the view below the river.
        {
          const visHalf = dims().height / target.zoom / 2;
          const lo = contentTop + visHalf;
          const hi = contentBottom - visHalf;
          target.y = hi <= lo ? (contentTop + contentBottom) / 2 : Math.max(lo, Math.min(hi, target.y));
        }

        // ── totals (one source: loaded batches) ─────────────────────────────
        const schools = new Set<string>();
        const grades = new Set<string>();
        const subjects = new Set<string>();
        const exams = new Set<string>();
        let papers = 0;
        let failed = 0;
        for (const b of batches) {
          schools.add(b.key.school);
          grades.add(`${b.key.school}¦${b.key.grade}`);
          subjects.add(`${b.key.school}¦${b.key.grade}¦${b.key.subject}`);
          exams.add(`${b.key.school}¦${b.key.grade}¦${b.key.subject}¦${b.key.exam}`);
          papers += b.paperCount;
          failed += computeProgress(b).failed;
        }
        setTotals({
          schools: schools.size,
          grades: grades.size,
          subjects: subjects.size,
          exams: exams.size,
          batches: batches.length,
          papers,
          failed,
        });
        setOpts({
          schools: distinct(batches, (b) => b.key.school),
          grades: distinct(batches, (b) => gradeLabel(b.key.grade)),
          sections: distinct(batches, (b) => b.key.section),
          subjects: distinct(batches, (b) => b.key.subject),
          exams: distinct(batches, (b) => b.key.exam),
        });
      });
    })();

    wallRef.current?.focus();

    return () => {
      cancelled = true;
      cleanupExtra?.();
      if (app) { app.destroy(true, { children: true }); app = null; }
      world.destroy({ children: true });
    };
  }, []);

  // ── bottom-bar derived state ──────────────────────────────────────────────
  const level = navSnap.level;
  const openRaft = level === "raft" ? byId(navSnap.containerId) : undefined;
  const countFor = (l: ViewLevel): number => totals[l as keyof Totals] ?? 0;
  const titleText = openRaft
    ? `Inside ${openRaft.key.exam} · ${openRaft.key.section}`
    : `${plural(countFor(level), LEVEL_NOUN[level])} on the river`;

  const setF = (patch: Partial<WallFilter>) => setFilter((f) => ({ ...f, ...patch }));

  return (
    <div
      className="wall"
      ref={wallRef}
      tabIndex={0}
      role="application"
      aria-label="River pipeline wall. Up and Down arrows move focus through rafts. Left and right arrows pan the canvas, or — when a raft is focused — soft-select the stage sequence lines and step between them. Enter opens the focused item or stage. Plus and minus change granularity. Click a loading bay to center on its rafts. Zero resets the view. Question mark opens help."
      onKeyDown={(e) => keyHandlerRef.current?.(e)}
    >
      <div className="wall-canvas" ref={hostRef} />

      {/* ── dam stage labels — HTML Tailwind chips pinned over each sequence line.
          Positioned at the dam columns (computeColumns); hovering a chip OR its
          Pixi line glows BOTH (shared navState.hoverDam). Manual gates are clickable
          → their review page. Auto gates are labels only. (Chips sit at a fixed top
          band; the full-height line ties them to the river.) */}
      {cdims.width > 0 && (() => {
        const cols = computeColumns(cdims);
        return (
          <div className="wall-chrome absolute top-1/2 left-0 right-0 h-0 pointer-events-none z-[6]">
            {DAM_STAGES.map((s) => {
              const glow = navSnap.hoverDam === s || navSnap.stageFocus === s;
              const manual = isHumanGate(s);
              const tint = "#" + STAGE_TINT[s].toString(16).padStart(6, "0");
              return (
                <button
                  key={s}
                  style={{
                    left: `${cols.x[s]}px`,
                    boxShadow: glow ? `0 0 0 2px ${tint}, 0 0 14px ${tint}99` : undefined,
                  }}
                  className={`pointer-events-auto absolute -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-0.5 px-2 py-1 rounded-lg border bg-white/90 backdrop-blur-sm text-[11px] leading-tight font-semibold text-gray-700 shadow-sm transition ${
                    glow ? "scale-105 bg-white border-transparent" : "border-gray-200 hover:border-gray-300"
                  } ${manual ? "cursor-pointer" : "cursor-default"}`}
                  onMouseEnter={() => navState.setHoverDam(s)}
                  onMouseLeave={() => navState.setHoverDam(null)}
                  onClick={() => {
                    if (!manual) return;
                    nav.navigate({ kind: "reviewStage", stage: s, batchId: "" });
                    wallRef.current?.focus();
                  }}
                >
                  <span className="flex items-center gap-1">
                    {manual ? <User size={11} className="text-amber-600" /> : <Cog size={11} className="text-sky-600" />}
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: tint }} />
                  </span>
                  {damDisplayLabel(s).split("\n").map((ln, i) => (
                    <span key={i}>{ln}</span>
                  ))}
                </button>
              );
            })}
          </div>
        );
      })()}

      {/* ── bottom bar: the wood signboard (control box) with the filter + help "?" to its right ── */}
      <div className="bottombar">

      {/* ── compact wood control box (signboard): search/hover-detail on top, granularity + ± below ── */}
      <div
        className="controlbar"
        onMouseEnter={cancelHoverClear}
        onMouseLeave={scheduleHoverClear}
      >
        {/* Top slot: while hovering a unit it shows that unit's details on ONE LINE
            (+ an inline action button) — the old floating card now lives here on the
            signboard. With nothing hovered it's a direct SEARCH box: type a school/
            grade/section/subject/exam/batch-id and matching rafts stay bright while
            the rest dim. stopPropagation keeps wall hotkeys (±, arrows) from firing
            while typing. */}
        {hover ? (
          <div className="cb-hover">
            <span className="cb-hover-line" title={hoverLine(hover)}>{hoverLine(hover)}</span>
            {hover.action && (
              <button
                className="cb-hover-act"
                onClick={() => {
                  const intent = hover.action!.intent;
                  cancelHoverClear();
                  setHover(null);
                  nav.navigate(intent);
                }}
              >
                {hover.action.label}
              </button>
            )}
          </div>
        ) : (
          <input
            className="cb-search"
            value={filter.search}
            placeholder={titleText}
            aria-label="Search rafts"
            onChange={(e) => setF({ search: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Escape") setF({ search: "" }); e.stopPropagation(); }}
          />
        )}
        <div className="cb-buttons">
          {LADDER.map((l) => (
            <button
              key={l}
              className={`cb-btn ${
                (openRaft && l === "batches") || (!openRaft && l === level) ? "sel" : ""
              }`}
              onClick={() => {
                actionsRef.current?.setGranularity(l);
                wallRef.current?.focus();
              }}
            >
              <span className="cb-n">{countFor(l)}</span>
              <span className="cb-l">{countFor(l) === 1 ? singularize(LEVEL_NOUN[l]) : LEVEL_NOUN[l]}</span>
            </button>
          ))}
          <div className="cb-zoom">
            <button
              className="cb-zbtn"
              aria-label="Granularity broader"
              onClick={() => { actionsRef.current?.zoomOut(); wallRef.current?.focus(); }}
            >
              −
            </button>
            <button
              className="cb-zbtn"
              aria-label="Granularity deeper"
              onClick={() => { actionsRef.current?.zoomIn(); wallRef.current?.focus(); }}
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* to the RIGHT of the signboard: a small Filter pill with the help "?" under it.
          The expanded filter is a popover ABOVE the bar (rendered separately below) so a
          wide filter row never disturbs this cluster's alignment. */}
      <div className="bb-side wall-chrome">
        <button
          className={`flex items-center gap-1.5 h-9 px-3 rounded-lg border text-xs font-medium shadow-sm transition ${
            filterOpen || filterActive(filter)
              ? "bg-indigo-50 border-indigo-300 text-indigo-700"
              : "bg-white border-gray-200 text-gray-600 hover:border-indigo-400 hover:text-indigo-600"
          }`}
          aria-label="Toggle filter"
          onClick={() => setFilterOpen((v) => !v)}
        >
          <FilterIcon size={13} /> Filter
          {filterOpen ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
          {filterActive(filter) && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500" />}
        </button>
        {!help && (
          <button
            className="w-9 h-9 rounded-full bg-indigo-600 hover:bg-indigo-700 text-white text-lg font-semibold flex items-center justify-center shadow-md transition"
            aria-label="Open help"
            onClick={() => setHelp(true)}
          >
            ?
          </button>
        )}
      </div>
      </div>{/* /bottombar */}

      {/* expanded filter — a beaver-styled white card centred ABOVE the bottom bar */}
      {filterOpen && (
        <div
          className="wall-chrome absolute left-1/2 bottom-[92px] -translate-x-1/2 z-20 w-max max-w-[92vw] flex items-center flex-wrap justify-center gap-2 bg-white border border-gray-200 rounded-xl shadow-lg shadow-black/10 px-3 py-2"
          aria-label="Filter rafts"
        >
          <span className="text-xs font-semibold text-gray-500 mr-1">Filter</span>
          <FbSelect label="School" value={filter.school} opts={opts.schools} onChange={(v) => setF({ school: v })} />
          <FbSelect label="Grade" value={filter.grade} opts={opts.grades} onChange={(v) => setF({ grade: v })} />
          <FbSelect label="Subject" value={filter.subject} opts={opts.subjects} onChange={(v) => setF({ subject: v })} />
          <FbSelect label="Section" value={filter.section} opts={opts.sections} onChange={(v) => setF({ section: v })} />
          <FbSelect label="Exam" value={filter.exam} opts={opts.exams} onChange={(v) => setF({ exam: v })} />
          <button
            className={`h-8 px-3 text-xs font-medium rounded-lg border transition ${
              filter.status === "failed"
                ? "bg-red-500 border-red-500 text-white"
                : "bg-white border-gray-200 text-gray-600 hover:border-red-300 hover:text-red-600"
            }`}
            onClick={() => setF({ status: filter.status === "failed" ? "" : "failed" })}
          >
            failed
          </button>
          <button
            className={`h-8 px-3 text-xs font-medium rounded-lg border transition ${
              filter.status === "active"
                ? "bg-amber-500 border-amber-500 text-white"
                : "bg-white border-gray-200 text-gray-600 hover:border-amber-300 hover:text-amber-600"
            }`}
            onClick={() => setF({ status: filter.status === "active" ? "" : "active" })}
          >
            in-progress
          </button>
          <button
            className="h-8 px-3 text-xs font-medium text-red-500 hover:text-red-600 border border-red-200 hover:border-red-300 rounded-lg transition"
            onClick={() => setFilter(EMPTY_FILTER)}
          >
            clear
          </button>
          <button
            className="h-8 w-8 flex items-center justify-center text-gray-400 hover:text-gray-700 rounded-lg transition"
            aria-label="Collapse filter"
            onClick={() => setFilterOpen(false)}
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* ── help dialog (full-screen; shows on every load unless ?help=0) ──── */}
      {help && (
        <div className="help-backdrop" onClick={() => { setHelp(false); wallRef.current?.focus(); }}>
          <div
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-label="How the wall works"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => { if (e.key === "Escape") { setHelp(false); wallRef.current?.focus(); } }}
            tabIndex={-1}
          >
            <h2>The Beaver Wall</h2>
            <p>
              At default zoom level, each <b>raft</b> is a <b>batch</b> of answer papers. Explore by
              clicking on rafts and zooming in/out. A raft only clears a stage once <b>all</b> of its
              papers have — so it leaves the <b>loading bay</b> only when every answer paper has been uploaded.
            </p>
            <div className="help-legend">
              <div className="help-legend-label">Keyboard<br />controls</div>
              <ul className="help-keys">
                <li><span><kbd>↑</kbd><kbd>↓</kbd> focus</span><span><kbd>Enter</kbd> open</span></li>
                <li><span><kbd>+</kbd><kbd>−</kbd> granularity</span><span>scroll to pan</span></li>
                <li><span><kbd>o</kbd> open in beaver</span><span><kbd>Esc</kbd> back · <kbd>0</kbd> reset</span></li>
              </ul>
            </div>
            <div className="help-legend">
              <div className="help-legend-label">Cell<br />status</div>
              <div className="help-key">
                {COLOR_KEY.map(({ label, color }) => (
                  <span className="hk-item" key={label}>
                    <i className="hk-swatch" style={{ background: color }} />{label}
                  </span>
                ))}
              </div>
            </div>
            <button className="help-ok" onClick={() => { setHelp(false); wallRef.current?.focus(); }}>
              Got it
            </button>
          </div>
        </div>
      )}

      {/* Accessible live region. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">{navSnap.announce}</div>
    </div>
  );
}

// Compact labelled select for the filter widget — mirrors beaver's /batches filter
// selects (Header.tsx): Tailwind-styled native <select> + a ChevronDown chip, indigo
// fill when a value is chosen. The field label doubles as the empty ("any") option.
function FbSelect({
  label,
  value,
  opts,
  onChange,
}: {
  label: string;
  value: string;
  opts: string[];
  onChange: (v: string) => void;
}) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`h-8 pl-3 pr-8 text-xs font-medium rounded-lg border appearance-none cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 ${
          value ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-white border-gray-200 text-gray-500"
        }`}
      >
        <option value="">{label}</option>
        {opts.map((o) => (
          <option key={o} value={o}>{o}</option>
        ))}
      </select>
      <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-gray-400" />
    </div>
  );
}
