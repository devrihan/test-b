import { apiClient } from "../../../lib/apiClient";
import { getAuthToken } from "@/app/lib/auth";

const BEAVER_BASE = process.env.NEXT_PUBLIC_BEAVER_API_URL ?? "http://localhost:4000";
const DATA_QUALITY_BASE = process.env.NEXT_PUBLIC_AGGREGATED_DATA_API_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8082";

// ── Types ──────────

export interface Batch {
  id:                   number;
  batch_id:             string;
  batch_name:           string;
  school_id:            number;
  school_name:          string;
  grade:                string;
  section:              string;
  subject:              string;
  exam_type:            string;
  set_name:             string | null;
  total_students:       number;
  total_questions:      number;
  status:               string;
  r2_folder_path:       string;
  created_at:           string;
  updated_at:           string;
  preprocessed_count?:  number;
  bbox_detected_count?: number;
  bbox_validated_count?: number;
  ocr_completed_count?: number;
  metadata?: {
    question_numbers?:         string[];
    integer_question_numbers?: string[];
    question_paper_id?:        number | null;
    parsed_questions?:         unknown[];
    preprocessing?: {
      booklet_scan: boolean;
      rotate_pages: boolean;
      rotate_a4_pages?: boolean;
      sheet_type?: "booklet" | "a4";
      margin_pct?: number;
    };
    grading_grid_mode?: "table" | "none";
    skip_bbox_flow?:    boolean;
    [key: string]: unknown;
  };
}


export interface BatchStudent {
  id:                       number;
  student_id:               string;
  batch_id:                 string;
  student_name:             string;
  roll_number:              string;
  status:                   string;
  total_pages:              number;
  total_questions:          number;
  verified_questions_count: number;
  ocr_verified?:            boolean;
  total_marks_obtained:     number;
  total_max_marks:          number;
  teacher_totalling_error?: number | null;
  teacher_error?:           boolean;
  teacher_error_kind?:      string | null;
  teacher_error_note?:      string | null;
  // Stamped by the roster route from loam_db question_papers.max_marks — the
  // authoritative paper total (null when no QP is registered for the exam).
  question_paper_max_marks?: number | string | null;
  r2_folder_path:           string;
  error_message:            string | null;
  created_at:               string;
  updated_at:               string;
  // Per-student validation (section/grade/school + exam-attended), persisted by
  // beaver-api. validation_status: "valid" | "invalid" | null (unchecked).
  validation_status?:       string | null;
  validation_reasons?:      string[] | null;
  exam_marks?:              number | null;
  validated_at?:            string | null;
}

export interface StudentPage {
  img_id:         string;
  page_number:    number;
  image_url:      string;
  natural_width:  number;
  natural_height: number;
  file_size_kb:   number;
}


export interface BBoxRegion {
  region_id:  string;
  img_id:     string;
  order:      number;
  confidence: number | null;
  source?:    "ai" | "manual";
  bbox: {
    x1: number; y1: number;
    x2: number; y2: number;
  };
}

export interface BBoxChunk {
  question_key:   string;
  source:         "ai" | "manual";
  verified:       boolean;
  verified_by:    string | null;
  regions:        BBoxRegion[];
  ocr_text:       string | null;
  ocr_confidence: number | null;
  ocr_model:      string | null;
  ocr_completed_at: string | null;
  cropped_image_url: string | null;
  marks:           number | null;
  max_marks:      number | null;
  whole_marks:    number | null;
  // OR-question resolution from identify_or_questions_activity:
  // 'A' = student attempted .1 option, 'B' = .2 option, null otherwise.
  // Answer-editing UI uses this to fold the bbox into the correct sub-slot.
  or_attempt:     "A" | "B" | null;
  isOrQuestion?:   boolean;
  ocr_verified?: boolean;
  ocr_verified_by?: string | null;
  ocr_verified_at?: string | null;
  // Chemistry: operator-flagged structure + DECIMER recognition result.
  has_structure?: boolean;
  structure_smiles?: string | null;
  structure_inchikey?: string | null;
  // MCQ: normalized choice letter extracted from OCR text (A–E), null if not set.
  mcq_normalized?: string | null;
}


