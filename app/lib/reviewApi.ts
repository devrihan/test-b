// Client-side API helpers for the Review Framework (beaver #97, Phase A).
// All calls hit beaver-api's /api/review/* endpoints. Identity is derived
// server-side from the bearer token, so we never send an actor field.
//
// Mirrors the per-feature wrapper pattern in
//   app/(dashboard)/answerEditing/lib/dataQualityApi.ts
// and the beaver-api base + auth-token extraction used by
//   app/(dashboard)/pdfExtract/lib/beaverApi.ts

import { getAuthToken as getToken } from "@/app/lib/auth";

const BEAVER_BASE =
  process.env.NEXT_PUBLIC_BEAVER_API_URL ?? "http://localhost:4000";

// ── Types ─────────────────────────────────────────────────────────────────

export type Outcome =
  | "ai_unchanged"
  | "ai_edited"
  | "ai_cleared"
  | "written_from_blank"
  | "ai_regenerated";

export type ActionRef = {
  question_key: string;
};

export type EventValue = {
  ocr_text: string | null;
  marks: number | null;
};

export type ReviewEvent = {
  id: string;
  actor: string;
  action_ref: ActionRef;
  outcome: Outcome;
  old_value: EventValue;
  new_value: EventValue;
  created_at: string;
};

export type ReviewComment = {
  id: string;
  action_ref: ActionRef | null;
  author: string;
  body: string;
  resolved: boolean;
  created_at: string;
};

export type TimeSpent = {
  actor: string;
  active_ms: number;
  sessions: number;
};

export type ReviewUnit = {
  unit_type: string;
  batch_id: string;
  student_id: string;
};

export type ReviewHistory = {
  unit: ReviewUnit;
  events: ReviewEvent[];
  comments: ReviewComment[];
  time_spent: TimeSpent[];
};

export type MetricsRow = {
  group: string;
  corrected: number;
  discarded: number;
  written_from_blank: number;
  regenerated: number;
  unchanged: number;
  total_events: number;
  units_touched: number;
  active_ms: number;
  sessions: number;
};

export type ReviewSession = {
  session_id: string;
};

export type HeartbeatResult = {
  active_ms: number;
};

const UNIT_TYPE = "answer_paper" as const;

// ── Token extraction (matches beaverApi / pipeline editor pattern) ──────────


function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...authHeaders(),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    let err: unknown;
    try {
      err = JSON.parse(text);
    } catch {
      err = { error: text || `HTTP ${res.status}` };
    }
    throw Object.assign(new Error(`HTTP ${res.status}`), {
      status: res.status,
      body: err,
    });
  }
  if (res.status === 204) return undefined as unknown as T;
  const body = await res.text();
  return (body ? JSON.parse(body) : ({} as T)) as T;
}

// ── History ─────────────────────────────────────────────────────────────────

export async function getReviewHistory(params: {
  batchId: string;
  studentId: string;
}): Promise<ReviewHistory> {
  const qs = new URLSearchParams({
    unit_type: UNIT_TYPE,
    batch_id: params.batchId,
    student_id: params.studentId,
  });
  return jsonFetch<ReviewHistory>(
    `${BEAVER_BASE}/api/review/history?${qs.toString()}`
  );
}

// ── Sessions / time tracking ────────────────────────────────────────────────


export async function openReviewSession(params: {
  batchId: string;
  studentId: string;
  kind?: "auto" | "explicit";
  stage?: ReviewStage;
}): Promise<ReviewSession> {
  return jsonFetch<ReviewSession>(`${BEAVER_BASE}/api/review/sessions`, {
    method: "POST",
    body: JSON.stringify({
      unit_type: UNIT_TYPE,
      batch_id: params.batchId,
      student_id: params.studentId,
      ...(params.kind ? { kind: params.kind } : {}),
      ...(params.stage ? { stage: params.stage } : {}),
    }),
  });
}


export interface SectionSession {
  session_id: number;
  role: string | null;
  started_at: string;
  resumed: boolean;
}

/** Auto-start. Safe on every click: the server joins the open record rather than opening a second. */
export async function startSectionTiming(params: {
  batchId: string;
  stage: ReviewStage;
}): Promise<SectionSession> {
  return jsonFetch<SectionSession>(`${BEAVER_BASE}/api/review/sections/start`, {
    method: "POST",
    body: JSON.stringify({ batch_id: params.batchId, stage: params.stage }),
  });
}

export interface OpenSectionSession {
  session_id: number;
  role: string | null;
  started_at: string;
}

