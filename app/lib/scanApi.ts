// Client-side helpers for the Scanning screen (/scans — one consolidated
// screen, spec rev 2). All piper traffic goes through beaver's own proxy
// routes under /api/scans/* — the piper service token never reaches the
// browser. Spec: cld_beaver_scan_screens_spec.md.

// ── Piper shapes (mirrors piper src/schemas.ts + route serializers) ────────

import { getAuthToken as getToken } from "@/app/lib/auth";

export type DispatchStatus = "open" | "closed" | "sorted";
export type PageDecodeStatus = "pending" | "decoded" | "no_qr" | "decode_error";
export type DocumentKind = "answer_paper" | "question_paper" | "answer_key" | "blueprint";

export interface DispatchCounters {
    pages_total: number;
    pages_pending_decode: number;
    pages_with_qr: number;
    pages_decode_error: number;
    pages_sorted: number;
    documents_minted: number;
}

export interface Dispatch {
    dispatch_id: string;
    laptop_id: string;
    name: string;
    status: DispatchStatus;
    // The exam every booklet in this dispatch is filed under (bound when the
    // dispatch is opened; the QR's own exam segment is ignored). null on
    // dispatches opened before piper required an exam.
    exam_type_id: number | null;
    exam_type_name: string | null;
    sort_paused: boolean;
    opened_at: string;
    closed_at: string | null;
    updated_at: string;
    counters: DispatchCounters;
}

export interface DispatchPage {
    page_id: string;
    dispatch_id: string;
    file_name: string;
    stream: string | null;
    page_no: number | null;
    content_hash: string;
    file_size_bytes: number | string | null;
    file_mtime: string | null;
    observed_at: string | null;
    r2_key_original: string;
    r2_key_downscaled: string;
    width: number | null;
    height: number | null;
    decode_status: PageDecodeStatus;
    decode_payload: string | null;
    decode_detail: string | null;
    flags: string[];
    document_id: string | null;
    created_at: string;
    updated_at: string;
}

// The LOAM1 cover claim (piper answerPaperMetadataSchema).
export interface AnswerPaperClaim {
    version: "LOAM1";
    school_id: string;
    exam_type: string;
    academic_year: string;
    subject_code: string;
    subject: string;
    set_name: string | null;
    grade: string;
    section: string;
    roll_number: string;
    admission_no: string;
    student_name: string;
}

export interface ScannedDocument {
    document_id: string;
    kind: DocumentKind | null;
    id_origin: "client" | "server";
    claimed_metadata: Partial<AnswerPaperClaim> | Record<string, unknown> | null;
    metadata_origin: "qr" | "manual" | null;
    rescan_of: string | null;
    storage_status: "receiving" | "stored";
    created_at: string;
    updated_at: string;
}

export interface ScannedPage {
    document_id: string;
    page_number: number;
    r2_key_original: string;
    r2_key_downscaled: string;
    width: number | null;
    height: number | null;
    created_at: string;
}

export interface DocumentEvent {
    id: number | string;
    document_id: string;
    event_kind: string;
    payload: Record<string, unknown> | null;
    actor: string | null;
    created_at: string;
}

export interface DocumentProcessing {
    document_id: string;
    stage: string;
    detail: string | null;
    updated_at: string;
}

export interface DocumentDetail extends ScannedDocument {
    processing: DocumentProcessing | null;
    pages: ScannedPage[];
    events: DocumentEvent[];
}

export interface DispatchListResponse {
    dispatches: Dispatch[];
    // "piper" once piper grows a real list endpoint; until then the proxy
    // derives the list from recent documents' mint events (known gap).
    source: "piper" | "derived-from-documents";
}

// ── fetch plumbing ──────────────────────────────────────────────────────────

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
    const res = await fetch(url, {
        ...init,
        headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
    });
    const text = await res.text();
    let body: unknown = null;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = { message: text };
    }
    if (!res.ok) {
        const msg =
            (body as { message?: string; error?: string })?.message ??
            (body as { message?: string; error?: string })?.error ??
            `HTTP ${res.status}`;
        throw Object.assign(new Error(msg), { status: res.status, body });
    }
    return body as T;
}

// ── /api/scans/* calls ──────────────────────────────────────────────────────

export const listDispatches = () =>
    jsonFetch<DispatchListResponse>(`/api/scans/dispatches`);

export const getDispatch = (id: string) =>
    jsonFetch<Dispatch>(`/api/scans/dispatches/${encodeURIComponent(id)}`);

