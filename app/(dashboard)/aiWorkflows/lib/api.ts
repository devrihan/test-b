// Client for beaver-api's /api/ai-workflows/* endpoints, which proxy through to
// the heron Temporal workflows. Identity is derived from the bearer token
// server-side, so no caller field is ever sent.
//
// Token extraction and error shape follow app/lib/reviewApi.ts.

const BEAVER_BASE =
  process.env.NEXT_PUBLIC_BEAVER_API_URL ?? "http://localhost:4000";

const BASE = `${BEAVER_BASE}/api/ai-workflows`;

// ── Types ──────────────────────────────────────────────────────────────────

export type Dependency = {
  configured: boolean;
  ok: boolean;
  error?: string;
  [k: string]: unknown;
};

export type DependencyKey = "temporal" | "ledger" | "loam_ops" | "loam_db";

export type Health = {
  ok: boolean;
  dependencies: Partial<Record<DependencyKey, Dependency>>;
  /** Task queue name per kind of run, e.g. classification → ai-workflows-queue. */
  queues?: Record<string, string>;
  apply_allowlist_configured?: boolean;
  apply_allowlisted?: boolean;
  /** Which dashboard database an apply writes to, as the deployment labels it. */
  target?: { label: string | null; loam_db_host: string | null; publisher?: string | null };
};

/** A question paper as the picker sees it. `sections` is a count, not names. */
export type Paper = {
  qp: number;
  display_name: string | null;
  exam: string;
  grade: string;
  subject: string;
  exam_type: string | null;
  exam_date?: string | null;
  max_marks?: number | null;
  batches: number;
  sections: number;
  students: number;
  /** false: scanned, but the dashboard database does not hold the paper yet — push it first. */
  on_dashboard?: boolean;
  source?: PaperSource | null;
};

/** What the River-side loam_db holds for a paper (the readiness of a push). */
export type PaperSource = {
  exam: string;
  display_name?: string | null;
  grade: string;
  subject: string;
  exam_type?: string | null;
  questions: number;
  mcq: number;
  non_mcq: number;
  chapter_mapped: number;
  concept_mapped: number;
  bloom_mapped: number;
  keys_ready: number;
  keys_with_text: number;
};

export type PushReferenceResult = {
  run_id?: string;
  source: PaperSource;
  result: {
    paper: "inserted" | "updated" | null;
    dry_run: boolean;
    questions: { kept_id: number; new_id: number; updated: number };
    curriculum: { units: number; chapters: number; concepts: number };
    answer_keys: { inserted: number; updated: number };
    unmapped: { chapter: number; concept: number };
    warnings: string[];
  };
};

export const getPaperSource = (qp: string | number, signal?: AbortSignal) =>
  get<{ qp: number; summary: PaperSource; on_dashboard: boolean }>(`/papers/${qp}/source`, signal);

export const pushPaperReference = (qp: string | number, dryRun = false) =>
  post<PushReferenceResult>(`/papers/${qp}/push-reference?dry_run=${dryRun}`);

/**
 * What to call a paper on screen. Most papers carry no display_name, so the
 * exam name — which already includes grade and subject — is the fallback.
 */
export function paperName(p: {
  display_name?: string | null;
  exam?: string | null;
  subject?: string | null;
}): string {
  const name = (p.display_name ?? p.exam ?? "").trim();
  const prefix = (p.subject ?? "").trim();
  if (!name) return "unnamed paper";
  if (!prefix) return name;
  // Names often lead with the subject ("Physics — Unit Test 1"), which would
  // read twice over next to the "Grade 12 · Physics" label beside them.
  const stripped = name.replace(
    new RegExp(`^${prefix.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*[—–_-]?\\s*`, "i"),
    ""
  );
  return stripped || name;
}

export type TaxonomyGrain = "chapter" | "unit" | "none";

export type Cell = {
  answers: number;
  with_text: number;
  coverage: number | null;
  /** Rows the dashboard already holds for this cell, and how many carry no code.
      Null when the dashboard database could not be asked. */
  prod_rows?: number | null;
  prod_uncoded?: number | null;
  /** Students (not rows) this cell has on the dashboard, and how many of them
      carry a code or a person's review. */
  prod_students?: number | null;
  prod_coded?: number | null;
  /** Students with a verdict in a finished run nobody has applied yet. */
  pending_apply?: number;
  /** Where the cell stands on the dashboard — what the grid colours by.
      Decided server-side (heron workflows/select.py). */
  state?: CellState;
};