export interface SectionTimingState {
  /** This operator's pass, if one is under way. */
  open: OpenSectionSession | null;
  /** Who holds each role on the section, shown whether or not anything is running. */
  makers: string[];
  checkers: string[];
  /** The section's status, the same one the Ops Queue shows. */
  ops_status: OpsStatus;
}

/** The section's timing state: my open pass, plus who is assigned to it. */
export async function getSectionTiming(params: {
  batchId: string;
  stage: ReviewStage;
}): Promise<SectionTimingState> {
  const qs = new URLSearchParams({ batch_id: params.batchId, stage: params.stage });
  return jsonFetch<SectionTimingState>(
    `${BEAVER_BASE}/api/review/sections/open?${qs.toString()}`
  );
}

/** Done: closes whichever record the server has open for this section, from any tab. */
export async function completeSectionTiming(params: {
  batchId: string;
  stage: ReviewStage;
}): Promise<{ started_at: string; ended_at: string; seconds: number }> {
  return jsonFetch(`${BEAVER_BASE}/api/review/sections/done`, {
    method: "POST",
    body: JSON.stringify({ batch_id: params.batchId, stage: params.stage }),
  });
}
export async function heartbeatReviewSession(
  sessionId: string
): Promise<HeartbeatResult> {
  return jsonFetch<HeartbeatResult>(
    `${BEAVER_BASE}/api/review/sessions/${sessionId}/heartbeat`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

export async function closeReviewSession(
  sessionId: string
): Promise<HeartbeatResult> {
  return jsonFetch<HeartbeatResult>(
    `${BEAVER_BASE}/api/review/sessions/${sessionId}/close`,
    { method: "POST", body: JSON.stringify({}) }
  );
}

/**
 * Best-effort close used on `beforeunload`, where async fetch may be killed
 * before it flushes. Uses sendBeacon when available so the close still lands.
 */
export function closeReviewSessionBeacon(sessionId: string): void {
  if (typeof navigator === "undefined") return;
  const url = `${BEAVER_BASE}/api/review/sessions/${sessionId}/close`;
  // sendBeacon can't set Authorization headers; fall back to keepalive fetch
  // which still carries our auth header. Either path is best-effort.
  try {
    fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...authHeaders() },
      body: JSON.stringify({}),
      keepalive: true,
    }).catch(() => {});
  } catch {
    /* ignore — page is unloading */
  }
}

// ── Comments ─────────────────────────────────────────────────────────────────

export async function listReviewComments(params: {
  batchId: string;
  studentId: string;
}): Promise<ReviewComment[]> {
  const qs = new URLSearchParams({
    unit_type: UNIT_TYPE,
    batch_id: params.batchId,
    student_id: params.studentId,
  });
  return jsonFetch<ReviewComment[]>(
    `${BEAVER_BASE}/api/review/comments?${qs.toString()}`
  );
}

export async function addReviewComment(params: {
  batchId: string;
  studentId: string;
  body: string;
  actionRef?: ActionRef;
}): Promise<ReviewComment> {
  return jsonFetch<ReviewComment>(`${BEAVER_BASE}/api/review/comments`, {
    method: "POST",
    body: JSON.stringify({
      unit_type: UNIT_TYPE,
      batch_id: params.batchId,
      student_id: params.studentId,
      ...(params.actionRef ? { action_ref: params.actionRef } : {}),
      body: params.body,
    }),
  });
}

// ── Metrics ──────────────────────────────────────────────────────────────────

export async function getReviewMetrics(params: {
  by: "reviewer" | "batch";
  batchId?: string;
  from?: string;
  to?: string;
}): Promise<MetricsRow[]> {
  const qs = new URLSearchParams({ by: params.by });
  if (params.batchId) qs.set("batch_id", params.batchId);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  return jsonFetch<MetricsRow[]>(
    `${BEAVER_BASE}/api/review/metrics?${qs.toString()}`
  );
}

// ── Assignment board: queue + control-plane actions (#173) ───────────────────
// The queue is a plain read from loam_ops (projected from the workflow). The
// actions POST to beaver-api, which forwards to River → signals the paper's
// AnswerPaperWorkflow (the source of truth). The acting identity is taken from
// the bearer token server-side, so we only send who/what is being acted on.

export type ReviewStatus =
  | "open"
  | "claimed"
  | "in_review"
  | "awaiting_approval"
  | "approved"
  | "pushed";

export type ReviewStage = "chunking" | "answers" | "marks_verification";

