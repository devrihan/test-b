"use client";

import React, { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "@/app/lib/queryKeys";
import LeftSidebar from "../../../components/LeftSidebar";
import QuestionRow, { QuestionRowData } from "../../../components/Questionrow";
import StudentHeader, { type TeacherErrorState } from "../../../components/StudentHeader";
import { useSectionTimerContext } from "@/app/context/SectionTimerContext";
import ReviewGateControl from "../../../components/ReviewGateControl";
import ManualRepairButton from "../../../components/ManualRepairButton";
import BottomBar from "../../../components/BottomBar";
import Toast from "../../../components/Toast";
import PdfPanel from "../../../components/PdfPanel";
import QuestionsGrid from "./QuestionsGrid";
import { useBatchFilterContext } from "../../../context/BatchFilterContext";
import {
  getStudentBBoxes,
  getStudentPages,
  StudentPage,
  extractAnswer,
  getCroppedImageUrl,
  ExtractModel,
  EXTRACT_MODELS,
  getQuestionsByExam,
  QuestionListItemDTO,
  saveStudentTotal,
  saveStudentTeacherError,
  getBatchStudent,
  // DECIMER structure recognition disabled — slow + inaccurate. Kept for re-enable.
  // recognizeStructure,
} from "../../pdfExtract/lib/beaverApi";
import { getAnswerKeyRows } from "../../answerKey/lib/answerKeyApi";
import { fromEditableMolecules } from "../../../lib/smiles";
import { OCRExtractionProvider } from "@/app/context/Ocrextractioncontext";
import { useOCRExtraction } from "@/app/context/Ocrextractioncontext";
import OCRDrawer from "../../../components/OCRDrawer";
import { useReviewSession } from "@/app/hooks/useReviewSession";
import ReviewHistoryPanel from "./ReviewHistoryPanel";
import { getAuthToken as getToken } from "@/app/lib/auth";

const EXTRACT_MODEL_STORAGE_KEY = "answerEditing.extractModel";

// Stable identities so an idle/disabled query doesn't churn renders.
const NO_EXAM_QUESTIONS: QuestionListItemDTO[] = [];
const EMPTY_QUESTION_PARAMS = { schoolId: 0, grade: "", exam: "" } as const;

// ── Direct fetch helper for PATCH ────────────────────────────
const BASE = process.env.NEXT_PUBLIC_BEAVER_API_URL ?? "http://localhost:4000";


async function patchBBox(
  batch_id: string,
  student_id: string,
  question_key: string,
  body: Record<string, unknown>
) {
  const token = getToken();
  const res = await fetch(
    `${BASE}/api/batches/${batch_id}/students/${student_id}/bboxes/${question_key}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify(body),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error ?? `Failed: ${res.status}`);
  }
  return res.json();
}

// ── Helper: question_key → qNo ────────────────────────────────
const keyToNo = (key: string) => key;

// GLM-OCR confidence at/above this is treated as "safe to skip" for the
// low-confidence-only review filter. Fixed for now; calibrate on eval data.
const HIGH_CONF_THRESHOLD = 0.95;

// ─────────────────────────────────────────────────────────────

export default function AnswerEditingPage() {
  const queryClient = useQueryClient();
  const {
    matchedBatch,
    selectedStudentId,
    students,
    registerOpen,
    setLoadingPages,
    loadingPages,
    setSelectedStudent,
  } = useBatchFilterContext();

  // ── Local state ───────────────────────────────────────────
  const [questions, setQuestions] = useState<QuestionRowData[]>([]);
  const [scans, setScans] = useState<StudentPage[]>([]);
  const [total, setTotal] = useState<number | string>(0);
  // Manual Total override (#): when the grader types a Total, it sticks instead of
  // re-syncing to the per-answer marks sum — until they edit a mark again.
  const [manualTotal, setManualTotal] = useState(false);
  // Paper-level teacher error flag (checkbox + scenario + optional note).
  const [teacherError, setTeacherError] = useState<TeacherErrorState>({ flagged: false, kind: null, note: "" });
  const [isSaved, setIsSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPdf, setShowPdf] = useState(false);
  const [savedIds, setSavedIds] = useState<Set<string>>(() => new Set());
  // Atomic session (#199): the loaded student's identity, committed only at the
  // end of a successful load. questions/scans/total all belong to this session;
  // save() targets it and refuses if it has drifted from the current selection.
  const [session, setSession] = useState<{ batchId: string; studentId: string; studentName: string } | null>(null);
  const loadTokenRef = useRef(0);
  const loadedKeyRef = useRef<string | null>(null);
  // Live mirror of `session` for drift re-checks AFTER an await: a callback's
  // closure keeps the session it was created with, so async continuations must
  // consult this ref before touching per-student display state (#199/#537).
  const sessionRef = useRef<typeof session>(null);
  useEffect(() => { sessionRef.current = session; }, [session]);
  // Live mirror of `questions`, same rationale as sessionRef: the Ctrl+Enter
  // handler below needs the just-committed rows read synchronously (not from
  // a closure that may predate the commit) — see handleSave's override param.
  const questionsRef = useRef<QuestionRowData[]>(questions);
  useEffect(() => { questionsRef.current = questions; }, [questions]);
  const [toast, setToast] = useState<{
    message: string; type: "success" | "error";
  } | null>(null);
  const [latexPreview, setLatexPreview] = useState(false);
  const [chemPreview, setChemPreview] = useState(false);
  // Grid (compact) vs List (original per-question) view — applies to every
  // question, not just MCQ. Persists across student switches on purpose.
  const [gridViewMode, setGridViewMode] = useState<"grid" | "list">("grid");
  // "Only show low-confidence extractions" filter for the list view. Lets ops
  // skip answers GLM-OCR extracted with high confidence and spend time on the
  // risky ones. Fixed threshold for now; calibrate against eval data later.
  const [lowConfOnly, setLowConfOnly] = useState(false);

  // ── Review framework (#97): history drawer + session timing ──────────────
  const [showHistory, setShowHistory] = useState(false);
  // Open a timing session for the loaded unit; heartbeats only while focused.
  // Enabled once we have both a batch and a selected student.
  useReviewSession({
    batchId: matchedBatch?.batch_id ?? null,
    studentId: selectedStudentId || null,
    enabled: Boolean(matchedBatch?.batch_id && selectedStudentId),
  });


  // Section timing: clicks open the record; the filter bar's Done closes the same one.
  const sectionTimer = useSectionTimerContext();

  // Global Extract model — shared across every Extract button in the page.
  // Persisted in localStorage so the operator's preferred model survives
  // navigation. Default is gpt-4o-mini (cheaper/faster); gpt-4o available as upgrade.
  const [extractModel, setExtractModel] = useState<ExtractModel>("gpt-4o-mini");
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const saved = window.localStorage.getItem(EXTRACT_MODEL_STORAGE_KEY);
      if (saved && EXTRACT_MODELS.some((m) => m.value === saved)) {
        setExtractModel(saved as ExtractModel);
      }
    } catch { /* localStorage blocked */ }
  }, []);
  const handleModelChange = useCallback((model: string) => {
    if (!EXTRACT_MODELS.some((m) => m.value === model)) return;
    setExtractModel(model as ExtractModel);
    try { window.localStorage.setItem(EXTRACT_MODEL_STORAGE_KEY, model); } catch { /* ignore */ }
  }, []);

  // Per-row Extract loading state — disables only the row in flight.
  const [extractingQ, setExtractingQ] = useState<string | null>(null);

  // Header "Download crops" loading state. Single in-flight at a time —
  // the button is disabled while the zip is being assembled server-side.
  const [downloadingCrops, setDownloadingCrops] = useState(false);

  const markRefs = useRef<(HTMLInputElement | null)[]>([]);

  // ── Selected student object ───────────────────────────────
  const selectedStudent = students.find(s => s.student_id === selectedStudentId);

  // ── Filter key for savedIds persistence ──────────────────
  const filterKey = matchedBatch?.batch_id ?? "none";

  const isChemistry = Boolean(matchedBatch?.subject?.toLowerCase().includes("chem"));

  // The Extract-model picker is global and localStorage-persisted across
  // batches (see handleModelChange above), so opening a chemistry batch right
  // after an accountancy/economics one silently keeps whatever model was last
  // used there (e.g. gpt-table) — every chemistry extract would mis-route
  // with no error. Force gpt-chemistry once per batch load; the operator can
  // still switch away manually within the session afterward.
  useEffect(() => {
    if (isChemistry && extractModel !== "gpt-chemistry") {
      handleModelChange("gpt-chemistry");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchedBatch?.batch_id, isChemistry]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`opshub_saved_ids_${filterKey}`);
      setSavedIds(saved ? new Set(JSON.parse(saved)) : new Set());
    } catch { setSavedIds(new Set()); }
  }, [filterKey]);

  useEffect(() => {
    localStorage.setItem(
      `opshub_saved_ids_${filterKey}`,
      JSON.stringify(Array.from(savedIds))
    );
  }, [savedIds, filterKey]);

  // ── Exam enrichment, shared through the cache ─────────────
  // Keyed by exam, not student, so a batch costs one fetch instead of one per open.
  const examQuestionsParams = useMemo(
    () => (matchedBatch?.school_id && matchedBatch?.grade && matchedBatch?.exam_type
      ? {
          schoolId: matchedBatch.school_id,
          grade:    matchedBatch.grade,
          exam:     matchedBatch.exam_type,
          questionPaperId: matchedBatch.metadata?.question_paper_id ?? undefined,
        }
      : null),
    [matchedBatch?.school_id, matchedBatch?.grade, matchedBatch?.exam_type,
     matchedBatch?.metadata?.question_paper_id],
  );

  const examQuestionsQuery = useQuery({
    queryKey: keys.aggregated.questions(examQuestionsParams ?? EMPTY_QUESTION_PARAMS),
    queryFn:  () => getQuestionsByExam(
      examQuestionsParams!.schoolId,
      examQuestionsParams!.grade,
      examQuestionsParams!.exam,
      examQuestionsParams!.questionPaperId,
    ),
    enabled:  examQuestionsParams !== null,
  });

  const examQuestions = Array.isArray(examQuestionsQuery.data)
    ? examQuestionsQuery.data
    : NO_EXAM_QUESTIONS;

  // Reviewed rows, so "View Answer Key" shows clean_text not the raw ai_answer.
  const answerKeyPaperId = matchedBatch?.metadata?.question_paper_id;
  const answerKeyQuery = useQuery({
    queryKey: keys.answerKey.rows(answerKeyPaperId ?? 0),
    queryFn:  () => getAnswerKeyRows(answerKeyPaperId!),
    enabled:  Boolean(answerKeyPaperId),
  });

  const answerKeyMap = useMemo(
    () => new Map((answerKeyQuery.data ?? []).map(r => [r.questionId, r])),
    [answerKeyQuery.data],
  );

  // ── Reset when batch changes ──────────────────────────────
  useEffect(() => {
    setQuestions([]);
    setScans([]);
    setTotal(0);
    setIsSaved(false);
  }, [filterKey, matchedBatch]);

  // ── Open student — load bboxes + pages ───────────────────
  const handleOpenStudent = useCallback(async () => {
    if (!matchedBatch || !selectedStudentId) return;
    // Bind this load to a specific student/batch so a mid-load switch can't cross
    // wires (all fetches + the commit below use these locals, not the context).
    const batchId = matchedBatch.batch_id;
    const studentId = selectedStudentId;
    const student = students.find(s => s.student_id === studentId);
    if (!student) return;

    // Identity-stamp the load; a newer load (or student switch) bumps the token
    // and any in-flight commit below is discarded via isStale().
    const token = ++loadTokenRef.current;
    const isStale = () => loadTokenRef.current !== token;

    try {
      setLoadingPages(true);
      setSession(null);
      setQuestions([]);
      setScans([]);
      setTotal(0);
      setTeacherError({ flagged: false, kind: null, note: "" });
      setIsSaved(false);

      // Fetch bboxes, pages, and exam questions all in parallel so rows are
      // built with full question metadata (questionType etc.) immediately.
      // The exam-questions read is ENRICHMENT ONLY (question text / answer
      // key / types) and comes from aggregatedData — a different service than
      // beaver-api. It must never sink the whole load: the student's own
      // answers + OCR text are in bboxes/pages and render fine without it.
      // (Seen live: aggregatedData unreachable from the operator's browser
      // blanked the entire screen and was reported as "OCR text missing".)
      // fetchQuery hits the cache, or joins the batch-level request in flight.
      let examQuestionsFailed = false;
      // The student's own row is re-read too: the roster in context is not
      // refetched on same-batch switches, so its teacher-error fields can be
      // older than a save made earlier in this session.
      const [bboxRes, pagesRes, freshExamQuestions, freshStudentRes] = await Promise.all([
        getStudentBBoxes(batchId, studentId),
        getStudentPages(batchId, studentId),
        examQuestionsParams
          ? queryClient.fetchQuery({
              queryKey: keys.aggregated.questions(examQuestionsParams),
              queryFn:  () => getQuestionsByExam(
                examQuestionsParams.schoolId,
                examQuestionsParams.grade,
                examQuestionsParams.exam,
                examQuestionsParams.questionPaperId,
              ),
            })
              .catch(err => {
                console.error("Failed to fetch exam questions:", err);
                examQuestionsFailed = true;
                return [] as QuestionListItemDTO[];
              })
          : Promise.resolve([]),
        getBatchStudent(batchId, studentId),
      ]);
      if (isStale()) return;   // a newer student load started while we awaited
      const currentExamQuestions = Array.isArray(freshExamQuestions) ? freshExamQuestions : [];
      if (examQuestionsFailed) {
        setToast({
          message: "Question texts/answer keys unavailable (data service unreachable) — answers and OCR text are unaffected.",
          type: "error",
        });
      }

      // ── Build a lookup of bbox rows by question_key ──────────────────────
      // Bbox rows are keyed by integer base ("21" not "21.1"/"21.2"). For OR
      // questions the row carries an or_attempt resolution from the workflow
      // ('A' = .1 attempted, 'B' = .2 attempted) which we use to fold its data
      // into the correct sub-question slot below.
      const bboxMap = new Map<string, typeof bboxRes.bboxes[0]>();
      for (const bbox of bboxRes.bboxes) {
        bboxMap.set(bbox.question_key, bbox);
      }

      // ── AI OCR corrections ──────────────────────────────────────────────────
      // Keyed the way this grid renders ("18.1"), not the way answer_bboxes
      // stores ("18"), so subparts resolve to their own text.
      const correctionMap = new Map<string, string>();
      for (const c of bboxRes.corrections ?? []) {
        const text = c.proposed_ocr_text?.trim();
        if (text) correctionMap.set(c.question_key, text);
      }

      // ── Full expected question list from batch metadata ───────────────────
      // metadata can be a raw JSON string from the API, so parse it safely.
      const rawMeta = matchedBatch.metadata;
      const meta: {
        question_numbers?: string[];
        parsed_questions?: { questionNumber?: number | string; isOptional?: boolean }[];
      } | null =
        typeof rawMeta === "string"
          ? (() => { try { return JSON.parse(rawMeta); } catch { return null; } })()
          : rawMeta ?? null;

      // Merge bbox keys (integers from DB) with metadata question_numbers
      // (decimals from question paper). Integer keys carry whole_marks and
      // must always be present for correct totalMax computation.
      const bboxKeys = Array.from(bboxMap.keys());
      let rawKeys: string[] = [];
      if (meta?.question_numbers && (meta.question_numbers as string[]).length > 0) {
        rawKeys = [...new Set([...bboxKeys, ...(meta.question_numbers as string[])])];
      } else {
        rawKeys = bboxKeys;
      }


      // Sort by numeric value so "21.1" < "21.2" < "22". Deduplicate first —
      // OCR completion can write duplicate entries into metadata.question_numbers.
      const allKeys = [...new Set(rawKeys)].sort((a, b) => {
        const na = parseFloat(a.replace(/[^0-9.]/g, ""));
        const nb = parseFloat(b.replace(/[^0-9.]/g, ""));
        if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
        return a.localeCompare(b);
      });

      // For each rendered slot, resolve which integer-base bbox owns its data.
      // Plain integer keys map directly. Decimal sub-keys fall back to the
      // integer base bbox. For OR questions (.1 = A, .2 = B), only the
      // attempted side inherits data. Higher decimals (.3+) on OR questions
      // stay empty (no per-subpart data until increment 2).
      const SUB_SUFFIX = /^(.+)\.(\d+)$/;
      const qs: QuestionRowData[] = allKeys.map(key => {
        let bbox: typeof bboxRes.bboxes[0] | undefined;
        let sharedBaseBbox = false;

        const direct = bboxMap.get(key);
        if (direct) {
          bbox = direct;
        } else {
          const m = key.match(SUB_SUFFIX);
          if (m) {
            const intBase = String(Math.floor(parseFloat(m[1])));
            const baseBox = bboxMap.get(intBase);
            if (baseBox) {
              if (baseBox.or_attempt && (m[2] === "1" || m[2] === "2")) {
                // OR question: .1 = option A, .2 = option B
                const expectedAttempt = m[2] === "1" ? "A" : "B";
                if (baseBox.or_attempt.toUpperCase() === expectedAttempt) {
                  bbox = baseBox;
                  sharedBaseBbox = true;
                }
              } else if (!baseBox.or_attempt && baseBox.ocr_text) {
                // Non-OR multipart: all sub-slots share base bbox data
                bbox = baseBox;
                sharedBaseBbox = true;
              }
            }
          }
        }

        // Prefer the AI transcription; fall through to bbox text when absent.
        const aiText  = correctionMap.get(key);
        const ocrText = aiText || bbox?.ocr_text || "";
        const marks   = Number(bbox?.marks)     || 0;
        
        const isOptional = meta?.parsed_questions?.find(
          pq => pq.questionNumber?.toString() === key
        )?.isOptional ?? false;

        let baseKey = key;
        const subMatch = key.match(SUB_SUFFIX);
        if (subMatch) {
          baseKey = String(Math.floor(parseFloat(subMatch[1])));
        }
        // First try exact match, then try baseKey match (for OR questions)
        const examQuestion = currentExamQuestions.find(eq => Number(eq.questionNumber) === Number(key)) ||
                             currentExamQuestions.find(eq => Number(eq.questionNumber) === Number(baseKey));
        // Base question always carries the correct paper total for this integer
        const baseExamQuestion = currentExamQuestions.find(eq => Number(eq.questionNumber) === Number(baseKey));

        const maxMarks = Number(bbox?.max_marks) || Number(examQuestion?.maxMarks) || 0;
        // whole_marks = the full parent-question total. Always prefer the base
        // question's maxMarks (correct after V21) over the subpart's (NULL).
        const wholeMarks = Number(baseExamQuestion?.maxMarks) || Number(bbox?.whole_marks) || maxMarks || 0;

        return {
          qNo:           key,
          maxMarks,
          wholeMarks,
          ocrAnswer:     ocrText,
          ocrMarks:      marks,
          answer:        ocrText,
          marks,
          answerEditing: false,
          answerDraft:   ocrText,
          isOptional: Boolean(isOptional),
          croppedImageUrl: bbox?.cropped_image_url ? `${bbox.cropped_image_url}?v=${Date.now()}` : null,
          ocrVerified: bbox?.ocr_verified ?? false,
          questionText: examQuestion?.questionText,
          // prefer the reviewed answer key; for MCQ use the choice letter if clean text isn't set
          answerKey: (examQuestion ? (answerKeyMap.get(examQuestion.id)?.cleanText || answerKeyMap.get(examQuestion.id)?.mcqChoice) : undefined)
            || examQuestion?.cleanText
            || examQuestion?.mcqChoice
            || examQuestion?.answerKey,
          hasStructure: bbox?.has_structure ?? false,
          structureSmiles: bbox?.structure_smiles ?? null,
          questionType: examQuestion?.questionType,
          mcqNormalized: bbox?.mcq_normalized ?? null,
          ocrConfidence: bbox?.ocr_confidence ?? null,
          sharedBaseBbox,
          textSource: aiText ? ("ai" as const) : ("ocr" as const),
        };
      });

      if (isStale()) return;   // selection changed after building rows — discard
      setQuestions(qs);
      setScans(pagesRes.scans ?? []);

      // Total from batch_students — server truth (recomputed on every marks
      // PATCH, with authoritative OR/sub-part dedup). Do NOT guess a manual
      // override by comparing against the client-side sum: that comparison
      // mis-fires on OR/sub-part papers whose slot expansion disagrees with
      // the server's grouping (#537), and the wrong client sum then took over
      // the display after the first mark edit. `manualTotal` now strictly
      // means "operator typed the Total in THIS session".
      const loadedTotal = Number(student.total_marks_obtained) || 0;
      setTotal(loadedTotal);
      setManualTotal(false);
      const freshStudent = freshStudentRes.student;
      setTeacherError({
        flagged: !!freshStudent.teacher_error,
        kind: freshStudent.teacher_error_kind ?? null,
        note: freshStudent.teacher_error_note ?? "",
      });
      setIsSaved(savedIds.has(studentId));

      // Commit the session LAST: from here, save() targets this exact student.
      setSession({ batchId, studentId, studentName: student.student_name });

    } catch (err) {
      if (isStale()) return;
      setToast({
        message: err instanceof Error ? err.message : "Failed to load student",
        type: "error",
      });
    } finally {
      if (!isStale()) setLoadingPages(false);
    }
  }, [matchedBatch, selectedStudentId, students, savedIds, setLoadingPages, answerKeyMap, examQuestionsParams, queryClient]);


  // ── Neutralize the shared open-callback (#199) ────────────
  // Loading is now driven declaratively by selection (below), so the shared
  // BatchFilterBar's onOpenStudent must not also fire a load with a possibly
  // stale target.
  useEffect(() => {
    registerOpen(() => {});
  }, [registerOpen]);

  // ── Declarative, race-safe load on selection change (#199) ─
  // When the selected student (or batch) changes, load exactly that student.
  // loadedKeyRef de-dups so unrelated dep changes (answer key, saved set) don't
  // reload; the token guard inside handleOpenStudent discards stale commits.
  useEffect(() => {
    if (!matchedBatch?.batch_id || !selectedStudentId) {
      loadedKeyRef.current = null;
      // matchedBatch is derived and can be null transiently; only the student clearing means deselection.
      if (!selectedStudentId && sessionRef.current) {
        setSession(null);
        setQuestions([]);
        setScans([]);
        setTotal(0);
        setIsSaved(false);
      }
      return;
    }
    if (!students.find(s => s.student_id === selectedStudentId)) return;
    const key = `${matchedBatch.batch_id}::${selectedStudentId}`;
    if (loadedKeyRef.current === key) return;
    loadedKeyRef.current = key;
    handleOpenStudent();
  }, [matchedBatch?.batch_id, selectedStudentId, students, handleOpenStudent]);

  // Patch questionText + answerKey + questionType into already-built rows when exam data arrives late.
  // handleOpenStudent may run before getQuestionsByExam resolves, leaving those fields blank.
  useEffect(() => {
    if (examQuestions.length === 0) return;
    setQuestions(prev => {
      if (prev.length === 0) return prev;
      return prev.map(q => {
        const examQ = examQuestions.find(eq => Number(eq.questionNumber) === Number(q.qNo));
        if (!examQ) return q;
        const bestAnswerKey =
          (answerKeyMap.get(examQ.id)?.cleanText || answerKeyMap.get(examQ.id)?.mcqChoice) ||
          examQ.cleanText || examQ.mcqChoice || examQ.answerKey || undefined;
        return {
          ...q,
          questionText:  q.questionText  || examQ.questionText  || undefined,
          answerKey:     q.answerKey     || bestAnswerKey,
          questionType:  q.questionType  || examQ.questionType  || undefined,
        };
      });
    });
  }, [examQuestions, answerKeyMap]);


  // ── Deep-link open (?batchId&studentId) ───────────────────
  // No longer a special case: the batch-filter context sets selectedStudentId
  // from the URL, and the declarative load effect above then loads that exact
  // student — same path as any manual selection.


  // ── Question updater ──────────────────────────────────────
  const updateQuestion = (qNo: string, patch: Partial<QuestionRowData>) => {
    // Functional update — always derives from the latest state, so a Marks edit
    // reliably registers as dirty for save. (A closure over `questions` here
    // could drop the edit / leave the dirty check empty → "nothing to save".)
    // The live Total is kept in sync by the effect below, not from this updater.
    setQuestions(prev => prev.map(q => q.qNo === qNo ? { ...q, ...patch } : q));
    // Editing a Marks value re-syncs the Total to the sum: drop any manual override.
    if ("marks" in patch) setManualTotal(false);
    setIsSaved(false);
  };

  // ── Chemistry: on-demand structure recognition for one answer ──────────
  const [recognizingQ, setRecognizingQ] = useState<string | null>(null);
  const handleRecognizeStructure = useCallback(async (_qNo: string) => {
    // DECIMER structure recognition is DISABLED — the endpoint is slow and
    // highly inaccurate. The chemical-structure toggle (text-based SMILES
    // detection) replaces it. The original call is kept below, commented, so it
    // can be re-enabled easily (also re-add the recognizeStructure import).
    return;

    /* --- original DECIMER recognition (kept for re-enable) ---
    if (!matchedBatch || !selectedStudentId) return;
    setRecognizingQ(qNo);
    try {
      const res = await recognizeStructure(matchedBatch.batch_id, selectedStudentId, qNo);
      if (res.recognized && res.smiles) {
        setQuestions(prev => prev.map(q =>
          q.qNo === qNo ? { ...q, structureSmiles: res.smiles ?? null, hasStructure: true } : q));
      } else {
        setToast({ message: res.message || "No structure recognized for this answer", type: "error" });
      }
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Structure recognition failed", type: "error" });
    } finally {
      setRecognizingQ(null);
    }
    --- end original --- */
  }, [matchedBatch, selectedStudentId]);

  const saveAnswer = async (qNo: string) => {
    // Session invariant (#199): write to the loaded student; refuse on drift.
    if (!session || session.studentId !== selectedStudentId) return;
    const { batchId, studentId } = session;

    // Find the question to get current values
    const prevQ = questions.find(q => q.qNo === qNo);
    if (!prevQ) return;

    // The edit textarea shows molecule names as a plain "Molecules: ..." line
    // (see toEditableMolecules) — parse it back into the internal format.
    const savedAnswer = fromEditableMolecules(prevQ.answerDraft);

    // Update local state first
    setQuestions(prev =>
      prev.map(q => q.qNo === qNo
        ? { ...q, answer: savedAnswer, answerEditing: false }
        : q
      )
    );

    try {
      await patchBBox(
        batchId,
        studentId,
        qNo,
        {
          ocr_text: savedAnswer,
          marks: prevQ.marks,
          verified: true,
        }
      );
      setToast({ message: `Q${qNo} saved`, type: "success" });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : `Failed to save Q${qNo}`,
        type: "error",
      });
    }
  };


  const saveMarks = async (qNo: string) => {
    // Same session invariant as handleSave (#199): write to the loaded student,
    // and refuse if the selection has drifted mid-load.
    if (!session || session.studentId !== selectedStudentId) return;
    const { batchId, studentId } = session;

    const q = questions.find(q => q.qNo === qNo);
    if (!q || q.marks === q.ocrMarks) return;

    try {
      await patchBBox(
        batchId,
        studentId,
        qNo,
        {
          ocr_text: q.answer,
          marks: q.marks,
          max_marks: q.maxMarks,
          verified: true,
        }
      );

      // ocrMarks/ocrAnswer are never touched — they stay the permanent OCR
      // baseline. Total Marks still needs to reflect the correction — unless a
      // manual Total override is active (editing a mark clears it via
      // updateQuestion, so if it's still set the grader wants their value).
      // The PATCH above recomputed total_marks_obtained server-side; show that
      // instead of the client-side sum (#537).
      if (manualTotal) {
        await saveManualTotal(Number(total) || 0);
      } else {
        await refreshTotalFromServer(batchId, studentId);
      }

      setToast({ message: `Q${qNo} marks saved`, type: "success" });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : `Failed to save Q${qNo}`,
        type: "error",
      });
    }
  };


  // Ops Max override — writes max_marks + whole_marks together; student marks untouched.
  const saveMaxMarks = async (qNo: string) => {
    if (!session || session.studentId !== selectedStudentId) return;
    const { batchId, studentId } = session;
    const q = questions.find(q => q.qNo === qNo);
    if (!q) return;
    try {
      await patchBBox(batchId, studentId, qNo, {
        max_marks: q.maxMarks,
        whole_marks: q.maxMarks,
      });
      setToast({ message: `Q${qNo} max marks saved`, type: "success" });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : `Failed to save max marks for Q${qNo}`,
        type: "error",
      });
    }
  };


  // Persist a manually-typed Total override for the loaded student (session-safe).
  const saveManualTotal = async (value: number) => {
    if (!session || session.studentId !== selectedStudentId) return;
    try {
      await saveStudentTotal(session.batchId, session.studentId, value);
    } catch (err) {
      setToast({ message: err instanceof Error ? err.message : "Failed to save total", type: "error" });
    }
  };

  // #537: after a marks write, total_marks_obtained is recomputed server-side —
  // the only place that dedups OR/sub-part groups authoritatively. Re-fetch just
  // this student's row and display that value instead of the client-side sum
  // (computeMarksTotal), which can disagree for OR/sub-part papers. The
  // sessionRef re-check makes the post-await setTotal drift-safe: if the
  // operator switched students while the fetch was in flight, the stale value
  // is dropped instead of landing on the next student's screen.
  const refreshTotalFromServer = async (batchId: string, studentId: string) => {
    try {
      const { student } = await getBatchStudent(batchId, studentId);
      if (sessionRef.current?.studentId !== studentId) return; // switched mid-fetch
      if (student) setTotal(Number(student.total_marks_obtained) || 0);
    } catch {
      // Keep the current display; the next save or reload re-syncs it.
    }
  };

  const saveOcrVerified = async (qNo: string, ocrVerified: boolean) => {
    // Session invariant (#199): write to the loaded student; refuse on drift.
    if (!session || session.studentId !== selectedStudentId) return;
    const { batchId, studentId } = session;
    try {
      await patchBBox(
        batchId,
        studentId,
        qNo,
        { ocr_verified: ocrVerified }
      );
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : `Failed to update OCR verified for Q${qNo}`,
        type: "error",
      });
    }
  };

   // ── MCQ marks grid ─────────────────────────────────────────
    // PATCHes an explicit marks value (not read from `questions` state) so
    // stepper clicks don't race the async setQuestions from updateQuestion.
    const saveMarksValue = async (
      qNo: string, newMarks: number, maxMarks: number, answerText: string, wholeMarks?: number,
    ) => {
      if (!session || session.studentId !== selectedStudentId) return;
      const { batchId, studentId } = session;
      try {
        await patchBBox(
          batchId,
          studentId,
          qNo,
          {
            ocr_text: answerText, marks: newMarks, max_marks: maxMarks, verified: true,
            ...(wholeMarks !== undefined ? { whole_marks: wholeMarks } : {}),
          }
        );
        // A marks write always clears any manual Total override (updateQuestion
        // did that when the stepper/grid edit landed), so re-sync the Total to
        // the server's recomputed value unconditionally (#537).
        await refreshTotalFromServer(batchId, studentId);
      } catch (err) {
        setToast({
          message: err instanceof Error ? err.message : `Failed to save Q${qNo}`,
          type: "error",
        });
      }
    };

    const saveMcqNormalized = async (qNo: string, value: string | null) => {
      if (!session || session.studentId !== selectedStudentId) return;
      const { batchId, studentId } = session;
      setQuestions(prev => prev.map(q => q.qNo === qNo ? { ...q, mcqNormalized: value } : q));
      try {
        await patchBBox(batchId, studentId, qNo, { mcq_normalized: value });
      } catch (err) {
        setToast({
          message: err instanceof Error ? err.message : `Failed to save MCQ choice for Q${qNo}`,
          type: "error",
        });
      }
    };

  const handleStepMarks = (qNo: string, delta: number) => {
    const q = questions.find(q => q.qNo === qNo);
    if (!q) return;
    const newMarks = Math.min(q.maxMarks, Math.max(0, q.marks + delta));
    if (newMarks === q.marks) return;
    updateQuestion(qNo, { marks: newMarks });
    saveMarksValue(qNo, newMarks, q.maxMarks, q.answer);
  };

  // Grid cell commit: raw typed value arrives once, on blur/Enter. Clamp to
  // the question's full marks (QP-first wholeMarks; no clamp when unknown —
  // never force a mark to 0 because max wasn't parsed), update local state,
  // and PATCH the explicit value. whole_marks is NOT sent — ops max edits go
  // through saveMaxMarks only.
  const handleGridMarksCommitValue = (qNo: string, raw: string) => {
    const q = questions.find(q => q.qNo === qNo);
    if (!q) return;
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const ceiling = Number(q.wholeMarks) || Number(q.maxMarks) || Infinity;
    const clamped = Math.min(ceiling, Math.max(0, parsed));
    if (clamped === q.marks) return;
    updateQuestion(qNo, { marks: clamped });
    saveMarksValue(qNo, clamped, q.maxMarks, q.answer);
  };

  // Persists only states the server accepts: unflagged, or flagged with a
  // scenario picked. Ticking the box alone just reveals the dropdown.
  const handleTeacherErrorChange = async (next: TeacherErrorState, commit: boolean) => {
    setTeacherError(next);
    if (!commit) return;
    if (next.flagged && !next.kind) return;
    if (!session || session.studentId !== selectedStudentId) return;
    const { batchId, studentId } = session;
    try {
      await saveStudentTeacherError(batchId, studentId, next.flagged, next.kind, next.note);
      setToast({ message: "Teacher error saved", type: "success" });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to save teacher error",
        type: "error",
      });
    }
  };

  const handleApproveAll = async () => {
    if (!session || session.studentId !== selectedStudentId) return;
    const { batchId, studentId } = session;
    if (questions.length === 0) return;
    try {
      await Promise.all(
        questions.map(q =>
          patchBBox(
            batchId,
            studentId,
            q.qNo,
            { ocr_text: q.answer, marks: q.marks, max_marks: q.maxMarks, verified: true }
          )
        )
      );
      // The PATCHes recomputed the server-side total — pick it up (#537).
      await refreshTotalFromServer(batchId, studentId);
      setToast({ message: `${questions.length} question(s) approved`, type: "success" });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to approve all",
        type: "error",
      });
    }
  };

  const handleResetEdits = () => {
    const reset = questions.map(q => (q.marks !== q.ocrMarks ? { ...q, marks: q.ocrMarks } : q));
    setQuestions(reset);
    // The live client-sum effect is gone (#537), so re-sync the Total display
    // to the reset marks here. Display-only — nothing persists until Save,
    // and the next marks write re-syncs from the server anyway.
    setManualTotal(false);
    setTotal(computeMarksTotal(reset, "marks"));
  };

  const handleVerifyAllOcr = async () => {
    if (!session || session.studentId !== selectedStudentId) return;
    const { batchId, studentId } = session;

    const unverified = questions.filter(q => !q.ocrVerified);
    if (unverified.length === 0) {
      setToast({ message: "All questions already OCR verified", type: "success" });
      return;
    }

    try {
      await Promise.all(
        unverified.map(q =>
          patchBBox(
            batchId,
            studentId,
            q.qNo,
            { ocr_verified: true }
          )
        )
      );

      setQuestions(prev => prev.map(q => ({ ...q, ocrVerified: true })));
      setToast({ message: `All ${questions.length} questions OCR verified ✓`, type: "success" });
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to verify all",
        type: "error",
      });
    }
  };

  const cancelAnswer = (qNo: string) => {
    setQuestions(prev =>
      prev.map(q => q.qNo === qNo
        ? { ...q, answerDraft: q.answer, answerEditing: false }
        : q
      )
    );
  };


  const handleFillOCR = (questionId: string, text: string) => {
    updateQuestion(questionId, {
      answer: text,
      answerDraft: text,
    });
  };

  // Direct per-row Extract: skip the drawer entirely. POST the stored crop
  // (lazy-built backend-side if needed) to whichever model the operator
  // picked in the header dropdown; on success, drop the text straight into
  // the row's answer field. Marks/manually_edited are untouched.
  const handleDirectExtract = useCallback(async (qNo: string) => {
    // Session invariant (#199): extract/write for the loaded student; refuse on drift.
    if (!session || session.studentId !== selectedStudentId || !matchedBatch) return;
    const { batchId, studentId } = session;
    setExtractingQ(qNo);
    try {
      const row = questions.find(q => q.qNo === qNo);
      const questionType = row?.questionType;

      // glm-ocr and gpt-chemistry keep their dedicated beaver-api handling
      // (pipeline parity / SMILES structures) — only the general chat models
      // reroute through the subject-aware prompt.
      if (extractModel === "glm-ocr" || extractModel === "gpt-chemistry") {
        const result = await extractAnswer(
          batchId,
          studentId,
          qNo,
          extractModel,
          questionType,
        );
        const text = result?.text ?? "";
        updateQuestion(qNo, {
          answer: text,
          answerDraft: text,
          ...(result?.mcq_normalized !== undefined ? { mcqNormalized: result.mcq_normalized } : {}),
          ...(result?.confidence !== undefined ? { ocrConfidence: result.confidence } : {}),
        });
        const cropUrl = result?.cropped_image_url;
        if (cropUrl) {
          setQuestions((prev) =>
            prev.map((q) => (q.qNo === qNo ? { ...q, croppedImageUrl: `${cropUrl}?v=${Date.now()}` } : q)),
          );
        }
        return;
      }

      // GPT-4o / GPT-4o-mini / Claude go through the frontend /api/ocr route so
      // the prompt is picked by subject (accounts, economics, …) instead of
      // beaver-api's fixed math prompt.
      let cropUrl = row?.croppedImageUrl ?? null;
      if (!cropUrl) {
        const res = await getCroppedImageUrl(batchId, studentId, qNo);
        cropUrl = res.url;
      }

      const ocrRes = await fetch("/api/ocr", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: cropUrl,
          model: extractModel,
          subject: matchedBatch.subject,
        }),
      });
      if (!ocrRes.ok) {
        const body = await ocrRes.json().catch(() => ({}));
        throw new Error(body?.error || "Extract failed");
      }
      const text = (await ocrRes.json())?.text ?? "";

      // Persist as OCR output: ocr_text + ocr_model tells beaver-api this is a
      // service extraction, so marks and manually_edited stay untouched.
      await patchBBox(batchId, studentId, qNo, {
        ocr_text: text,
        ocr_model: extractModel,
      });

      updateQuestion(qNo, { answer: text, answerDraft: text });

      const resolvedCrop = cropUrl;
      if (resolvedCrop && !row?.croppedImageUrl) {
        setQuestions((prev) =>
          prev.map((q) => (q.qNo === qNo ? { ...q, croppedImageUrl: `${resolvedCrop}?v=${Date.now()}` } : q)),
        );
      }
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Extract failed",
        type: "error",
      });
    } finally {
      setExtractingQ(null);
    }
  }, [session, matchedBatch, selectedStudentId, extractModel, questions]);

  // ── Save — only dirty questions ───────────────────────────
  // `overrideRows`: lets a caller pass just-committed rows explicitly instead
  // of relying on the closed-over `questions` state (#S9) — needed by the
  // Ctrl+Enter handler below, whose committed draft can otherwise still read
  // pre-commit `questions` from a stale closure and silently drop the edit.
  const handleSave = useCallback(async (overrideRows?: QuestionRowData[]) => {
    // Save from the loaded session, never from raw context (#199). The rows in
    // `questions` were built for session.studentId; refuse if that has drifted
    // from the current selection (a switch is mid-flight) so we can never write
    // one student's answers onto another.
    if (!session) {
      // Never exit silently — a Save click must always answer (reported live:
      // "I click save student, I don't get any response").
      setToast({ message: "No student loaded yet — wait for the paper to load, then retry.", type: "error" });
      return;
    }
    if (session.studentId !== selectedStudentId) {
      setToast({ message: "Still loading this student — please retry in a moment.", type: "error" });
      return;
    }
    const { batchId, studentId } = session;

    const sourceRows = overrideRows ?? questions;
    const dirty = sourceRows.filter(
      q => q.marks !== q.ocrMarks || q.answer !== q.ocrAnswer
    );

    if (dirty.length === 0) {
      // No answer/marks changes — but a manual Total override on its own is still
      // a change worth saving (otherwise "edit only the Total → Save" says nothing
      // to save and the value is lost).
      if (manualTotal) {
        await saveManualTotal(Number(total) || 0);
        setIsSaved(true);
        setToast({ message: "Total saved", type: "success" });
      } else {
        // Grid mark edits save cell-by-cell as they're committed, so by the
        // time the operator clicks Save there is often nothing left to write —
        // that's success, not an error.
        setIsSaved(true);
        setToast({ message: "All changes already saved — nothing pending.", type: "success" });
      }
      return;
    }

    try {
      setSaving(true);

      // PATCH each dirty question
      await Promise.all(
        dirty.map(q =>
          patchBBox(
            batchId,
            studentId,
            q.qNo,
            {
              ocr_text: q.answer,
              marks: q.marks,
              max_marks: q.maxMarks,
              verified: true,
            }
          )
        )
      );

      // Total Marks: the mark patches above recomputed total_marks_obtained
      // server-side — re-sync the display from there (#537) — UNLESS a manual
      // override is active, in which case re-apply the grader's value last
      // (last write wins); editing a mark clears the override (updateQuestion),
      // so it only survives when the grader deliberately set it.
      if (manualTotal) {
        await saveManualTotal(Number(total) || 0);
      } else {
        await refreshTotalFromServer(batchId, studentId);
      }

      // Post-await: only stamp this student's display state if they are still
      // the loaded session (the operator may have switched mid-save).
      if (sessionRef.current?.studentId === studentId) setIsSaved(true);
      setSavedIds(prev => new Set(prev).add(studentId));
      setToast({ message: "Student saved successfully", type: "success" });

    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to save",
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  }, [session, selectedStudentId, questions, savedIds, manualTotal, total]);

    // ── Ctrl/Cmd + Enter → Save ──────────────────────────────
// #S9: previously committed open drafts via `setQuestions(prev => ...)` then
// scheduled `setTimeout(() => handleSave(), 0)`. That re-render produces a
// new `handleSave` closure over the committed rows, but the already-queued
// timeout callback still holds the OLD `handleSave` closure — which reads
// pre-commit `questions` — so the just-typed value was silently dropped from
// the save. Fixed by computing the committed rows from questionsRef (always
// current) and passing them into handleSave explicitly, synchronously — no
// timeout, no dependence on a re-render landing first.
useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      const committed = questionsRef.current.map(q =>
        q.answerEditing ? { ...q, answer: q.answerDraft, answerEditing: false } : q
      );
      setQuestions(committed);
      handleSave(committed);
    }
  };
  window.addEventListener("keydown", onKey);
  return () => window.removeEventListener("keydown", onKey);
}, [handleSave]);

  // Pull a zip of every stored bbox crop for the loaded student. Uses the
  // beaver-api endpoint /bboxes/download which lazy-builds any crops that
  // were never persisted. On success, derive the filename from the
  // Content-Disposition header and trigger a browser download.
  const handleDownloadCrops = async (): Promise<void> => {
    if (!matchedBatch || !selectedStudentId || downloadingCrops) return;
    setDownloadingCrops(true);
    try {
      const token = getToken();
      const res = await fetch(
        `${BASE}/api/batches/${matchedBatch.batch_id}/students/${selectedStudentId}/bboxes/download`,
        {
          method: "GET",
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        }
      );

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error ?? `Download failed: ${res.status}`);
      }

      const skipped = res.headers.get("X-Skipped-Bboxes");

      // Derive filename: prefer Content-Disposition, else fall back.
      let filename = `student_${selectedStudentId}_bboxes.zip`;
      const cd = res.headers.get("Content-Disposition") ?? "";
      const match = cd.match(/filename\s*=\s*"?([^";]+)"?/i);
      if (match?.[1]) filename = match[1];

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Defer revoke a tick so Safari/Firefox have time to start the download.
      setTimeout(() => URL.revokeObjectURL(url), 1000);

      if (skipped) {
        setToast({
          message: `Downloaded with ${skipped.split(",").length} skipped question(s).`,
          type: "success",
        });
      } else {
        setToast({ message: "Crops downloaded", type: "success" });
      }
    } catch (err) {
      setToast({
        message: err instanceof Error ? err.message : "Failed to download crops",
        type: "error",
      });
    } finally {
      setDownloadingCrops(false);
    }
  };

  const handleRunOCR = async (
    image: string,
    model: string
  ): Promise<string> => {
    const res = await fetch("/api/ocr", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        image,
        model,
        subject: matchedBatch?.subject,
      }),
    });

    if (!res.ok) {
      throw new Error("OCR failed");
    }

    const data = await res.json();

    return data.text ?? "";
  };

  // ── Derived ───────────────────────────────────────────────
  // Returns the integer base key for a sub-question only when it actually
  // shares its bbox with the base (sharedBaseBbox=true) or is an OR pair
  // (isOptional=true). Plain decimal-numbered questions with their own bbox
  // are NOT deduped so their marks are counted independently.
  const getDedupBase = (q: QuestionRowData): string | null => {
    if (!q.sharedBaseBbox && !q.isOptional) return null;
    const m = q.qNo.match(/^(.+)\.(\d+)$/);
    return m ? String(Math.floor(parseFloat(m[1]))) : null;
  };

  // Same dedup rule as ocrTotal below, factored out so saveMarks/handleSave
  // can recompute the Total Marks widget from the current array instead of
  // leaving it frozen at whatever total_marks_obtained was at page load.
  // `field` picks which value to sum: "ocrMarks" (permanent, never mutated —
  // for the stable OCR-reference total) or "marks" (current/corrected — for
  // the actual Total Marks value, which must keep tracking corrections even
  // though ocrMarks itself never changes).
  const computeMarksTotal = (qs: QuestionRowData[], field: "marks" | "ocrMarks"): number => {
    const groupMarks = new Map<string, number>();
    let sum = 0;
    for (const q of qs) {
      const base = getDedupBase(q);
      if (base) {
        groupMarks.set(base, Math.max(groupMarks.get(base) ?? 0, q[field]));
      } else {
        sum += q[field];
      }
    }
    for (const v of groupMarks.values()) sum += v;
    return sum;
  };

  // ocrTotal: for shared/OR groups take the MAX marks obtained; sum all others directly.
  const ocrTotal = computeMarksTotal(questions, "ocrMarks");

  // NOTE (#537): the old "live Total" effect that re-stamped
  // computeMarksTotal(questions) on every questions change is gone. The client
  // sum disagrees with the server's OR/sub-part grouping on some papers, and
  // the effect kept overwriting the correct server value with it. The Total now
  // shows server truth: loaded with the student, re-synced after every marks
  // write (refreshTotalFromServer), and set explicitly by Reset All below.

//  const ocrTotal = questions.reduce((sum, q) => sum + q.ocrMarks, 0);
  const dirtyCount = questions.filter(
    q => q.marks !== q.ocrMarks || q.answer !== q.ocrAnswer
  ).length;

  // ── Sidebar students ──────────────────────────────────────
  const sidebarStudents = students.map(s => ({
    id: s.student_id,
    studentName: s.student_name,
    studentId: s.roll_number || s.student_id,
    marksObtained: Number(s.total_marks_obtained) || 0,
    totalMarks: Number(s.question_paper_max_marks) || Number(s.total_max_marks) || 0,
    status: savedIds.has(s.student_id)
      ? "done" as const
      : "undone" as const,
  }));

  // ── No batch selected ─────────────────────────────────────
  if (!matchedBatch) {
    return (
      <div className="flex h-screen items-center justify-center text-gray-400">
        Use the filter above to select a batch and student.
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden">

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      {/* Review framework (#97): history drawer. Mounts only with a unit loaded. */}
      {matchedBatch?.batch_id && selectedStudentId && (
        <ReviewHistoryPanel
          batchId={matchedBatch.batch_id}
          studentId={selectedStudentId}
          open={showHistory}
          onClose={() => setShowHistory(false)}
        />
      )}

      {/* ── Left sidebar ── */}
      <LeftSidebar
        students={sidebarStudents}
        selectedId={selectedStudentId ?? undefined}
        onSelect={(id) => {
          if (id !== selectedStudentId) {
            setIsSaved(false);
            setSelectedStudent(id as string);
            // The declarative load effect (keyed on selection) loads this student;
            // no manual open call — that was the #199 switch race.
          }
        }}
      />

      {/* ── Right panel ── */}
      <div className="flex-1 flex min-h-0 overflow-hidden bg-gray-50">
        {selectedStudent && questions.length > 0 ? (
          <OCRExtractionProvider onFillOCR={handleFillOCR} onRunOCR={handleRunOCR}>


            {/* PDF panel — stays exactly the same, now inside provider */}
            {
              <div className={`w-1/2 flex flex-col min-h-0 border-l border-gray-200 ${showPdf ? "" : "hidden"}`}>
                <PdfPanel
                  studentName={selectedStudent.student_name}
                  scans={scans}
                  loading={loadingPages}
                />
              </div>
            }

            {/* Questions column */}
            <div className={`flex flex-col min-h-0 min-w-0 transition-all duration-200 ${showPdf ? "w-1/2 border-r border-gray-200" : "flex-1"
              }`}>

              {/* Header — stays exactly the same */}
              <div className="">
                <StudentHeader
                  studentName={selectedStudent.student_name}
                  studentId={selectedStudent.roll_number || selectedStudent.student_id}
                  total={total}
                  totalMax={Number(selectedStudent.question_paper_max_marks) || Number(selectedStudent.total_max_marks) || 0}
                  ocrTotal={ocrTotal}
                  dirtyCount={dirtyCount}
                  isSaved={isSaved}
                  onTotalChange={(val) => { setTotal(val); setManualTotal(true); setIsSaved(false); }}
                  onTotalCommit={(val) => { const v = Math.max(0, Number(val) || 0); setTotal(v); setManualTotal(true); saveManualTotal(v); }}
                  teacherError={teacherError}
                  onTeacherErrorChange={handleTeacherErrorChange}
                  onSave={handleSave}
                  onFileClick={() => setShowPdf(v => !v)}
                  isPdfOpen={showPdf}
                  latexPreview={latexPreview}
                  onLatexToggle={() => setLatexPreview(v => !v)}
                  chemPreview={chemPreview}
                  onChemToggle={isChemistry ? () => setChemPreview(v => !v) : undefined}
                  ocrVerifiedCount={questions.filter(q => q.ocrVerified).length}
                  totalQuestions={questions.length}
                  onVerifyAllOcr={handleVerifyAllOcr}
                  modelOptions={EXTRACT_MODELS}
                  selectedModel={extractModel}
                  onModelChange={handleModelChange}
                  onDownloadCrops={handleDownloadCrops}
                  downloadingCrops={downloadingCrops}
                  onReviewHistory={() => setShowHistory(true)}
                  reviewGate={
                    matchedBatch?.batch_id && selectedStudentId ? (
                      <div className="flex items-center gap-2">
                        <ReviewGateControl
                          batchId={matchedBatch.batch_id}
                          studentId={selectedStudentId}
                          stage="marks_verification"
                        />
                        {/* Same Send-to-Manual-Repair button as Answer Chunking. */}
                        <ManualRepairButton
                          batchId={matchedBatch.batch_id}
                          studentId={selectedStudentId}
                          onError={(message) => setToast({ message, type: "error" })}
                        />
                      </div>
                    ) : undefined
                  }
                />
              </div>

              {/* Questions list — REPLACE the old map with QuestionsList */}
              <div className="flex-1 overflow-y-auto min-h-0 px-8 py-6 space-y-3">
                <QuestionsGrid
                  key={selectedStudentId}
                  questions={questions}
                  paperMaxMarks={Number(selectedStudent?.question_paper_max_marks) || null}
                  onStep={handleStepMarks}
                  onMarksCommitValue={handleGridMarksCommitValue}
                  onActivity={sectionTimer.onActivity}
                  onApproveAll={handleApproveAll}
                  onResetAll={handleResetEdits}
                  viewMode={gridViewMode}
                  onToggleView={() => setGridViewMode(v => v === "grid" ? "list" : "grid")}
                />
                {gridViewMode === "list" && (() => {
                  const lowConfCount = questions.filter(
                    q => q.ocrConfidence != null && q.ocrConfidence < HIGH_CONF_THRESHOLD,
                  ).length;
                  return (
                    <div className="flex items-center justify-end">
                      <button
                        onClick={() => setLowConfOnly(v => !v)}
                        title={`Show only answers GLM-OCR extracted below ${Math.round(HIGH_CONF_THRESHOLD * 100)}% confidence`}
                        className={`flex items-center gap-1.5 h-7 px-2.5 text-[11px] font-semibold rounded-lg border transition ${
                          lowConfOnly
                            ? "bg-red-600 text-white border-red-600"
                            : "bg-white text-gray-500 border-gray-200 hover:bg-gray-100"
                        }`}
                      >
                        Low confidence only{lowConfCount > 0 ? ` (${lowConfCount})` : ""}
                      </button>
                    </div>
                  );
                })()}
                <QuestionsList
                  questions={
                    gridViewMode === "list"
                      ? (lowConfOnly
                          ? questions.filter(q => q.ocrConfidence != null && q.ocrConfidence < HIGH_CONF_THRESHOLD)
                          : questions)
                      : []
                  }
                  latexPreview={latexPreview}
                  chemPreview={chemPreview}
                  isChemistry={isChemistry}
                  markRefs={markRefs}
                  onActivity={sectionTimer.onActivity}
                  updateQuestion={updateQuestion}
                  saveAnswer={saveAnswer}
                  cancelAnswer={cancelAnswer}
                  saveMarks={saveMarks}
                  saveMaxMarks={saveMaxMarks}
                  saveOcrVerified={saveOcrVerified}
                  onDirectExtract={handleDirectExtract}
                  extractingQ={extractingQ}
                  onRecognizeStructure={handleRecognizeStructure}
                  recognizingQ={recognizingQ}
                  onMcqChange={saveMcqNormalized}
                />
              </div>

              {/* Bottom bar — stays exactly the same */}
              <div className="shrink-0">
                <BottomBar
                  dirtyCount={dirtyCount}
                  ocrTotal={ocrTotal}
                  correctedTotal={total}
                  onSave={handleSave}
                  saveLabel={saving ? "Saving..." : "Save Student"}
                />
              </div>

            </div>

            {/* OCR Drawer — ADD THIS */}
            <OCRDrawer latexPreview={latexPreview} />

          </OCRExtractionProvider>
        ) : loadingPages ? (
          <div className="flex flex-1 items-center justify-center text-gray-400">
            Loading student data...
          </div>
        ) : (
          <div className="flex flex-1 items-center justify-center text-gray-400">
            Select a student from the filter above to start reviewing.
          </div>
        )}
      </div>
    </div>
  );
}







function QuestionsList({
  questions,
  latexPreview,
  chemPreview,
  isChemistry,
  markRefs,
  onActivity,
  updateQuestion,
  saveAnswer,
  cancelAnswer,
  saveMarks,
  saveMaxMarks,
  saveOcrVerified,
  onDirectExtract,
  extractingQ,
  onRecognizeStructure,
  recognizingQ,
  onMcqChange,
}: {
  questions: QuestionRowData[];
  latexPreview: boolean;
  chemPreview: boolean;
  isChemistry: boolean;
  markRefs: React.MutableRefObject<(HTMLInputElement | null)[]>;
  onActivity: () => void;
  updateQuestion: (qNo: string, patch: Partial<QuestionRowData>) => void;
  saveAnswer: (qNo: string) => void;
  cancelAnswer: (qNo: string) => void;
  saveMarks: (qNo: string) => void;
  saveMaxMarks: (qNo: string) => void;
  saveOcrVerified: (qNo: string, ocrVerified: boolean) => void;
  /** Direct extract path: POSTs to backend, fills answer immediately. When
   *  provided, replaces the older drawer-based startExtraction flow. */
  onDirectExtract?: (qNo: string) => void;
  /** Which row currently has an in-flight extract request, for spinners. */
  extractingQ?: string | null;
  /** Chemistry: trigger DECIMER recognition for one answer + the in-flight row. */
  onRecognizeStructure?: (qNo: string) => void;
  recognizingQ?: string | null;
  /** MCQ: save the operator-selected normalized choice for a question. */
  onMcqChange?: (qNo: string, value: string | null) => void;
}) {
  const { startExtraction, activeQuestionId, loading } = useOCRExtraction();
  // Prefer the direct path when wired. Falls back to the legacy drawer flow.
  const extractHandler = onDirectExtract ?? startExtraction;
  const activeExtractId = onDirectExtract ? extractingQ ?? null : activeQuestionId;
  const extractLoading  = onDirectExtract ? !!extractingQ : loading;

  return (
    <>
      {questions.map((q, idx) => {
        const prevQ = idx > 0 ? questions[idx - 1] : null;
        const isAlternate =
          q.isOptional && prevQ && (
            prevQ.qNo.split("_OR_")[0] === q.qNo.split("_OR_")[0] ||
            (Math.floor(parseFloat(prevQ.qNo.replace(/^q/i, ""))) === Math.floor(parseFloat(q.qNo.replace(/^q/i, ""))) &&
             (prevQ.isOptional || prevQ.maxMarks === q.maxMarks))
          );

        return (
          <React.Fragment key={`${q.qNo}-${idx}`}>
            {isAlternate && (
              <div className="flex items-center justify-center my-1 relative">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-300"></div>
                </div>
                <div className="relative flex justify-center">
                  <span className="bg-gray-50 px-3 text-xs font-bold text-black-400">
                    OR
                  </span>
                </div>
              </div>
            )}
            <QuestionRow
              question={q}
              latexPreview={latexPreview}
              chemPreview={chemPreview}
              markInputRef={(el) => { markRefs.current[idx] = el; }}
              onActivity={onActivity}
              onChange={(patch) => {
                updateQuestion(q.qNo, patch);
                if (patch.ocrVerified !== undefined) {
                  saveOcrVerified(q.qNo, patch.ocrVerified);
                }
              }}
              showVerifiedCheckbox={true}
              onSaveAnswer={() => saveAnswer(q.qNo)}
              onCancelAnswer={() => cancelAnswer(q.qNo)}
              onReset={() => { }}
              onMarkEnter={() => markRefs.current[idx + 1]?.focus()}
              onExtract={() => extractHandler(q.qNo)}
              activeExtractId={activeExtractId}
              extractLoading={extractLoading}
              onSaveMarks={() => saveMarks(q.qNo)}
              onSaveMaxMarks={() => saveMaxMarks(q.qNo)}
              showStructureControl={isChemistry}
              onRecognizeStructure={() => onRecognizeStructure?.(q.qNo)}
              recognizeLoading={recognizingQ === q.qNo}
              onMcqChange={(value) => onMcqChange?.(q.qNo, value)}
            />
          </React.Fragment>
        );
      })}
    </>
  );
}