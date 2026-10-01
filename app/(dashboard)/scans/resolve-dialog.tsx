"use client";

// Resolution dialog (spec §Resolution dialog): opens from a Needs-attention
// row, or from any Documents-tab row via its Edit-claim affordance (the
// reason banner simply doesn't render for clean docs).
// Left: the actual scan, zoomable/pannable, paging through the document.
// Right: reason banner, editable claim fields, roster candidates, actions.
// prev/next walks the needs-attention queue without closing — resolution is
// a sequential job.
//
// Keyboard path: first empty claim field is autofocused on open; Enter saves
// the claim (and advances); ArrowLeft/ArrowRight (or [ / ]) navigate the
// queue when focus is not in an input; Esc closes.

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Input,
  Label,
  RadioGroup,
  RadioGroupItem,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Spinner,
  cn,
} from "@student-ds/ui";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Maximize,
  MoreHorizontal,
  Send,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type {
  AnswerPaperClaim,
  AttentionReason,
  DispatchDocument,
  DocumentDetail,
  RosterStudent,
} from "@/app/lib/scanApi";
import {
  CLAIM_REQUIRED_FIELDS,
  classifyDocument,
  errMsg,
  getDocument,
  patchDocumentMetadata,
  sendBlockReason,
  sendToProcessing,
} from "@/app/lib/scanApi";
import { DisabledWithTooltip, PageImage, shortId } from "./components";

// ── claim field options mined from the dispatch's existing claims ───────────

export interface ClaimOptions {
  gradeSections: { grade: string; section: string }[];
  subjects: { code: string; name: string }[];
  exams: string[];
  schoolIds: string[];
  academicYears: string[];
}

export function buildClaimOptions(
  docs: DispatchDocument[],
  roster: RosterStudent[] | null,
): ClaimOptions {
  const gs = new Map<string, { grade: string; section: string }>();
  const subjects = new Map<string, string>();
  const exams = new Set<string>();
  const schools = new Set<string>();
  const years = new Set<string>();
  for (const d of docs) {
    const c = (d.detail?.claimed_metadata ?? null) as Partial<AnswerPaperClaim> | null;
    if (!c) continue;
    if (c.grade && c.section) gs.set(`${c.grade}|${c.section}`, { grade: c.grade, section: c.section });
    if (c.subject_code && c.subject) subjects.set(c.subject_code, c.subject);
    if (c.exam_type) exams.add(c.exam_type);
    if (c.school_id) schools.add(c.school_id);
    if (c.academic_year) years.add(c.academic_year);
  }
  for (const s of roster ?? []) {
    if (s.grade && s.section) gs.set(`${s.grade}|${s.section}`, { grade: s.grade, section: s.section });
  }
  return {
    gradeSections: [...gs.values()].sort((a, b) =>
      `${a.grade}-${a.section}`.localeCompare(`${b.grade}-${b.section}`, undefined, { numeric: true }),
    ),
    subjects: [...subjects.entries()].map(([code, name]) => ({ code, name })),
    exams: [...exams],
    schoolIds: [...schools],
    academicYears: [...years],
  };
}

const mostCommon = (vals: (string | undefined)[]): string | undefined => {
  const counts = new Map<string, number>();
  for (const v of vals) if (v) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};

// ── zoom/pan image viewer (DS gap: hand-rolled, CSS transform + wheel/drag) ─

