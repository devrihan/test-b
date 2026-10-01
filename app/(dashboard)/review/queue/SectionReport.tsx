"use client";

// Section time report (Phase 3 of docs/plans/section-timing.md): total time per section, by person, role and round.

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { keys } from "@/app/lib/queryKeys";
import {
  getSectionReport,
  type ReportRound,
  type ReportSection,
  type ReviewStage,
  type ScopeFilterParams,
} from "@/app/lib/reviewApi";

const NO_SECTIONS: ReportSection[] = [];

function fmtDuration(seconds: number): string {
  if (seconds < 60) return "<1m";
  const min = Math.round(seconds / 60);
  if (min < 60) return `${min}m`;
  return `${Math.floor(min / 60)}h ${min % 60}m`;
}

function roleLabel(role: string | null): string {
  return role === "maker" ? "Maker" : role === "checker" ? "Checker" : "No role";
}

const STATE_META: Record<ReportRound["state"], { cls: string; title: string }> = {
  done: { cls: "border-border bg-white text-gray-700", title: "Finished with Done" },
  in_progress: { cls: "border-blue-200 bg-blue-50 text-blue-700", title: "In progress — time up to the last activity" },
  auto_closed: { cls: "border-dashed border-gray-300 bg-white text-gray-400", title: "Closed automatically — Done was never clicked" },
};

// One person's passes in one role on one section.
type PersonRounds = { actor: string; role: string | null; rounds: ReportRound[]; seconds: number };

function groupByPerson(rounds: ReportRound[]): PersonRounds[] {
  const map = new Map<string, PersonRounds>();
  for (const r of rounds) {
    const key = `${r.actor}|${r.role ?? ""}`;
    const p = map.get(key) ?? { actor: r.actor, role: r.role, rounds: [], seconds: 0 };
    p.rounds.push(r);
    p.seconds += r.seconds;
    map.set(key, p);
  }
  return [...map.values()];
}

function RoundChip({ r }: { r: ReportRound }) {
  const m = STATE_META[r.state];
  return (
    <span
      title={`${m.title}\n${new Date(r.started_at).toLocaleString()} → ${r.ended_at ? new Date(r.ended_at).toLocaleString() : "now"}`}
      className={`inline-flex items-center gap-sp-xxs rounded border px-sp-sm py-sp-xxs text-[11px] tabular-nums ${m.cls}`}
    >
      <span className="font-semibold">R{r.round}</span> {fmtDuration(r.seconds)}
      {r.state === "in_progress" && <span className="text-[10px]">· in progress</span>}
    </span>
  );
}