export interface BBoxSavePayload {
  question_key:    string;
  source:          "ai" | "manual";
  verified:        boolean;
  manually_edited: boolean;
  max_marks?: number | null;
  regions: {
    region_id:  string;
    img_id:     string;
    order:      number;
    confidence: number | null;
    bbox: {
      x1: number; y1: number;
      x2: number; y2: number;
    };
  }[];
}


export interface QuestionListItemDTO {
  id: number;
  questionNumber: number;
  questionText: string;
  unit?: string;
  chapter?: string;
  concept?: string;
  optionGroup?: string | null;
  optionSet?: string | null;
  pickCount?: number | null;
  questionLabel?: string;
  maxMarks?: number;
  questionType?: string;
  answerKey?: string;
  cleanText?: string;
  mcqChoice?: string;
  difficultyLevel?: string | null;
  bloomTaxonomy?: string | null;
  hasDiagram?: boolean | null;
  diagramBbox?: string | null;
  diagramCropUrl?: string | null;
  hasQuestionChemicalStructure?: boolean | null;
  hasAnswerChemicalStructure?: boolean | null;
  questionStructureSmiles?: string | null;
  questionStructureInchikey?: string | null;
}

// ── API Functions ──────────

export const getBatches = (params?: Record<string, string>) =>
  apiClient.get<{ batches: Batch[]; count: number }>(
    `${BEAVER_BASE}/api/batches`,
    { params }
  );


export const getBatch = (batch_id: string) =>
  apiClient.get<{ batch: Batch }>(
    `${BEAVER_BASE}/api/batches/${batch_id}`
  );


// Single student row (joined with its batch) — used to re-sync
// total_marks_obtained after a marks write without fetching the whole roster.
export const getBatchStudent = (batch_id: string, student_id: string) =>
  apiClient.get<{ student: BatchStudent }>(
    `${BEAVER_BASE}/api/batches/${batch_id}/students/${student_id}`);

export const getBatchStudents = (batch_id: string) =>
  apiClient.get<{ students: BatchStudent[]; count: number }>(
    `${BEAVER_BASE}/api/${batch_id}/students`
  );

// t092 review plane — one row per paper in the batch, scoped to a review stage.
export interface ReviewQueueRow {
  unit_ref: { batch_id?: string; student_id?: string };
  status: string;                 // review_unit.status (open|claimed|in_review|awaiting_approval|approved|pushed)
  maker: string | null;
  checker: string | null;
  stage_approved: boolean;        // ≥1 approval for the queried stage → checker done
  student_name?: string | null;
  roll_number?: string | null;
}

export const getReviewQueue = (batch_id: string, stage: "chunking" | "answers" = "answers") =>
  apiClient.get<ReviewQueueRow[]>(`${BEAVER_BASE}/api/review/queue`, {
    params: { batch_id, stage },
  });

// Recompute + persist per-student validation (section/grade/school + exam-attended).
export const revalidateBatchStudents = (batch_id: string) =>
  apiClient.post<{ batch_id: string; count: number; results: unknown[] }>(
    `${BEAVER_BASE}/api/batches/${batch_id}/validate-students`,
    {}
  );

// ── Fix a misplaced student ──────────────────────────────────────────────
export interface MoveTarget {
  batch_id: string;
  batch_name: string;
  section: string;
}
export const getMoveTarget = (batch_id: string, student_id: string) =>
  apiClient.get<{ actualSection: string | null; targetBatch: MoveTarget | null }>(
    `${BEAVER_BASE}/api/batches/${batch_id}/students/${student_id}/move-target`
  );
export const moveStudent = (batch_id: string, student_id: string, target_batch_id: string) =>
  apiClient.post<{ moved: boolean; to: string }>(
    `${BEAVER_BASE}/api/batches/${batch_id}/students/${student_id}/move`,
    { target_batch_id }
  );
export const removeStudent = (batch_id: string, student_id: string) =>
  apiClient.delete<{ removed: boolean }>(
    `${BEAVER_BASE}/api/batches/${batch_id}/students/${student_id}`
  );

