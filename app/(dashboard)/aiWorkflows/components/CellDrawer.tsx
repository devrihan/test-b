"use client";

// One cell of the readiness grid — a question in a section — answer by answer.
// The server says what each answer still needs (heron's select.py); this
// drawer lets a person pick some of them and do exactly that and no more:
// re-code the uncoded, classify the unclassified, re-read the ones with no
// text, rebuild the crops that were never made, and send the ones with no
// bounding box to the Ops TO-DO. A whole-cell rerun stays one click away on
// the grid; this is for the leftovers.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  Spinner,
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  cn,
} from "@student-ds/ui";
import { ClipboardList, ImagePlus, Play, RefreshCw, ScanText } from "lucide-react";
import {
  errMsg,
  getCellAnswers,
  getRun,
  getSweepPreview,
  startSweep,
  type AnswerStatus,
  type CellAnswer,
  type CellAnswers,
  type Prepare,
  type Run,
  type RunDetail,
  type SweepPreview,
} from "../lib/api";
import {
  ANSWER_STATUS_CLASS,
  ANSWER_STATUS_EXPLAIN,
  ANSWER_STATUS_LABEL,
  ANSWER_STATUS_ORDER,
} from "../lib/readiness";
import { addOpsTodos, getCroppedImageUrl } from "@/app/(dashboard)/pdfExtract/lib/beaverApi";
import { Failed, Loading, Note } from "./Bits";
import { ApplyPanel } from "./RunDrawer";

export type CellTarget = {
  question: number;
  section: string;
  /** Statuses to tick on open. Defaults to the ones a rerun helps. */
  preselect?: AnswerStatus[];
};

/** Open the start drawer for these students only. */
export type StartSubset = (opts: {
  question: number;
  section: string;
  studentIds: string[];
  task: "classify" | "recode";
}) => void;

const DEFAULT_PRESELECT: AnswerStatus[] = ["uncoded", "unclassified"];

