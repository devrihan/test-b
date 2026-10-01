#!/usr/bin/env node
// Stub piper (+ roster) server for local review of the /scans screen.
// Zero dependencies. Serves spec-shaped fixtures for 2 dispatches, including
// needs-attention documents (no-cover, incomplete claim, duplicate claim,
// roster mismatches), mock page images, and working mutations (classify /
// metadata patch / workflow / sort controls) over in-memory state.
//
// Run:   node scripts/scan-stub/server.mjs        (port 4571)
// Wire beaver at it via .env.local:
//   PIPER_INTAKE_URL=http://localhost:4571
//   PIPER_INTAKE_TOKEN=stub-token
//   SCAN_IMAGE_BASE=http://localhost:4571/r2
//   NEXT_PUBLIC_BEAVER_API_URL=http://localhost:4571   (roster endpoint)
//
// STUB_NO_LIST=1 makes GET /dispatches 404 to exercise the beaver proxy's
// derive-from-documents fallback (piper has no list endpoint today).
//
// All fixture data is invented — no real students, schools, or scans.

import http from "node:http";
import crypto from "node:crypto";

const PORT = Number(process.env.PORT ?? 4571);
const NO_LIST = process.env.STUB_NO_LIST === "1";

// ── fixtures ────────────────────────────────────────────────────────────────

const uuid = (n) => `11111111-1111-4111-8111-${String(n).padStart(12, "0")}`;
const DISP_A = uuid(100);
const DISP_B = uuid(200);

const today = new Date();
const at = (h, m) =>
  new Date(today.getFullYear(), today.getMonth(), today.getDate(), h, m).toISOString();
const daysAgo = (d, h, m) =>
  new Date(today.getFullYear(), today.getMonth(), today.getDate() - d, h, m).toISOString();

const claim = (over = {}) => ({
  version: "LOAM1",
  school_id: "SCH-TEST",
  exam_type: "UT1",
  academic_year: "2026-27",
  subject_code: "042",
  subject: "Physics",
  set_name: null,
  grade: "12",
  section: "C",
  roll_number: "23",
  admission_no: "A-1023",
  student_name: "Aarav Sharma",
  ...over,
});

const ROSTER = [
  { roll: "23", name: "Aarav Sharma", adm: "A-1023" },
  { roll: "24", name: "Diya Kapoor", adm: "A-1024" },
  { roll: "25", name: "Kabir Nair", adm: "A-1025" },
  { roll: "26", name: "Ishaan Verma", adm: "A-1026" },
  { roll: "27", name: "Ananya Singh", adm: "A-1027" },
  { roll: "28", name: "Meera Pillai", adm: "A-1028" },
].map((s, i) => ({
  student_id: uuid(900 + i),
  student_name: s.name,
  roll_number: s.roll,
  grade: "12",
  section: "C",
  admission_no: s.adm,
  needs_onboarding: false,
  status: "active",
}));

// documents: id → mutable record
const documents = new Map();
let docSeq = 0;
function addDoc({ dispatch, kind, claimData, origin, pages, events = [], processing = null, mintFlags = [] }) {
  const id = uuid(300 + ++docSeq);
  const created = dispatch.createdClock.next().value;
  const pageRows = Array.from({ length: pages }, (_, i) => ({
    document_id: id,
    page_number: i + 1,
    r2_key_original: `documents/${id}/pages/${String(i + 1).padStart(4, "0")}.png`,
    r2_key_downscaled: `documents/${id}/pages/${String(i + 1).padStart(4, "0")}.webp`,
    width: 1240,
    height: 1754,
    created_at: created,
  }));
  documents.set(id, {
    document_id: id,
    kind,
    id_origin: "server",
    claimed_metadata: claimData,
    metadata_origin: kind === "answer_paper" ? origin : null,
    rescan_of: null,
    storage_status: "stored",
    created_at: created,
    updated_at: created,
    processing,
    pages: pageRows,
    events: [
      {
        id: docSeq * 10,
        document_id: id,
        event_kind: kind ? "sorted_from_dispatch" : "sorted_from_dispatch_unassociated",
        payload: {
          dispatch_id: dispatch.dispatch_id,
          stream: "S1",
          cover_page_id: kind ? pageRows[0].r2_key_original : null,
          page_ids: pageRows.map((_, i) => uuid(5000 + docSeq * 20 + i)),
          flags: mintFlags,
        },
        actor: null,
        created_at: created,
      },
      ...events,
    ],
  });
  return documents.get(id);
}