// ── Re-run (ADMIN only on the server) ─────────────────────────────────────
// Full restart of one student's answer paper — terminates the workflow and runs
// the whole pipeline from scratch (as if newly uploaded). Blocked server-side if
// the student has manual verification (OCR verified / all bboxes verified).
// `force: true` is an explicit operator opt-in (from the re-run modal) to discard
// verified / manually-edited answers — it overrides the server-side edited-paper block.
//
// `force` alone still 409s on an edited paper — the server returns
// `{error, needs_confirmation: true, edited_count}` without discarding anything.
// Only `force + confirm_discard` actually performs the discard. This lets callers
// probe the real edited_count first (see RerunConfirm409 below) and show it in a
// confirmation dialog before committing to the discard.
export const rerunStudent = (batch_id: string, student_id: string, force = false, confirm_discard = false, preserve_edits = false, from?: "bbox") =>
  apiClient.post<{ message: string; student_id: string; preserved_edits?: number }>(
    `${BEAVER_BASE}/api/batches/${batch_id}/students/${student_id}/rerun`,
    force ? {
      force: true,
      ...(confirm_discard ? { confirm_discard: true } : {}),
      // Snapshot human edits before the wipe; re-applied by question number
      // when the re-run completes (beaver-api preservedEdits).
      ...(preserve_edits ? { preserve_edits: true } : {}),
      ...(from ? { from } : {}),
    } : { ...(from ? { from } : {}) });

// Manual Repair "Multi-booklet rerun": re-splits a combined-subject paper
// (multiple mini-booklets bundled in one scan — see beaver-api's
// booklet-resplit) into correct reading order + rotation. Operates on the
// student's CURRENT pages, so Get-from-dispatch + blank-page deletion run
// first. Returns a per-booklet breakdown for the operator to sanity-check.
// Read-only: how many graded questions a re-run would discard. Used to get an
// operator's discard confirmation BEFORE any destructive page rewrite.
export const probeRerunEdits = (batch_id: string, student_id: string) =>
  apiClient.post<{ edited_count: number }>(
    `${BEAVER_BASE}/api/batches/${batch_id}/students/${student_id}/rerun`, { probe: true });

// Rotates every even-positioned raw spread 180° in place, for a paper whose
// scanning operator fed alternate sheets upside down. A pre-step, not a
// re-split: the pages stay raw spreads, so a plain re-run afterwards still
// runs the real pipeline's trimming/validation/split/reorder on them.
export const flipAlternateSpreads = (batch_id: string, student_id: string) =>
  apiClient.post<{ spreads_found: number; flipped_count: number; flipped_keys: string[] }>(
    `${BEAVER_BASE}/api/batches/${batch_id}/students/${student_id}/flip-alternate-spreads`, {});

export const bookletResplit = (batch_id: string, student_id: string, opts?: { spreads_per_booklet?: number; rotate?: boolean; flip_spread_positions?: number[]; flip_alternate_spreads?: boolean }) =>
  apiClient.post<{
    booklets: { booklet: number; spread_pages: number[]; supplementary_page: number | null }[];
    leftover_pages: number[];
    dropped_blank_pages: number[];
    final_page_count: number;
  }>(
    `${BEAVER_BASE}/api/batches/${batch_id}/students/${student_id}/booklet-resplit`,
    opts ?? {});

// Shape of the 409 body when a forced re-run needs an explicit discard
// confirmation (distinct from the plain "not forced at all" 409, which has no
// `needs_confirmation` field).
export interface RerunConfirm409 {
  error: string;
  needs_confirmation: true;
  edited_count: number;
}

// Manual Repair only: re-run from bbox detection (skips preprocessing) so operator
// page deletions are preserved. Same endpoint, internal `from=bbox`.
export const reprocessFromBbox = (batch_id: string, student_id: string) =>
  apiClient.post<{ message: string; student_id: string }>(
    `${BEAVER_BASE}/api/batches/${batch_id}/students/${student_id}/rerun`, { from: "bbox" });

export const getStudentPages = (batch_id: string, student_id: string) =>
  apiClient.get<{
    student_id:  string;
    batch_id:    string;
    total_pages: number;
    scans:       StudentPage[];
  }>(`${BEAVER_BASE}/api/batches/${batch_id}/students/${student_id}/pages`);


// AI re-transcription of one answer. Keyed per subpart ("18.1") where BBoxChunk
// keys by the parent ("18"). beaver-api filters these, so anything here is safe
// to display as-is.
export interface OcrCorrection {
  question_key:      string;
  proposed_ocr_text: string;
}