export type CellState =
  | "empty"
  | "done"
  | "exported_uncoded"
  | "pending_apply"
  | "partial"
  | "ready"
  | "blocked";

// ── One cell, answer by answer ─────────────────────────────────────────────

/** What, if anything, still needs doing to one answer. Decided server-side
    (heron workflows/select.py); the UI only words it. */
export type AnswerStatus =
  | "reviewed"
  | "coded"
  | "uncoded"
  | "unclassified"
  | "pending_apply"
  | "no_text"
  | "no_crop_has_regions"
  | "no_crop"
  | "full_marks"
  | "unresolved";

export type AnswerAction =
  | "recode"
  | "classify"
  | "reread"
  | "rebuild_crop"
  | "draw_bbox"
  | "apply";

export type CellAnswer = {
  /** batch_id/student_id/question_key — the sweep's own answer id. */
  answer_id: string;
  student_id: string;
  batch_id: string;
  student_name: string;
  admission_no: string;
  marks: number | null;
  max_marks: number | null;
  has_text: boolean;
  has_crop: boolean;
  has_regions: boolean;
  status: AnswerStatus;
  action: AnswerAction | null;
  unresolved: string | null;
  prod: {
    error_code: string | null;
    reviewed_by: string | null;
    verdict: string | null;
    source_run_id: string | null;
    sae_id: number | null;
  } | null;
  ledger: {
    run_id: string;
    error_code: string | null;
    run_status: string | null;
    applied_at: string | null;
  } | null;
  prior: { what_went_wrong: string | null; evidence_quote: string | null } | null;
};

export type CellAnswers = {
  qp: number;
  question: number;
  section: string;
  answers: CellAnswer[];
  counts: Record<AnswerStatus, number>;
};

export type PriorRun = {
  id: string;
  mode: string | null;
  status: RunStatus;
  sections: string[];
  coded: number | null;
  rows_written: number | null;
  started_at: string;
  started_by: string;
};

export type PrepareQuestion = {
  question: number;
  /** Sub-part labels, e.g. ["9.1", "9.2"]. Absent on single-part questions. */
  parts?: string[] | null;
  types?: string[] | null;
  max_marks?: number | null;
  chapter: string | null;
  taxonomy: {
    key: string;
    grain: TaxonomyGrain;
    spans?: unknown;
    codes: string[];
  };
  gold_total: number | null;
  gold_by_section?: Record<string, number> | null;
  briefs: { run_id: string; started_at: string; status?: string }[];
  prior_runs: PriorRun[];
  cells: Record<string, Cell>;
};

/** One section of the paper, with how much of it was scanned. */
export type PrepareSection = {
  section: string;
  batches: number;
  students: number;
};

export type Prepare = {
  paper: {
    qp: number;
    display_name: string | null;
    exam: string;
    exam_type: string | null;
    grade: string;
    subject: string;
    exam_date?: string | null;
    max_marks?: number | null;
  };
  sections: PrepareSection[];
  threshold: number;
  unapplied_corrections: number;
  questions: PrepareQuestion[];
};

export type SweepPreview = {
  qp: number;
  answers: number;
  students: number;
  sections: string[];
  empty_ocr: number;
  no_crop: number;
  /** Answers per shard the count below was worked out with. */
  per_shard: number;
  shard_count: number;
  shards: { shard: string; answers: number; students: number; sections?: string[] }[];
};

export type RunKind = "classification" | "ocr_sweep" | "pipeline" | "sync" | "summaries";

export type RunStatus =
  | "running"
  | "done"
  | "partial"
  | "blocked_on_ocr"
  | "brief_needs_human"
  | "nothing_in_scope"
  | "cancelled"
  | "failed"
  // pipeline runs (one section, end to end)
  | "blocked_on_taxonomy"
  | "pending_apply"
  | "waiting_on_ops"
  | "stalled";

export type Stage =
  | "pending"
  | "dump"
  | "classify"
  | "check"
  | "stage"
  | "review"
  | "load"
  | "done"
  | "needs_human"
  | "error";

export type Run = {
  id: string;
  workflow_id: string;
  kind: RunKind;
  qp_id: number;
  exam_id: number | null;
  grade: string | null;
  subject: string | null;
  exam_name: string | null;
  question: number | null;
  sections: string[];
  mode: string | null;
  params: Record<string, unknown>;
  status: RunStatus;
  summary: Record<string, unknown> | null;
  started_by: string;
  started_at: string;
  finished_at: string | null;
  override_reason: string | null;
  applied_by: string | null;
  applied_at: string | null;
  dry_run_sha256?: string | null;
  lane: string | null;
  /** Temporal task queue the run was dispatched to. Filled in by the worker. */
  queue?: string | null;
  stage?: string | null;
  /** Per-section stage, absent until the workflow records its first section. */
  stages: Record<string, Stage> | null;
  coded: number | null;
  rows_written: number | null;
};

