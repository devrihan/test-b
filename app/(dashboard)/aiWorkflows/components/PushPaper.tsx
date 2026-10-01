"use client";

import { useState } from "react";
import { pushPaperReference, type Paper, type PushReferenceResult } from "../lib/api";
import { Note } from "./Bits";

/**
 * A scanned paper the dashboard database does not hold yet. Nothing downstream
 * (pipeline, bridge, summaries) can key on it until it is pushed: the paper,
 * its questions, its answer keys and its chapter → concept mapping travel by
 * name and the paper keeps its id (the batches reference it).
 */
export function PushPaper({ paper, onPushed }: { paper: Paper; onPushed: () => void }) {
  const [busy, setBusy] = useState<"dry" | "push" | null>(null);
  const [result, setResult] = useState<PushReferenceResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const src = paper.source ?? null;

  async function run(dry: boolean) {
    setBusy(dry ? "dry" : "push");
    setError(null);
    try {
      const r = await pushPaperReference(paper.qp, dry);
      setResult(r);
      if (!dry) onPushed();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const gaps: string[] = [];
  if (src) {
    if (src.chapter_mapped < src.questions) gaps.push(`${src.questions - src.chapter_mapped} of ${src.questions} questions have no chapter`);
    if (src.concept_mapped < src.questions) gaps.push(`${src.questions - src.concept_mapped} have no concept`);
    if (src.keys_ready < src.non_mcq) gaps.push(`${src.non_mcq - src.keys_ready} of ${src.non_mcq} answer keys are not READY`);
  }

  return (
    <div className="rounded-lg border border-amber-300 bg-amber-50 p-4">
      <div className="text-sm font-semibold text-amber-900">This paper is not on the dashboard yet</div>
      <p className="mt-1 text-sm text-amber-900/90">
        The scans reference paper {paper.qp}, but the dashboard database has no such paper, so the pipeline, the
        crops bridge and the summaries cannot key on it. Push it from the Question Paper side: the paper, its
        questions, its answer keys and its chapter and concept mapping are matched by name; the paper keeps its id.
      </p>
      {src ? (
        <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
          <dt className="text-gray-600">Source paper</dt>
          <dd className="font-mono text-xs">{src.exam}</dd>
          <dt className="text-gray-600">Questions</dt>
          <dd>{src.questions} ({src.mcq} MCQ)</dd>
          <dt className="text-gray-600">Chapter / concept mapped</dt>
          <dd>{src.chapter_mapped} / {src.concept_mapped}</dd>
          <dt className="text-gray-600">Answer keys READY</dt>
          <dd>{src.keys_ready} of {src.non_mcq}</dd>
        </dl>
      ) : (
        <Note>The River-side database could not be read from here; the push will say what it finds.</Note>
      )}
      {gaps.length > 0 && (
        <p className="mt-2 text-xs text-amber-900/80">
          Still to do on the Question Paper and Answer Key pages before the cards and the chapter pages work: {gaps.join("; ")}.
          The push can be repeated after — it updates in place.
        </p>
      )}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => run(true)}
          disabled={busy !== null}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          {busy === "dry" ? "Checking…" : "Dry run"}
        </button>
        <button
          type="button"
          onClick={() => run(false)}
          disabled={busy !== null}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          {busy === "push" ? "Pushing…" : "Push paper to dashboard"}
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {result && (
        <div className="mt-3 rounded-md border border-gray-200 bg-white p-3 text-xs">
          <div className="font-medium">
            {result.result.dry_run ? "Dry run — nothing written." : "Pushed."} Paper {result.result.paper ?? "unchanged"};{" "}
            questions kept id {result.result.questions.kept_id}, new id {result.result.questions.new_id}, updated{" "}
            {result.result.questions.updated}; curriculum created: {result.result.curriculum.units} units,{" "}
            {result.result.curriculum.chapters} chapters, {result.result.curriculum.concepts} concepts; answer keys{" "}
            {result.result.answer_keys.inserted} new, {result.result.answer_keys.updated} updated.
          </div>
          {result.result.warnings.map((w) => (
            <div key={w} className="mt-1 text-amber-800">{w}</div>
          ))}
          {result.run_id && <div className="mt-1 text-gray-500">Recorded as run {result.run_id} on the Runs tab.</div>}
        </div>
      )}
    </div>
  );
}