export const getDispatchPages = (id: string) =>
    jsonFetch<{ dispatch_id: string; pages: DispatchPage[] }>(
        `/api/scans/dispatches/${encodeURIComponent(id)}/pages`,
    );

export type SortAction = "pause" | "resume" | "start";
export const sortControl = (id: string, action: SortAction) =>
    jsonFetch<Dispatch | { dispatch_id: string; workflow_id: string }>(
        `/api/scans/dispatches/${encodeURIComponent(id)}/sort/${action}`,
        { method: "POST" },
    );

export interface ListDocumentsOptions {
    kind?: DocumentKind | "unassociated";
    dispatch_id?: string;
    limit?: number; // piper default 200, max 1000
    offset?: number;
}

export const listDocuments = (opts: ListDocumentsOptions = {}) => {
    const qs = new URLSearchParams();
    if (opts.kind) qs.set("kind", opts.kind);
    if (opts.dispatch_id) qs.set("dispatch_id", opts.dispatch_id);
    if (opts.limit !== undefined) qs.set("limit", String(opts.limit));
    if (opts.offset !== undefined) qs.set("offset", String(opts.offset));
    const s = qs.toString();
    return jsonFetch<{ documents: ScannedDocument[]; total?: number }>(
        `/api/scans/documents${s ? `?${s}` : ""}`,
    );
};

export const getDocument = (id: string) =>
    jsonFetch<DocumentDetail>(`/api/scans/documents/${encodeURIComponent(id)}`);

export const classifyDocument = (id: string, claim: AnswerPaperClaim) =>
    jsonFetch<DocumentDetail>(`/api/scans/documents/${encodeURIComponent(id)}/classify`, {
        method: "POST",
        body: JSON.stringify({ kind: "answer_paper", claimed_metadata: claim }),
    });

export const patchDocumentMetadata = (id: string, patch: Partial<AnswerPaperClaim>) =>
    jsonFetch<DocumentDetail>(`/api/scans/documents/${encodeURIComponent(id)}/metadata`, {
        method: "PATCH",
        body: JSON.stringify(patch),
    });

export const sendToProcessing = (id: string) =>
    jsonFetch<{ document_id: string; workflow_id: string; stage: string }>(
        `/api/scans/documents/${encodeURIComponent(id)}/workflow`,
        { method: "POST" },
    );

// Page images stream through /api/scans/images (which reads SCAN_IMAGE_BASE
// server-side — piper has no page-image endpoint yet). The route 503s when
// unconfigured; <img onError> shows the placeholder.
export const pageImageUrl = (r2Key: string): string =>
    `/api/scans/images?key=${encodeURIComponent(r2Key)}`;

// ── documents scoped to a dispatch ──────────────────────────────────────────
// The linkage lives on dispatch_pages.document_id. We join the dispatch's
// page list against the documents list client-side. Piper's GET /documents
// now paginates (limit ≤ 1000, dispatch_id filter available); the screen
// fetches up to 1000, so a doc appears with detail: null (id + page count
// only) only past that window.

export interface DispatchDocument {
    document_id: string;
    detail: ScannedDocument | null;
    page_count: number;
    // union of sorter flags on this doc's pages (e.g. duplicate_claim_in_dispatch)
    page_flags: string[];
    first_page_key: string | null; // earliest page's downscaled key (cover if sorter cut on a cover)
    created_at: string; // earliest page created_at (fallback when detail is null)
}

export function joinDispatchDocuments(
    pages: DispatchPage[],
    documents: ScannedDocument[],
): DispatchDocument[] {
    const byDoc = new Map<string, DispatchPage[]>();
    for (const p of pages) {
        if (!p.document_id) continue;
        const list = byDoc.get(p.document_id) ?? [];
        list.push(p);
        byDoc.set(p.document_id, list);
    }
    const docIndex = new Map(documents.map((d) => [d.document_id, d]));
    const out: DispatchDocument[] = [];
    for (const [docId, docPages] of byDoc) {
        const detail = docIndex.get(docId) ?? null;
        const flags = [...new Set(docPages.flatMap((p) => p.flags ?? []))];
        const sorted = [...docPages].sort((a, b) =>
            (a.stream ?? "") === (b.stream ?? "")
                ? (a.page_no ?? 0) - (b.page_no ?? 0)
                : (a.stream ?? "").localeCompare(b.stream ?? ""),
        );
        out.push({
            document_id: docId,
            detail,
            page_count: docPages.length,
            page_flags: flags,
            first_page_key: sorted[0]?.r2_key_downscaled ?? null,
            created_at: detail?.created_at ?? sorted[0]?.created_at ?? "",
        });
    }
    out.sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    return out;
}

