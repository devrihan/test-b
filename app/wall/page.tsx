"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo } from "react";
import "./wall.css";
import WallNav from "./WallNav";
import { MockRiverFeed } from "./_engine/feed/mockFeed";
import {
  BeaverApiFeed,
  studentStatusToKind,
  studentStatusToStage,
} from "./_engine/feed/beaverApiFeed";
import type { RiverFeed } from "./_engine/feed/types";
import { BeaverNavResolver } from "./_engine/model/nav";
import type { Paper } from "./_engine/model/types";
import { getBatchStudents, getBatches } from "@/app/(dashboard)/pdfExtract/lib/beaverApi";
import { listStudents } from "@/app/(dashboard)/answerEditing/lib/dataQualityApi";

// The wall boots PixiJS, which touches window/canvas — it must never render on
// the server. ssr:false keeps it client-only; the page itself is a client
// component so the dynamic() call is legal in Next 16's App Router.
// (RiverWall is the engine's internal name — "river" is the rafts/dams visual
// metaphor, distinct from the River pipeline-orchestrator service.)
const Wall = dynamic(
  () => import("./_engine/view/RiverWall").then((m) => m.RiverWall),
  { ssr: false },
);

const USE_MOCK = process.env.NEXT_PUBLIC_WALL_FEED === "mock";
// LOCAL ops-data view: route the feed through the server-side proxy (token injected
// server-side, no Keycloak login). See app/wall/api/{batches,students}/route.ts.
const USE_OPS = process.env.NEXT_PUBLIC_WALL_OPS === "1";

// Pick the feed ONCE at module scope so it's stable across remounts. Default is
// the real beaver-api poll (inherits beaver's Keycloak `token` cookie through
// the shared apiClient). Set NEXT_PUBLIC_WALL_FEED=mock to drive the wall from
// the in-browser simulator instead — no backend / login needed (demos, offline).
function makeFeed(): RiverFeed {
  if (USE_MOCK) return new MockRiverFeed();
  // Optional data-SCOPE clamp: bound the real feed to ONE school. This is NOT the
  // grouping mechanism — the left loading bays + bottom-bar granularity do the org
  // grouping; this just bounds which batches enter the wall at all. Unset = show
  // every school (default). Set NEXT_PUBLIC_WALL_SCHOOL to an EXACT school_name
  // (e.g. "DPS East") to clamp. NB: previously defaulted to "DPS", which matched no
  // real school_name ("DPS East" / "Shihab School") and silently emptied the wall.
  const SCHOOL = process.env.NEXT_PUBLIC_WALL_SCHOOL;  // undefined ⇒ all schools
  return new BeaverApiFeed({
    // Batch is a structural superset of RawBatch, so these assign cleanly.
    fetchBatches: async () => {
      let list;
      if (USE_OPS) {
        const { batches } = await (await fetch("/wall/api/batches", { cache: "no-store" })).json();
        list = batches; // local ops view: all batches (single school locally)
      } else {
        const all = (await getBatches()).batches;
        list = SCHOOL ? all.filter((b) => b.school_name === SCHOOL) : all;
      }
      // stash each raw batch (carries school_id) for the onboarded-roster lookup
      for (const b of list as Array<{ batch_id: string; school_id?: number; grade: string; section: string; subject: string }>) {
        rawByBatchId.set(b.batch_id, { school_id: b.school_id, grade: b.grade, section: b.section, subject: b.subject });
      }
      return list;
    },
    onError: (err) => console.error("[wall] batch poll failed:", err),
  });
}
const feed = makeFeed();

// ── "uploaded / onboarded" metric (Faiza's count) ───────────────────────────
// uploaded  = batch.total_students (count of batch_students rows in loam_ops) —
//             already the wall's paperCount.
// onboarded = the roster size in loam_db for the batch's (school,grade,section,
//             subject): every student in that section·subject is expected to sit
//             every exam, so the section roster IS the expected paper count. This
//             lets ops see whether too many/too few papers were uploaded.
// We stash each polled raw batch (it carries school_id) so we can resolve the
// loam_db roster per batch, cached by section·subject (shared across its exams).
// NOTE: listStudents hits aggregatedData via the USER's Keycloak token — so this
// resolves only when a logged-in ops user views the wall; in a tokenless kiosk it
// 401s and the wall falls back to showing just the uploaded count.
const rawByBatchId = new Map<string, { school_id?: number; grade: string; section: string; subject: string }>();
const onboardedCache = new Map<string, Promise<number | null>>();
async function fetchOnboarded(batchId: string): Promise<number | null> {
  const raw = rawByBatchId.get(batchId);
  if (!raw || raw.school_id == null) return null;
  const key = `${raw.school_id}|${raw.grade}|${raw.section}|${raw.subject}`;
  let p = onboardedCache.get(key);
  if (!p) {
    p = listStudents({ schoolId: raw.school_id, grade: raw.grade, section: raw.section, subject: raw.subject })
      .then((rows) => (Array.isArray(rows) ? rows.length : null))
      .catch(() => null);
    onboardedCache.set(key, p);
  }
  return p;
}

// Real drill-in (Phase 3): map a batch's actual students → wall Papers so the
// drilled view + per-paper action deep-links use real student_ids + statuses.
async function fetchStudents(batchId: string): Promise<Paper[]> {
  const { students } = USE_OPS
    ? await (await fetch(`/wall/api/students/${encodeURIComponent(batchId)}`, { cache: "no-store" })).json()
    : await getBatchStudents(batchId);
  return (students as Array<{ student_id: string; roll_number: string; student_name: string; status: string }>).map((s) => ({
    id: s.student_id,
    batchId,
    rollNumber: s.roll_number ?? "",
    studentName: s.student_name ?? "",
    stage: studentStatusToStage(s.status),
    status: studentStatusToKind(s.status),
    answers: [],
  }));
}

export default function WallPage() {
  const router = useRouter();
  // Real resolver only on the real feed — mock batch ids have no beaver routes, so
  // mock falls back to the engine's logging resolver (clicks just log).
  const nav = useMemo(
    () => (USE_MOCK ? undefined : new BeaverNavResolver((url) => router.push(url))),
    [router],
  );
  return (
    <div className="wall-shell">
      <WallNav />
      <Wall
        feed={feed}
        nav={nav}
        fetchStudents={USE_MOCK ? undefined : fetchStudents}
        fetchOnboarded={USE_MOCK ? undefined : fetchOnboarded}
      />
    </div>
  );
}