export const getStudentBBoxes = (batch_id: string, student_id: string) =>
  apiClient.get<{
    student_id:      string;
    batch_id:        string;
    batch_name:      string;
    grade:           string;
    section:         string;
    subject:         string;
    exam_type:       string;
    total_questions: number;
    verified_count:  number;
    bboxes:          BBoxChunk[];
    corrections?:    OcrCorrection[];
  }>(`${BEAVER_BASE}/api/batches/${batch_id}/students/${student_id}/bboxes`);


export const saveBBoxes = (
  batch_id:   string,
  student_id: string,
  bboxes:     BBoxSavePayload[],
  trigger_ocr: boolean = false,
  ocr_question_keys?: string[],
  ocr_only?: boolean,
  trigger_crop?: boolean,
) =>
  apiClient.post<{ message: string }>(
    `${BEAVER_BASE}/api/batches/${batch_id}/students/${student_id}/bboxes`,
    { bboxes, trigger_ocr, ...(ocr_question_keys && { ocr_question_keys }), ...(ocr_only && { ocr_only }), ...(trigger_crop && { trigger_crop }) }
  );
  
  

export const saveStudentTotal = (
  batch_id:   string,
  student_id: string,
  total:      number,
) =>
  apiClient.patch<{ ok: boolean; total: number }>(
    `${BEAVER_BASE}/api/batches/${batch_id}/students/${student_id}/total`,
    { total }
  );

// Paper-level teacher error flag. kind is required when flagged; unflagging
// clears kind and note server-side.
export const saveStudentTeacherError = (
  batch_id:   string,
  student_id: string,
  flagged:    boolean,
  kind:       string | null,
  note:       string,
) =>
  apiClient.patch<{
    ok: boolean;
    teacher_error: boolean;
    teacher_error_kind: string | null;
    teacher_error_note: string | null;
  }>(
    `${BEAVER_BASE}/api/batches/${batch_id}/students/${student_id}/total`,
    flagged
      ? { teacher_error: true, teacher_error_kind: kind, teacher_error_note: note }
      : { teacher_error: false }
  );

// Optional `w`: ask the proxy for a downscaled WebP display rendition.
// Display-only — OCR crops are always built server-side from the originals.
// Dispatch screen "Upload to batch": create a MISSING paper from its dispatch
// document. Two-step: without confirm the server 409s with the matched batch
// (needs_confirmation) so the operator sees where the paper will land.
export interface ImportFromDispatchPayload {
  student_name: string;
  roll_number: string;
  grade: string;
  section: string;
  subject: string;
  admission_no?: string;
  page_keys: string[];
  confirm?: boolean;
}
export const importFromDispatch = (payload: ImportFromDispatchPayload) =>
  apiClient.post<{ imported: boolean; batch_id: string; student_id: string; pages: number }>(
    `${BEAVER_BASE}/api/batches/import-from-dispatch`, payload);

export const getProxyImageUrl = (url: string, w?: number) =>
  `${BEAVER_BASE}/api/proxy-image?url=${encodeURIComponent(url)}${w ? `&w=${w}` : ""}`;


// ── Error bucket / Manual Repair ───────────────────────────────────────────
export interface ErrorBucketRow {
  id:           number;
  school_id:    number | null;
  batch_id:     string;
  student_id:   string;
  student_name: string | null;
  roll_number:  string | null;
  set_name:     string | null;
  school_name:  string | null;
  grade:        string | null;
  section:      string | null;
  subject:      string | null;
  exam_type:    string | null;
  exam_type_name: string | null;
  reason:       string | null;
  notes:        string | null;
  status:       "open" | "escalated" | "resolved";
  added_by:     string | null;
  created_at:   string;
}

export const ERROR_BUCKET_REASONS = [
  "Different Handwriting Detected",
  "Duplicate Marks Grid",
  "Missing Pages",
  "Only Scanner Uploaded",
  "Page Cut / Cropped",
  "Page Inverted",
  "Pages Not Split",
  "Pages Shuffled",
  "Pages Zoomed In",
  "QR Code Mismatch",
  "Two Student Booklets Mixed",
  "Wrong Booklet (Name Mismatch)",
  "Other",
] as const;

