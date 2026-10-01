"use client";

// Ops Queue (beaver #97 + #173, t092) — the ops review-assignment navigator.
//
// Vocabulary (Fahad): Maker = 1st pass (a "make"), Checker = 2nd pass (a "check";
// approves; 4-eyes ⇒ ≠ Maker). A unit = one answer-paper × one stage. A ROW = one
// section (batch). Assignment is via interactive CHIPS in the Maker / Checker columns,
// at both the section level (assign the whole section) and the per-paper level (expand
// a section). Each paper has two assignable slots (review_assignment.role: maker|checker).
//
// Empty slot → "⊕ Assign" → dropdown (me first). Assigned → avatar+name chip with ✕.
// A section with papers split across people shows one chip per person (no ✕) — click it
// to expand + highlight that person's papers and remove them individually.
//
// Assign/unassign affordances are LEAD-ONLY (backend 403s non-leads on bulk assign/
// release); non-leads see the chips read-only. Approving (advancing a gate) is moving
// to the editing/chunking screens; this queue is assignment + status.
// See infnotes/dev/beaver/cld_review_queue_navigator_design.md.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { Button, Spinner, Tabs, TabsList, TabsTrigger } from "@student-ds/ui";
import { FilterSelect } from "@/app/components/FilterSelect";
import { keys } from "@/app/lib/queryKeys";
import { urlKeys, URL_OPTIONS } from "@/app/lib/urlKeys";
import {
  ChevronRight,
  ChevronDown,
  UserPlus,
  Check,
  RefreshCw,
  ExternalLink,
  X,
} from "lucide-react";
import {
  getReviewTasks,
  getScopeNodes,
  getReviewers,
  getReviewQueue,
  bulkAssignBatch,
  releaseBatch,
  approveStage,
  isLead,
  getMyEmail,
  reviewerPhotoUrl,
  type BatchTask,
  type TaskStatus,
  type Slot,
  type ScopeNode,
  type ScopeLevel,
  type ScopeFilterParams,
  type ReviewStage,
  type AssignRole,
  type Reviewer,
  type QueueRow,
} from "@/app/lib/reviewApi";
import { SectionReport } from "./SectionReport";
import { OpsStatusBadge } from "@/app/components/OpsStatusBadge";

const SHOW_PAPER_EXPANSION: boolean = true;
// The River-gate status, superseded on screen by Ops status; flip to true to show both.
const SHOW_GATE_STATUS: boolean = false;
// The section-level bulk "Check" button; its column stays because the papers' "open" links sit in it.
const SHOW_ACTIONS: boolean = false;
// Extraction review is not worked this cycle: its tab stays but shows a placeholder and loads nothing.
const SHOW_EXTRACTION_STAGE: boolean = false;
const stageIsLive = (stage: ReviewStage) => SHOW_EXTRACTION_STAGE || stage !== "answers";

const TAB_LIST = "h-10 border border-border bg-white";
const TAB_TRIGGER =
  "px-sp-xl text-sm font-semibold data-[state=active]:bg-blue-600 data-[state=active]:text-white data-[state=active]:shadow-sm";

// ── Status display ────────────────────────────────────────────────────────────
const STATUS_META: Record<TaskStatus, { label: string; dot: string; text: string }> = {
  open: { label: "Open", dot: "bg-gray-400", text: "text-gray-600" },
  maker_active: { label: "Making", dot: "bg-blue-500", text: "text-blue-700" },
  awaiting_checker: { label: "Awaiting check", dot: "bg-orange-500", text: "text-orange-700" },
  in_review: { label: "Checking", dot: "bg-blue-500", text: "text-blue-700" },
  done: { label: "Done", dot: "bg-green-500", text: "text-green-700" },
  blocked: { label: "Locked", dot: "bg-slate-300", text: "text-slate-400" },
};

function StatusDot({ status }: { status: TaskStatus }) {
  const m = STATUS_META[status] ?? STATUS_META.open;
  return (
    <span className={`inline-flex items-center gap-sp-sm text-xs font-medium ${m.text}`}>
      <span className={`h-2 w-2 rounded-full ${m.dot}`} />
      {m.label}
    </span>
  );
}

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="flex items-center gap-sp-md">
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-gray-100">
        <div className="h-full rounded-full bg-green-500" style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums text-xs text-muted-foreground">
        {done}/{total}
      </span>
    </div>
  );
}

function shortName(email: string): string {
  if (!email) return "";
  const local = email.split("@")[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

function initialsOf(name: string): string {
  return (
    name
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((s) => s[0]?.toUpperCase())
      .join("") || "?"
  );
}

// Avatar: photo (from the R2-backed photo API by Keycloak id) with initials fallback.
function Avatar({ name, photoUrl, size = 18 }: { name: string; photoUrl?: string; size?: number }) {
  const [err, setErr] = useState(false);
  if (photoUrl && !err) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photoUrl}
        alt={name}
        onError={() => setErr(true)}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className="inline-flex items-center justify-center rounded-full bg-blue-100 font-semibold text-blue-700"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {initialsOf(name)}
    </span>
  );
}

type ReviewerMap = Map<string, Reviewer>;
function personOf(email: string, rmap: ReviewerMap) {
  const r = rmap.get(email);
  return { name: r?.name ?? shortName(email), photoUrl: reviewerPhotoUrl(r) };
}