function ScanViewer({ detail }: { detail: DocumentDetail }) {
  const [pageIdx, setPageIdx] = useState(0);
  const [scale, setScale] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  // (rendered with key={detail.document_id} so all view state resets per doc)

  const page = detail.pages[pageIdx] ?? null;

  const onWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.min(6, Math.max(0.5, s * (e.deltaY < 0 ? 1.15 : 1 / 1.15))));
  };
  const onPointerDown = (e: React.PointerEvent) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!drag.current) return;
    setOffset({
      x: drag.current.ox + (e.clientX - drag.current.x),
      y: drag.current.oy + (e.clientY - drag.current.y),
    });
  };
  const onPointerUp = () => (drag.current = null);
  const reset = () => {
    setScale(1);
    setOffset({ x: 0, y: 0 });
  };

  return (
    <div className="flex min-h-0 flex-col gap-2">
      <div
        className="bg-muted/40 relative min-h-0 flex-1 cursor-grab touch-none overflow-hidden rounded-md border active:cursor-grabbing"
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        <div
          className="flex h-full w-full items-center justify-center"
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: "center center",
          }}
        >
          {page ? (
            <PageImage
              r2Key={page.r2_key_original}
              alt={`Page ${page.page_number} of ${shortId(detail.document_id)}`}
              className="max-h-full max-w-full select-none object-contain"
            />
          ) : (
            <p className="text-muted-foreground text-sm">No pages recorded.</p>
          )}
        </div>
      </div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon-sm"
            disabled={pageIdx === 0}
            onClick={() => setPageIdx((i) => i - 1)}
            aria-label="Previous page"
          >
            <ChevronLeft />
          </Button>
          <span className="text-muted-foreground px-1 text-xs tabular-nums">
            page {detail.pages.length === 0 ? 0 : pageIdx + 1} / {detail.pages.length}
          </span>
          <Button
            variant="outline"
            size="icon-sm"
            disabled={pageIdx >= detail.pages.length - 1}
            onClick={() => setPageIdx((i) => i + 1)}
            aria-label="Next page"
          >
            <ChevronRight />
          </Button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => setScale((s) => Math.max(0.5, s / 1.25))} aria-label="Zoom out">
            <ZoomOut />
          </Button>
          <span className="text-muted-foreground w-10 text-center text-xs tabular-nums">
            {Math.round(scale * 100)}%
          </span>
          <Button variant="outline" size="icon-sm" onClick={() => setScale((s) => Math.min(6, s * 1.25))} aria-label="Zoom in">
            <ZoomIn />
          </Button>
          <Button variant="outline" size="icon-sm" onClick={reset} aria-label="Fit">
            <Maximize />
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── the dialog ──────────────────────────────────────────────────────────────

type ClaimForm = Record<keyof AnswerPaperClaim, string>;

const emptyForm = (): ClaimForm => ({
  version: "LOAM1",
  school_id: "",
  exam_type: "",
  academic_year: "",
  subject_code: "",
  subject: "",
  set_name: "",
  grade: "",
  section: "",
  roll_number: "",
  admission_no: "",
  student_name: "",
});

function toForm(claim: DocumentDetail["claimed_metadata"]): ClaimForm {
  const f = emptyForm();
  if (claim && typeof claim === "object") {
    const c = claim as Partial<AnswerPaperClaim>;
    for (const k of Object.keys(f) as (keyof AnswerPaperClaim)[]) {
      const v = c[k];
      if (typeof v === "string") f[k] = v;
    }
  }
  return f;
}

function formToClaim(f: ClaimForm): AnswerPaperClaim {
  return { ...f, version: "LOAM1", set_name: f.set_name.trim() === "" ? null : f.set_name };
}