export type SectionResult = {
  paper_defects_found?: number;
  brief_disagreements?: number;
  handoff?: string;
  [k: string]: unknown;
};

export type SectionDetail = {
  section: string;
  stage: Stage;
  answers: number | null;
  rows_written: number | null;
  coded: number | null;
  uncoded: number | null;
  task_meta: Record<string, unknown> | null;
  score: Record<string, unknown> | null;
  export: Record<string, unknown> | null;
  result: SectionResult | null;
  error: string | null;
  updated_at: string;
};

export type RunEvent = {
  at: string;
  who: string;
  what: string;
  /** Free-form context recorded with the event, e.g. { workflow_id }. */
  detail: Record<string, unknown> | string | null;
};

/**
 * The detail endpoint drops `coded`/`rows_written` (they are rolled up per
 * section instead) and embeds the artifact list, so both are optional here.
 */
/** One agent task as its worker last reported it (every 30 s while it runs). */
export type TaskProgress = {
  task_id: string;
  account?: string;
  at?: string;
  updated_at?: string;
  elapsed_s?: number;
  done?: number;
  total?: number;
  note?: string;
  waiting_for_slot_s?: number;
  /** API path of the task's agent.log, present once the task ended. */
  log?: string;
};

export type RunDetail = Omit<Run, "coded" | "rows_written"> & {
  coded?: number | null;
  rows_written?: number | null;
  sections_detail: SectionDetail[];
  events: RunEvent[];
  artifacts?: Artifact[];
  tasks?: Record<string, TaskProgress>;
  /** Set when this read found the workflow dead and closed the ledger row. */
  reconciled?: string;
  live_status?: { stage?: string; iteration?: number; counts?: Record<string, number>; children?: string[] } | null;
  /** The workflow's state in Temporal, e.g. RUNNING or COMPLETED. */
  temporal_status?: string | null;
  temporal_error?: string;
};

export type Artifact = {
  section: string;
  name: string;
  bytes: number;
  created_at: string;
};

export type ApplyResult = {
  sections: Record<
    string,
    {
      statements: Record<string, number>;
      /** Rows actually affected per statement kind — set when the apply went
          through loam-publisher. */
      rows?: Record<string, number>;
      warnings: string[];
      audit_id?: number;
    }
  >;
  applied_by: string;
  applied_at: string;
  /** "publisher" when loam-publisher wrote the dashboard. */
  via?: string;
};

export type Login = {
  name: string;
  provider?: string;
  max_parallel: number;
  in_flight: number;
  state: string;
  cooling_until: string | null;
};

export type Worker = {
  host: string;
  lane: string;
  kind: string;
  queue: string;
  logins: Login[];
  slots_in_use: number;
  code_sha: string;
  seen_at: string;
  age_s: number;
  stale: boolean;
};

export type Lanes = {
  workers: Worker[];
  running: Record<
    string,
    { workflow_id: string; type: string; started: string }[]
  >;
  temporal_error?: string;
};

export type StartClassification = {
  qp: number;
  question: number;
  sections: string[];
  mode: "compare" | "load";
  brief: "reuse" | "author";
  brief_src?: string;
  text_only?: boolean;
  model_brief?: string;
  model_classify?: string;
  coverage_threshold?: number;
  ignore_preflight?: boolean;
  override_reason?: string;
  /** Pin every agent task of the run to one seat (see listAccounts). */
  account?: string;
  /** Section → ops student_ids to run for. A section in `sections` but not
      here runs whole. */
  students_by_section?: Record<string, string[]>;
  /** `recode` keeps each answer's earlier diagnosis and only re-attempts the
      taxonomy code. Needs students_by_section for every section. */
  task?: "classify" | "recode";
};

export type StartSweep = {
  qp: number;
  sections?: string[];
  min_question?: number;
  questions?: number[];
  per_shard?: number;
  model_review?: string;
  source?: string;
  /** Pin every agent task of the sweep to one seat (see listAccounts). */
  account?: string;
  /** Only answers whose stored text is empty. */
  only_missing_text?: boolean;
  /** Exact answers (batch_id/student_id/question_key); overrides question and
      section scope. */
  answer_ids?: string[];
};