// ── Assignee dropdown ─────────────────────────────────────────────────────────
function AssigneePopover({
  reviewers,
  myEmail,
  exclude,
  excludeRole,
  onPick,
  onClose,
}: {
  reviewers: Reviewer[];
  myEmail: string | null;
  exclude: Set<string>; // 4-eyes: the other role's holders, greyed out
  excludeRole: AssignRole; // which role those excluded people already hold (label)
  onPick: (email: string) => void;
  onClose: () => void;
}) {
  const { isFetching } = useQuery({ queryKey: keys.review.reviewers(), queryFn: getReviewers });
  const loadingReviewers = isFetching && reviewers.length === 0;

  const list = useMemo(() => {
    const arr = [...reviewers];
    if (myEmail && !arr.some((r) => r.email === myEmail)) arr.unshift({ email: myEmail, name: "Me" });
    arr.sort((a, b) => (a.email === myEmail ? -1 : b.email === myEmail ? 1 : 0));
    return arr;
  }, [reviewers, myEmail]);
  return (
    <>
      <button className="fixed inset-0 z-20 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="absolute left-0 top-full z-30 mt-sp-xs max-h-60 w-52 overflow-auto rounded-md border border-border bg-white py-sp-xs shadow-lg">
        {list.map((r) => {
          const excluded = exclude.has(r.email);
          return (
            <button
              key={r.email}
              type="button"
              disabled={excluded}
              onClick={() => onPick(r.email)}
              className="flex w-full items-center gap-sp-md px-sp-lg py-sp-sm text-left text-xs hover:bg-muted/50 disabled:opacity-30"
            >
              <Avatar name={r.name} photoUrl={reviewerPhotoUrl(r)} size={18} />
              <span className="font-medium text-gray-800">
                {r.name}
                {r.email === myEmail ? " (me)" : ""}
              </span>
              {excluded && <span className="ml-auto text-[10px] text-muted-foreground">{excludeRole}</span>}
            </button>
          );
        })}
        {loadingReviewers && (
          <div className="flex items-center gap-sp-md px-sp-lg py-sp-sm text-xs text-muted-foreground">
            <Spinner className="size-3" /> Loading reviewers…
          </div>
        )}
      </div>
    </>
  );
}