export type QueueRow = {
  unit_id: number | null;
  unit_type: string;
  unit_ref: { batch_id?: string; student_id?: string; [k: string]: unknown };
  batch_id: string | null;
  status: ReviewStatus | string;
  assignee: string | null; // = maker (back-compat alias)
  maker?: string | null; // active role=maker holder (1st pass)
  checker?: string | null; // active role=checker holder (2nd pass)
  assigned_by: string | null;
  claimed_at: string | null;
  expires_at: string | null;
  event_count: number;
  approval_count: number;
  stage_approved: boolean; // >=1 approval for the queried stage → per-stage "Checked"
  verdict?: "good" | "needs_work" | null; // checker's latest verdict at the queried stage
  ready?: boolean; // sent for check by the maker, no verdict since
  student_name?: string | null;
  roll_number?: string | null;
};

export async function getReviewQueue(params: {
  batchId?: string;
  assignee?: string;
  status?: string;
  unitType?: string;
  stage?: ReviewStage; // which stage's maker/checker the rows show (defaults 'chunking')
}): Promise<QueueRow[]> {
  const qs = new URLSearchParams();
  qs.set("unit_type", params.unitType ?? UNIT_TYPE);
  if (params.batchId) qs.set("batch_id", params.batchId);
  if (params.assignee) qs.set("assignee", params.assignee);
  if (params.status) qs.set("status", params.status);
  if (params.stage) qs.set("stage", params.stage);
  return jsonFetch<QueueRow[]>(
    `${BEAVER_BASE}/api/review/queue?${qs.toString()}`
  );
}

export async function claimUnit(params: {
  batchId: string;
  studentId: string;
  assignee?: string; // omit for self-claim
}): Promise<{ ok: boolean; assignee: string }> {
  return jsonFetch(`${BEAVER_BASE}/api/review/units/claim`, {
    method: "POST",
    body: JSON.stringify({
      batch_id: params.batchId,
      student_id: params.studentId,
      ...(params.assignee ? { assignee: params.assignee } : {}),
    }),
  });
}

export async function releaseUnit(params: {
  batchId: string;
  studentId: string;
}): Promise<{ ok: boolean }> {
  return jsonFetch(`${BEAVER_BASE}/api/review/units/release`, {
    method: "POST",
    body: JSON.stringify({
      batch_id: params.batchId,
      student_id: params.studentId,
    }),
  });
}

export async function approveStage(params: {
  batchId: string;
  studentId: string;
  stage: ReviewStage;
  decision?: "approve" | "reject";
}): Promise<{ ok: boolean; stage: ReviewStage; decision: string }> {
  return jsonFetch(`${BEAVER_BASE}/api/review/units/approve`, {
    method: "POST",
    body: JSON.stringify({
      batch_id: params.batchId,
      student_id: params.studentId,
      stage: params.stage,
      decision: params.decision ?? "approve",
    }),
  });
}

/** A paper's answer boxes: how many, how many unverified, and the questions OCR would skip. */
export type PaperBoxes = {
  student_id: string;
  roll_number: string | null;
  student_name: string | null;
  boxes: number;
  unverified: number;
  skipped_questions: string[];
  readiness: "ready" | "unverified" | "no_boxes";
};

export async function getPaperBoxes(params: { batchId: string; studentId: string }): Promise<PaperBoxes> {
  const qs = new URLSearchParams({ batch_id: params.batchId, student_id: params.studentId });
  return jsonFetch<PaperBoxes>(`${BEAVER_BASE}/api/review/units/boxes?${qs.toString()}`);
}

/**
 * Maker sends one paper for check at this stage. At chunking, a paper with unverified
 * answer boxes needs confirmUnverified (the server answers 409 needs_confirmation otherwise).
 */
export async function sendPaperForCheck(params: {
  batchId: string;
  studentId: string;
  stage: ReviewStage;
  confirmUnverified?: boolean;
}): Promise<{ ok: boolean; stage: ReviewStage; ready: boolean }> {
  return jsonFetch(`${BEAVER_BASE}/api/review/units/send`, {
    method: "POST",
    body: JSON.stringify({
      batch_id: params.batchId,
      student_id: params.studentId,
      stage: params.stage,
      confirm_unverified: params.confirmUnverified === true,
    }),
  });
}

export async function setVerdict(params: {
  batchId: string;
  studentId: string;
  stage: ReviewStage;
  verdict: "good" | "needs_work";
  reason?: string;
  /** Chunking Good on a paper with unverified answer boxes (see sendPaperForCheck). */
  confirmUnverified?: boolean;
}): Promise<{ ok: boolean; stage: ReviewStage; verdict: string }> {
  return jsonFetch(`${BEAVER_BASE}/api/review/units/verdict`, {
    method: "POST",
    body: JSON.stringify({
      batch_id: params.batchId,
      student_id: params.studentId,
      stage: params.stage,
      verdict: params.verdict,
      reason: params.reason,
      confirm_unverified: params.confirmUnverified === true,
    }),
  });
}

