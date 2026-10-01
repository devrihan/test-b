"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@student-ds/ui";
import { Check, Loader2 } from "lucide-react";
import { keys } from "@/app/lib/queryKeys";
import { getMyEmail, type OpenSectionSession, type OpsStatus } from "@/app/lib/reviewApi";
import { OpsStatusBadge } from "./OpsStatusBadge";

// What the button does for each role, in their words; the action is the same for all three.
const LABEL = { maker: "Send for check", checker: "Finish check", other: "Stop timer" } as const;
const HINT = {
  maker: "Hand this section to the checker",
  checker: "Finish your check of this section",
  other: "Stop your timer on this section",
} as const;

/** sajan@inferentics.com -> Sajan. Matches the review queue's own convention. */
function shortName(email: string): string {
  if (!email) return "";
  const local = email.split("@")[0];
  return local.charAt(0).toUpperCase() + local.slice(1);
}

/** "since 2:15pm" same day, "since Wed 1:00pm" once it has run overnight. */
function since(startedAt: string): string {
  const d = new Date(startedAt);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  return sameDay
    ? `since ${time}`
    : `since ${d.toLocaleDateString(undefined, { weekday: "short" })} ${time}`;
}

/** Ends the pass on this section; names show always, the start time only while one runs. */
export function SectionDoneButton({
  open,
  makers,
  checkers,
  opsStatus,
  onDone,
}: {
  open: OpenSectionSession | null;
  makers: string[];
  checkers: string[];
  opsStatus: OpsStatus | null;
  onDone: () => Promise<boolean>;
}) {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  // Identity lives in browser storage, so it is read after mount like the Ops Queue does.
  const [me, setMe] = useState<string | null>(null);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setMe(getMyEmail()); }, []);

  // The running pass knows its role; before one starts, fall back to what I'm assigned.
  const role =
    open?.role === "maker" || open?.role === "checker" ? open.role
    : open ? "other"
    : me && makers.includes(me) ? "maker"
    : me && checkers.includes(me) ? "checker"
    : "other";

  const people = [
    ...makers.map((e) => `${shortName(e)} maker`),
    ...checkers.map((e) => `${shortName(e)} checker`),
  ].join(" · ");

  // Stops the timer; for a maker the server also tells the checker which papers were sent (none sent, no message).
  const finish = async () => {
    setBusy(true);
    const ok = await onDone();
    setFailed(!ok);
    setBusy(false);
    // A hand-over changes paper and section states the queue and student header show.
    if (ok) void queryClient.invalidateQueries({ queryKey: keys.review.all() });
  };

  return (
    <div className="flex items-center gap-sp-sm">
      {opsStatus && <OpsStatusBadge status={opsStatus} />}

      {people && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">{people}</span>
      )}

      {open && (
        <span className="text-xs text-muted-foreground whitespace-nowrap">
          {since(open.started_at)}
        </span>
      )}

      <Button
        variant={open ? "default" : "outline"}
        size="sm"
        disabled={!open || busy}
        title={open ? HINT[role] : "Timing starts when you edit this section"}
        onClick={() => void finish()}
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} {LABEL[role]}
      </Button>

      {failed && (
        <span className="text-xs text-destructive whitespace-nowrap">Not saved — try again</span>
      )}
    </div>
  );
}
