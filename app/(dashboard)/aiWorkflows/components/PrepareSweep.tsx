"use client";

// OCR sweep: re-read the scanned answers for a paper and write corrections back.
// Scope it, look at the preview, then start. The preview is the whole point —
// a sweep over a whole paper is thousands of answers and costs real money.

import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Spinner,
  cn,
} from "@student-ds/ui";
import { Play, RefreshCw } from "lucide-react";
import {
  errMsg,
  getSweepPreview,
  startSweep,
  type Prepare,
  type Run,
  type SweepPreview,
} from "../lib/api";
import { Note } from "./Bits";
import { AccountPicker } from "./AccountPicker";

export function PrepareSweep({
  prepare,
  onStarted,
  disabled,
}: {
  prepare: Prepare;
  onStarted: (run: Run) => void;
  disabled: boolean;
}) {
  const sections = useMemo(
    () => prepare.sections.map((s) => s.section),
    [prepare.sections]
  );
  const [picked, setPicked] = useState<string[]>(sections);
  const [scope, setScope] = useState<"from" | "list">("from");
  const [minQuestion, setMinQuestion] = useState("1");
  const [questionList, setQuestionList] = useState("");
  const [perShard, setPerShard] = useState("120");
  const [modelReview, setModelReview] = useState("");
  const [account, setAccount] = useState("");
  const [onlyMissingText, setOnlyMissingText] = useState(false);

  const [preview, setPreview] = useState<SweepPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);

  const explicitQuestions = useMemo(
    () =>
      questionList
        .split(/[\s,]+/)
        .map((s) => Number(s))
        .filter((n) => Number.isInteger(n) && n > 0),
    [questionList]
  );

  const scopeValid =
    picked.length > 0 &&
    (scope === "from"
      ? Number.isInteger(Number(minQuestion)) && Number(minQuestion) > 0
      : explicitQuestions.length > 0);

  // Any change to the scope invalidates the preview — never let someone start
  // against numbers that describe a different scope. Shard size counts: it
  // changes how many shards the same answers are cut into.
  useEffect(() => {
    setPreview(null);
    setPreviewError(null);
  }, [picked, scope, minQuestion, questionList, perShard, onlyMissingText]);

  async function runPreview() {
    setPreviewing(true);
    setPreviewError(null);
    try {
      setPreview(
        await getSweepPreview(prepare.paper.qp, {
          sections: picked,
          ...(scope === "from"
            ? { min_question: Number(minQuestion) }
            : { questions: explicitQuestions }),
          ...(Number(perShard) > 0 ? { per_shard: Number(perShard) } : {}),
          ...(onlyMissingText ? { only_missing_text: true } : {}),
        })
      );
    } catch (e) {
      setPreview(null);
      setPreviewError(errMsg(e));
    } finally {
      setPreviewing(false);
    }
  }

  async function start() {
    setStarting(true);
    setStartError(null);
    try {
      const run = await startSweep({
        qp: prepare.paper.qp,
        sections: picked,
        ...(scope === "from"
          ? { min_question: Number(minQuestion) }
          : { questions: explicitQuestions }),
        per_shard: Number(perShard) || undefined,
        ...(modelReview.trim() ? { model_review: modelReview.trim() } : {}),
        ...(account ? { account } : {}),
        ...(onlyMissingText ? { only_missing_text: true } : {}),
      });
      setConfirming(false);
      onStarted(run);
    } catch (e) {
      setStartError(errMsg(e));
    } finally {
      setStarting(false);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="text-base font-semibold text-gray-900">
          Re-read the scanned answers and correct the text
        </h2>
        <p className="mt-0.5 max-w-3xl text-sm text-gray-600">
          A sweep sends the answer images back through a reader and writes down
          where the stored text is wrong. It is what you run when the readiness
          grid is full of red — better text now means more answers the agent can
          judge later. It writes corrections, not marks.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-4 rounded-lg border border-gray-200 bg-white px-4 py-4">
          <h3 className="text-sm font-semibold text-gray-900">What to sweep</h3>

          <div>
            <span className="block text-xs font-medium text-gray-700">Sections</span>
            <div className="mt-1.5 flex flex-wrap gap-2">
              {sections.map((s) => {
                const on = picked.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() =>
                      setPicked((c) =>
                        c.includes(s) ? c.filter((x) => x !== s) : [...c, s]
                      )
                    }
                    className={cn(
                      "flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition",
                      on
                        ? "border-indigo-400 bg-indigo-50 text-indigo-900"
                        : "border-gray-200 bg-white text-gray-600 hover:border-gray-300"
                    )}
                  >
                    <Checkbox checked={on} className="pointer-events-none" />
                    {s}
                  </button>
                );
              })}
            </div>
            {picked.length === 0 && (
              <p className="mt-1.5 text-xs text-rose-700">Pick at least one section.</p>
            )}
          </div>

          <div>
            <span className="block text-xs font-medium text-gray-700">Questions</span>
            <div className="mt-1.5 flex flex-col gap-2">
              <label className="flex items-center gap-2 text-sm text-gray-800">
                <input
                  type="radio"
                  checked={scope === "from"}
                  onChange={() => setScope("from")}
                />
                Everything from question
                <input
                  value={minQuestion}
                  onChange={(e) => setMinQuestion(e.target.value)}
                  onFocus={() => setScope("from")}
                  className="w-16 rounded-md border border-gray-300 px-2 py-1 text-sm outline-none focus:border-indigo-400"
                />
                onwards
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-800">
                <input
                  type="radio"
                  checked={scope === "list"}
                  onChange={() => setScope("list")}
                />
                Just these questions
                <input
                  value={questionList}
                  onChange={(e) => setQuestionList(e.target.value)}
                  onFocus={() => setScope("list")}
                  placeholder="e.g. 3, 7, 12"
                  className="w-40 rounded-md border border-gray-300 px-2 py-1 text-sm outline-none focus:border-indigo-400"
                />
              </label>
              {scope === "list" && questionList.trim() && explicitQuestions.length === 0 && (
                <p className="text-xs text-rose-700">
                  No question numbers recognised — write them as numbers separated by
                  commas.
                </p>
              )}
            </div>
          </div>

          <label className="flex cursor-pointer items-start gap-2">
            <Checkbox
              checked={onlyMissingText}
              onCheckedChange={(v) => setOnlyMissingText(v === true)}
              className="mt-0.5"
            />
            <span>
              <span className="block text-sm font-medium text-gray-900">
                Only answers with no stored text
              </span>
              <span className="block text-xs text-gray-500">
                Skips everything that was already transcribed and reads just the
                gaps — the answers a sweep helps most, at a fraction of the cost.
              </span>
            </span>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="block text-xs font-medium text-gray-700">
                Answers per shard
              </span>
              <span className="block text-[11px] text-gray-500">
                How the work is cut up across workers.
              </span>
              <input
                value={perShard}
                onChange={(e) => setPerShard(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
              />
            </label>
            <label className="block">
              <span className="block text-xs font-medium text-gray-700">Model</span>
              <span className="block text-[11px] text-gray-500">
                Blank uses the default.
              </span>
              <input
                value={modelReview}
                onChange={(e) => setModelReview(e.target.value)}
                placeholder="default"
                className="mt-1 w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
              />
            </label>
            <AccountPicker kind="ocr_sweep" value={account} onChange={setAccount} />
          </div>

          <div>
            <Button
              variant="outline"
              size="sm"
              onClick={runPreview}
              disabled={!scopeValid || previewing || disabled}
            >
              {previewing ? (
                <Spinner className="size-3.5" />
              ) : (
                <RefreshCw className="size-3.5" />
              )}
              Show me what this covers
            </Button>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {previewError ? (
            <Note tone="error" title="Could not work out the scope">
              {previewError}
            </Note>
          ) : !preview ? (
            <Note tone="plain">
              Set the scope on the left, then ask for a preview. Nothing starts until
              you have seen how many answers this touches.
            </Note>
          ) : (
            <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-white px-4 py-4">
              <h3 className="text-sm font-semibold text-gray-900">
                What this sweep covers
              </h3>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat n={preview.answers} label="answers" />
                <Stat n={preview.students} label="students" />
                <Stat n={preview.sections.length} label="sections" />
                <Stat
                  n={preview.shard_count ?? preview.shards.length}
                  label={`shards of ${preview.per_shard}`}
                />
              </div>
              <dl className="flex flex-col gap-1.5 border-t border-gray-100 pt-3 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-600">
                    Answers with no stored text at all
                  </dt>
                  <dd className="font-medium tabular-nums text-gray-900">
                    {preview.empty_ocr}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-gray-600">Answers with no cropped image</dt>
                  <dd className="font-medium tabular-nums text-gray-900">
                    {preview.no_crop}
                  </dd>
                </div>
              </dl>
              {preview.no_crop > 0 && (
                <p className="text-xs text-amber-800">
                  The {preview.no_crop} answers with no cropped image cannot be
                  re-read — there is no picture to read. Open their cells in the
                  readiness grid to rebuild the crop or send them to the Ops TO-DO.
                </p>
              )}
              {preview.answers === 0 && (
                <p className="text-xs text-rose-800">
                  Nothing falls inside this scope. Widen the sections or the question
                  range.
                </p>
              )}

              <div>
                <Button
                  onClick={() => setConfirming(true)}
                  disabled={starting || preview.answers === 0 || disabled}
                >
                  <Play className="size-4" />
                  Start the sweep
                </Button>
              </div>

              {/* A sweep bills for every answer it re-reads, so the scope gets
                  said back in words before anything is spent. */}
              <Dialog open={confirming} onOpenChange={(v) => !starting && setConfirming(v)}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Start this sweep?</DialogTitle>
                    <DialogDescription>
                      This sends every answer below back through a reader. It
                      costs real money and cannot be undone part-way — what it
                      has already written stays written.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="flex flex-col gap-2 rounded-lg border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-gray-800">
                    <p>
                      <span className="font-semibold tabular-nums">
                        {preview.answers.toLocaleString()} answers
                      </span>{" "}
                      from{" "}
                      <span className="font-semibold tabular-nums">
                        {preview.students.toLocaleString()} students
                      </span>{" "}
                      across{" "}
                      <span className="font-semibold">
                        {preview.sections.length} section
                        {preview.sections.length === 1 ? "" : "s"}
                      </span>{" "}
                      ({preview.sections.join(" ")}), cut into{" "}
                      <span className="font-semibold tabular-nums">
                        {preview.shard_count ?? preview.shards.length} shards
                      </span>{" "}
                      of {preview.per_shard}.
                    </p>
                    <p>
                      {preview.empty_ocr > 0
                        ? `${preview.empty_ocr.toLocaleString()} of them have no stored text at all — those are the ones a sweep helps most.`
                        : "All of them already have stored text; the sweep is checking it rather than filling gaps."}
                    </p>
                    {preview.no_crop > 0 && (
                      <p className="text-amber-800">
                        {preview.no_crop.toLocaleString()} have no cropped image
                        and will be skipped — there is no picture to read. Deal
                        with those from their cells in the readiness grid.
                      </p>
                    )}
                    <p className="text-gray-600">
                      It writes corrections to the stored text. It does not
                      change any marks, and nothing reaches teachers from here.
                    </p>
                  </div>
                  {startError && (
                    <Note tone="error" title="Could not start the sweep">
                      {startError}
                    </Note>
                  )}
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setConfirming(false)}
                      disabled={starting}
                    >
                      Back out
                    </Button>
                    <Button onClick={start} disabled={starting}>
                      {starting ? (
                        <Spinner className="size-4" />
                      ) : (
                        <Play className="size-4" />
                      )}
                      Start the sweep
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ n, label }: { n: number; label: string }) {
  return (
    <div className="rounded-md bg-gray-50 px-3 py-2">
      <div className="text-lg font-semibold tabular-nums text-gray-900">
        {n.toLocaleString()}
      </div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
