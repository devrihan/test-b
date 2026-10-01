// Headless smoke for BeaverApiFeed — verifies the batch-list → river-event
// translation without a live beaver-api. Run:
//   npx esbuild scripts/wall/feedSmoke.mts --bundle --platform=node --format=esm | node --input-type=module
import {
  BeaverApiFeed,
  derivePaperStages,
  mapStatusToStage,
  mapStatusToKind,
  type RawBatch,
} from "../../app/wall/_engine/feed/beaverApiFeed";
import type { RiverEvent } from "../../app/wall/_engine/feed/types";

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? "  ok  " : " FAIL "} ${label}`);
  if (!cond) failures++;
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── 1. COARSE status → fallback dam + kind (real batches.status vocabulary) ──
const STAGE_CASES: [string, string][] = [
  ["waiting_for_scans", "upload_scan"],
  ["pending", "upload_scan"],
  ["processing", "upload_scan"], // per-paper overridden by the count waterline
  ["completed", "answer_editing"],
  ["pushed", "done"],
];
for (const [status, stage] of STAGE_CASES) {
  check(`${status} → ${stage}`, mapStatusToStage(status) === stage);
}
check("no status maps to insight_generation (dark dam)", !STAGE_CASES.some(([, s]) => s === "insight_generation"));
check("processing kind = processing", mapStatusToKind("processing") === "processing");
check("completed kind = waiting (moored at edit)", mapStatusToKind("completed") === "waiting");
check("waiting_for_scans kind = queued", mapStatusToKind("waiting_for_scans") === "queued");
check("failed kind = failed", mapStatusToKind("failed") === "failed");
check("pushed kind = done", mapStatusToKind("pushed") === "done");

// ── 2. count-column WATERLINE → per-paper dam distribution ───────────────────
const base = {
  batch_id: "b1", school_name: "DPS", grade: "Class 12", section: "A",
  subject: "Maths", exam_type: "July Unit Test",
};
// real-shaped processing batch: 4 papers, counts at each stage (most-advanced first)
const flowing: RawBatch = {
  ...base, status: "processing", total_students: 4,
  preprocessed_count: 4, bbox_detected_count: 3, bbox_validated_count: 2, ocr_completed_count: 1,
};
check(
  "waterline distributes papers across dams by count",
  JSON.stringify(derivePaperStages(flowing)) ===
    JSON.stringify(["answer_editing", "answer_extraction", "bbox_review", "answer_chunking"]),
);
// non-nested counts (bbox_detected > preprocessed, as seen in real data) stay sane
const nonNested: RawBatch = {
  ...base, status: "processing", total_students: 2,
  preprocessed_count: 1, bbox_detected_count: 2, bbox_validated_count: 1, ocr_completed_count: 0,
};
check("non-nested counts never over/under-assign (sum === total)", derivePaperStages(nonNested).length === 2);
check(
  "non-nested counts clamp to monotonic waterline",
  JSON.stringify(derivePaperStages(nonNested)) === JSON.stringify(["answer_extraction", "bbox_review"]),
);
// completed → all papers at answer_editing even if a count lagged
check(
  "completed lifts everything to answer_editing",
  derivePaperStages({ ...base, status: "completed", total_students: 3, ocr_completed_count: 1 })
    .every((s) => s === "answer_editing"),
);
// waiting_for_scans with no papers yet → empty raft
check("waiting_for_scans + 0 students → empty", derivePaperStages({ ...base, status: "waiting_for_scans", total_students: 0 }).length === 0);
check("pushed → all over the waterfall", derivePaperStages({ ...base, status: "pushed", total_students: 2 }).every((s) => s === "done"));

// ── 3. lifecycle: spawn → unchanged → counts-advance → retire ────────────────
let snapshot: RawBatch[] = [flowing];
const feed = new BeaverApiFeed({ fetchBatches: async () => snapshot, pollMs: 25 });
let events: RiverEvent[] = [];
feed.subscribe((e) => events.push(e));

await (async () => {
  feed.start(); // immediate first poll
  await sleep(15);

  const created = events.filter((e) => e.type === "batch_created");
  const added = events.filter((e) => e.type === "paper_added");
  const staged = events.filter((e) => e.type === "stage_changed");
  check("spawn: 1 batch_created", created.length === 1);
  check("spawn: paperCount = total_students", created[0]?.type === "batch_created" && created[0].paperCount === 4);
  check("spawn: 4 paper_added", added.length === 4);
  check("spawn: 4 stage_changed (one per paper)", staged.length === 4);
  check(
    "spawn: papers land on their waterline dams",
    new Set(staged.map((e) => (e.type === "stage_changed" ? e.stage : ""))).size === 4,
  );
  check(
    "spawn: batch key built from list fields",
    created[0]?.type === "batch_created" && created[0].key.school === "DPS" && created[0].key.exam === "July Unit Test",
  );

  // unchanged poll → no new events
  events = [];
  await sleep(40);
  check("unchanged status+counts emits nothing", events.length === 0);

  // counts advance (status stays 'processing') → re-stage only the papers that moved
  events = [];
  snapshot = [{ ...flowing, ocr_completed_count: 2, bbox_validated_count: 3 }];
  await sleep(40);
  const restaged = events.filter((e) => e.type === "stage_changed");
  check("count advance re-stages the moved papers", restaged.length > 0 && restaged.length <= 4);
  check("count advance emits no new batch_created", !events.some((e) => e.type === "batch_created"));
  check("count advance emits no new paper_added", !events.some((e) => e.type === "paper_added"));

  // batch drops out of the list → retire
  events = [];
  snapshot = [];
  await sleep(40);
  check("disappearance retires the raft", events.some((e) => e.type === "batch_retired" && e.batchId === "b1"));

  feed.stop();
})();

console.log(failures === 0 ? "\nALL PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);