export function CellDrawer({
  prepare,
  target,
  open,
  onClose,
  onStartSubset,
  onSweepStarted,
  onOpenRun,
  onChanged,
  disabled,
}: {
  prepare: Prepare;
  target: CellTarget | null;
  open: boolean;
  onClose: () => void;
  onStartSubset: StartSubset;
  onSweepStarted: (run: Run) => void;
  onOpenRun: (id: string) => void;
  /** Something changed on the server that the grid should re-read. */
  onChanged: () => void;
  disabled: boolean;
}) {
  const [data, setData] = useState<CellAnswers | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<AnswerStatus | "all">("all");

  const qp = prepare.paper.qp;

  const load = useCallback(
    async (preselect: AnswerStatus[] | undefined, showSpinner: boolean) => {
      if (!target) return;
      if (showSpinner) setLoading(true);
      try {
        const d = await getCellAnswers(qp, target.question, target.section);
        setData(d);
        setError(null);
        if (preselect) {
          const want = new Set(preselect);
          setSelected(new Set(d.answers.filter((a) => want.has(a.status)).map((a) => a.student_id)));
        }
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setLoading(false);
      }
    },
    [qp, target]
  );

  useEffect(() => {
    setData(null);
    setError(null);
    setFilter("all");
    setSelected(new Set());
    if (open && target) load(target.preselect ?? DEFAULT_PRESELECT, true);
  }, [open, target, load]);

  const rows = useMemo(() => {
    const all = data?.answers ?? [];
    const order = new Map(ANSWER_STATUS_ORDER.map((s, i) => [s, i]));
    const sorted = [...all].sort(
      (a, b) =>
        (order.get(a.status) ?? 99) - (order.get(b.status) ?? 99) ||
        a.student_name.localeCompare(b.student_name)
    );
    return filter === "all" ? sorted : sorted.filter((a) => a.status === filter);
  }, [data, filter]);

  const picked = useMemo(
    () => (data?.answers ?? []).filter((a) => selected.has(a.student_id)),
    [data, selected]
  );
  const by = (status: AnswerStatus) => picked.filter((a) => a.status === status);
  const toRecode = by("uncoded");
  const toClassify = by("unclassified");
  const toReread = by("no_text");
  const toRebuild = by("no_crop_has_regions");
  const toDraw = by("no_crop");
  const toApply = by("pending_apply");
  // Anything ticked that no button can act on — so the footer can say why.
  const inert = picked.length - toRecode.length - toClassify.length - toReread.length - toRebuild.length - toDraw.length - toApply.length;

  const toggle = (id: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const setMany = (ids: string[], on: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });

  const title = target ? `Q${target.question} · Section ${target.section}` : "";

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl"
      >
        <SheetHeader className="border-b border-gray-200 px-6 py-4">
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription>
            Every student in this cell who lost marks, and what their answer still
            needs. Tick some and act on just those — the rest of the section keeps
            what it has.
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
          {loading && !data && <Loading what="this cell's answers" />}
          {error && !data && <Failed what="this cell's answers" error={error} />}
          {data && (
            <>
              <StatusChips
                counts={data.counts}
                filter={filter}
                onFilter={setFilter}
                onSelectAll={(status) =>
                  setMany(
                    data.answers.filter((a) => a.status === status).map((a) => a.student_id),
                    true
                  )
                }
              />

              <PendingExports
                answers={data.answers}
                onOpenRun={onOpenRun}
                onApplied={() => {
                  load(undefined, false);
                  onChanged();
                }}
              />

              <AnswerTable
                rows={rows}
                selected={selected}
                onToggle={toggle}
                onToggleAll={(on) => setMany(rows.map((a) => a.student_id), on)}
              />
            </>
          )}
        </div>

        {data && target && (
          <Footer
            qp={qp}
            target={target}
            pickedCount={picked.length}
            inert={inert}
            toRecode={toRecode}
            toClassify={toClassify}
            toReread={toReread}
            toRebuild={toRebuild}
            toDraw={toDraw}
            disabled={disabled}
            onStartSubset={onStartSubset}
            onSweepStarted={onSweepStarted}
            onRefresh={() => {
              load(undefined, false);
              onChanged();
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

/**
 * Verdicts a finished run holds for this cell that the dashboard has not
 * received. Exporting is the existing Apply — same dry-run summary, same typed
 * confirmation, same allowlist — brought to where the gap is visible.
 */
function PendingExports({
  answers,
  onOpenRun,
  onApplied,
}: {
  answers: CellAnswer[];
  onOpenRun: (id: string) => void;
  onApplied: () => void;
}) {
  const pending = useMemo(() => answers.filter((a) => a.status === "pending_apply"), [answers]);
  const runIds = useMemo(() => uniqueRuns(pending), [pending]);
  const key = runIds.join(",");
  const [runs, setRuns] = useState<Record<string, RunDetail | { error: string }>>({});

  useEffect(() => {
    let live = true;
    setRuns({});
    for (const id of runIds)
      getRun(id)
        .then((r) => live && setRuns((cur) => ({ ...cur, [id]: r })))
        .catch((e) => live && setRuns((cur) => ({ ...cur, [id]: { error: errMsg(e) } })));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (pending.length === 0) return null;

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-indigo-200 bg-indigo-50/30 px-4 py-3">
      <div>
        <h3 className="text-sm font-semibold text-gray-900">
          {pending.length} answer{pending.length === 1 ? " is" : "s are"} classified but not on the
          dashboard
        </h3>
        <p className="mt-0.5 text-xs text-gray-600">
          The verdicts sit in {runIds.length === 1 ? "a finished run" : `${runIds.length} finished runs`}{" "}
          that nobody has applied. Exporting is free — nothing is re-run. Applying a run writes every
          section that run finished, not only this cell; the table below says exactly what.
        </p>
      </div>
      {runIds.map((id) => {
        const r = runs[id];
        const count = pending.filter((a) => a.ledger?.run_id === id).length;
        return (
          <div key={id} className="flex flex-col gap-2">
            <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
              <button
                type="button"
                onClick={() => onOpenRun(id)}
                className="font-mono text-xs text-indigo-700 underline underline-offset-2"
              >
                {id}
              </button>
              <span>
                holds {count} of this cell&apos;s answers
              </span>
            </div>
            {!r ? (
              <Loading what="this run" />
            ) : "error" in r ? (
              <Note tone="error" title="Could not open this run">
                {r.error}
              </Note>
            ) : r.status !== "done" && r.status !== "partial" ? (
              <Note tone="plain">
                This run cannot be applied yet — it is {r.status}. Open it to see why.
              </Note>
            ) : (
              <ApplyPanel run={r} onChanged={onApplied} />
            )}
          </div>
        );
      })}
    </section>
  );
}

function uniqueRuns(rows: CellAnswer[]): string[] {
  return Array.from(new Set(rows.map((a) => a.ledger?.run_id).filter((x): x is string => !!x)));
}

// ── Status chips ────────────────────────────────────────────────────────────

function StatusChips({
  counts,
  filter,
  onFilter,
  onSelectAll,
}: {
  counts: Record<AnswerStatus, number>;
  filter: AnswerStatus | "all";
  onFilter: (f: AnswerStatus | "all") => void;
  onSelectAll: (status: AnswerStatus) => void;
}) {
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        onClick={() => onFilter("all")}
        className={cn(
          "rounded-full border px-2.5 py-0.5 text-xs",
          filter === "all"
            ? "border-gray-800 bg-gray-800 text-white"
            : "border-gray-300 bg-white text-gray-700 hover:border-gray-400"
        )}
      >
        all {total}
      </button>
      {ANSWER_STATUS_ORDER.filter((s) => counts[s] > 0).map((s) => (
        <Tooltip key={s}>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={() => onFilter(filter === s ? "all" : s)}
              onDoubleClick={() => onSelectAll(s)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-xs",
                ANSWER_STATUS_CLASS[s],
                filter === s && "ring-2 ring-gray-800 ring-offset-1"
              )}
            >
              {counts[s]} {ANSWER_STATUS_LABEL[s]}
            </button>
          </TooltipTrigger>
          <TooltipContent className="max-w-sm">
            {ANSWER_STATUS_EXPLAIN[s]}
            <span className="mt-1 block opacity-70">
              Click to show only these; double-click to tick them all.
            </span>
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}

// ── Table ───────────────────────────────────────────────────────────────────

function AnswerTable({
  rows,
  selected,
  onToggle,
  onToggleAll,
}: {
  rows: CellAnswer[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: (on: boolean) => void;
}) {
  if (rows.length === 0)
    return <Note tone="plain">No answers match this filter.</Note>;
  const allOn = rows.every((a) => selected.has(a.student_id));
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200">
      <table className="w-full min-w-[640px] border-collapse text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50/80 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
            <th className="w-8 px-3 py-2">
              <Checkbox
                aria-label="Tick every answer shown"
                checked={allOn}
                onCheckedChange={(v) => onToggleAll(v === true)}
              />
            </th>
            <th className="px-3 py-2">Student</th>
            <th className="px-3 py-2">Marks</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">What is known</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.student_id} className="border-b border-gray-100 align-top last:border-0">
              <td className="px-3 py-2">
                <Checkbox
                  checked={selected.has(a.student_id)}
                  onCheckedChange={() => onToggle(a.student_id)}
                  aria-label={`Tick ${a.student_name}`}
                />
              </td>
              <td className="px-3 py-2">
                <div className="font-medium text-gray-900">{a.student_name}</div>
                <div className="text-[11px] text-gray-500">
                  {a.admission_no || (a.unresolved ? a.unresolved : "no admission no.")}
                </div>
              </td>
              <td className="px-3 py-2 tabular-nums text-gray-700">
                {a.marks == null ? "—" : `${a.marks}/${a.max_marks}`}
              </td>
              <td className="px-3 py-2">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span
                      className={cn(
                        "inline-flex cursor-default items-center rounded border px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap",
                        ANSWER_STATUS_CLASS[a.status]
                      )}
                    >
                      {ANSWER_STATUS_LABEL[a.status]}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent className="max-w-sm">{ANSWER_STATUS_EXPLAIN[a.status]}</TooltipContent>
                </Tooltip>
              </td>
              <td className="px-3 py-2 text-xs text-gray-600">
                <Known a={a} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Known({ a }: { a: CellAnswer }) {
  const bits: string[] = [];
  if (a.prod?.error_code) bits.push(`code ${a.prod.error_code}`);
  else if (a.ledger?.error_code) bits.push(`run ${a.ledger.run_id}: ${a.ledger.error_code}`);
  if (a.prod?.reviewed_by) bits.push(`reviewed by ${a.prod.reviewed_by}`);
  if (!a.has_text) bits.push(a.has_crop ? "crop, no text" : a.has_regions ? "box, no crop" : "no box");
  const prior = a.prior?.what_went_wrong?.trim();
  return (
    <>
      {bits.length > 0 && <div>{bits.join(" · ")}</div>}
      {prior && (
        <div className="mt-0.5 line-clamp-2 text-gray-500" title={prior}>
          {prior}
        </div>
      )}
      {bits.length === 0 && !prior && <span className="text-gray-400">—</span>}
    </>
  );
}

// ── Footer actions ──────────────────────────────────────────────────────────

function Footer({
  qp,
  target,
  pickedCount,
  inert,
  toRecode,
  toClassify,
  toReread,
  toRebuild,
  toDraw,
  disabled,
  onStartSubset,
  onSweepStarted,
  onRefresh,
}: {
  qp: number;
  target: CellTarget;
  pickedCount: number;
  inert: number;
  toRecode: CellAnswer[];
  toClassify: CellAnswer[];
  toReread: CellAnswer[];
  toRebuild: CellAnswer[];
  toDraw: CellAnswer[];
  disabled: boolean;
  onStartSubset: StartSubset;
  onSweepStarted: (run: Run) => void;
  onRefresh: () => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ tone: "info" | "error" | "plain"; text: string } | null>(null);
  const [rereadPreview, setRereadPreview] = useState<SweepPreview | null>(null);
  const [rereadOpen, setRereadOpen] = useState(false);

  const say = (tone: "info" | "error" | "plain", text: string) => setMessage({ tone, text });

  async function rebuildCrops() {
    setBusy("rebuild");
    setMessage(null);
    let ok = 0;
    const failed: string[] = [];
    for (const a of toRebuild) {
      try {
        // beaver-api builds the crop from the drawn regions when none is stored,
        // uploads it and writes cropped_image_url — one call per answer.
        await getCroppedImageUrl(a.batch_id, a.student_id, String(target.question));
        ok++;
      } catch (e) {
        failed.push(`${a.student_name}: ${errMsg(e)}`);
      }
    }
    setBusy(null);
    say(
      failed.length ? "error" : "info",
      `${ok} crop${ok === 1 ? "" : "s"} rebuilt.` +
        (failed.length ? ` ${failed.length} failed — ${failed.slice(0, 3).join("; ")}` : "") +
        (ok ? " They now show as “no text” and can be re-read." : "")
    );
    onRefresh();
  }

  async function addToOpsTodo() {
    setBusy("todo");
    setMessage(null);
    try {
      const res = await addOpsTodos(
        toDraw.map((a) => ({
          batch_id: a.batch_id,
          student_id: a.student_id,
          question_key: String(target.question),
          kind: "draw_bbox" as const,
          reason: `No bounding box for Q${target.question} — lost marks but nothing is drawn, so it cannot be read or classified.`,
        })),
        "ai_workflows"
      );
      say("info", `${res.count} answer${res.count === 1 ? "" : "s"} added to the Ops TO-DO. Ops will see them under “Draw a bounding box”.`);
    } catch (e) {
      say("error", errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  async function openReread() {
    setBusy("preview");
    setMessage(null);
    try {
      const pv = await getSweepPreview(qp, {
        questions: [target.question],
        sections: [target.section],
        answer_ids: toReread.map((a) => a.answer_id),
        per_shard: Math.max(1, toReread.length),
      });
      setRereadPreview(pv);
      setRereadOpen(true);
    } catch (e) {
      say("error", errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  async function startReread() {
    setBusy("reread");
    try {
      const run = await startSweep({
        qp,
        sections: [target.section],
        questions: [target.question],
        answer_ids: toReread.map((a) => a.answer_id),
        per_shard: Math.max(1, toReread.length),
      });
      setRereadOpen(false);
      onSweepStarted(run);
    } catch (e) {
      say("error", errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  const nothing = pickedCount === 0;

  return (
    <div className="flex shrink-0 flex-col gap-3 border-t border-gray-200 bg-white px-6 py-4">
      {message && (
        <Note tone={message.tone} className="py-2">
          {message.text}
        </Note>
      )}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-xs text-gray-500">
          {nothing
            ? "Tick the answers to act on. The chips above tick a whole status at a double-click."
            : `${pickedCount} ticked` +
              (inert > 0
                ? ` — ${inert} of them ${inert === 1 ? "needs" : "need"} nothing a run can do (coded, reviewed, full marks, or waiting to be applied).`
                : "")}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={disabled || toRecode.length === 0 || !!busy}
            onClick={() =>
              onStartSubset({
                question: target.question,
                section: target.section,
                studentIds: toRecode.map((a) => a.student_id),
                task: "recode",
              })
            }
            title="Keeps each diagnosis as written; only the taxonomy code is attempted again."
          >
            <RefreshCw className="size-3.5" />
            Re-code {toRecode.length || ""}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || toClassify.length === 0 || !!busy}
            onClick={() =>
              onStartSubset({
                question: target.question,
                section: target.section,
                studentIds: toClassify.map((a) => a.student_id),
                task: "classify",
              })
            }
          >
            <Play className="size-3.5" />
            Classify {toClassify.length || ""}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={disabled || toReread.length === 0 || !!busy}
            onClick={openReread}
          >
            {busy === "preview" ? <Spinner className="size-3.5" /> : <ScanText className="size-3.5" />}
            Re-read {toReread.length || ""}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={toRebuild.length === 0 || !!busy}
            onClick={rebuildCrops}
          >
            {busy === "rebuild" ? <Spinner className="size-3.5" /> : <ImagePlus className="size-3.5" />}
            Rebuild {toRebuild.length || ""} crop{toRebuild.length === 1 ? "" : "s"}
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={toDraw.length === 0 || !!busy}
            onClick={addToOpsTodo}
          >
            {busy === "todo" ? <Spinner className="size-3.5" /> : <ClipboardList className="size-3.5" />}
            Add {toDraw.length || ""} to Ops TO-DO
          </Button>
        </div>
      </div>

      <Dialog open={rereadOpen} onOpenChange={(v) => busy !== "reread" && setRereadOpen(v)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Re-read {toReread.length} answer{toReread.length === 1 ? "" : "s"}?</DialogTitle>
            <DialogDescription>
              Each crop goes back through a reader, which costs real money. It writes
              a proposed correction to the stored text; nothing changes marks and nothing
              reaches teachers until the corrections are applied.
            </DialogDescription>
          </DialogHeader>
          {rereadPreview && (
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-800">
              <p>
                <span className="font-semibold tabular-nums">{rereadPreview.answers}</span> answer
                {rereadPreview.answers === 1 ? "" : "s"} from{" "}
                <span className="font-semibold tabular-nums">{rereadPreview.students}</span> student
                {rereadPreview.students === 1 ? "" : "s"} in section {target.section}, Q{target.question}.
              </p>
              {rereadPreview.no_crop > 0 && (
                <p className="mt-1 text-amber-800">
                  {rereadPreview.no_crop} of them have no crop and will be reported, not read.
                </p>
              )}
              {rereadPreview.answers === 0 && (
                <p className="mt-1 text-rose-800">
                  Nothing is in scope any more — the answers may have gained text since the cell was loaded.
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setRereadOpen(false)} disabled={busy === "reread"}>
              Back out
            </Button>
            <Button onClick={startReread} disabled={busy === "reread" || !rereadPreview || rereadPreview.answers === 0}>
              {busy === "reread" ? <Spinner className="size-4" /> : <Play className="size-4" />}
              Start the re-read
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