function* clock(startH, startM) {
  let m = startH * 60 + startM;
  while (true) {
    m += 2;
    yield at(Math.floor(m / 60), m % 60);
  }
}

const dispatches = new Map();
function addDispatch({ id, name, laptop, status, opened, closed }) {
  dispatches.set(id, {
    dispatch_id: id,
    laptop_id: laptop,
    name,
    status,
    sort_paused: false,
    opened_at: opened,
    closed_at: closed ?? null,
    updated_at: closed ?? opened,
    createdClock: clock(9, 40),
    pages: [],
  });
  return dispatches.get(id);
}

const dispA = addDispatch({
  id: DISP_A,
  name: "UT1 morning — Lab 2",
  laptop: "scanner-laptop-2",
  status: "open",
  opened: at(9, 12),
});
const dispB = addDispatch({
  id: DISP_B,
  name: "Jun UT1 — Lab 1",
  laptop: "scanner-laptop-1",
  status: "sorted",
  opened: daysAgo(20, 8, 55),
  closed: daysAgo(20, 13, 10),
});
dispB.createdClock = (function* () {
  const c = clock(9, 5);
  while (true) yield daysAgo(20, 0, 0).slice(0, 10) + c.next().value.slice(10);
})();

// dispatch A documents
const a1 = addDoc({ dispatch: dispA, kind: "answer_paper", origin: "qr", pages: 8, claimData: claim() });
a1.processing = { document_id: a1.document_id, stage: "completed", detail: null, updated_at: at(11, 0) };
a1.events.push({ id: 9001, document_id: a1.document_id, event_kind: "workflow_progress", payload: { stage: "completed" }, actor: null, created_at: at(11, 0) });
addDoc({ dispatch: dispA, kind: "answer_paper", origin: "qr", pages: 6, claimData: claim({ roll_number: "24", admission_no: "A-1024", student_name: "Diya Kapoor" }) });
const aNoCover = addDoc({ dispatch: dispA, kind: null, origin: null, pages: 2, claimData: null });
const aIncomplete = addDoc({
  dispatch: dispA, kind: "answer_paper", origin: "qr", pages: 6,
  claimData: claim({ roll_number: "", admission_no: "", student_name: "Kabir Nair" }),
  mintFlags: ["partial_decode"],
});
const dupClaim = claim({ roll_number: "26", admission_no: "A-1026", student_name: "Ishaan Verma" });
addDoc({ dispatch: dispA, kind: "answer_paper", origin: "qr", pages: 8, claimData: dupClaim });
addDoc({ dispatch: dispA, kind: "answer_paper", origin: "qr", pages: 8, claimData: { ...dupClaim }, mintFlags: ["duplicate_claim_in_dispatch"] });
addDoc({
  dispatch: dispA, kind: "answer_paper", origin: "qr", pages: 6,
  claimData: claim({ roll_number: "99", admission_no: "A-1099", student_name: "Rohan Gupta" }),
});
addDoc({
  dispatch: dispA, kind: "answer_paper", origin: "qr", pages: 6,
  claimData: claim({ roll_number: "27", admission_no: "A-1027", student_name: "Ananya Sinh" }),
});

// dispatch B documents (one unresolved leftover)
addDoc({ dispatch: dispB, kind: "answer_paper", origin: "qr", pages: 8, claimData: claim({ exam_type: "JUN-UT1" }) });
addDoc({ dispatch: dispB, kind: "answer_paper", origin: "qr", pages: 8, claimData: claim({ exam_type: "JUN-UT1", roll_number: "25", admission_no: "A-1025", student_name: "Kabir Nair" }) });
addDoc({ dispatch: dispB, kind: null, origin: null, pages: 3, claimData: null });