/** Flag a student on the Answer Chunking screen into the error bucket. */
export const sendToErrorBucket = (batch_id: string, student_id: string, reason?: string, notes?: string) =>
  apiClient.post<ErrorBucketRow>(`${BEAVER_BASE}/api/error-bucket`, {
    batch_id, student_id, reason: reason ?? null, notes: notes ?? null,
  });

/** List the error bucket (school-scoped, newest first). Optional status filter. */
export const getErrorBucket = (status?: "open" | "escalated" | "resolved") =>
  apiClient.get<{ count: number; rows: ErrorBucketRow[] }>(
    `${BEAVER_BASE}/api/error-bucket${status ? `?status=${status}` : ""}`,
  );

/** Remove a repaired entry from the error bucket. */
export const removeFromErrorBucket = (id: number) =>
  apiClient.delete<{ removed: boolean }>(`${BEAVER_BASE}/api/error-bucket/${id}`);

/** Move an error bucket entry to the rescan list. */
export const escalateErrorBucket = (id: number) =>
  apiClient.patch<ErrorBucketRow>(`${BEAVER_BASE}/api/error-bucket/${id}/escalate`, {});

/** Mark an error bucket entry as resolved. */
export const resolveErrorBucket = (id: number) =>
  apiClient.patch<ErrorBucketRow>(`${BEAVER_BASE}/api/error-bucket/${id}/resolve`, {});

/** Move an entry back to open. */
export const reopenErrorBucket = (id: number) =>
  apiClient.patch<ErrorBucketRow>(`${BEAVER_BASE}/api/error-bucket/${id}/reopen`, {});

/** Notify assigned maker/checker that a student was fixed in Manual Repair. */
export const notifyManualRepairFixed = (batch_id: string, student_id: string, student_name?: string, roll_number?: string) =>
  apiClient.post<{ notified: boolean }>(`${BEAVER_BASE}/api/error-bucket/notify-fixed`, {
    batch_id, student_id, ...(student_name ? { student_name } : {}), ...(roll_number ? { roll_number } : {}),
  });

// ── Ops TO-DO (answer-level tasks for the ops team) ────────────────────────
// Distinct from the error bucket: that is page-level repair per (student,
// batch); this is per answer — first kind `draw_bbox`, an answer that lost
// marks but has no bounding box drawn.
export type OpsTodoKind = "draw_bbox" | "verify_marks";
export type OpsTodoStatus = "open" | "done" | "dismissed";

export interface OpsTodoRow {
  id:           number;
  kind:         OpsTodoKind;
  school_id:    number | null;
  batch_id:     string;
  student_id:   string;
  question_key: string;
  student_name: string | null;
  roll_number:  string | null;
  school_name:  string | null;
  grade:        string | null;
  section:      string | null;
  subject:      string | null;
  exam_type:    string | null;
  exam_id:      number | null;
  reason:       string | null;
  source:       string | null;
  status:       OpsTodoStatus;
  added_by:     string | null;
  created_at:   string;
  done_by:      string | null;
  done_at:      string | null;
}

export interface OpsTodoItem {
  batch_id: string;
  student_id: string;
  question_key: string;
  kind?: OpsTodoKind;
  reason?: string;
}

/** Add one or many to-dos; an existing one is reopened. */
export const addOpsTodos = (items: OpsTodoItem[], source: string = "manual") =>
  apiClient.post<{ count: number; rows: OpsTodoRow[] }>(`${BEAVER_BASE}/api/ops-todos`, { items, source });

export const getOpsTodos = (params: { status?: OpsTodoStatus; kind?: OpsTodoKind; batch_id?: string; exam_id?: number } = {}) => {
  const qs = new URLSearchParams();
  if (params.status) qs.set("status", params.status);
  if (params.kind) qs.set("kind", params.kind);
  if (params.batch_id) qs.set("batch_id", params.batch_id);
  if (params.exam_id != null) qs.set("exam_id", String(params.exam_id));
  const suffix = qs.toString() ? `?${qs}` : "";
  return apiClient.get<{ count: number; rows: OpsTodoRow[] }>(`${BEAVER_BASE}/api/ops-todos${suffix}`);
};