// ── Section-level slot column (Maker or Checker) ───────────────────────────────
function SlotColumn({
  slots,
  total,
  reviewers,
  rmap,
  myEmail,
  lead,
  exclude,
  excludeRole,
  open,
  setOpen,
  onAssign,
  onUnassign,
  onChipClick,
}: {
  slots: Slot[];
  total: number;
  reviewers: Reviewer[];
  rmap: ReviewerMap;
  myEmail: string | null;
  lead: boolean;
  exclude: Set<string>;
  excludeRole: AssignRole;
  open: boolean;
  setOpen: (v: boolean) => void;
  onAssign: (email: string, force: boolean) => void;
  onUnassign: () => void;
  onChipClick: (email: string) => void;
}) {
  const assignedCount = slots.reduce((a, s) => a + s.count, 0);

  if (slots.length === 0) {
    if (!lead) return <span className="text-xs text-gray-300">—</span>;
    return (
      <div className="relative inline-block">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-sp-xs rounded-full border border-dashed border-gray-300 px-sp-md py-sp-xxs text-xs text-muted-foreground hover:border-gray-400 hover:text-gray-600"
        >
          <UserPlus size={12} /> Assign
        </button>
        {open && (
          <AssigneePopover
            reviewers={reviewers}
            myEmail={myEmail}
            exclude={exclude}
            excludeRole={excludeRole}
            onClose={() => setOpen(false)}
            onPick={(e) => { setOpen(false); onAssign(e, false); }}
          />
        )}
      </div>
    );
  }

  // Uniform → one person, the whole section. Leads can ✕-release-all or click the name
  // to re-assign (force); non-leads see a read-only chip.
  if (slots.length === 1 && slots[0].count === total) {
    const p = personOf(slots[0].email, rmap);
    // A non-lead may drop their OWN claim (✕) but never reassign or touch others'.
    const mine = !lead && slots[0].email === myEmail;
    return (
      <div className="relative inline-block">
        <span className="inline-flex items-center gap-sp-xs rounded-full border border-border bg-white py-sp-xxs pl-sp-xxs pr-sp-xs text-xs">
          <Avatar name={p.name} photoUrl={p.photoUrl} />
          <button
            type="button"
            onClick={lead ? () => setOpen(!open) : undefined}
            className={lead ? "text-gray-700 hover:underline" : "text-gray-700"}
            title={lead ? "Re-assign section" : undefined}
          >
            {p.name}
          </button>
          {(lead || mine) && (
            <button type="button" onClick={onUnassign} className="text-muted-foreground hover:text-red-500" title="Unassign section">
              <X size={11} />
            </button>
          )}
        </span>
        {open && lead && (
          <AssigneePopover
            reviewers={reviewers}
            myEmail={myEmail}
            exclude={exclude}
            excludeRole={excludeRole}
            onClose={() => setOpen(false)}
            onPick={(e) => { setOpen(false); onAssign(e, true); }}
          />
        )}
      </div>
    );
  }

  // Mixed → a chip per person (no ✕; click → expand + highlight). A faded "+N" chip
  // assigns the still-open remainder (leads only).
  return (
    <div className="flex flex-wrap items-center gap-sp-xs">
      {slots.map((s) => {
        const p = personOf(s.email, rmap);
        return (
          <button
            key={s.email}
            type="button"
            onClick={() => onChipClick(s.email)}
            title="Show this person's papers"
            className="inline-flex items-center gap-sp-xs rounded-full border border-border bg-white py-sp-xxs pl-sp-xxs pr-sp-sm text-xs hover:bg-muted/50"
          >
            <Avatar name={p.name} photoUrl={p.photoUrl} />
            <span className="text-gray-700">
              {p.name}
              <span className="text-muted-foreground">·{s.count}</span>
            </span>
          </button>
        );
      })}
      {lead && assignedCount < total && (
        <div className="relative inline-block">
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="inline-flex items-center gap-sp-xs rounded-full border border-dashed border-gray-300 px-sp-sm py-sp-xxs text-xs text-muted-foreground hover:text-gray-600"
          >
            <UserPlus size={11} /> {total - assignedCount} open
          </button>
          {open && (
            <AssigneePopover
              reviewers={reviewers}
              myEmail={myEmail}
              exclude={exclude}
              excludeRole={excludeRole}
              onClose={() => setOpen(false)}
              onPick={(e) => { setOpen(false); onAssign(e, false); }}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Per-paper slot chip (single person or empty) ───────────────────────────────
function PaperChip({
  email,
  reviewers,
  rmap,
  myEmail,
  lead,
  exclude,
  excludeRole,
  open,
  setOpen,
  onAssign,
  onUnassign,
}: {
  email: string | null;
  reviewers: Reviewer[];
  rmap: ReviewerMap;
  myEmail: string | null;
  lead: boolean;
  exclude: Set<string>;
  excludeRole: AssignRole;
  open: boolean;
  setOpen: (v: boolean) => void;
  onAssign: (email: string, force: boolean) => void;
  onUnassign: () => void;
}) {
  if (!email) {
    if (!lead) return <span className="text-[11px] text-gray-300">—</span>;
    return (
      <div className="relative inline-block">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-sp-xxs rounded-full border border-dashed border-gray-300 px-sp-sm py-sp-xxs text-[11px] text-muted-foreground hover:text-gray-600"
        >
          <UserPlus size={10} /> Assign
        </button>
        {open && (
          <AssigneePopover
            reviewers={reviewers}
            myEmail={myEmail}
            exclude={exclude}
            excludeRole={excludeRole}
            onClose={() => setOpen(false)}
            onPick={(e) => { setOpen(false); onAssign(e, false); }}
          />
        )}
      </div>
    );
  }
  const p = personOf(email, rmap);
  // Non-leads: a slot they hold gets a ✕ to drop their own claim; anyone else's slot
  // is a read-only chip (no re-assign, no ✕).
  if (!lead) {
    const mine = email === myEmail;
    return (
      <span className="inline-flex items-center gap-sp-xs rounded-full border border-border bg-white py-sp-xxs pl-sp-xxs pr-sp-sm text-[11px]">
        <Avatar name={p.name} photoUrl={p.photoUrl} size={16} />
        <span className="text-gray-700">{p.name}</span>
        {mine && (
          <button type="button" onClick={onUnassign} className="text-muted-foreground hover:text-red-500" title="Unassign yourself">
            <X size={10} />
          </button>
        )}
      </span>
    );
  }
  return (
    <div className="relative inline-block">
      <span className="inline-flex items-center gap-sp-xs rounded-full border border-border bg-white py-sp-xxs pl-sp-xxs pr-sp-xs text-[11px]">
        <Avatar name={p.name} photoUrl={p.photoUrl} size={16} />
        <button type="button" onClick={() => setOpen(!open)} className="text-gray-700 hover:underline">
          {p.name}
        </button>
        <button type="button" onClick={onUnassign} className="text-muted-foreground hover:text-red-500">
          <X size={10} />
        </button>
      </span>
      {open && (
        <AssigneePopover
          reviewers={reviewers}
          myEmail={myEmail}
          exclude={exclude}
          excludeRole={excludeRole}
          onClose={() => setOpen(false)}
          onPick={(e) => { setOpen(false); onAssign(e, true); }}
        />
      )}
    </div>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
const NO_TASKS: BatchTask[] = [];
const NO_REVIEWERS: Reviewer[] = [];

export default function OpsQueuePage() {
  // `view` is null until the role default resolves — that gates the fetch, so it has no default in urlKeys.
  const [
    { stage, assignee, view, schoolId, grade, academicYear, subjectId, examId, from, to },
    setQueue,
  ] = useQueryStates(urlKeys.reviewQueue, URL_OPTIONS);

  // Memoised on the primitives: ScopeSelect keys an effect off this object.
  const scope = useMemo<ScopeFilterParams>(
    () => ({
      schoolId: schoolId || undefined,
      grade: grade || undefined,
      academicYear: academicYear || undefined,
      subjectId: subjectId || undefined,
      examId: examId || undefined,
    }),
    [schoolId, grade, academicYear, subjectId, examId]
  );

  // One call, five params — a cascade reset is one URL write, one history entry.
  const setScope = useCallback(
    (s: ScopeFilterParams) =>
      setQueue({
        schoolId: s.schoolId ?? null,
        grade: s.grade ?? null,
        academicYear: s.academicYear ?? null,
        subjectId: s.subjectId ?? null,
        examId: s.examId ?? null,
      }),
    [setQueue]
  );
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [lead, setLead] = useState(false);
  const [myEmail, setMyEmail] = useState<string | null>(null);
  const [openPopover, setOpenPopover] = useState<string | null>(null); // key of the open dropdown
  const [highlight, setHighlight] = useState<{ batchId: string; email: string } | null>(null);
  const [actionError, setError] = useState<string | null>(null);

  // Role + identity come from browser storage, so they must be read after mount.
  useEffect(() => {
    const amLead = isLead();
    setLead(amLead);
    setMyEmail(getMyEmail());
    // Role default: regular ops land on My Queue; leads land on All sections.
    // Only when the URL did not already say — a shared link must win.
    if (view === null) setQueue({ view: amLead ? "all" : "mine" });
    // The report is leads-only; a shared link can't open it for anyone else.
    else if (view === "report" && !amLead) setQueue({ view: "mine" });
    // Mount-only: re-running would overwrite the operator's own toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reviewersQuery = useQuery({
    queryKey: keys.review.reviewers(),
    queryFn: getReviewers,
  });

  const reviewers = reviewersQuery.data ?? NO_REVIEWERS;

  const rmap = useMemo<ReviewerMap>(() => new Map(reviewers.map((r) => [r.email, r])), [reviewers]);

  // Every input that changes the result is in the key, so switching stage, view
  // or assignee can't let a slow reply for the old selection land on the new one.
  const tasksQuery = useQuery({
    queryKey: keys.review.tasks({
      view: view ?? "",
      stage,
      scope: view === "mine" ? {} : scope,
      assignee: view === "mine" ? myEmail : (assignee || null),
    }),
    queryFn: async (): Promise<BatchTask[]> => {
      if (view === "mine") {
        // My Queue: my own slots across ALL scopes (ignore the navigator selection),
        // forced to my email. Sort by recency (last_activity_at) DESC, nulls last.
        const data = await getReviewTasks({ stage, scope: {}, assignee: myEmail!, mine: true });
        const list = Array.isArray(data) ? [...data] : [];
        list.sort((a, b) => {
          const ta = a.last_activity_at ? Date.parse(a.last_activity_at) : -Infinity;
          const tb = b.last_activity_at ? Date.parse(b.last_activity_at) : -Infinity;
          return tb - ta;
        });
        return list;
      }
      // All sections: today's behaviour — scope navigator + assignee filter.
      const data = await getReviewTasks({ stage, scope, assignee: assignee || undefined });
      return Array.isArray(data) ? data : [];
    },
    enabled: stageIsLive(stage) && view !== null && view !== "report" && (view !== "mine" || !!myEmail),
  });

  // Checked sections sink to the bottom of both views; the rest keep their order.
  const tasks = useMemo(() => {
    const list = tasksQuery.data ?? NO_TASKS;
    return [...list.filter((t) => t.ops_status !== "done"), ...list.filter((t) => t.ops_status === "done")];
  }, [tasksQuery.data]);
  const loading = view === null || tasksQuery.isPending;
  const error =
    actionError ??
    (tasksQuery.error instanceof Error ? tasksQuery.error.message : null);

  const loadTasks = useCallback(
    () => queryClient.invalidateQueries({ queryKey: keys.review.tasksAll() }),
    [queryClient]
  );

  const rollup = useMemo(() => {
    let total = 0, cleared = 0, awaiting = 0;
    for (const t of tasks) { total += t.total; cleared += t.cleared; awaiting += t.awaiting_recheck; }
    // makesPending = 1st pass not done; awaiting = made-but-not-yet-checked.
    return { total, cleared, awaiting, makesPending: Math.max(0, total - cleared - awaiting) };
  }, [tasks]);

  // One query per expanded section, keyed on (batchId, stage). A batch's
  // maker/checker differ by stage, so the stage being in the key is what makes
  // switching tabs show the right assignments — no manual cache-drop needed.
  const expandedList = Array.from(expanded);
  const paperQueries = useQueries({
    queries: expandedList.map((batchId) => ({
      queryKey: keys.review.queue(batchId, stage),
      queryFn: () => getReviewQueue({ batchId, stage }),
    })),
  });

  const papers: Record<string, QueueRow[]> = {};
  expandedList.forEach((batchId, i) => {
    const rows = paperQueries[i]?.data;
    if (rows) papers[batchId] = rows;
  });

  const loadPapers = useCallback(
    (batchId: string) =>
      queryClient.invalidateQueries({ queryKey: keys.review.queue(batchId, stage) }),
    [queryClient, stage]
  );

  const toggleExpand = useCallback((batchId: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(batchId)) next.delete(batchId);
      else next.add(batchId);
      return next;
    });
  }, []);

  const runAction = useCallback(
    async (key: string, fn: () => Promise<unknown>) => {
      setBusy(key);
      setError(null);
      try {
        await fn();
        await loadTasks();
        for (const b of expanded) void loadPapers(b);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Action failed");
      } finally {
        setBusy(null);
      }
    },
    [loadTasks, expanded, loadPapers]
  );

  // Section-level slot actions
  const assignSection = (batchId: string, role: AssignRole, email: string, force: boolean) =>
    runAction(`as:${batchId}:${role}`, () => bulkAssignBatch({ batchId, stage, role, assignee: email, force }));
  const unassignSection = (batchId: string, role: AssignRole) =>
    runAction(`us:${batchId}:${role}`, () => releaseBatch({ batchId, stage, role }));

  // Per-paper slot actions
  const assignPaper = (batchId: string, studentId: string, role: AssignRole, email: string, force: boolean) =>
    runAction(`ap:${batchId}:${studentId}:${role}`, () =>
      bulkAssignBatch({ batchId, stage, role, assignee: email, studentIds: [studentId], force }));
  const unassignPaper = (batchId: string, studentId: string, role: AssignRole) =>
    runAction(`up:${batchId}:${studentId}:${role}`, () =>
      releaseBatch({ batchId, stage, role, studentIds: [studentId] }));

  // Multi-select bulk assign: assign a chosen subset of a section's papers to one person
  // (force so the selection definitively lands, even if some were already held).
  const assignPapers = (batchId: string, studentIds: string[], role: AssignRole, email: string) =>
    runAction(`aps:${batchId}:${role}`, () =>
      bulkAssignBatch({ batchId, stage, role, assignee: email, studentIds, force: true }));

  // Approve remaining "awaiting re-check" papers (transitional — moving to editors).
  const approveAll = (batchId: string) =>
    runAction(`appr:${batchId}`, async () => {
      const rows = papers[batchId] ?? (await getReviewQueue({ batchId, stage }));
      for (const r of rows.filter((x) => x.status === "awaiting_approval")) {
        const sid = String(r.unit_ref.student_id ?? "");
        if (sid) await approveStage({ batchId, studentId: sid, stage });
      }
    });

  // Clicking a mixed-section chip → expand + highlight that person's papers.
  const onChipClick = async (batchId: string, email: string) => {
    if (!expanded.has(batchId)) await toggleExpand(batchId);
    setHighlight({ batchId, email });
  };

  return (
    <div className="min-h-screen bg-stone-50 px-sp-5xl py-sp-4xl">
      <div className="space-y-sp-3xl">
        <div className="flex flex-wrap items-center justify-between gap-sp-lg">
          <div className="space-y-sp-md">
            <h1 className="text-lg font-bold text-gray-900">Ops Queue</h1>
            <ViewSwitch view={view} lead={lead} onChange={(v) => setQueue({ view: v })} />
            <p className="text-xs text-muted-foreground">
              A Maker does the first pass; a different Checker approves each gate
              (chunking → OCR, extraction → publish).
            </p>
          </div>
          <div className="flex items-center gap-sp-md">
            <StageSwitch stage={stage} onChange={(s) => setQueue({ stage: s })} />
            <Button
              variant="outline"
              size="icon"
              className="size-10"
              onClick={() => void loadTasks()}
              title="Refresh"
              aria-label="Refresh"
            >
              <RefreshCw size={14} />
            </Button>
          </div>
        </div>

        {/* Phase 2: requests inbox (outgoing + lead "needs me") slots in here. */}

        {!stageIsLive(stage) ? (
          <div className="rounded-lg border border-dashed border-border bg-white px-sp-xl py-sp-3xl text-center text-sm text-muted-foreground">
            Extraction review is paused this cycle. Answers are checked on the Marks tab.
          </div>
        ) : (
        <>
        {(view === "all" || view === "report") && (
        <div className="flex flex-wrap items-center gap-sp-md">
          <ScopeBar scope={scope} setScope={setScope} />
          {view === "all" && (
          <div className="ml-auto flex items-center gap-sp-md">
            {myEmail && (
              <button
                type="button"
                onClick={() => setQueue({ assignee: assignee === myEmail ? null : myEmail })}
                className={`rounded-md border px-sp-lg py-sp-sm text-sm font-medium ${
                  assignee === myEmail
                    ? "border-blue-300 bg-blue-50 text-blue-700"
                    : "border-border bg-white text-gray-600 hover:bg-muted/50"
                }`}
              >
                Mine
              </button>
            )}
            <FilterSelect
              label="Maker"
              value={assignee}
              onChange={(v) => setQueue({ assignee: v || null })}
              placeholder="Anyone"
              options={[
                ...(myEmail && !reviewers.some((r) => r.email === myEmail)
                  ? [{ value: myEmail, label: `${myEmail} (me)` }]
                  : []),
                ...reviewers.map((r) => ({
                  value: r.email,
                  label: `${r.name}${r.email === myEmail ? " (me)" : ""}`,
                })),
              ]}
            />
          </div>
          )}
        </div>
        )}

        {view === "report" ? (
          <SectionReport
            stage={stage}
            scope={scope}
            from={from}
            to={to}
            setDates={(d) => setQueue(d)}
            nameOf={(email) => personOf(email, rmap).name}
          />
        ) : (
        <>
        <div className="flex flex-wrap items-center gap-sp-xl rounded-lg border border-border bg-white px-sp-xl py-sp-lg text-sm">
          <Stat label="makes pending" value={`${rollup.makesPending}/${rollup.total}`} tone="gray" />
          <span className="text-gray-200">·</span>
          <Stat label="checks pending" value={`${rollup.awaiting}/${rollup.total}`} tone="amber" />
          <span className="text-gray-200">·</span>
          <Stat label="done" value={`${rollup.cleared}/${rollup.total}`} tone="green" />
          <span className="ml-auto text-xs text-muted-foreground">{tasks.length} sections</span>
        </div>

        {error && <p className="rounded-md bg-red-50 p-sp-md text-sm text-red-600">{error}</p>}

        <div className="overflow-visible rounded-lg border border-border bg-white">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-sp-xl py-sp-lg">Section</th>
                <th className="px-sp-xl py-sp-lg">Maker</th>
                <th className="px-sp-xl py-sp-lg">Checker</th>
                <th className="px-sp-xl py-sp-lg">Ops status</th>
                {SHOW_GATE_STATUS && <th className="px-sp-xl py-sp-lg">Status</th>}
                <th className="px-sp-xl py-sp-lg text-right">{SHOW_ACTIONS && "Actions"}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={SHOW_GATE_STATUS ? 6 : 5} className="px-sp-lg py-sp-3xl text-center text-sm text-muted-foreground">Loading…</td></tr>
              ) : tasks.length === 0 ? (
                <tr><td colSpan={SHOW_GATE_STATUS ? 6 : 5} className="px-sp-lg py-sp-3xl text-center text-sm italic text-muted-foreground">
                  {view === "mine" ? "Nothing assigned to you in this stage." : "No sections match this scope."}
                </td></tr>
              ) : (
                tasks.map((t) => (
                  <TaskRow
                    key={t.batch_id}
                    task={t}
                    stage={stage}
                    showMyRole={view === "mine"}
                    expanded={expanded.has(t.batch_id)}
                    papers={papers[t.batch_id]}
                    busy={busy}
                    reviewers={reviewers}
                    rmap={rmap}
                    myEmail={myEmail}
                    lead={lead}
                    highlight={highlight}
                    openPopover={openPopover}
                    setOpenPopover={setOpenPopover}
                    onToggleExpand={() => void toggleExpand(t.batch_id)}
                    onAssignSection={(role, email, force) => void assignSection(t.batch_id, role, email, force)}
                    onUnassignSection={(role) => void unassignSection(t.batch_id, role)}
                    onAssignPaper={(sid, role, email, force) => void assignPaper(t.batch_id, sid, role, email, force)}
                    onUnassignPaper={(sid, role) => void unassignPaper(t.batch_id, sid, role)}
                    onAssignPapers={(sids, role, email) => void assignPapers(t.batch_id, sids, role, email)}
                    onChipClick={(email) => void onChipClick(t.batch_id, email)}
                    onApproveAll={() => void approveAll(t.batch_id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
        </>
        )}
        </>
        )}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────
// View toggle: My Queue, All sections, and the leads-only Report; defaulted by role on mount.
type QueueView = "mine" | "all" | "report";
function ViewSwitch({ view, lead, onChange }: { view: QueueView | null; lead: boolean; onChange: (v: QueueView) => void }) {
  return (
    <Tabs value={view ?? "mine"} onValueChange={(v) => onChange(v as QueueView)}>
      <TabsList className={TAB_LIST}>
        <TabsTrigger className={TAB_TRIGGER} value="mine">My Queue</TabsTrigger>
        <TabsTrigger className={TAB_TRIGGER} value="all">All sections</TabsTrigger>
        {lead && <TabsTrigger className={TAB_TRIGGER} value="report">Report</TabsTrigger>}
      </TabsList>
    </Tabs>
  );
}

function StageSwitch({ stage, onChange }: { stage: ReviewStage; onChange: (s: ReviewStage) => void }) {
  return (
    <Tabs value={stage} onValueChange={(v) => onChange(v as ReviewStage)}>
      <TabsList className={TAB_LIST}>
        <TabsTrigger className={TAB_TRIGGER} value="marks_verification">Marks</TabsTrigger>
        <TabsTrigger className={TAB_TRIGGER} value="chunking">Chunking</TabsTrigger>
        <TabsTrigger className={TAB_TRIGGER} value="answers">Extraction</TabsTrigger>
      </TabsList>
    </Tabs>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone: "gray" | "amber" | "green" }) {
  const color = tone === "amber" ? "text-orange-700" : tone === "green" ? "text-green-700" : "text-gray-700";
  return (
    <span className="flex items-baseline gap-sp-sm">
      <span className={`tabular-nums font-semibold ${color}`}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </span>
  );
}

function ScopeBar({ scope, setScope }: { scope: ScopeFilterParams; setScope: (s: ScopeFilterParams) => void }) {
  const levels: { level: ScopeLevel; label: string; placeholder: string }[] = [
    { level: "school", label: "School", placeholder: "All schools" },
    { level: "grade_year", label: "Grade", placeholder: "All grades" },
    { level: "subject", label: "Subject", placeholder: "All subjects" },
    { level: "exam", label: "Exam", placeholder: "All exams" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-sp-md">
      {levels.map(({ level, label, placeholder }) => (
        <ScopeSelect key={level} level={level} label={label} placeholder={placeholder} scope={scope} setScope={setScope} />
      ))}
    </div>
  );
}

function ScopeSelect({
  level, label, placeholder, scope, setScope,
}: {
  level: ScopeLevel; label: string; placeholder: string; scope: ScopeFilterParams; setScope: (s: ScopeFilterParams) => void;
}) {
  const [nodes, setNodes] = useState<ScopeNode[]>([]);
  const parentScope = useMemo(() => {
    const s: ScopeFilterParams = {};
    if (level !== "school") s.schoolId = scope.schoolId;
    if (level === "subject" || level === "exam") { s.grade = scope.grade; s.academicYear = scope.academicYear; }
    if (level === "exam") s.subjectId = scope.subjectId;
    return s;
  }, [level, scope]);

  useEffect(() => {
    getScopeNodes({ level, scope: parentScope }).then(setNodes).catch(() => setNodes([]));
  }, [level, parentScope]);

  const currentValue =
    level === "school" ? scope.schoolId ?? "" :
    level === "grade_year" ? (scope.grade ? `${scope.grade}|${scope.academicYear ?? ""}` : "") :
    level === "subject" ? scope.subjectId ?? "" :
    scope.examId ?? "";

  const onChange = (val: string) => {
    const next: ScopeFilterParams = { ...scope };
    if (level === "school") {
      next.schoolId = val || undefined;
      next.grade = next.academicYear = next.subjectId = next.examId = undefined;
    } else if (level === "grade_year") {
      const [g, y] = val.split("|");
      next.grade = val ? g : undefined;
      next.academicYear = val ? (y || undefined) : undefined;
      next.subjectId = next.examId = undefined;
    } else if (level === "subject") {
      next.subjectId = val || undefined;
      next.examId = undefined;
    } else {
      next.examId = val || undefined;
    }
    setScope(next);
  };

  return (
    <FilterSelect
      label={label}
      value={currentValue}
      onChange={onChange}
      placeholder={placeholder}
      options={nodes.map((n) => ({
        value: n.key,
        label: `${n.label} · ${n.claimable}/${n.total}${n.child_noun ? ` · ${n.child_count} ${n.child_noun}` : ""}`,
      }))}
    />
  );
}

function TaskRow({
  task, stage, showMyRole, expanded, papers, busy, reviewers, rmap, myEmail, lead, highlight,
  openPopover, setOpenPopover,
  onToggleExpand, onAssignSection, onUnassignSection, onAssignPaper, onUnassignPaper, onAssignPapers, onChipClick, onApproveAll,
}: {
  task: BatchTask;
  stage: ReviewStage;
  showMyRole: boolean;
  expanded: boolean;
  papers?: QueueRow[];
  busy: string | null;
  reviewers: Reviewer[];
  rmap: ReviewerMap;
  myEmail: string | null;
  lead: boolean;
  highlight: { batchId: string; email: string } | null;
  openPopover: string | null;
  setOpenPopover: (v: string | null) => void;
  onToggleExpand: () => void;
  onAssignSection: (role: AssignRole, email: string, force: boolean) => void;
  onUnassignSection: (role: AssignRole) => void;
  onAssignPaper: (studentId: string, role: AssignRole, email: string, force: boolean) => void;
  onUnassignPaper: (studentId: string, role: AssignRole) => void;
  onAssignPapers: (studentIds: string[], role: AssignRole, email: string) => void;
  onChipClick: (email: string) => void;
  onApproveAll: () => void;
}) {
  const locked = task.status === "blocked";
  const makerEmails = new Set(task.makers.map((s) => s.email));
  const checkerEmails = new Set(task.checkers.map((s) => s.email));
  // My Queue: which role(s) I hold on this section, shown as tags beside its name.
  const myRoles = showMyRole && myEmail
    ? [makerEmails.has(myEmail) && "Maker", checkerEmails.has(myEmail) && "Checker"].filter((r): r is string => Boolean(r))
    : [];
  const popKey = (role: AssignRole) => `sec:${task.batch_id}:${role}`;
  return (
    <>
      <tr className={`border-b border-border ${locked ? "" : "hover:bg-muted/50"}`}>
        <td className="px-sp-xl py-sp-lg">
          <div className="flex items-start gap-sp-sm">
            {SHOW_PAPER_EXPANSION && !locked && (
              <button
                type="button"
                onClick={onToggleExpand}
                className="mt-px rounded p-0.5 text-gray-400 hover:bg-muted hover:text-gray-700"
                title={expanded ? "Hide papers" : "Show papers"}
              >
                {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            )}
            <div>
              <div className="flex flex-wrap items-center gap-sp-sm">
                <span className="font-medium text-gray-900">{task.label}</span>
                {myRoles.map((r) => (
                  <span
                    key={r}
                    className={`rounded-full px-sp-sm py-px text-[10px] font-semibold ${
                      r === "Maker" ? "bg-blue-50 text-blue-700" : "bg-purple-50 text-purple-700"
                    }`}
                  >
                    {r}
                  </span>
                ))}
              </div>
              <div className="text-[10px] text-gray-300">{task.batch_id}</div>
            </div>
          </div>
        </td>
        <td className="px-sp-xl py-sp-lg">
          {locked ? <span className="text-xs text-gray-300">—</span> : (
            <SlotColumn
              slots={task.makers} total={task.total} reviewers={reviewers} rmap={rmap}
              myEmail={myEmail} lead={lead} exclude={checkerEmails} excludeRole="checker"
              open={openPopover === popKey("maker")}
              setOpen={(v) => setOpenPopover(v ? popKey("maker") : null)}
              onAssign={(e, f) => onAssignSection("maker", e, f)}
              onUnassign={() => onUnassignSection("maker")}
              onChipClick={onChipClick}
            />
          )}
        </td>
        <td className="px-sp-xl py-sp-lg">
          {locked ? <span className="text-xs text-gray-300">—</span> : (
            <SlotColumn
              slots={task.checkers} total={task.total} reviewers={reviewers} rmap={rmap}
              myEmail={myEmail} lead={lead} exclude={makerEmails} excludeRole="maker"
              open={openPopover === popKey("checker")}
              setOpen={(v) => setOpenPopover(v ? popKey("checker") : null)}
              onAssign={(e, f) => onAssignSection("checker", e, f)}
              onUnassign={() => onUnassignSection("checker")}
              onChipClick={onChipClick}
            />
          )}
        </td>
        <td className="px-sp-xl py-sp-lg">
          <OpsStatusBadge status={task.ops_status} />
          {task.ready_for_check > 0 && (
            <div className="mt-sp-xxs text-[11px] text-yellow-700">{task.ready_for_check} ready for check</div>
          )}
        </td>
        {SHOW_GATE_STATUS && <td className="px-sp-xl py-sp-lg"><StatusDot status={task.status} /></td>}
        <td className="px-sp-xl py-sp-lg">
          <div className="flex items-center justify-end gap-sp-xs">
            {SHOW_ACTIONS && !locked && task.awaiting_recheck > 0 && (
              <button
                type="button"
                disabled={busy?.endsWith(task.batch_id) ?? false}
                onClick={onApproveAll}
                className="inline-flex items-center gap-sp-xs rounded-md border border-green-200 bg-green-50 px-sp-md py-sp-xs text-xs font-medium text-green-700 hover:bg-green-100 disabled:opacity-40"
              >
                <Check size={12} /> Check
              </button>
            )}
          </div>
        </td>
      </tr>
      {SHOW_PAPER_EXPANSION && expanded && (
        <PaperSubRows
          papers={papers} batchId={task.batch_id} stage={stage} reviewers={reviewers} rmap={rmap}
          myEmail={myEmail} lead={lead} highlightEmail={highlight?.batchId === task.batch_id ? highlight.email : null}
          openPopover={openPopover} setOpenPopover={setOpenPopover}
          onAssignPaper={onAssignPaper} onUnassignPaper={onUnassignPaper} onAssignPapers={onAssignPapers}
        />
      )}
    </>
  );
}

// Per-paper status for the current stage: Ready for check once the maker sends it, then the checker's verdict.
function paperState(row: QueueRow): { label: string; cls: string } {
  if (row.ready) return { label: "Ready for check", cls: "text-yellow-700" };
  if (row.verdict === "good") return { label: "Good", cls: "text-green-600" };
  if (row.verdict === "needs_work") return { label: "Needs work", cls: "text-red-600" };
  // No verdict yet: blank, not an old gate approval that the section status ignores.
  return { label: "—", cls: "text-gray-300" };
}

function PaperSubRows({
  papers, batchId, stage, reviewers, rmap, myEmail, lead, highlightEmail, openPopover, setOpenPopover,
  onAssignPaper, onUnassignPaper, onAssignPapers,
}: {
  papers?: QueueRow[];
  batchId: string;
  stage: ReviewStage;
  reviewers: Reviewer[];
  rmap: ReviewerMap;
  myEmail: string | null;
  lead: boolean;
  highlightEmail: string | null;
  openPopover: string | null;
  setOpenPopover: (v: string | null) => void;
  onAssignPaper: (studentId: string, role: AssignRole, email: string, force: boolean) => void;
  onUnassignPaper: (studentId: string, role: AssignRole) => void;
  onAssignPapers: (studentIds: string[], role: AssignRole, email: string) => void;
}) {
  // Multi-select (leads only): checkbox per row + drag-to-select across rows. A subset of
  // papers can then be bulk-assigned to one person via the action bar (uses studentIds).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkRole, setBulkRole] = useState<AssignRole | null>(null); // which role's popover is open
  // Drag-select state lives in a ref, not useState, so the rapid mouseenter events
  // during a drag read a stable value instead of a stale render closure. null = not
  // dragging; true = drag is selecting rows; false = drag is deselecting.
  const dragMode = useRef<boolean | null>(null);

  // One always-on mouseup ends any in-progress drag, wherever the button is released.
  useEffect(() => {
    const up = () => { dragMode.current = null; };
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  // Drop selection if the paper set changes (e.g. after an assign refresh).
  // `papers` is the cached array straight from the query, so its identity only
  // changes when the data actually does — this can't fire on every render.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSelected(new Set()); setBulkRole(null); }, [papers]);

  // These rows sit directly in the table body, so they must be <tr>s, not <div>s.
  if (!papers) return (
    <tr><td colSpan={SHOW_GATE_STATUS ? 6 : 5} className="px-sp-xl py-sp-md text-xs text-muted-foreground">Loading papers…</td></tr>
  );
  if (papers.length === 0) return (
    <tr><td colSpan={SHOW_GATE_STATUS ? 6 : 5} className="px-sp-xl py-sp-md text-xs italic text-muted-foreground">No papers.</td></tr>
  );
  const popKey = (sid: string, role: AssignRole) => `pp:${batchId}:${sid}:${role}`;

  const sidOf = (p: QueueRow) => String(p.unit_ref.student_id ?? "");
  const setSel = (sid: string, on: boolean) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (on) next.add(sid); else next.delete(sid);
      return next;
    });
  // Begin a drag on the checkbox cell: arm the mode from the start row's current
  // state and apply it to that row at once. A plain click toggles exactly this row
  // (no neighbour fires mouseenter on a stationary press), so click and drag share
  // one path and a jittery click can no longer leak onto the next row.
  const dragStart = (sid: string) => {
    const mode = !selected.has(sid);
    dragMode.current = mode;
    setSel(sid, mode);
  };
  // Entering a row while the button is held extends the selection in the drag's mode.
  const dragOver = (sid: string) => { if (dragMode.current !== null) setSel(sid, dragMode.current); };

  const selIds = papers.map(sidOf).filter((s) => selected.has(s));
  // 4-eyes: when bulk-assigning a role, grey out people who already hold the OTHER role
  // on any selected paper.
  const otherRole: AssignRole = bulkRole === "maker" ? "checker" : "maker";
  const bulkExclude = new Set(
    papers
      .filter((p) => selected.has(sidOf(p)))
      .map((p) => (otherRole === "maker" ? p.maker : p.checker) ?? null)
      .filter((e): e is string => Boolean(e))
  );

  // Rows of the PARENT table, so the paper columns line up with the headings above.
  return (
    <>
      {lead && selIds.length > 0 && (
        <tr className="bg-blue-50/60">
          <td colSpan={SHOW_GATE_STATUS ? 6 : 5} className="flex items-center gap-sp-md border-b border-border px-sp-lg py-sp-sm text-xs">
          <span className="font-medium text-blue-700">{selIds.length} selected</span>
          <span className="text-gray-300">·</span>
          <span className="text-muted-foreground">Assign as</span>
          {(["maker", "checker"] as AssignRole[]).map((role) => (
            <div key={role} className="relative inline-block">
              <button
                type="button"
                onClick={() => setBulkRole(bulkRole === role ? null : role)}
                className="inline-flex items-center gap-sp-xs rounded-full border border-blue-200 bg-white px-sp-md py-sp-xxs font-medium capitalize text-blue-700 hover:bg-blue-50"
              >
                <UserPlus size={11} /> {role}
              </button>
              {bulkRole === role && (
                <AssigneePopover
                  reviewers={reviewers}
                  myEmail={myEmail}
                  exclude={bulkExclude}
                  excludeRole={otherRole}
                  onClose={() => setBulkRole(null)}
                  onPick={(e) => { setBulkRole(null); onAssignPapers(selIds, role, e); }}
                />
              )}
            </div>
          ))}
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="ml-sp-xs text-muted-foreground hover:text-gray-600"
          >
            Clear
          </button>
          </td>
        </tr>
      )}
      {papers.map((p) => {
            const sid = sidOf(p);
            const st = paperState(p);
            const sel = selected.has(sid);
            const hl =
              highlightEmail &&
              (p.maker === highlightEmail || p.checker === highlightEmail);
            return (
              <tr
                key={sid}
                // Lead-only: pressing anywhere on the row (except the assign chips /
                // open-link) starts a drag-select; dragging across rows extends it.
                // The whole row is the handle so you don't have to hit the checkbox.
                onMouseDown={(e) => {
                  if (!lead) return;
                  if ((e.target as HTMLElement).closest("button, a")) return; // chips/links act normally
                  e.preventDefault(); // suppress text selection during the drag
                  dragStart(sid);
                }}
                onMouseEnter={() => dragOver(sid)}
                className={`select-none border-b border-gray-50 last:border-0 ${
                  lead ? "cursor-pointer " : ""
                }${sel ? "bg-blue-50/70" : hl ? "bg-orange-50" : "bg-muted/20"}`}
              >
                <td className="px-sp-xl py-sp-sm">
                  <div className="flex items-center gap-sp-md pl-sp-xl">
                    {lead && (
                      <input
                        type="checkbox"
                        checked={sel}
                        readOnly
                        tabIndex={-1}
                        className="pointer-events-none accent-indigo-600"
                        title="Click a row, or drag across rows, to select"
                      />
                    )}
                    <span className="w-8 text-xs text-muted-foreground">{p.roll_number ?? "—"}</span>
                    <span className="text-xs font-medium text-gray-800">{p.student_name ?? sid.slice(0, 8)}</span>
                  </div>
                </td>
                <td className="px-sp-lg py-sp-sm">
                  <PaperChip
                    email={p.maker ?? null} reviewers={reviewers} rmap={rmap} myEmail={myEmail} lead={lead}
                    exclude={new Set(p.checker ? [p.checker] : [])} excludeRole="checker"
                    open={openPopover === popKey(sid, "maker")}
                    setOpen={(v) => setOpenPopover(v ? popKey(sid, "maker") : null)}
                    onAssign={(e, f) => onAssignPaper(sid, "maker", e, f)}
                    onUnassign={() => onUnassignPaper(sid, "maker")}
                  />
                </td>
                <td className="px-sp-lg py-sp-sm">
                  <PaperChip
                    email={p.checker ?? null} reviewers={reviewers} rmap={rmap} myEmail={myEmail} lead={lead}
                    exclude={new Set(p.maker ? [p.maker] : [])} excludeRole="maker"
                    open={openPopover === popKey(sid, "checker")}
                    setOpen={(v) => setOpenPopover(v ? popKey(sid, "checker") : null)}
                    onAssign={(e, f) => onAssignPaper(sid, "checker", e, f)}
                    onUnassign={() => onUnassignPaper(sid, "checker")}
                  />
                </td>
                <td className={`px-sp-lg py-sp-sm ${st.cls}`}>{st.label}</td>
                <td className="px-sp-lg py-sp-sm text-right">
                  <a
                    href={`/${stage === "chunking" ? "pdfExtract" : "answerEditing"}?batchId=${encodeURIComponent(batchId)}&studentId=${encodeURIComponent(sid)}`}
                    className="inline-flex items-center gap-sp-xs text-blue-600 hover:text-blue-800"
                  >
                    open <ExternalLink size={11} />
                  </a>
                </td>
              </tr>
            );
      })}
    </>
  );
}
