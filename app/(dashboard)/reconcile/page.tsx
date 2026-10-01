"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { keys } from "@/app/lib/queryKeys";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Check, AlertTriangle, Users, Copy } from "lucide-react";
import {
  getBatches,
  getRosterReconcile,
  getRoster,
  attachAdmissionNumber,
  type Batch,
  type RosterReconcileResult,
  type RosterEntry,
  type ReconcileLooseRow,
} from "@/app/(dashboard)/pdfExtract/lib/beaverApi";

// Reconciliation resolve-queue (#155). Renders the #144 roster reconcile output
// for a batch — matched / fuzzy_candidates / unmatched / duplicates — and lets
// ops attach the canonical admission_no to matched + chosen-fuzzy rows.
//
// The reconcile endpoint references the canonical roster row by `canonicalId`
// (the roster's PK), not by value, so we fetch the roster list in parallel and
// build a canonicalId → admission_no lookup to drive the one-click attach.

type Row = ReconcileLooseRow;

const NO_BATCHES: Batch[] = [];

export default function ReconcilePage() {
  const router = useRouter();

  const batchesQuery = useQuery({
    queryKey: keys.batch.all(),
    queryFn: () => getBatches().then(res => res.batches ?? []),
  });
  const batches = batchesQuery.data ?? NO_BATCHES;
  const batchesLoading = batchesQuery.isPending;
  const [selectedBatch,  setSelectedBatch]  = useState<string>("");

  const [result,  setResult]  = useState<RosterReconcileResult | null>(null);
  const [roster,  setRoster]  = useState<RosterEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // student_id currently mid-attach (disables its button + shows spinner).
  const [attaching, setAttaching] = useState<Set<string>>(new Set());
  // student_id → attached admission_no once a row is resolved this session.
  const [attached, setAttached] = useState<Record<string, string>>({});
  // fuzzy loose student_id → picked canonicalId.
  const [fuzzyPick, setFuzzyPick] = useState<Record<string, number>>({});
  const [toast, setToast] = useState<{ kind: "ok" | "err"; msg: string } | null>(null);

  // canonicalId → admission_no, from the roster list.
  const admByCanonicalId = useMemo(() => {
    const m = new Map<number, string>();
    for (const r of roster) m.set(r.id, r.admission_no);
    return m;
  }, [roster]);

  const rosterById = useMemo(() => {
    const m = new Map<number, RosterEntry>();
    for (const r of roster) m.set(r.id, r);
    return m;
  }, [roster]);

  const loadReconcile = useCallback(async (batchId: string) => {
    if (!batchId) return;
    setLoading(true);
    setError(null);
    setResult(null);
    setAttached({});
    setFuzzyPick({});
    try {
      const [rec, ros] = await Promise.all([
        getRosterReconcile(batchId),
        getRoster(batchId),
      ]);
      setResult(rec);
      setRoster(ros.roster ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load reconciliation");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selectedBatch) loadReconcile(selectedBatch);
  }, [selectedBatch, loadReconcile]);

  const showToast = (kind: "ok" | "err", msg: string) => {
    setToast({ kind, msg });
    setTimeout(() => setToast(null), 3000);
  };

  const attach = async (loose: Row, canonicalId: number | null) => {
    if (canonicalId == null) return;
    const admission = admByCanonicalId.get(canonicalId);
    if (!admission) {
      showToast("err", "No admission number found for the matched roster row");
      return;
    }
    setAttaching(prev => new Set(prev).add(loose.student_id));
    try {
      await attachAdmissionNumber(selectedBatch, loose.student_id, admission);
      setAttached(prev => ({ ...prev, [loose.student_id]: admission }));
      showToast("ok", `Attached ${admission} to ${loose.student_name}`);
    } catch (err) {
      showToast("err", err instanceof Error ? err.message : "Failed to attach admission number");
    } finally {
      setAttaching(prev => {
        const next = new Set(prev);
        next.delete(loose.student_id);
        return next;
      });
    }
  };

  const matched    = result?.matched ?? [];
  const fuzzy      = result?.fuzzy_candidates ?? [];
  const unmatched  = result?.unmatched ?? [];
  const duplicates = result?.duplicates ?? [];

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-6">
      <button
        onClick={() => router.push("/")}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium transition mb-4"
      >
        <ArrowLeft size={15} /> Back
      </button>

      <div className="max-w-5xl mx-auto">
        <h1 className="text-xl font-bold text-gray-900 mb-1">Roster Reconciliation</h1>
        <p className="text-sm text-gray-500 mb-5">
          Match the ingested batch students against the IT-dept roster and attach
          admission numbers. Pick a batch to review its exceptions.
        </p>

        {/* Batch picker */}
        <div className="flex items-center gap-3 mb-6">
          <label className="text-[10px] font-bold uppercase tracking-wider text-gray-400 shrink-0">
            Batch
          </label>
          <div className="relative">
            <select
              value={selectedBatch}
              onChange={e => setSelectedBatch(e.target.value)}
              disabled={batchesLoading}
              className={`h-9 pl-3 pr-8 text-sm font-medium rounded-lg border appearance-none cursor-pointer transition focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 ${selectedBatch ? "bg-indigo-50 border-indigo-300 text-indigo-700" : "bg-white border-gray-200 text-gray-500"}`}
            >
              <option value="">{batchesLoading ? "Loading batches…" : "Select a batch"}</option>
              {batches.map(b => (
                <option key={b.batch_id} value={b.batch_id}>
                  {b.batch_name} — {b.grade}/{b.section}/{b.subject}
                </option>
              ))}
            </select>
          </div>
          {result && (
            <span className="text-xs text-gray-400">
              {result.loose_count} ingested · {result.canonical_count} on roster
            </span>
          )}
        </div>

        {loading && (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-indigo-500" />
          </div>
        )}

        {error && (
          <div className="text-center py-16">
            <p className="text-red-500 text-sm font-medium">{error}</p>
            <button
              onClick={() => loadReconcile(selectedBatch)}
              className="mt-3 text-indigo-600 text-sm underline"
            >
              Try again
            </button>
          </div>
        )}

        {!loading && !error && !result && selectedBatch === "" && (
          <p className="text-center py-16 text-gray-400 text-sm font-medium">
            Select a batch to begin.
          </p>
        )}

        {!loading && !error && result && (
          <div className="space-y-8">

            {/* ── Matched ───────────────────────────────────────────── */}
            <Section
              icon={<Check size={15} className="text-green-600" />}
              title="Matched"
              count={matched.length}
              accent="green"
              empty="No exact matches."
            >
              {matched.length > 0 && (
                <table className="w-full text-sm">
                  <Thead cols={["Student", "Roll", "Roster admission #", ""]} />
                  <tbody>
                    {matched.map(({ loose, canonicalId }) => {
                      const admission = canonicalId != null ? admByCanonicalId.get(canonicalId) : undefined;
                      const done = attached[loose.student_id];
                      const busy = attaching.has(loose.student_id);
                      return (
                        <tr key={loose.student_id} className="border-t border-gray-100">
                          <td className="py-2.5 pr-3 font-medium text-gray-800">{loose.student_name}</td>
                          <td className="py-2.5 pr-3 text-gray-500 font-mono text-xs">{loose.roll_number}</td>
                          <td className="py-2.5 pr-3 font-mono text-xs text-gray-700">{admission ?? "—"}</td>
                          <td className="py-2.5 text-right">
                            {done ? (
                              <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
                                <Check size={13} /> Attached {done}
                              </span>
                            ) : (
                              <button
                                onClick={() => attach(loose, canonicalId)}
                                disabled={busy || !admission}
                                className="inline-flex items-center gap-1.5 h-8 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition"
                              >
                                {busy ? <Loader2 size={13} className="animate-spin" /> : null}
                                Attach admission #
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Section>

            {/* ── Fuzzy candidates ──────────────────────────────────── */}
            <Section
              icon={<Users size={15} className="text-amber-600" />}
              title="Fuzzy candidates"
              count={fuzzy.length}
              accent="amber"
              empty="No fuzzy candidates."
            >
              <div className="space-y-3">
                {fuzzy.map(({ loose, candidates }) => {
                  const picked = fuzzyPick[loose.student_id];
                  const done = attached[loose.student_id];
                  const busy = attaching.has(loose.student_id);
                  return (
                    <div key={loose.student_id} className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
                      <div className="flex items-center justify-between gap-3 mb-2">
                        <div className="text-sm">
                          <span className="font-semibold text-gray-800">{loose.student_name}</span>
                          <span className="text-gray-400 ml-2 font-mono text-xs">roll {loose.roll_number}</span>
                        </div>
                        {done ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-green-700">
                            <Check size={13} /> Attached {done}
                          </span>
                        ) : (
                          <button
                            onClick={() => attach(loose, picked ?? null)}
                            disabled={busy || picked == null}
                            className="inline-flex items-center gap-1.5 h-8 px-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition"
                          >
                            {busy ? <Loader2 size={13} className="animate-spin" /> : null}
                            Attach selected
                          </button>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        {candidates.map(c => {
                          const cand = c.canonicalId != null ? rosterById.get(c.canonicalId) : undefined;
                          const isPicked = picked === c.canonicalId;
                          return (
                            <label
                              key={String(c.canonicalId)}
                              className={`flex items-center gap-3 px-3 py-2 rounded-md border cursor-pointer transition text-sm ${isPicked ? "border-indigo-400 bg-indigo-50" : "border-gray-200 bg-white hover:border-gray-300"}`}
                            >
                              <input
                                type="radio"
                                name={`fuzzy-${loose.student_id}`}
                                checked={isPicked}
                                disabled={!!done}
                                onChange={() =>
                                  c.canonicalId != null &&
                                  setFuzzyPick(prev => ({ ...prev, [loose.student_id]: c.canonicalId as number }))
                                }
                                className="accent-indigo-600"
                              />
                              <span className="font-medium text-gray-800">{cand?.student_name ?? "—"}</span>
                              <span className="text-gray-400 font-mono text-xs">roll {cand?.roll_number ?? "—"}</span>
                              <span className="text-gray-500 font-mono text-xs">{cand?.admission_no ?? "—"}</span>
                              <span className="ml-auto text-[11px] font-semibold text-amber-700">
                                {(c.score * 100).toFixed(0)}% match
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>

            {/* ── Unmatched (display only) ──────────────────────────── */}
            <Section
              icon={<AlertTriangle size={15} className="text-red-500" />}
              title="Unmatched"
              count={unmatched.length}
              accent="red"
              empty="Nothing unmatched."
            >
              {unmatched.length > 0 && (
                <table className="w-full text-sm">
                  <Thead cols={["Student", "Roll", "Ingest admission_no"]} />
                  <tbody>
                    {unmatched.map((u: Row) => (
                      <tr key={u.student_id} className="border-t border-gray-100">
                        <td className="py-2.5 pr-3 font-medium text-gray-800">{u.student_name}</td>
                        <td className="py-2.5 pr-3 text-gray-500 font-mono text-xs">{u.roll_number}</td>
                        <td className="py-2.5 text-gray-500 font-mono text-xs">{u.admission_no ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            {/* ── Duplicates (display only) ─────────────────────────── */}
            <Section
              icon={<Copy size={15} className="text-purple-500" />}
              title="Duplicates"
              count={duplicates.length}
              accent="purple"
              empty="No duplicate keys."
            >
              <div className="space-y-3">
                {duplicates.map((g, i) => (
                  <div key={`${g.side}-${g.key}-${i}`} className="rounded-lg border border-purple-200 bg-purple-50/40 p-3">
                    <div className="flex items-center gap-2 mb-2 text-xs">
                      <span className="font-bold uppercase tracking-wider text-purple-700">{g.side}</span>
                      <span className="font-mono text-gray-500">{g.key}</span>
                      <span className="text-gray-400">· {g.rows.length} rows</span>
                    </div>
                    <ul className="space-y-1 text-sm">
                      {g.rows.map((r, j) => (
                        <li key={r.student_id ?? j} className="flex items-center gap-3">
                          <span className="font-medium text-gray-800">{r.student_name}</span>
                          <span className="text-gray-400 font-mono text-xs">roll {r.roll_number}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </Section>
          </div>
        )}
      </div>

      {toast && (
        <div
          className={`fixed bottom-6 right-6 px-4 py-3 rounded-lg shadow-lg text-sm font-medium z-50 ${toast.kind === "ok" ? "bg-green-600 text-white" : "bg-red-600 text-white"}`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

// ── Small presentational helpers ─────────────────────────────────────────

const ACCENT: Record<string, string> = {
  green:  "bg-green-100 text-green-700",
  amber:  "bg-amber-100 text-amber-700",
  red:    "bg-red-100 text-red-700",
  purple: "bg-purple-100 text-purple-700",
};

function Section({
  icon, title, count, accent, empty, children,
}: {
  icon:     React.ReactNode;
  title:    string;
  count:    number;
  accent:   string;
  empty:    string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h2 className="text-sm font-bold text-gray-900">{title}</h2>
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${ACCENT[accent]}`}>{count}</span>
      </div>
      <div className="bg-white border border-gray-200 rounded-xl px-4 py-3">
        {count === 0 ? <p className="text-xs text-gray-400 py-2">{empty}</p> : children}
      </div>
    </section>
  );
}

function Thead({ cols }: { cols: string[] }) {
  return (
    <thead>
      <tr className="text-[10px] font-bold uppercase tracking-wider text-gray-400 text-left">
        {cols.map((c, i) => (
          <th key={i} className={`pb-1 ${i === cols.length - 1 ? "text-right" : ""}`}>{c}</th>
        ))}
      </tr>
    </thead>
  );
}