// ── Ops Queue navigator (t092) ───────────────────────────────────────────────
// Vocabulary (Fahad): Maker = 1st pass (a "make"); Checker = 2nd pass (a "check",
// approves; 4-eyes ⇒ ≠ Maker). One unit = one answer-paper × one stage; a row = one
// section (batch).

export type TaskStatus =
  | "blocked"
  | "open"
  | "maker_active"
  | "awaiting_checker"
  | "in_review"
  | "done";

// The ops lead view: where the section is in the maker-checker cycle (not the River gate).
// The state of the section's task for a stage (beaver-api task engine).
export type OpsStatus = "not_started" | "in_progress" | "waiting_for_check" | "needs_work" | "done" | "failed" | "cancelled";

export type Slot = { email: string; count: number };

export type BatchTask = {
  batch_id: string;
  label: string;
  school_id: string | null;
  school_name: string | null;
  grade: string | null;
  section: string | null;
  subject: string | null;
  exam_type: string | null;
  academic_year: string | null;
  stage: ReviewStage;
  status: TaskStatus;
  ops_status: OpsStatus;
  ready_for_check: number; // papers the maker sent that have no verdict since
  total: number;
  cleared: number; // checked (done)
  claimable: number; // not yet picked up
  assigned: number; // a Maker is on them
  makers: Slot[]; // active role=maker assignees (1st pass; + counts)
  checkers: Slot[]; // active role=checker assignees (2nd pass; + counts)
  edits: number;
  awaiting_recheck: number; // Made, not yet Checked
  chunking_done: boolean;
  // Most-recent activity across the section's papers (ISO ts, or null if none).
  // Drives My Queue's recency sort. Computed server-side (GREATEST of latest
  // assignment claim / approval decision / edit).
  last_activity_at: string | null;
};

export type AssignRole = "maker" | "checker";

// Section time report (Phase 3, leads only): one entry per section, every pass as a round.
export type RoundState = "done" | "in_progress" | "auto_closed";

export type ReportRound = {
  session_id: number;
  actor: string;
  role: string | null;
  round: number; // this person's nth pass in this role on this section
  started_at: string;
  ended_at: string | null;
  seconds: number; // total time: end - start
  state: RoundState;
};

export type ReportSection = { batch_id: string; label: string; rounds: ReportRound[] };

export async function getSectionReport(params: {
  stage: ReviewStage;
  scope: ScopeFilterParams;
  from?: string;
  to?: string;
}): Promise<ReportSection[]> {
  const qs = scopeQs(params.scope);
  qs.set("stage", params.stage);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  return jsonFetch<ReportSection[]>(`${BEAVER_BASE}/api/review/report?${qs.toString()}`);
}

export type ScopeLevel = "school" | "grade_year" | "subject" | "exam";

export type ScopeNode = {
  key: string;
  label: string;
  total: number;
  claimable: number;
  child_count: number;
  child_noun: string | null;
};

export type ScopeFilterParams = {
  schoolId?: string;
  grade?: string;
  academicYear?: string;
  subjectId?: string;
  examId?: string;
  batchId?: string;
};

export type Reviewer = { email: string; name: string; id?: string };

// The registry photo API (s056) serves avatars from R2 keyed by EMAIL:
//   GET {beaver-api}/api/registry/photo/by-email/{email} → 302→R2 (or 404).
// Missing/404 → the Avatar's onError falls back to initials.
export function reviewerPhotoUrl(r: { email?: string } | undefined | null): string | undefined {
  return r?.email
    ? `${BEAVER_BASE}/api/registry/photo/by-email/${encodeURIComponent(r.email)}`
    : undefined;
}

function scopeQs(scope: ScopeFilterParams): URLSearchParams {
  const qs = new URLSearchParams();
  if (scope.schoolId) qs.set("school_id", scope.schoolId);
  if (scope.grade) qs.set("grade", scope.grade);
  if (scope.academicYear) qs.set("academic_year", scope.academicYear);
  if (scope.subjectId) qs.set("subject_id", scope.subjectId);
  if (scope.examId) qs.set("exam_id", scope.examId);
  if (scope.batchId) qs.set("batch_id", scope.batchId);
  return qs;
}

export async function getReviewTasks(params: {
  stage: ReviewStage;
  scope: ScopeFilterParams;
  assignee?: string; // filter to this person's queue
  mine?: boolean; // My Queue: sections where the assignee is the maker OR the checker
}): Promise<BatchTask[]> {
  const qs = scopeQs(params.scope);
  qs.set("stage", params.stage);
  if (params.assignee) qs.set("assignee", params.assignee);
  if (params.mine) qs.set("mine", "1");
  return jsonFetch<BatchTask[]>(`${BEAVER_BASE}/api/review/tasks?${qs.toString()}`);
}