// ── claim helpers ───────────────────────────────────────────────────────────

export const CLAIM_REQUIRED_FIELDS: (keyof AnswerPaperClaim)[] = [
    "school_id",
    "exam_type",
    "academic_year",
    "subject_code",
    "subject",
    "grade",
    "section",
    "roll_number",
    "admission_no",
    "student_name",
];

export function claimMissingFields(claim: ScannedDocument["claimed_metadata"]): string[] {
    if (!claim || typeof claim !== "object") return [...CLAIM_REQUIRED_FIELDS];
    const c = claim as Partial<AnswerPaperClaim>;
    return CLAIM_REQUIRED_FIELDS.filter((f) => {
        const v = c[f];
        return typeof v !== "string" || v.trim() === "";
    });
}

export const isClaimComplete = (claim: ScannedDocument["claimed_metadata"]) =>
    claimMissingFields(claim).length === 0;

// One-cell claim summary: "12-C · Physics · UT1 · roll 23 — Aarav S."
export function claimSummary(claim: ScannedDocument["claimed_metadata"]): string {
    if (!claim || typeof claim !== "object") return "—";
    const c = claim as Partial<AnswerPaperClaim>;
    const gs = c.grade && c.section ? `${c.grade}-${c.section}` : (c.grade ?? c.section ?? "?");
    const head = [gs, c.subject ?? c.subject_code, c.exam_type, c.roll_number ? `roll ${c.roll_number}` : null]
        .filter(Boolean)
        .join(" · ");
    return c.student_name ? `${head} — ${c.student_name}` : head || "—";
}

// Can this document be sent to processing? Mirrors piper's dispatchWorkflow
// guards so the button can explain itself instead of just failing.
export function sendBlockReason(doc: DocumentDetail): string | null {
    if (doc.kind === null) return "Unassociated — no claim yet. Resolve the claim first.";
    if (doc.kind !== "answer_paper") return `Kind '${doc.kind}' has no processing workflow yet.`;
    if (doc.storage_status !== "stored") return `Storage status is '${doc.storage_status}', not 'stored'.`;
    const missing = claimMissingFields(doc.claimed_metadata);
    if (missing.length > 0) return `Claim incomplete: missing ${missing.join(", ")}.`;
    if (doc.processing && doc.processing.stage !== "failed")
        return `Already in processing (stage '${doc.processing.stage}').`;
    return null;
}

// ── roster check (v0: read-only) ────────────────────────────────────────────
// Note: app/lib/registryApi.ts is the app-USER registry (ops accounts, /api/
// registry/*), not the student roster — the roster the needs-attention check
// wants lives on beaver-api's /api/students/list (same endpoint the Students
// screens read). Registry being down degrades gracefully: rosterCheck is
// simply skipped and the UI shows a notice.

const BEAVER_BASE = process.env.NEXT_PUBLIC_BEAVER_API_URL ?? "http://localhost:4000";

export interface RosterStudent {
    student_id: string;
    student_name: string;
    roll_number: string;
    grade: string;
    section: string;
    admission_no: string | null;
}


export async function fetchRoster(): Promise<RosterStudent[]> {
    const token = getToken();
    const res = await fetch(`${BEAVER_BASE}/api/students/list`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`Roster fetch failed (HTTP ${res.status})`);
    const data = await res.json();
    return (data.students ?? []) as RosterStudent[];
}

const normRoll = (r: string | null | undefined) => (r ?? "").trim().replace(/^0+(?=\d)/, "");
const normName = (n: string | null | undefined) =>
    (n ?? "").trim().toUpperCase().replace(/\s+/g, " ");

export type RosterOutcome =
    | { status: "ok"; match: RosterStudent }
    | { status: "name_mismatch"; match: RosterStudent }
    | { status: "roll_not_found"; candidates: RosterStudent[] }
    | { status: "no_claim" };

// Compare a claim against the roster for its grade-section. Roll number is
// the key (admission numbers are NOT unique — never key on them).
export function rosterCheck(
    claim: ScannedDocument["claimed_metadata"],
    roster: RosterStudent[],
): RosterOutcome {
    if (!claim || typeof claim !== "object") return { status: "no_claim" };
    const c = claim as Partial<AnswerPaperClaim>;
    if (!c.grade || !c.section || !c.roll_number) return { status: "no_claim" };
    const inSection = roster.filter(
        (s) =>
            normRoll(s.grade) === normRoll(c.grade) &&
            (s.section ?? "").trim().toUpperCase() === c.section!.trim().toUpperCase(),
    );
    const byRoll = inSection.find((s) => normRoll(s.roll_number) === normRoll(c.roll_number));
    if (!byRoll) {
        // Offer nearest candidates by name so the human can eyeball it.
        const nameMatches = inSection.filter(
            (s) => normName(s.student_name) === normName(c.student_name),
        );
        return { status: "roll_not_found", candidates: nameMatches.slice(0, 3) };
    }
    if (normName(byRoll.student_name) !== normName(c.student_name)) {
        return { status: "name_mismatch", match: byRoll };
    }
    return { status: "ok", match: byRoll };
}

