import type { AnswerKeyRow, IngestResult, PaperOption, StepItem } from "../types";
import { getAuthToken as getToken } from "@/app/lib/auth";

// ─────────────────────────────────────────────────────────────────────────────
// Base URLs
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE    = process.env.NEXT_PUBLIC_AGGREGATED_DATA_API_URL ?? "http://localhost:8082";
const BEAVER_BASE = process.env.NEXT_PUBLIC_BEAVER_API_URL          ?? "http://localhost:4000";

// ─────────────────────────────────────────────────────────────────────────────
// Auth helpers
// ─────────────────────────────────────────────────────────────────────────────


function authHeaders(): Record<string, string> {
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
      body:   err,
    });
  }

  if (res.status === 204) return undefined as unknown as T;
  return res.json() as Promise<T>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Endpoints
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Fetch all question papers for the paper selector dropdown.
 * Uses the existing data-quality endpoint that beaver already calls.
 */
export async function listQuestionPapers(): Promise<PaperOption[]> {
  const data = await jsonFetch<any[]>(
    `${API_BASE}/api/data-quality/schools`
  );

  // Flatten schools → questionPapers into a single list
  const papers: PaperOption[] = [];
  for (const school of data ?? []) {
    for (const qp of school.questionPapers ?? []) {
      papers.push({
        id:          qp.id,
        name:        qp.name ?? qp.exam ?? `Paper ${qp.id}`,
        subjectName: qp.subject ?? null,
        gradeName:   null,
        schoolName:  school.name ?? null,
        maxMarks:    qp.maxMarks ?? null,
        setNumber:   qp.setNumber ?? null,
        setMode:     qp.setMode ?? null,
      });
    }
  }
  return papers;
}

/**
 * Fetch all answer key rows for a paper with steps.
 * Used by the review table.
 */
export async function getAnswerKeyRows(
  questionPaperId: number
): Promise<AnswerKeyRow[]> {
  const data = await jsonFetch<{ rows: any[] }>(
    `${API_BASE}/api/answer-key/question-paper/${questionPaperId}`
  );
  return (data.rows ?? []).map((r: any) => ({
    id:                  r.id,
    questionId:          r.questionId,
    questionNumber:      r.questionNumber,
    questionText:        r.questionText,
    questionType:        r.questionType ?? null,
    maxMarks:            r.maxMarks,
    ocrText:             r.ocrText ?? null,
    cleanText:           r.cleanText ?? null,
    mcqChoice:    r.mcqChoice ?? null,
    status:              r.status,
    version:             r.version,
    steps:               r.steps ?? [],
    r2CroppedImageUrl:   r.r2CroppedImageUrl ?? null,
    createdAt:           r.createdAt ?? null,
    updatedAt:           r.updatedAt ?? null,
  }));
}

/**
 * Upload AK PDF to beaver-api.
 * beaver-api runs Claude OCR + Gate 1 + Gate 2 + writes to aggregatedData.
 * Returns ingest summary + validation issues.
 */
export async function ingestAnswerKey(
  questionPaperId: number,
  file:            File
): Promise<IngestResult> {
  const token = getToken();
  const fd    = new FormData();
  fd.append("answer_key", file);

  const res = await fetch(
    `${BEAVER_BASE}/api/question-papers/${questionPaperId}/answer-key/ingest`,
    {
      method:  "POST",
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body:    fd,
    }
  );

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
      body:   err,
    });
  }

  return res.json() as Promise<IngestResult>;
}

/**
 * Ops patches a single answer key row.
 * Replaces clean_text, steps, and status.
 */
export async function patchAnswerKeyRow(
  id:               number,
  cleanText:        string,
  mcqChoice: string | null,
  steps:            StepItem[],
  status:           string
): Promise<AnswerKeyRow> {
  return jsonFetch<AnswerKeyRow>(
    `${API_BASE}/api/answer-key/${id}`,
    {
      method: "PATCH",
      body:   JSON.stringify({ cleanText, mcqChoice, steps, status }),
    }
  );
}

/**
 * Re-run Claude extraction for a single row using its existing crop image.
 * Overwrites ocrText, cleanText, steps in the DB.
 */
export async function reExtractAnswerKeyRow(
  questionPaperId: number,
  questionId:      number,
  questionNumber:  string,
  cropUrl:         string,
  maxMarks:        number,
  questionType:    string | null,
  provider:        "claude" | "openai" = "claude",
): Promise<void> {
  await jsonFetch(
    `${BEAVER_BASE}/api/answer-key/${questionPaperId}/extract`,
    {
      method: "POST",
      body:   JSON.stringify({
        crops: [{ questionId, questionNumber, cropUrl, maxMarks, questionType: questionType ?? "" }],
        provider,
      }),
    }
  );
}

/**
 * Publish all DRAFT rows for a paper → READY.
 * Blocked server-side if any unresolved rows exist.
 */
export async function publishAnswerKey(
  questionPaperId: number
): Promise<{ message: string; questionPaperId: number }> {
  return jsonFetch(
    `${API_BASE}/api/answer-key/publish/${questionPaperId}`,
    { method: "POST" }
  );
}
/** One page image of an uploaded answer-key PDF. */
export interface AnswerKeyPage {
  pageNumber: number;
  url:        string;
  width:      number;
  height:     number;
}

/** One canonical question from preflight, used to seed the marking sidebar. */
export interface PreflightQuestion {
  id:              number;
  question_number: string;
  question_text:   string;
  max_marks:       number;
  question_type:   string | null;
}

/** Page images for an answer-key paper. `pages` arrives as a JSON string. */
export async function getAnswerKeyPages(
  questionPaperId: number
): Promise<AnswerKeyPage[]> {
  const data = await jsonFetch<{ pages?: string }>(
    `${API_BASE}/api/answer-key/question-paper/${questionPaperId}/pages`
  );
  return JSON.parse(data.pages ?? "[]") as AnswerKeyPage[];
}

/** Canonical questions for an answer-key paper, from the preflight step. */
export async function getAnswerKeyPreflight(
  questionPaperId: number
): Promise<PreflightQuestion[]> {
  const data = await jsonFetch<{ questions?: PreflightQuestion[] }>(
    `${API_BASE}/api/answer-key/question-paper/${questionPaperId}/preflight`
  );
  return data.questions ?? [];
}