export const opsTodoDone    = (id: number) => apiClient.patch<OpsTodoRow>(`${BEAVER_BASE}/api/ops-todos/${id}/done`, {});
export const opsTodoDismiss = (id: number) => apiClient.patch<OpsTodoRow>(`${BEAVER_BASE}/api/ops-todos/${id}/dismiss`, {});
export const opsTodoReopen  = (id: number) => apiClient.patch<OpsTodoRow>(`${BEAVER_BASE}/api/ops-todos/${id}/reopen`, {});
export const removeOpsTodo  = (id: number) => apiClient.delete<{ removed: boolean }>(`${BEAVER_BASE}/api/ops-todos/${id}`);

/** Re-seed a paper's raw scans from its piper dispatch document (ADMIN).
 *  page_keys: dispatches/… keys in page order; server clears stale raws first. */
export const restoreFromDispatch = (batch_id: string, student_id: string, page_keys: string[]) =>
  apiClient.post<{ restored: number; cleared: number; folder: string }>(
    `${BEAVER_BASE}/api/batches/${batch_id}/students/${student_id}/restore-from-dispatch`,
    { page_keys },
  );

/** Persist a manual page reorder: complete img_id list in desired order → renumbered 1..N. */
export const reorderPages = (batch_id: string, student_id: string, img_ids: string[]) =>
  apiClient.patch<{ reordered: boolean; count: number }>(
    `${BEAVER_BASE}/api/batches/${batch_id}/students/${student_id}/pages/order`,
    { img_ids },
  );

/** Delete one answer-sheet page; backend renumbers survivors to contiguous 1..N. */
export const deletePage = (batch_id: string, student_id: string, img_id: string) =>
  apiClient.delete<{ deleted: boolean; img_id: string; remaining_pages: number }>(
    `${BEAVER_BASE}/api/batches/${batch_id}/students/${student_id}/pages/${encodeURIComponent(img_id)}`,
  );


export const rotateStudentPage = (
  batch_id:    string,
  student_id:  string,
  page_number: number,
  direction:   "cw" | "ccw" | "180"
) =>
  apiClient.post<{
    message: string;
    page: StudentPage;
  }>(
    `${BEAVER_BASE}/api/batches/${batch_id}/students/${student_id}/pages/${page_number}/rotate`,
    { direction }
  );

export const getQuestionsByExam = (schoolId: number, grade: string, exam: string, questionPaperId?: number) =>
  apiClient.get<QuestionListItemDTO[]>(
    `${DATA_QUALITY_BASE}/api/data-quality/questions`,
    { params: { schoolId: String(schoolId), grade, exam, ...(questionPaperId ? { questionPaperId: String(questionPaperId) } : {}) } }
  );

export const updateQuestion = (questionId: number, data: Partial<QuestionListItemDTO>) =>
  apiClient.put<{ message: string }>(
    `${DATA_QUALITY_BASE}/api/data-quality/questions/${questionId}`,
    data
  );

export const addQuestion = (data: Partial<QuestionListItemDTO> & { questionPaperId: number }) =>
  apiClient.post<{ message: string; questionId: number }>(
    `${DATA_QUALITY_BASE}/api/data-quality/questions`,
    data
  );

export const deleteQuestion = (questionId: number) =>
  apiClient.delete<{ message: string }>(
    `${DATA_QUALITY_BASE}/api/data-quality/questions/${questionId}`
  );


export const reExtractEntirePaperFromUrl = async (pdfUrl: string) => {
  const response = await fetch(pdfUrl);
  if (!response.ok) throw new Error("Failed to download PDF from storage");
  const blob = await response.blob();
  const file = new File([blob], "question_paper.pdf", { type: "application/pdf" });
  
  const fd = new FormData();
  fd.append("question_paper", file);

  const token = getAuthToken() ?? "";

  const baseUrl = BEAVER_BASE.replace(/\/$/, "");
  const targetUrl = `${baseUrl}/api/exams/0/parse-paper`;
  
  const parseRes = await fetch(targetUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
    },
    body: fd,
  });

  if (!parseRes.ok) {
    const errBody = await parseRes.json().catch(() => ({}));
    throw new Error(errBody.message || errBody.error || `Request failed: ${parseRes.status}`);
  }

  const parsedData = await parseRes.json();
  return parsedData as { success: boolean; questions: any[]; pages: any[] };
};