// ── needs-attention rules (spec §Needs attention, v0) ───────────────────────

export type AttentionReason =
    | { rule: "unassociated"; label: string }
    | { rule: "claim_incomplete"; label: string; missing: string[] }
    | { rule: "duplicate_claim"; label: string; other_document_ids: string[] }
    | { rule: "roster_roll_not_found"; label: string; candidates: RosterStudent[] }
    | { rule: "roster_name_mismatch"; label: string; match: RosterStudent };

const dupKey = (c: Partial<AnswerPaperClaim>): string | null => {
    if (!c.grade || !c.section || !c.subject_code || !c.exam_type || !c.roll_number) return null;
    return [
        normRoll(c.grade),
        c.section.trim().toUpperCase(),
        c.subject_code.trim().toUpperCase(),
        c.exam_type.trim().toUpperCase(),
        normRoll(c.roll_number),
    ].join("|");
};

// roster === null means the roster was unavailable → roster rules are skipped
// (the caller shows a notice).
export function computeAttention(
    docs: DispatchDocument[],
    roster: RosterStudent[] | null,
): Map<string, AttentionReason[]> {
    // duplicate detection across the dispatch first
    const byClaimKey = new Map<string, string[]>();
    for (const d of docs) {
        if (d.detail?.kind !== "answer_paper") continue;
        const key = dupKey((d.detail.claimed_metadata ?? {}) as Partial<AnswerPaperClaim>);
        if (!key) continue;
        byClaimKey.set(key, [...(byClaimKey.get(key) ?? []), d.document_id]);
    }

    const out = new Map<string, AttentionReason[]>();
    for (const d of docs) {
        const reasons: AttentionReason[] = [];
        const doc = d.detail;
        if (doc === null) {
            // outside the recent-documents window; nothing to judge
            out.set(d.document_id, reasons);
            continue;
        }
        if (doc.kind === null) {
            reasons.push({ rule: "unassociated", label: "No cover found" });
        } else if (doc.kind === "answer_paper") {
            const missing = claimMissingFields(doc.claimed_metadata);
            if (missing.length > 0) {
                reasons.push({
                    rule: "claim_incomplete",
                    label: `Claim incomplete (${missing.join(", ")})`,
                    missing,
                });
            }
            const key = dupKey((doc.claimed_metadata ?? {}) as Partial<AnswerPaperClaim>);
            const twins = key ? (byClaimKey.get(key) ?? []) : [];
            if (twins.length > 1 || d.page_flags.includes("duplicate_claim_in_dispatch")) {
                reasons.push({
                    rule: "duplicate_claim",
                    label: "Duplicate claim in dispatch",
                    other_document_ids: twins.filter((id) => id !== d.document_id),
                });
            }
            if (roster && missing.length === 0) {
                const rc = rosterCheck(doc.claimed_metadata, roster);
                if (rc.status === "roll_not_found") {
                    reasons.push({
                        rule: "roster_roll_not_found",
                        label: "Roll number not on roster",
                        candidates: rc.candidates,
                    });
                } else if (rc.status === "name_mismatch") {
                    reasons.push({
                        rule: "roster_name_mismatch",
                        label: `Name differs from roster (${rc.match.student_name})`,
                        match: rc.match,
                    });
                }
            }
        }
        out.set(d.document_id, reasons);
    }
    return out;
}

// Dispatch id + per-document sorter flags live in the mint event payload.
export function mintEventInfo(doc: DocumentDetail): {
    dispatch_id: string | null;
    flags: string[];
    cover_page_id: string | null;
} {
    const ev = doc.events.find((e) => e.event_kind.startsWith("sorted_from_dispatch"));
    const payload = (ev?.payload ?? {}) as {
        dispatch_id?: string;
        flags?: string[];
        cover_page_id?: string | null;
    };
    return {
        dispatch_id: payload.dispatch_id ?? null,
        flags: payload.flags ?? [],
        cover_page_id: payload.cover_page_id ?? null,
    };
}

export function errMsg(e: unknown): string {
    return e instanceof Error ? e.message : "Something went wrong";
}
