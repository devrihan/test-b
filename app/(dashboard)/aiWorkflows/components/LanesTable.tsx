"use client";

// Where the work actually runs. Ops look at this when a run sits at "waiting"
// for too long — usually the answer is that every slot is busy, or a worker has
// stopped reporting in.

import { useMemo, useState } from "react";
import { Button, cn } from "@student-ds/ui";
import { RefreshCw } from "lucide-react";
import { getSeats, putSeat, type Lanes, type Seat, type Worker } from "../lib/api";
import { useResource } from "../hooks/useApi";
import { absoluteTime, relativeTime, untilTime } from "../lib/readiness";
import { Failed, Loading, Note } from "./Bits";

export function LanesTable({
  lanes,
  loading,
  error,
  onRefresh,
}: {
  lanes: Lanes | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  const byLane = useMemo(() => {
    const map = new Map<string, Worker[]>();
    for (const w of lanes?.workers ?? []) {
      const list = map.get(w.lane) ?? [];
      list.push(w);
      map.set(w.lane, list);
    }
    return [...map.entries()];
  }, [lanes]);

  if (loading && !lanes) return <Loading what="the workers" />;
  const seatsBlock = <Seats />;
  if (error && !lanes) return <Failed what="the worker list" error={error} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <p className="max-w-3xl text-sm text-gray-600">
          A lane is one login (or a few) served by one worker; lanes are how quota
          is shared out. A run waits until its lane has a free slot, so if
          everything here is busy or stale, that is why a run is sitting still.
        </p>
        <Button size="sm" variant="outline" onClick={onRefresh}>
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      {lanes?.temporal_error && (
        <Note tone="warn" title="Cannot see what is running right now">
          {lanes.temporal_error} — the workers below are still reported from the
          ledger, but the &ldquo;running now&rdquo; list may be incomplete.
        </Note>
      )}

      {byLane.length === 0 ? (
        <Note tone="plain">
          No workers have reported in. Nothing can run until at least one worker is
          up, so a run started now would sit waiting.
        </Note>
      ) : (
        <div className="flex flex-col gap-4">
          {seatsBlock}
          {byLane.map(([lane, workers]) => (
            <div key={lane} className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50/80 px-4 py-2">
                <span className="text-sm font-semibold text-gray-900">{lane}</span>
                <span className="text-xs text-gray-500">
                  {workers[0]?.kind === "ocr_sweep"
                    ? "runs OCR sweeps"
                    : "runs error classification"}
                </span>
              </div>
              <table className="w-full table-fixed border-collapse text-sm">
                <thead>
                  <tr className="border-b border-gray-100 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
                    <th className="w-48 px-4 py-2">Worker</th>
                    <th className="w-44 px-4 py-2">Queue</th>
                    <th className="px-4 py-2">Logins and slots</th>
                    <th className="w-24 px-4 py-2">Code</th>
                    <th className="w-40 px-4 py-2">Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {workers.map((w) => (
                    <tr key={`${w.host}-${w.queue}`} className="border-b border-gray-100 align-top last:border-0">
                      <td className="px-4 py-2.5 text-gray-900">{w.host}</td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-600">
                        {w.queue}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex flex-col gap-1">
                          {w.logins.map((l) => (
                            <div key={l.name} className="flex flex-wrap items-center gap-2 text-xs">
                              <span className="font-medium text-gray-800">{l.name}</span>
                              <span className="tabular-nums text-gray-600">
                                {l.in_flight} of {l.max_parallel} slots busy
                              </span>
                              <span
                                className={cn(
                                  "rounded border px-1.5 py-0.5",
                                  l.state === "working" && "border-sky-200 bg-sky-50 text-sky-800",
                                  l.state === "idle" && "border-gray-200 bg-gray-50 text-gray-600",
                                  l.state === "cooling" && "border-amber-200 bg-amber-50 text-amber-800"
                                )}
                              >
                                {l.state}
                              </span>
                              {l.cooling_until && (
                                <span
                                  className="text-amber-700"
                                  title={absoluteTime(l.cooling_until)}
                                >
                                  free again {untilTime(l.cooling_until)}
                                </span>
                              )}
                            </div>
                          ))}
                          {w.logins.length === 0 && (
                            <span className="text-xs text-gray-400">
                              no logins registered on this worker
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 font-mono text-xs text-gray-600">
                        {w.code_sha ? w.code_sha.slice(0, 7) : "—"}
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        {w.stale ? (
                          <span className="font-medium text-rose-700" title={absoluteTime(w.seen_at)}>
                            {relativeTime(w.seen_at)} — stale
                          </span>
                        ) : (
                          <span className="text-gray-600" title={absoluteTime(w.seen_at)}>
                            {relativeTime(w.seen_at)}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {workers.map((w) => {
                const running = lanes?.running?.[w.queue] ?? [];
                return (
                  <div
                    key={`${w.queue}-running`}
                    className="border-t border-gray-100 px-4 py-2 text-xs"
                  >
                    <span className="font-medium text-gray-700">
                      Running now on {w.queue}:{" "}
                    </span>
                    {running.length === 0 ? (
                      <span className="text-gray-500">nothing</span>
                    ) : (
                      <span className="text-gray-700">
                        {running
                          .map(
                            (r) =>
                              `${r.workflow_id} (${r.type}, started ${relativeTime(r.started)})`
                          )
                          .join(" · ")}
                      </span>
                    )}
                  </div>
                );
              })}

              {workers.some((w) => w.stale) && (
                <div className="border-t border-rose-100 bg-rose-50 px-4 py-2 text-xs text-rose-800">
                  A stale worker has stopped reporting in. Anything queued on its
                  lane will sit waiting until it comes back or someone restarts it.
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The accounts registry: every Claude login the agenters may use, which lane
 * holds it, and whether a live agenter is actually reporting it. One login,
 * one lane — an agenter started from the registry refuses a seat another lane
 * also holds. Editing here is what used to be editing accounts.yaml by hand.
 */
function Seats() {
  const seats = useResource(getSeats, []);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: "", config_dir: "", lane: "", queue: "" });
  const rows: Seat[] = seats.data?.seats ?? [];

  async function save(name: string, patch: Parameters<typeof putSeat>[1]) {
    setBusy(name);
    setError(null);
    try {
      await putSeat(name, patch);
      seats.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  const cell = "rounded border border-gray-200 px-1.5 py-0.5 text-xs";
  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-gray-200 bg-gray-50/80 px-4 py-2">
        <span className="text-sm font-semibold text-gray-900">Seats (agent logins)</span>
        <span className="text-xs text-gray-500">one login belongs to one lane; a disabled seat is never used</span>
      </div>
      {seats.error && <p className="px-4 py-2 text-xs text-rose-800">Could not load seats: {seats.error}</p>}
      {error && <p className="px-4 py-2 text-xs text-rose-800">{error}</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-gray-100 text-left text-xs font-semibold tracking-wide text-gray-500 uppercase">
              <th className="px-4 py-2">Seat</th>
              <th className="px-3 py-2">Lane</th>
              <th className="px-3 py-2">Queue</th>
              <th className="px-3 py-2">Slots</th>
              <th className="px-3 py-2">Held by</th>
              <th className="px-3 py-2">Note</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {rows.map((s) => (
              <tr key={s.name} className={cn("border-b border-gray-100 align-top last:border-0", !s.enabled && "opacity-60")}>
                <td className="px-4 py-2">
                  <span className="font-medium text-gray-900">{s.name}</span>
                  <span className="block font-mono text-[10px] text-gray-500">{s.config_dir}</span>
                </td>
                <td className="px-3 py-2">
                  <input defaultValue={s.lane ?? ""} placeholder="unassigned" className={cn(cell, "w-24")}
                    onBlur={(e) => e.target.value !== (s.lane ?? "") && save(s.name, { lane: e.target.value || undefined })} />
                </td>
                <td className="px-3 py-2">
                  <input defaultValue={s.queue ?? ""} placeholder="agent-queue-…" className={cn(cell, "w-40 font-mono")}
                    onBlur={(e) => e.target.value !== (s.queue ?? "") && save(s.name, { queue: e.target.value || undefined })} />
                </td>
                <td className="px-3 py-2">
                  <input type="number" min={1} max={8} defaultValue={s.max_parallel} className={cn(cell, "w-14")}
                    onBlur={(e) => Number(e.target.value) !== s.max_parallel && save(s.name, { max_parallel: Number(e.target.value) })} />
                </td>
                <td className="px-3 py-2 text-xs">
                  {s.held_by.length === 0 ? (
                    <span className="text-gray-400">no live agenter</span>
                  ) : (
                    s.held_by.map((h, i) => (
                      <span key={i} className={cn("mr-1 rounded border px-1.5 py-0.5", h.stale ? "border-gray-200 text-gray-500" : "border-emerald-200 bg-emerald-50 text-emerald-800")}>
                        {h.lane} · {h.state}{h.stale ? " (stale)" : ""}
                      </span>
                    ))
                  )}
                </td>
                <td className="px-3 py-2">
                  <input defaultValue={s.note ?? ""} placeholder="why disabled, who owns it" className={cn(cell, "w-56")}
                    onBlur={(e) => e.target.value !== (s.note ?? "") && save(s.name, { note: e.target.value })} />
                </td>
                <td className="px-3 py-2 text-right">
                  <button type="button" disabled={busy === s.name} onClick={() => save(s.name, { enabled: !s.enabled })}
                    className={cn("rounded border px-2 py-0.5 text-xs font-medium", s.enabled ? "border-gray-200 bg-white text-gray-700 hover:border-rose-300" : "border-emerald-200 bg-emerald-50 text-emerald-800")}>
                    {s.enabled ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
            <tr className="align-top">
              <td className="px-4 py-2">
                <input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value.trim() })} placeholder="new seat name" className={cn(cell, "w-28 border-gray-300")} />
                <input value={draft.config_dir} onChange={(e) => setDraft({ ...draft, config_dir: e.target.value.trim() })} placeholder="/root/.claude-<name>" className={cn(cell, "mt-1 block w-44 border-gray-300 font-mono text-[10px]")} />
              </td>
              <td className="px-3 py-2"><input value={draft.lane} onChange={(e) => setDraft({ ...draft, lane: e.target.value.trim() })} placeholder="lane" className={cn(cell, "w-24 border-gray-300")} /></td>
              <td className="px-3 py-2"><input value={draft.queue} onChange={(e) => setDraft({ ...draft, queue: e.target.value.trim() })} placeholder="agent-queue-…" className={cn(cell, "w-40 border-gray-300 font-mono")} /></td>
              <td className="px-3 py-2" colSpan={3} />
              <td className="px-3 py-2 text-right">
                <button type="button" disabled={!draft.name || busy !== null}
                  onClick={() => save(draft.name, { config_dir: draft.config_dir || undefined, lane: draft.lane || undefined, queue: draft.queue || undefined, enabled: true }).then(() => setDraft({ name: "", config_dir: "", lane: "", queue: "" }))}
                  className="rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-800 hover:border-indigo-400 disabled:opacity-50">
                  Add seat
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