// Pull a zip of every stored bbox crop for a student (same endpoint the Answer
// Editing screen's "Download crops" button uses — /bboxes/download lazy-builds
// any crops not yet persisted). Returns the blob + a filename derived from the
// Content-Disposition header, and the X-Skipped-Bboxes header if present. A raw
// fetch (not apiClient) is needed to read the binary body + response headers.
export const downloadStudentBBoxesZip = async (batch_id: string, student_id: string) => {
  const token = getAuthToken() ?? "";

  const res = await fetch(
    `${BEAVER_BASE}/api/batches/${batch_id}/students/${student_id}/bboxes/download`,
    { method: "GET", headers: token ? { Authorization: `Bearer ${token}` } : {} }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? `Download failed: ${res.status}`);
  }

  const skipped = res.headers.get("X-Skipped-Bboxes");
  let filename = `student_${student_id}_bboxes.zip`;
  const cd = res.headers.get("Content-Disposition") ?? "";
  const match = cd.match(/filename\s*=\s*"?([^";]+)"?/i);
  if (match?.[1]) filename = match[1];

  const blob = await res.blob();
  return { blob, filename, skipped };
};

export const cropQuestionDiagram = (page_image_url: string, bbox: { x1: number, y1: number, x2: number, y2: number }, question_number: string) =>
  apiClient.post<{ crop_url: string }>(`${BEAVER_BASE}/api/exams/crop-question`, { page_image_url, bbox, question_number });

// Answer Chunking hot path: save ONE question's regions and mark it verified in
// a single round-trip. Replaces the old "saveBBoxes(every question) + verifyBBox"
// pair that ran on every Enter / ✓ — ~N+12 sequential DB queries per keypress.
export interface BBoxVerifyPayload {
  source:          "ai" | "manual";
  manually_edited: boolean;
  regions:         BBoxSavePayload["regions"];
}

export const verifyBBoxWithRegions = (
  batchId: string,
  studentId: string,
  questionKey: string,
  payload: BBoxVerifyPayload,
) =>
  apiClient.put<{ message: string; bbox: BBoxChunk }>(
    `${BEAVER_BASE}/api/batches/${batchId}/students/${studentId}/bboxes/${encodeURIComponent(questionKey)}/verify`,
    payload,
  );

export const verifyBBox = (batchId: string, studentId: string, questionKey: string) =>
  apiClient.patch<{ message: string }>(
    `${BEAVER_BASE}/api/batches/${batchId}/students/${studentId}/bboxes/${questionKey}`,
    { verified: true }
  );


// ── Chemistry: on-demand structure recognition for one answer ──────────────
// Sends the answer's crop to the DECIMER endpoint; persists has_structure +
// structure_smiles/inchikey on the bbox and returns the recognized SMILES.
export interface RecognizeStructureResult {
  recognized: boolean;
  smiles?: string;
  inchikey?: string | null;
  message?: string;
}

export const recognizeStructure = (batchId: string, studentId: string, questionKey: string) =>
  apiClient.post<RecognizeStructureResult>(
    `${BEAVER_BASE}/api/batches/${batchId}/students/${studentId}/bboxes/${questionKey}/recognize-structure`,
    {}
  );


// ── Answer-editing Extract dispatcher ─────────────────────────────────────
//
// Backend resolves the stored R2 crop (lazy-builds for legacy bboxes whose
// cropped_image_url is null), ships it to the chosen model, overwrites
// ocr_text + ocr_model on the bbox row, and returns the text. Marks and
// manually_edited are left untouched.

export type ExtractModel = "gpt-4o" | "gpt-4o-mini" | "claude-sonnet-4-5" | "glm-ocr" | "gpt-chemistry" | "gpt-table";

export const EXTRACT_MODELS: { value: ExtractModel; label: string; hint?: string }[] = [
  { value: "gpt-4o-mini",       label: "GPT-4o mini",        hint: "Default · fast" },
  { value: "gpt-4o",            label: "GPT-4o",             hint: "Best handwriting" },
  { value: "gpt-table",         label: "GPT Table",          hint: "GPT-4o · Accountancy / Economics tables" },
  { value: "gpt-chemistry",     label: "GPT Chemistry",      hint: "GPT-4o mini · handwritten chemistry + structures" },
  { value: "claude-sonnet-4-5", label: "Claude Sonnet 4.5",  hint: "Strong on long math" },
  { value: "glm-ocr",           label: "GLM-OCR (pipeline)", hint: "Matches the initial OCR" },
];