// ── Transport ──────────────────────────────────────────────────────────────

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  const cookie = document.cookie
    .split(";")
    .map((r) => r.trim())
    .find((r) => r.startsWith("token="))
    ?.slice("token=".length);
  if (cookie) return decodeURIComponent(cookie);
  return (
    localStorage.getItem("keycloak_token") ??
    sessionStorage.getItem("keycloak_token")
  );
}

function authHeaders(): HeadersInit {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** An API failure carrying the server's own `detail` message and status code. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function failure(res: Response): Promise<ApiError> {
  const text = await res.text().catch(() => "");
  let detail = text;
  try {
    const parsed = JSON.parse(text) as { detail?: unknown; error?: unknown };
    const d = parsed.detail ?? parsed.error;
    if (typeof d === "string") detail = d;
    else if (d != null) detail = JSON.stringify(d);
  } catch {
    // Not JSON — keep the raw body, which is usually a proxy error page.
  }
  return new ApiError(detail || `Request failed (HTTP ${res.status}).`, res.status);
}

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { ...authHeaders() },
    signal,
  });
  if (!res.ok) throw await failure(res);
  return (await res.json()) as T;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await failure(res);
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

async function put<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw await failure(res);
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

async function del<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json", ...authHeaders() },
  });
  if (!res.ok) throw await failure(res);
  const text = await res.text();
  return (text ? JSON.parse(text) : {}) as T;
}

