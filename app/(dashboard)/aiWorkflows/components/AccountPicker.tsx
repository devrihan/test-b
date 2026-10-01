"use client";

// Which seat (Claude login) a run's agent tasks use. The default lets the
// lane's agenter pick the least-loaded active seat; pinning one is for when
// a seat is known to be cooling, blocked, or reserved for something else.
// The list is what the agenters serving this runner's queues reported in
// their last heartbeat, so a seat that is not here cannot be used here.

import { useResource } from "../hooks/useApi";
import { listAccounts, type Account } from "../lib/api";

export function AccountPicker({
  kind,
  value,
  onChange,
}: {
  kind: "classification" | "ocr_sweep";
  value: string;
  onChange: (name: string) => void;
}) {
  const accounts = useResource(listAccounts, []);
  const options = (accounts.data?.accounts ?? []).filter((a) => a.kinds.includes(kind));
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-700">Agent seat</span>
      <span className="block text-[11px] text-gray-500">
        Which login the agent runs on. Leave it on the default unless a seat is blocked or cooling.
      </span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-md border border-gray-300 bg-white px-2 py-1.5 text-sm outline-none focus:border-indigo-400"
      >
        <option value="">any available seat (default)</option>
        {options.map((a) => (
          <option key={`${a.lane}:${a.name}`} value={a.name}>
            {accountWords(a)}
          </option>
        ))}
      </select>
      {accounts.error && (
        <span className="mt-1 block text-[11px] text-rose-700">Seats could not be listed: {accounts.error}</span>
      )}
      {!accounts.loading && !accounts.error && options.length === 0 && (
        <span className="mt-1 block text-[11px] text-amber-700">
          No agenter has reported for this queue recently — the run would wait for one.
        </span>
      )}
    </label>
  );
}

function accountWords(a: Account): string {
  const load = `${a.in_flight}/${a.max_parallel} busy`;
  const state = a.state === "active" ? load : a.state === "cooling" ? `cooling${a.cooling_until ? ` until ${new Date(a.cooling_until).toLocaleTimeString()}` : ""}` : a.state;
  return `${a.name} — lane ${a.lane}, ${state}${a.stale ? " (worker not seen lately)" : ""}`;
}