export const extractAnswer = (
  batch_id: string,
  student_id: string,
  question_key: string,
  model: ExtractModel,
  question_type?: string,
) =>
  apiClient.post<{ text: string; ocr_model: string; cropped_image_url: string; mcq_normalized?: string | null; confidence?: number | null }>(
    `${BEAVER_BASE}/api/batches/${batch_id}/students/${student_id}/bboxes/${question_key}/extract`,
    { model, ...(question_type ? { question_type } : {}) },
  );

// Best-effort fetch for the stored crop URL. If the bbox row's
// cropped_image_url is null, beaver-api reconstructs from regions on the fly,
// uploads, persists, and returns. UI should fall back to the BBoxChunk's
// `cropped_image_url` field first; this helper is for legacy bboxes that need
// the lazy build to fire.
export const getCroppedImageUrl = (
  batch_id: string,
  student_id: string,
  question_key: string,
) =>
  apiClient.get<{ url: string; source: "stored" | "lazy" }>(
    `${BEAVER_BASE}/api/batches/${batch_id}/students/${student_id}/bboxes/${question_key}/cropped-image-url`,
  );


// ── Roster reconcile (#155) ───────────────────────────────────────────────
//
// The resolve-queue UI for #144's roster reconciliation. The reconcile endpoint
// returns the 4-way engine result keyed on (student_name, roll_number). The
// loose side carries `student_id` (the row the resolve UI patches) and the
// existing `admission_no`; matches reference the canonical roster row by `id`
// (canonicalId). To attach the canonical admission_no we map canonicalId →
// admission_no from the roster list endpoint.

// The loose batch_students row as the reconcile endpoint projects it.
export interface ReconcileLooseRow {
  id:           number;
  student_id:   string;
  student_name: string;
  roll_number:  string;
  admission_no: string | null;
}

// A canonical roster row (system of record; carries admission_no).
export interface RosterEntry {
  id:               number;
  school_id:        number | null;
  batch_id:         string;
  admission_no:     string;
  student_name:     string;
  roll_number:      string;
  grade:            string | null;
  section:          string | null;
}

export interface ReconcileMatched {
  loose:       ReconcileLooseRow;
  canonicalId: number | null;
}

export interface ReconcileFuzzyCandidate {
  canonicalId: number | null;
  score:       number; // 1 = identical, 0 = maximally distant
}

export interface ReconcileFuzzyMatch {
  loose:      ReconcileLooseRow;
  candidates: ReconcileFuzzyCandidate[]; // best-first
}

export interface ReconcileDuplicateGroup {
  side: "loose" | "canonical";
  key:  string;
  rows: ReconcileLooseRow[];
}

export interface RosterReconcileResult {
  batch_id:         string;
  loose_count:      number;
  canonical_count:  number;
  matched:          ReconcileMatched[];
  fuzzy_candidates: ReconcileFuzzyMatch[];
  unmatched:        ReconcileLooseRow[];
  duplicates:       ReconcileDuplicateGroup[];
}

export const getRosterReconcile = (batch_id: string) =>
  apiClient.get<RosterReconcileResult>(
    `${BEAVER_BASE}/api/batches/${batch_id}/roster-reconcile`,
  );

export const getRoster = (batch_id: string) =>
  apiClient.get<{ count: number; batch_id: string; roster: RosterEntry[] }>(
    `${BEAVER_BASE}/api/batches/${batch_id}/roster`,
  );

// Attach the canonical admission_no to a loose batch_students row via the
// existing status PATCH (the route accepts admission_no as an optional
// nullable string from #144's write-path slice).
// batch_id is required: student_id is reused across a student's subject batches,
// so beaver-api scopes the batch_students UPDATE by (batch_id, student_id).
export const attachAdmissionNumber = (
  batch_id:         string,
  student_id:       string,
  admission_no:     string,
) =>
  apiClient.patch<{ message: string; student: BatchStudent }>(
    `${BEAVER_BASE}/api/students/${student_id}/status`,
    { batch_id, admission_no },
  );