export function ResolveDialog({
  open,
  onOpenChange,
  queue,
  index,
  onNavigate,
  attention,
  roster,
  allDocs,
  onChanged,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  queue: DispatchDocument[];
  index: number;
  onNavigate: (index: number) => void;
  attention: Map<string, AttentionReason[]>;
  roster: RosterStudent[] | null;
  allDocs: DispatchDocument[];
  onChanged: () => void;
}) {
  const item = queue[index] ?? null;
  const docId = item?.document_id ?? null;
  const reasons = docId ? (attention.get(docId) ?? []) : [];

  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<ClaimForm>(emptyForm());
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  const options = useMemo(() => buildClaimOptions(allDocs, roster), [allDocs, roster]);

  // Prefill defaults for a coverless doc: the dispatch's dominant exam/year/
  // school/subject make manual entry a two-field job (roll + name).
  const defaults = useMemo(() => {
    const claims = allDocs
      .map((d) => (d.detail?.claimed_metadata ?? null) as Partial<AnswerPaperClaim> | null)
      .filter((c): c is Partial<AnswerPaperClaim> => c !== null);
    return {
      school_id: mostCommon(claims.map((c) => c.school_id)) ?? "",
      exam_type: mostCommon(claims.map((c) => c.exam_type)) ?? "",
      academic_year: mostCommon(claims.map((c) => c.academic_year)) ?? "",
      subject_code: mostCommon(claims.map((c) => c.subject_code)) ?? "",
      subject: mostCommon(claims.map((c) => c.subject)) ?? "",
    };
  }, [allDocs]);

  const loadDetail = useCallback(
    async (id: string) => {
      setDetail(null);
      setLoadError(null);
      try {
        const d = await getDocument(id);
        setDetail(d);
        const f = toForm(d.claimed_metadata);
        // prefill blanks from dispatch-dominant values
        for (const k of ["school_id", "exam_type", "academic_year", "subject_code", "subject"] as const) {
          if (!f[k]) f[k] = defaults[k];
        }
        setForm(f);
      } catch (e) {
        setLoadError(errMsg(e));
      }
    },
    [defaults],
  );

  useEffect(() => {
    if (open && docId) void loadDetail(docId);
  }, [open, docId, loadDetail]);

  // Autofocus the first empty claim field once the detail arrives.
  useEffect(() => {
    if (!detail || !formRef.current) return;
    const t = setTimeout(() => {
      const inputs = formRef.current?.querySelectorAll<HTMLInputElement>("input[data-claim-field]");
      if (!inputs) return;
      for (const el of inputs) {
        if (el.value.trim() === "") {
          el.focus();
          return;
        }
      }
    }, 60);
    return () => clearTimeout(t);
  }, [detail]);

  const set = (k: keyof AnswerPaperClaim) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  const missing = CLAIM_REQUIRED_FIELDS.filter((k) => form[k].trim() === "");
  const complete = missing.length === 0;

  const originalForm = useMemo(() => toForm(detail?.claimed_metadata ?? null), [detail]);
  const changedFields = (Object.keys(form) as (keyof AnswerPaperClaim)[]).filter(
    (k) => form[k] !== originalForm[k],
  );

  // Roster candidates for the current form values (grade-section scope).
  const candidates = useMemo(() => {
    if (!roster || !form.grade || !form.section) return [];
    const inSection = roster.filter(
      (s) =>
        s.grade.trim() === form.grade.trim() &&
        s.section.trim().toUpperCase() === form.section.trim().toUpperCase(),
    );
    const norm = (v: string) => v.trim().replace(/^0+(?=\d)/, "");
    const scored = inSection
      .map((s) => {
        const rollOk = form.roll_number && norm(s.roll_number) === norm(form.roll_number);
        const nameOk =
          form.student_name &&
          s.student_name.trim().toUpperCase().replace(/\s+/g, " ") ===
            form.student_name.trim().toUpperCase().replace(/\s+/g, " ");
        return { s, rollOk, nameOk, score: (rollOk ? 2 : 0) + (nameOk ? 1 : 0) };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, 4);
  }, [roster, form.grade, form.section, form.roll_number, form.student_name]);

  const pickCandidate = (s: RosterStudent) =>
    setForm((f) => ({
      ...f,
      roll_number: s.roll_number,
      student_name: s.student_name,
      admission_no: s.admission_no ?? f.admission_no,
    }));

  const advance = () => {
    if (index < queue.length - 1) onNavigate(index + 1);
    else onOpenChange(false);
  };

  // Returns true only when the write succeeded (the Enter-to-save path must
  // not advance the queue on a failed or rejected save).
  const saveClaim = async (mode: "edited" | "as-is"): Promise<boolean> => {
    if (!detail || !docId) return false;
    setSaving(true);
    try {
      if (detail.kind === null) {
        if (!complete) {
          toast.error(`Claim incomplete: ${missing.join(", ")}`);
          return false;
        }
        await classifyDocument(docId, formToClaim(form));
      } else {
        // already answer_paper → PATCH. "as-is" (or no edits) posts the full
        // current payload so the human decision lands in the event trail.
        const patch: Partial<AnswerPaperClaim> = {};
        if (mode === "edited" && changedFields.length > 0) {
          for (const k of changedFields) {
            if (k === "set_name") patch.set_name = form.set_name.trim() === "" ? null : form.set_name;
            else if (k !== "version") patch[k] = form[k];
          }
        } else {
          Object.assign(patch, formToClaim(form));
        }
        await patchDocumentMetadata(docId, patch);
      }
      toast.success(mode === "as-is" ? "Claim confirmed as-is" : "Claim saved");
      onChanged();
      await loadDetail(docId);
      return true;
    } catch (e) {
      toast.error(errMsg(e));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const send = async () => {
    if (!docId) return;
    setSending(true);
    try {
      const res = await sendToProcessing(docId);
      toast.success(`Sent to processing (workflow ${res.workflow_id})`);
      onChanged();
      advance();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const target = e.target as HTMLElement;
    const inField = ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
    if (e.key === "Enter" && inField && target.tagName === "INPUT") {
      e.preventDefault();
      if (!saving)
        void saveClaim("edited").then((ok) => {
          if (ok) advance();
        });
      return;
    }
    if (inField) return;
    if (e.key === "ArrowLeft" || e.key === "[") {
      if (index > 0) onNavigate(index - 1);
    } else if (e.key === "ArrowRight" || e.key === "]") {
      if (index < queue.length - 1) onNavigate(index + 1);
    }
  };

  const blockReason = detail ? sendBlockReason(detail) : "Loading…";
  const title = detail
    ? detail.kind === null
      ? `(no cover found) · ${detail.pages.length} page${detail.pages.length === 1 ? "" : "s"}`
      : `${form.grade}-${form.section} · ${form.subject || form.subject_code} · roll ${form.roll_number || "?"}`
    : "Loading…";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex h-[92vh] max-h-[92vh] flex-col gap-3 overflow-hidden p-4 sm:max-w-[92vw]"
        onKeyDown={onKeyDown}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 pr-8">
          <DialogTitle className="truncate text-base">Resolve: {title}</DialogTitle>
          <div className="flex items-center gap-1">
            <span className="text-muted-foreground mr-1 text-xs tabular-nums">
              {index + 1} of {queue.length}
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={index === 0}
              onClick={() => onNavigate(index - 1)}
            >
              <ChevronLeft /> prev
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={index >= queue.length - 1}
              onClick={() => onNavigate(index + 1)}
            >
              next <ChevronRight />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel>Not available yet (needs piper endpoints)</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem disabled>Mark as rescan of another document</DropdownMenuItem>
                <DropdownMenuItem disabled>Move pages between documents / split / merge</DropdownMenuItem>
                <DropdownMenuItem disabled>Exclude page (blank or junk sheet)</DropdownMenuItem>
                <DropdownMenuItem disabled>Park as roster problem</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {reasons.length > 0 && (
          <Alert className="shrink-0 border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-200">
            <AlertTriangle className="text-current" />
            <AlertTitle>Why this needs a human</AlertTitle>
            <AlertDescription className="text-current/80">
              {reasons.map((r) => r.label).join(" · ")}
            </AlertDescription>
          </Alert>
        )}

        {loadError ? (
          <Alert variant="destructive">
            <AlertTriangle />
            <AlertTitle>Could not load document</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        ) : !detail ? (
          <div className="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-sm">
            <Spinner className="size-4" /> Loading document…
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
            <ScanViewer key={detail.document_id} detail={detail} />

            <div className="flex min-h-0 flex-col gap-3 overflow-y-auto pr-1" ref={formRef}>
              <h4 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                Claim
              </h4>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label className="text-xs">Grade-section</Label>
                  <Select
                    value={form.grade && form.section ? `${form.grade}|${form.section}` : ""}
                    onValueChange={(v) => {
                      const [grade, section] = v.split("|");
                      setForm((f) => ({ ...f, grade: grade ?? "", section: section ?? "" }));
                    }}
                  >
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue placeholder="12-C" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.gradeSections.map((g) => (
                        <SelectItem key={`${g.grade}|${g.section}`} value={`${g.grade}|${g.section}`}>
                          {g.grade}-{g.section}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Subject</Label>
                  <Select
                    value={form.subject_code}
                    onValueChange={(code) => {
                      const s = options.subjects.find((x) => x.code === code);
                      setForm((f) => ({ ...f, subject_code: code, subject: s?.name ?? f.subject }));
                    }}
                  >
                    <SelectTrigger size="sm" className="w-full">
                      <SelectValue placeholder="Subject" />
                    </SelectTrigger>
                    <SelectContent>
                      {options.subjects.map((s) => (
                        <SelectItem key={s.code} value={s.code}>
                          {s.name} ({s.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Exam</Label>
                  {options.exams.length > 0 ? (
                    <Select value={form.exam_type} onValueChange={set("exam_type")}>
                      <SelectTrigger size="sm" className="w-full">
                        <SelectValue placeholder="Exam" />
                      </SelectTrigger>
                      <SelectContent>
                        {options.exams.map((x) => (
                          <SelectItem key={x} value={x}>
                            {x}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Input
                      data-claim-field
                      value={form.exam_type}
                      onChange={(e) => set("exam_type")(e.target.value)}
                      placeholder="UT1"
                      className="h-8"
                    />
                  )}
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Roll no</Label>
                  <Input
                    data-claim-field
                    value={form.roll_number}
                    onChange={(e) => set("roll_number")(e.target.value)}
                    placeholder="23"
                    className="h-8"
                  />
                </div>
                <div className="col-span-2 space-y-1">
                  <Label className="text-xs">Student name</Label>
                  <Input
                    data-claim-field
                    value={form.student_name}
                    onChange={(e) => set("student_name")(e.target.value)}
                    placeholder="As printed on the cover"
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Admission no</Label>
                  <Input
                    data-claim-field
                    value={form.admission_no}
                    onChange={(e) => set("admission_no")(e.target.value)}
                    placeholder="Admission no"
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Academic year</Label>
                  <Input
                    data-claim-field
                    value={form.academic_year}
                    onChange={(e) => set("academic_year")(e.target.value)}
                    placeholder="2026-27"
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">School id</Label>
                  <Input
                    data-claim-field
                    value={form.school_id}
                    onChange={(e) => set("school_id")(e.target.value)}
                    placeholder="School id"
                    className="h-8"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Set (optional)</Label>
                  <Input
                    value={form.set_name}
                    onChange={(e) => set("set_name")(e.target.value)}
                    placeholder="—"
                    className="h-8"
                  />
                </div>
              </div>

              {roster === null && (
                <p className="text-muted-foreground text-xs">
                  Roster unavailable — roster checks skipped.
                </p>
              )}

              {candidates.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
                    Roster match
                  </h4>
                  <RadioGroup
                    value=""
                    onValueChange={(id) => {
                      const c = candidates.find((x) => x.s.student_id === id);
                      if (c) pickCandidate(c.s);
                    }}
                    className="gap-1.5"
                  >
                    {candidates.map(({ s, rollOk, nameOk }) => (
                      <label
                        key={s.student_id}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-1.5 text-sm",
                          "hover:bg-muted/50",
                        )}
                      >
                        <RadioGroupItem value={s.student_id} />
                        <span className="font-medium tabular-nums">{s.roll_number}</span>
                        <span className="truncate">{s.student_name}</span>
                        <span className="text-muted-foreground ml-auto shrink-0 text-xs">
                          {rollOk && nameOk ? "exact" : rollOk ? "roll ok" : "name ~"}
                        </span>
                      </label>
                    ))}
                  </RadioGroup>
                </div>
              )}

              <div className="mt-auto space-y-2 border-t pt-3">
                {missing.length > 0 && (
                  <p className="text-destructive text-xs">Missing: {missing.join(", ")}</p>
                )}
                <div className="flex flex-wrap items-center gap-2">
                  {detail.kind === "answer_paper" && (
                    <Button
                      variant="outline"
                      disabled={saving || !complete}
                      onClick={() => void saveClaim("as-is")}
                    >
                      Confirm as-is
                    </Button>
                  )}
                  <Button
                    disabled={saving || !complete || (detail.kind !== null && changedFields.length === 0)}
                    onClick={() => void saveClaim("edited")}
                  >
                    {saving ? <Spinner className="size-4" /> : null} Save claim
                  </Button>
                  {blockReason === null ? (
                    <Button variant="secondary" disabled={sending} onClick={send}>
                      {sending ? <Spinner className="size-4" /> : <Send />} Send to processing
                    </Button>
                  ) : (
                    <DisabledWithTooltip reason={blockReason}>
                      <Button variant="secondary" disabled>
                        <Send /> Send to processing
                      </Button>
                    </DisabledWithTooltip>
                  )}
                </div>
                {detail.metadata_origin && (
                  <p className="text-muted-foreground text-xs">
                    Current claim origin: <Badge variant="outline">{detail.metadata_origin}</Badge>{" "}
                    · doc {shortId(detail.document_id)}
                  </p>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