// dispatch pages: mirror each doc's pages + some undocumented tail
let pageSeq = 0;
function dispatchPagesFor(disp) {
  const rows = [];
  for (const doc of documents.values()) {
    const mint = doc.events.find((e) => e.event_kind.startsWith("sorted_from_dispatch"));
    if (mint?.payload.dispatch_id !== disp.dispatch_id) continue;
    doc.pages.forEach((p, i) => {
      rows.push({
        page_id: uuid(7000 + ++pageSeq),
        dispatch_id: disp.dispatch_id,
        file_name: `S1_${String(rows.length + 1).padStart(4, "0")}.jpg`,
        stream: "S1",
        page_no: rows.length + 1,
        content_hash: `sha256:${crypto.createHash("sha256").update(p.r2_key_original).digest("hex")}`,
        file_size_bytes: 480000 + i * 1000,
        file_mtime: p.created_at,
        observed_at: p.created_at,
        r2_key_original: p.r2_key_original,
        r2_key_downscaled: p.r2_key_downscaled,
        width: 1240,
        height: 1754,
        decode_status: i === 0 && doc.kind ? "decoded" : "no_qr",
        decode_payload: i === 0 && doc.kind ? "LOAM1|SCH-TEST|UT1|2026-27|042|…" : null,
        decode_detail: null,
        flags: [],
        document_id: doc.document_id,
        created_at: p.created_at,
        updated_at: p.created_at,
      });
    });
  }
  return rows;
}
dispA.pages = dispatchPagesFor(dispA);
dispB.pages = dispatchPagesFor(dispB);
// live-stream extras on A: pending + decode errors + an unparsed name
for (let i = 0; i < 9; i++) {
  const isErr = i < 3;
  const badName = i === 8;
  dispA.pages.push({
    page_id: uuid(7800 + i),
    dispatch_id: DISP_A,
    file_name: badName ? "scanpage-oops.jpg" : `S1_${String(dispA.pages.length + 1).padStart(4, "0")}.jpg`,
    stream: badName ? null : "S1",
    page_no: badName ? null : dispA.pages.length + 1,
    content_hash: `sha256:${crypto.createHash("sha256").update(String(i)).digest("hex")}`,
    file_size_bytes: 500000,
    file_mtime: at(11, 30 + i),
    observed_at: at(11, 30 + i),
    r2_key_original: `dispatches/${DISP_A}/pages/${uuid(7800 + i)}.jpg`,
    r2_key_downscaled: `dispatches/${DISP_A}/pages/${uuid(7800 + i)}.webp`,
    width: 1240,
    height: 1754,
    decode_status: isErr ? "decode_error" : "pending",
    decode_payload: null,
    decode_detail: isErr ? "QR region unreadable (blur)" : null,
    flags: badName ? ["unparsed_name"] : [],
    document_id: null,
    created_at: at(11, 30 + i),
    updated_at: at(11, 30 + i),
  });
}

// ── serialization helpers ───────────────────────────────────────────────────

const counters = (disp) => {
  const p = disp.pages;
  const docsMinted = new Set(p.filter((x) => x.document_id).map((x) => x.document_id)).size;
  return {
    pages_total: p.length,
    pages_pending_decode: p.filter((x) => x.decode_status === "pending").length,
    pages_with_qr: p.filter((x) => x.decode_status === "decoded").length,
    pages_decode_error: p.filter((x) => x.decode_status === "decode_error").length,
    pages_sorted: p.filter((x) => x.document_id).length,
    documents_minted: docsMinted,
  };
};

const serializeDispatch = (d) => ({
  dispatch_id: d.dispatch_id,
  laptop_id: d.laptop_id,
  name: d.name,
  status: d.status,
  sort_paused: d.sort_paused,
  opened_at: d.opened_at,
  closed_at: d.closed_at,
  updated_at: d.updated_at,
  counters: counters(d),
});

const serializeDoc = (d) => ({
  document_id: d.document_id,
  kind: d.kind,
  id_origin: d.id_origin,
  claimed_metadata: d.claimed_metadata,
  metadata_origin: d.metadata_origin,
  rescan_of: d.rescan_of,
  storage_status: d.storage_status,
  created_at: d.created_at,
  updated_at: d.updated_at,
});

const docDetail = (d) => ({
  ...serializeDoc(d),
  processing: d.processing,
  pages: d.pages,
  events: d.events,
});

const piperError = (code, message, status) => [
  status,
  { code, message, document_id: null, retryable: false, issues: [] },
];