function RoleCell({ people, nameOf }: { people: PersonRounds[]; nameOf: (email: string) => string }) {
  if (people.length === 0) return <span className="text-xs text-gray-300">—</span>;
  return (
    <div className="space-y-sp-sm">
      {people.map((p) => (
        <div key={`${p.actor}|${p.role}`}>
          <div className="text-xs">
            <span className="font-medium text-gray-800">{nameOf(p.actor)}</span>
            {p.role === null && <span className="text-muted-foreground"> (no role)</span>}
            <span className="text-muted-foreground">
              {" · "}{p.rounds.length} round{p.rounds.length === 1 ? "" : "s"} · </span>
            <span className="font-semibold tabular-nums text-gray-900">{fmtDuration(p.seconds)}</span>
          </div>
          <div className="mt-sp-xxs flex flex-wrap gap-sp-xs">
            {p.rounds.map((r) => <RoundChip key={r.session_id} r={r} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SectionReport({
  stage, scope, from, to, setDates, nameOf,
}: {
  stage: ReviewStage;
  scope: ScopeFilterParams;
  from: string;
  to: string;
  setDates: (d: { from?: string | null; to?: string | null }) => void;
  nameOf: (email: string) => string;
}) {
  const reportQuery = useQuery({
    queryKey: keys.review.report({ stage, scope, from, to }),
    queryFn: () => getSectionReport({ stage, scope, from: from || undefined, to: to || undefined }),
  });
  const sections = reportQuery.data ?? NO_SECTIONS;

  // Per-person totals across every section in view.
  const byPerson = useMemo(() => {
    const map = new Map<string, { actor: string; role: string | null; sections: Set<string>; rounds: number; seconds: number }>();
    for (const s of sections) {
      for (const r of s.rounds) {
        const key = `${r.actor}|${r.role ?? ""}`;
        const p = map.get(key) ?? { actor: r.actor, role: r.role, sections: new Set<string>(), rounds: 0, seconds: 0 };
        p.sections.add(s.batch_id);
        p.rounds += 1;
        p.seconds += r.seconds;
        map.set(key, p);
      }
    }
    return [...map.values()].sort((a, b) => b.seconds - a.seconds);
  }, [sections]);

  const error = reportQuery.error instanceof Error ? reportQuery.error.message : null;

  return (
    <div className="space-y-sp-3xl">
      <div className="flex flex-wrap items-center gap-sp-md text-sm">
        <label className="flex items-center gap-sp-sm text-xs text-muted-foreground">
          From
          <input
            type="date" value={from} max={to || undefined}
            onChange={(e) => setDates({ from: e.target.value || null })}
            className="rounded-md border border-border bg-white px-sp-md py-sp-xs text-sm text-gray-800"
          />
        </label>
        <label className="flex items-center gap-sp-sm text-xs text-muted-foreground">
          To
          <input
            type="date" value={to} min={from || undefined}
            onChange={(e) => setDates({ to: e.target.value || null })}
            className="rounded-md border border-border bg-white px-sp-md py-sp-xs text-sm text-gray-800"
          />
        </label>
        {(from || to) && (
          <button type="button" onClick={() => setDates({ from: null, to: null })} className="text-xs text-muted-foreground hover:text-gray-700">
            Clear dates
          </button>
        )}
        <span className="ml-auto flex items-center gap-sp-md text-[11px] text-muted-foreground">
          <span className={`rounded border px-sp-sm ${STATE_META.done.cls}`}>R1 Done</span>
          <span className={`rounded border px-sp-sm ${STATE_META.in_progress.cls}`}>In progress</span>
          <span className={`rounded border px-sp-sm ${STATE_META.auto_closed.cls}`}>Auto-closed</span>
          <span>Total time = Done − first edit, breaks included</span>
        </span>
      </div>

      {error && <p className="rounded-md bg-red-50 p-sp-md text-sm text-red-600">{error}</p>}

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <div className="border-b border-border bg-muted/50 px-sp-xl py-sp-lg text-xs font-semibold text-gray-700">By person</div>
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-sp-xl py-sp-md">Person</th>
              <th className="px-sp-xl py-sp-md">Role</th>
              <th className="px-sp-xl py-sp-md text-right">Sections</th>
              <th className="px-sp-xl py-sp-md text-right">Rounds</th>
              <th className="px-sp-xl py-sp-md text-right">Total time</th>
            </tr>
          </thead>
          <tbody>
            {reportQuery.isPending ? (
              <tr><td colSpan={5} className="px-sp-lg py-sp-2xl text-center text-sm text-muted-foreground">Loading…</td></tr>
            ) : byPerson.length === 0 ? (
              <tr><td colSpan={5} className="px-sp-lg py-sp-2xl text-center text-sm italic text-muted-foreground">No timed work in this scope.</td></tr>
            ) : (
              byPerson.map((p) => (
                <tr key={`${p.actor}|${p.role}`} className="border-b border-border last:border-0">
                  <td className="px-sp-xl py-sp-md font-medium text-gray-800">{nameOf(p.actor)}</td>
                  <td className="px-sp-xl py-sp-md text-xs text-gray-600">{roleLabel(p.role)}</td>
                  <td className="px-sp-xl py-sp-md text-right tabular-nums">{p.sections.size}</td>
                  <td className="px-sp-xl py-sp-md text-right tabular-nums">{p.rounds}</td>
                  <td className="px-sp-xl py-sp-md text-right font-semibold tabular-nums">{fmtDuration(p.seconds)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-white">
        <div className="border-b border-border bg-muted/50 px-sp-xl py-sp-lg text-xs font-semibold text-gray-700">
          By section <span className="font-normal text-muted-foreground">· {sections.length} sections</span>
        </div>
        <table className="w-full text-sm">
          <thead className="border-b border-border text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-sp-xl py-sp-md">Section</th>
              <th className="px-sp-xl py-sp-md">Maker</th>
              <th className="px-sp-xl py-sp-md">Checker</th>
              <th className="px-sp-xl py-sp-md text-right">Section total</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((s) => {
              const people = groupByPerson(s.rounds);
              const total = s.rounds.reduce((a, r) => a + r.seconds, 0);
              return (
                <tr key={s.batch_id} className="border-b border-border align-top last:border-0">
                  <td className="px-sp-xl py-sp-lg">
                    <div className="font-medium text-gray-900">{s.label}</div>
                    <div className="text-[10px] text-gray-300">{s.batch_id}</div>
                  </td>
                  <td className="px-sp-xl py-sp-lg">
                    <RoleCell people={people.filter((p) => p.role !== "checker")} nameOf={nameOf} />
                  </td>
                  <td className="px-sp-xl py-sp-lg">
                    <RoleCell people={people.filter((p) => p.role === "checker")} nameOf={nameOf} />
                  </td>
                  <td className="px-sp-xl py-sp-lg text-right font-semibold tabular-nums">{fmtDuration(total)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