export async function releaseBatch(params: {
  batchId: string;
  stage: ReviewStage; // required — releases are per-stage now (api migration 006)
  role?: AssignRole;
  studentIds?: string[];
}): Promise<BulkAssignResult> {
  return jsonFetch<BulkAssignResult>(`${BEAVER_BASE}/api/review/release-bulk`, {
    method: "POST",
    body: JSON.stringify({
      batch_id: params.batchId,
      stage: params.stage,
      role: params.role ?? "maker",
      ...(params.studentIds ? { student_ids: params.studentIds } : {}),
    }),
  });
}

export async function getScopeNodes(params: {
  level: ScopeLevel;
  scope: ScopeFilterParams;
}): Promise<ScopeNode[]> {
  const qs = scopeQs(params.scope);
  qs.set("level", params.level);
  return jsonFetch<ScopeNode[]>(`${BEAVER_BASE}/api/review/scope/nodes?${qs.toString()}`);
}

export async function getReviewers(): Promise<Reviewer[]> {
  return jsonFetch<Reviewer[]>(`${BEAVER_BASE}/api/review/reviewers`);
}

// Per-paper review state for the editor screens' Make / Check buttons.
export type UnitState = {
  status: string;
  maker: string | null; // active role=maker assignee (1st pass)
  checker: string | null; // active role=checker assignee (2nd pass)
  stage_approved: boolean;
  approvers: string[];
  verdict: "good" | "needs_work" | null; // checker's latest verdict (loam_ops only)
  verdict_reason: string | null; // the checker's note on a needs_work, if any
  ready: boolean; // sent for check by the maker, no verdict since
};

export async function getUnitReviewState(params: {
  batchId: string;
  studentId: string;
  stage: ReviewStage;
}): Promise<UnitState> {
  const qs = new URLSearchParams({
    batch_id: params.batchId,
    student_id: params.studentId,
    stage: params.stage,
  });
  return jsonFetch<UnitState>(`${BEAVER_BASE}/api/review/units/state?${qs.toString()}`);
}

// "Made" — the Maker marks their first pass done. (Check/approve = approveStage.)
export async function markChecked(params: { batchId: string; studentId: string }): Promise<{ ok: boolean }> {
  return jsonFetch(`${BEAVER_BASE}/api/review/units/checked`, {
    method: "POST",
    body: JSON.stringify({ batch_id: params.batchId, student_id: params.studentId }),
  });
}

export type BulkAssignResult = {
  assigned: number;
  skipped: number;
  failed: number;
  details: Array<{ student_id: string; outcome: string; reason?: string }>;
};

// Roles come from the Keycloak JWT (realm_access.roles). We decode client-side to
// decide whether to surface lead-only controls (the backend re-enforces — UI gating
// is convenience, not security).
export const LEAD_ROLE = "OPERATIONS-LEAD";

export function getMyRoles(): string[] {
  const t = getToken();
  if (!t) return [];
  try {
    const payload = JSON.parse(
      atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))
    );
    return (payload?.realm_access?.roles as string[]) ?? [];
  } catch {
    return [];
  }
}

export function isLead(): boolean {
  return getMyRoles().includes(LEAD_ROLE);
}

export function getMyEmail(): string | null {
  const t = getToken();
  if (!t) return null;
  try {
    const payload = JSON.parse(
      atob(t.split(".")[1].replace(/-/g, "+").replace(/_/g, "/"))
    );
    return (payload?.email as string) ?? null;
  } catch {
    return null;
  }
}

export async function bulkAssignBatch(params: {
  batchId: string;
  stage: ReviewStage; // required — assignments are per-stage now (api migration 006)
  assignee?: string;
  assignees?: string[];
  strategy?: "all" | "round_robin";
  force?: boolean;
  role?: AssignRole;
  studentIds?: string[];
}): Promise<BulkAssignResult> {
  return jsonFetch<BulkAssignResult>(`${BEAVER_BASE}/api/review/assign-bulk`, {
    method: "POST",
    body: JSON.stringify({
      batch_id: params.batchId,
      stage: params.stage,
      ...(params.assignee ? { assignee: params.assignee } : {}),
      ...(params.assignees ? { assignees: params.assignees } : {}),
      strategy: params.strategy ?? "all",
      ...(params.force ? { force: true } : {}),
      role: params.role ?? "maker",
      ...(params.studentIds ? { student_ids: params.studentIds } : {}),
    }),
  });
}