// ── mock scan image (SVG, generic content) ─────────────────────────────────

function mockScanSvg(key) {
  const page = (key.match(/(\d{4})\.(png|webp)$/) ?? [])[1] ?? "?";
  const hue = (parseInt(key.replace(/\D/g, "").slice(-4) || "0", 10) * 37) % 360;
  const lines = Array.from(
    { length: 18 },
    (_, i) => `<line x1="60" y1="${200 + i * 30}" x2="560" y2="${200 + i * 30}" stroke="#aeb8c6" stroke-width="2"/>`,
  ).join("");
  const scribbles = Array.from(
    { length: 9 },
    (_, i) =>
      `<path d="M70 ${192 + i * 60} q40 -18 90 -6 t130 4 t150 -10 t60 4" fill="none" stroke="hsl(${hue},45%,30%)" stroke-width="5" opacity="0.85"/>`,
  ).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="620" height="800" viewBox="0 0 620 800">
  <rect width="620" height="800" fill="#faf8f3"/>
  <rect x="30" y="30" width="560" height="120" fill="#eef1f6" stroke="#5b6575" stroke-width="4"/>
  <text x="55" y="80" font-family="monospace" font-size="30" font-weight="bold" fill="#3c4657">MOCK SCAN p${page}</text>
  <text x="55" y="120" font-family="monospace" font-size="20" fill="#6b74a5">stub fixture · not a real paper</text>
  ${lines}${scribbles}
</svg>`;
}

// ── http server ─────────────────────────────────────────────────────────────

const json = (res, status, body) => {
  res.writeHead(status, { "content-type": "application/json", "access-control-allow-origin": "*", "access-control-allow-headers": "*" });
  res.end(JSON.stringify(body));
};

const readBody = (req) =>
  new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data ? JSON.parse(data) : {}));
  });

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://localhost:${PORT}`);
    const path = url.pathname;
    const method = req.method ?? "GET";
    if (method === "OPTIONS") return json(res, 200, {});

    // mock R2
    if (path.startsWith("/r2/")) {
      res.writeHead(200, { "content-type": "image/svg+xml", "cache-control": "no-store" });
      return res.end(mockScanSvg(path.slice(4)));
    }
    // roster (beaver-api shape)
    if (path === "/api/students/list") return json(res, 200, { students: ROSTER });

    if (path === "/health") return json(res, 200, { ok: true });

    // Piper-shaped routes require the service token. Anything else (beaver-api
    // routes the dashboard contexts probe, e.g. /api/batches/*) 404s below —
    // NEVER 401, because beaver's apiClient hard-redirects to /login on 401.
    const isPiperRoute = path.startsWith("/dispatches") || path.startsWith("/documents");
    if (!isPiperRoute) return json(res, 404, { message: `stub: no route for ${method} ${path}` });
    if (req.headers["x-piper-service-token"] !== "stub-token") {
      return json(res, 401, piperError("UNAUTHORIZED", "missing or invalid service token", 401)[1]);
    }
    const actor = req.headers["x-actor"] ?? null;

    // GET /dispatches (the list endpoint piper does not have yet)
    if (method === "GET" && path === "/dispatches") {
      if (NO_LIST) return json(res, 404, { message: "not found" });
      const list = [...dispatches.values()]
        .sort((a, b) => (a.opened_at < b.opened_at ? 1 : -1))
        .map(serializeDispatch);
      return json(res, 200, { dispatches: list });
    }

    let m;
    if ((m = path.match(/^\/dispatches\/([^/]+)$/)) && method === "GET") {
      const d = dispatches.get(m[1]);
      if (!d) return json(res, ...piperError("NOT_FOUND", "dispatch not found", 404));
      return json(res, 200, serializeDispatch(d));
    }
    if ((m = path.match(/^\/dispatches\/([^/]+)\/pages$/)) && method === "GET") {
      const d = dispatches.get(m[1]);
      if (!d) return json(res, ...piperError("NOT_FOUND", "dispatch not found", 404));
      return json(res, 200, { dispatch_id: d.dispatch_id, pages: d.pages });
    }
    if ((m = path.match(/^\/dispatches\/([^/]+)\/sort\/(pause|resume|start)$/)) && method === "POST") {
      const d = dispatches.get(m[1]);
      if (!d) return json(res, ...piperError("NOT_FOUND", "dispatch not found", 404));
      if (m[2] === "start") {
        if (d.status === "sorted")
          return json(res, ...piperError("STATE_CONFLICT", "dispatch is already fully sorted", 409));
        return json(res, 200, { dispatch_id: d.dispatch_id, workflow_id: `dispatch-sort-${d.dispatch_id.slice(0, 8)}` });
      }
      d.sort_paused = m[2] === "pause";
      d.updated_at = new Date().toISOString();
      return json(res, 200, serializeDispatch(d));
    }

    if (method === "GET" && path === "/documents") {
      const kind = url.searchParams.get("kind");
      let list = [...documents.values()];
      if (kind === "unassociated") list = list.filter((d) => d.kind === null);
      else if (kind) list = list.filter((d) => d.kind === kind);
      list.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
      return json(res, 200, { documents: list.slice(0, 200).map(serializeDoc) });
    }
    if ((m = path.match(/^\/documents\/([^/]+)$/)) && method === "GET") {
      const d = documents.get(m[1]);
      if (!d) return json(res, ...piperError("NOT_FOUND", "document not found", 404));
      return json(res, 200, docDetail(d));
    }
    if ((m = path.match(/^\/documents\/([^/]+)\/classify$/)) && method === "POST") {
      const d = documents.get(m[1]);
      if (!d) return json(res, ...piperError("NOT_FOUND", "document not found", 404));
      if (d.kind !== null)
        return json(res, ...piperError("STATE_CONFLICT", `document already classified as '${d.kind}'`, 409));
      const body = await readBody(req);
      d.kind = "answer_paper";
      d.claimed_metadata = body.claimed_metadata;
      d.metadata_origin = "manual";
      d.updated_at = new Date().toISOString();
      d.events.push({ id: Date.now(), document_id: d.document_id, event_kind: "classified", payload: { kind: "answer_paper" }, actor, created_at: d.updated_at });
      return json(res, 200, docDetail(d));
    }
    if ((m = path.match(/^\/documents\/([^/]+)\/metadata$/)) && method === "PATCH") {
      const d = documents.get(m[1]);
      if (!d) return json(res, ...piperError("NOT_FOUND", "document not found", 404));
      if (d.kind !== "answer_paper")
        return json(res, ...piperError("STATE_CONFLICT", "metadata patch applies to answer_paper documents only", 409));
      const patch = await readBody(req);
      const old = d.claimed_metadata;
      d.claimed_metadata = { ...old, ...patch };
      d.metadata_origin = "manual";
      d.updated_at = new Date().toISOString();
      d.events.push({ id: Date.now(), document_id: d.document_id, event_kind: "metadata_patched", payload: { old, new: d.claimed_metadata, patch }, actor, created_at: d.updated_at });
      return json(res, 200, docDetail(d));
    }
    if ((m = path.match(/^\/documents\/([^/]+)\/workflow$/)) && method === "POST") {
      const d = documents.get(m[1]);
      if (!d) return json(res, ...piperError("NOT_FOUND", "document not found", 404));
      if (d.kind !== "answer_paper")
        return json(res, ...piperError("STATE_CONFLICT", `cannot dispatch kind '${d.kind ?? "unassociated"}'`, 409));
      if (d.processing && d.processing.stage !== "failed")
        return json(res, ...piperError("STATE_CONFLICT", `document already dispatched (stage '${d.processing.stage}')`, 409));
      const wf = `answer-paper-${d.document_id.slice(0, 8)}`;
      d.processing = { document_id: d.document_id, stage: "dispatched", detail: null, updated_at: new Date().toISOString() };
      d.events.push({ id: Date.now(), document_id: d.document_id, event_kind: "dispatched", payload: { workflow_id: wf }, actor, created_at: d.processing.updated_at });
      return json(res, 200, { document_id: d.document_id, workflow_id: wf, stage: "dispatched" });
    }

    json(res, 404, { message: `stub: no route for ${method} ${path}` });
  })
  .listen(PORT, () => console.log(`scan-stub listening on http://localhost:${PORT} (NO_LIST=${NO_LIST})`));