/** Message to show a person for any thrown error, API or network. */
export function errMsg(e: unknown): string {
  if (e instanceof ApiError) {
    // A signed-out session is the most common failure here, and the server's
    // own wording does not tell anyone what to do about it.
    if (e.status === 401)
      return "Your session has expired. Reload the page to sign in again.";
    if (e.status === 403)
      return "Your account is not allowed to do this. Ask an admin for access.";
    return e.message;
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

// ── Endpoints ──────────────────────────────────────────────────────────────

export const getHealth = (signal?: AbortSignal) =>
  get<Health>("/health", signal);

export const listPapers = (signal?: AbortSignal) =>
  get<Paper[]>("/papers", signal);

/** A known defect of a paper (heron.paper_defects), read into every brief. */
export type PaperDefect = {
  id: number;
  qp_id: number;
  question: number | null;
  text: string;
  source: string;
  created_by: string | null;
  created_at: string;
};
export const getPaperDefects = (qp: string | number, signal?: AbortSignal) =>
  get<{ defects: PaperDefect[] }>(`/papers/${encodeURIComponent(String(qp))}/defects`, signal);
export const addPaperDefect = (qp: string | number, body: { question?: number; text: string }) =>
  post<PaperDefect>(`/papers/${encodeURIComponent(String(qp))}/defects`, body);
export const removePaperDefect = (qp: string | number, id: number) =>
  del<{ retired: number }>(`/papers/${encodeURIComponent(String(qp))}/defects/${id}`);

/** Write every unapplied OCR proposal of the paper into the stored text
 *  (guarded: only blank or unchanged-since-audit text, backup kept). */
export type CorrectionsApplied = {
  qp: number;
  written: number;
  by_reason: Record<string, number>;
  changed_since_audit_or_no_bbox: number;
};
export const applyPaperCorrections = (qp: string | number) =>
  post<CorrectionsApplied>(`/papers/${encodeURIComponent(String(qp))}/apply-corrections`);

export const getPrepare = (qp: string | number, signal?: AbortSignal) =>
  get<Prepare>(`/papers/${encodeURIComponent(String(qp))}/prepare`, signal);

export const getCellAnswers = (
  qp: string | number,
  question: number,
  section: string,
  signal?: AbortSignal
) =>
  get<CellAnswers>(
    `/papers/${encodeURIComponent(String(qp))}/questions/${question}/answers?section=${encodeURIComponent(
      section
    )}`,
    signal
  );

export function getSweepPreview(
  qp: string | number,
  params: {
    min_question?: number;
    questions?: number[];
    sections?: string[];
    per_shard?: number;
    only_missing_text?: boolean;
    answer_ids?: string[];
  },
  signal?: AbortSignal
) {
  const qs = new URLSearchParams();
  if (params.min_question != null) qs.set("min_question", String(params.min_question));
  if (params.questions?.length) qs.set("questions", params.questions.join(","));
  if (params.sections?.length) qs.set("sections", params.sections.join(","));
  // Sent so the shard count in the preview matches the number that will
  // actually be used when the sweep starts.
  if (params.per_shard != null) qs.set("per_shard", String(params.per_shard));
  if (params.only_missing_text) qs.set("only_missing_text", "true");
  if (params.answer_ids?.length) qs.set("answer_ids", params.answer_ids.join(","));
  const suffix = qs.toString() ? `?${qs}` : "";
  return get<SweepPreview>(
    `/papers/${encodeURIComponent(String(qp))}/sweep-preview${suffix}`,
    signal
  );
}

export const startClassification = (body: StartClassification) =>
  post<Run>("/runs/classification", body);

export const startSweep = (body: StartSweep) => post<Run>("/runs/sweep", body);

/** One section, end to end (workflows/pipeline.py). Starting it while it runs
 *  only tells it to look again; the response then carries `signalled: true`. */
export type StartPipeline = {
  qp: number;
  section: string;
  /** Only these whole questions (a partial pipeline is its own run). */
  questions?: number[];
  account?: string;
  max_iterations?: number;
  wait_minutes?: number;
};
export const startPipeline = (body: StartPipeline) =>
  post<Run & { signalled?: boolean }>("/runs/pipeline", body);

export function listRuns(
  params: { qp?: string; status?: string; kind?: string; limit?: number },
  signal?: AbortSignal
) {
  const qs = new URLSearchParams();
  if (params.qp) qs.set("qp", params.qp);
  if (params.status) qs.set("status", params.status);
  if (params.kind) qs.set("kind", params.kind);
  if (params.limit) qs.set("limit", String(params.limit));
  const suffix = qs.toString() ? `?${qs}` : "";
  return get<Run[]>(`/runs${suffix}`, signal);
}

export const getRun = (id: string, signal?: AbortSignal) =>
  get<RunDetail>(`/runs/${encodeURIComponent(id)}`, signal);

export const cancelRun = (id: string) =>
  post<Run>(`/runs/${encodeURIComponent(id)}/cancel`);

export const applyRun = (id: string) =>
  post<ApplyResult>(`/runs/${encodeURIComponent(id)}/apply`);

/** What applying would write, read off the run's dry-run logs. For a run that
    stored none (compare mode), the server writes the dry run now. */
export type ApplyPreview = {
  run_id: string;
  applied: false;
  dry_run_sha256: string;
  sections: Record<string, { statements: Record<string, number>; warnings: string[] }>;
};

/** Rewrite a finished run's abbreviated codes to the taxonomy spelling
 *  (unique match only); `unresolved` lists what still needs a re-code. */
export type RepairCodes = { run_id: string; repaired: Record<string, string>; rows: number; unresolved: string[] };
export const repairRunCodes = (id: string) => post<RepairCodes>(`/runs/${encodeURIComponent(id)}/repair-codes`);

export const getApplyPreview = (id: string) =>
  get<ApplyPreview>(`/runs/${encodeURIComponent(id)}/apply-preview`);

export const listArtifacts = (id: string, signal?: AbortSignal) =>
  get<Artifact[]>(`/runs/${encodeURIComponent(id)}/artifacts`, signal);

export async function getArtifactText(
  id: string,
  section: string,
  name: string,
  signal?: AbortSignal
): Promise<string> {
  const res = await fetch(
    `${BASE}/runs/${encodeURIComponent(id)}/artifacts/${encodeURIComponent(
      section
    )}/${encodeURIComponent(name)}`,
    { headers: { ...authHeaders() }, signal }
  );
  if (!res.ok) throw await failure(res);
  return res.text();
}

export const getLanes = (signal?: AbortSignal) => get<Lanes>("/lanes", signal);

/** The accounts registry (heron.seats): one login, one lane. */
export type Seat = {
  name: string;
  provider: string;
  config_dir: string;
  max_parallel: number;
  lane: string | null;
  queue: string | null;
  enabled: boolean;
  note: string | null;
  updated_at: string;
  /** Live agenters currently reporting this login. */
  held_by: { lane: string; queue: string; state: string; stale: boolean }[];
};
export const getSeats = (signal?: AbortSignal) => get<{ seats: Seat[] }>("/seats", signal);
export const putSeat = (name: string, body: Partial<Pick<Seat, "provider" | "config_dir" | "max_parallel" | "lane" | "queue" | "enabled" | "note">>) =>
  put<Seat>(`/seats/${encodeURIComponent(name)}`, body);

/** A seat a run can be pinned to: what the lane's agenters hold. */
export type Account = Login & {
  lane: string;
  host: string;
  queue: string;
  kinds: ("classification" | "ocr_sweep")[];
  stale: boolean;
};
export const listAccounts = (signal?: AbortSignal) =>
  get<{ accounts: Account[]; queues: Record<string, string> }>("/accounts", signal);
export const artifactUrl = (path: string) => `${BASE}${path}`;
