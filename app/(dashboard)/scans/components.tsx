"use client";

// Shared presentation pieces for the Scanning screen. Built on the vendored
// design system (@student-ds/ui) — hand-rolled markup only where the DS has
// no equivalent (stat tiles, freshness pill, image placeholder).

import { useState } from "react";
import { Badge, Tooltip, TooltipContent, TooltipTrigger, cn } from "@student-ds/ui";
import { AlertTriangle, ImageOff } from "lucide-react";
import type {
  AnswerPaperClaim,
  DispatchCounters,
  DispatchStatus,
  DocumentEvent,
  PageDecodeStatus,
  ScannedDocument,
} from "@/app/lib/scanApi";
import { pageImageUrl } from "@/app/lib/scanApi";

export const shortId = (id: string) => id.slice(0, 8);

export const fmtTime = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

export const fmtClock = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" }) : "—";

// Short date for headers/timestamps, e.g. "Jul 14 '26".
export const fmtDate = (iso: string | null | undefined) => {
  if (!iso) return "";
  const d = new Date(iso);
  const md = d.toLocaleDateString("en-IN", { month: "short", day: "numeric" });
  return `${md} '${String(d.getFullYear()).slice(2)}`;
};

// Compact, DISPLAY-ONLY dispatch label for the narrow rail: lead with a short
// date so it doesn't truncate the laptop id. The real dispatch.name (from
// piper) is unchanged; this is purely presentational.
export const railLabel = (d: { name: string; laptop_id: string; opened_at: string }) => {
  const md = new Date(d.opened_at).toLocaleDateString("en-IN", {
    month: "short",
    day: "numeric",
  });
  return `${md} · ${d.laptop_id}`;
};

// ── badges ──────────────────────────────────────────────────────────────────

// Intake and sort are ORTHOGONAL dimensions, so they get separate chips:
//  • intake — is the laptop still uploading (open) or done (closed)? Sorting
//    runs during BOTH (booklets mint incrementally while open), so intake
//    state says nothing about sort health.
//  • sort — is the server actively sorting, finished, or stalled/failed?
//    piper doesn't expose the sort workflow's Temporal state, so "stalled" is
//    inferred by the caller (counters not advancing) and passed in.

// Intake: open (accepting uploads) vs closed (stream complete). `sorted` in
// piper implies the stream was closed.
export function DispatchIntakeBadge({ status }: { status: DispatchStatus }) {
  if (status === "open")
    return (
      <Badge className="gap-1.5 bg-emerald-600 text-white dark:bg-emerald-500">
        <span className="relative flex size-1.5">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white opacity-60" />
          <span className="relative inline-flex size-1.5 rounded-full bg-white" />
        </span>
        open
      </Badge>
    );
  return <Badge className="bg-slate-500 text-white dark:bg-slate-400">closed</Badge>;
}

// Sort health: done / stalled / sorting / paused / idle-caught-up.
export function DispatchSortBadge({
  status,
  paused,
  pendingDecode,
  stalled,
}: {
  status: DispatchStatus;
  paused?: boolean;
  pendingDecode: number;
  stalled?: boolean;
}) {
  if (status === "sorted") return <Badge variant="secondary">sort done</Badge>;
  if (paused) return <Badge variant="outline">sort paused</Badge>;
  if (stalled)
    return (
      <Badge variant="destructive" className="gap-1">
        <AlertTriangle className="size-3" /> sort stalled
      </Badge>
    );
  if (pendingDecode > 0)
    return <Badge className="bg-sky-600 text-white dark:bg-sky-500">sorting</Badge>;
  return <Badge variant="ghost">sort idle</Badge>;
}

export function DecodeBadge({ status }: { status: PageDecodeStatus }) {
  if (status === "decoded") return <Badge variant="secondary">QR decoded</Badge>;
  if (status === "pending") return <Badge variant="outline">awaiting decode</Badge>;
  if (status === "no_qr") return <Badge variant="ghost">no QR</Badge>;
  return <Badge variant="destructive">decode error</Badge>;
}

export function KindBadge({ kind }: { kind: ScannedDocument["kind"] | undefined }) {
  if (kind === null || kind === undefined) return <Badge variant="destructive">?</Badge>;
  if (kind === "answer_paper") return <Badge variant="default">answer paper</Badge>;
  return <Badge variant="secondary">{kind.replace(/_/g, " ")}</Badge>;
}

export function OriginBadge({
  origin,
}: {
  origin: ScannedDocument["metadata_origin"] | undefined;
}) {
  if (!origin) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant={origin === "qr" ? "secondary" : "outline"}>
      {origin === "qr" ? "qr" : "manual"}
    </Badge>
  );
}

export function FlagBadge({ flag }: { flag: string }) {
  return <Badge variant="destructive">{flag.replace(/_/g, " ")}</Badge>;
}

// ── freshness pill (DS gap: hand-rolled) ────────────────────────────────────

export function FreshnessPill({
  live,
  secondsAgo,
  hidden,
}: {
  live: boolean;
  secondsAgo: number | null;
  hidden: boolean;
}) {
  if (!live)
    return (
      <span className="text-muted-foreground inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs">
        <span className="size-1.5 rounded-full bg-current opacity-50" /> static
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
      <span className="relative flex size-1.5">
        <span
          className={cn(
            "absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60",
            !hidden && "animate-ping",
          )}
        />
        <span className="relative inline-flex size-1.5 rounded-full bg-emerald-500" />
      </span>
      {hidden ? "paused (tab hidden)" : secondsAgo === null ? "Live" : `Live · ${secondsAgo}s ago`}
    </span>
  );
}

// ── counter tiles (DS gap: no stat-tile component — hand-rolled on card
//    tokens) ─────────────────────────────────────────────────────────────────

export function CounterStrip({ counters }: { counters: DispatchCounters }) {
  // "checked" = pages the sorter has examined (only covers carry QR codes, so
  // a raw QR-read count would read as mass failure to an operator).
  const checked = counters.pages_total - counters.pages_pending_decode;
  const tiles: { label: string; value: number; amber?: boolean }[] = [
    { label: "pages", value: counters.pages_total },
    { label: "awaiting decode", value: counters.pages_pending_decode },
    { label: "checked", value: checked },
    {
      label: "decode errors",
      value: counters.pages_decode_error,
      amber: counters.pages_decode_error > 0,
    },
    { label: "sorted", value: counters.pages_sorted },
    { label: "documents", value: counters.documents_minted },
  ];
  return (
    <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
      {tiles.map(({ label, value, amber }) => (
        <div
          key={label}
          className={cn(
            "bg-card rounded-lg border px-3 py-2 text-center",
            amber && "border-amber-400 bg-amber-50 dark:border-amber-700 dark:bg-amber-950",
          )}
        >
          <div
            className={cn(
              "text-xl font-semibold tabular-nums",
              amber && "text-amber-700 dark:text-amber-300",
            )}
          >
            {value}
          </div>
          <div className="text-muted-foreground text-xs">{label}</div>
        </div>
      ))}
    </div>
  );
}

// ── claim rendering ─────────────────────────────────────────────────────────

const CLAIM_LABELS: { key: keyof AnswerPaperClaim; label: string }[] = [
  { key: "student_name", label: "Student" },
  { key: "roll_number", label: "Roll no" },
  { key: "admission_no", label: "Admission no" },
  { key: "grade", label: "Grade" },
  { key: "section", label: "Section" },
  { key: "subject", label: "Subject" },
  { key: "subject_code", label: "Subject code" },
  { key: "exam_type", label: "Exam" },
  { key: "academic_year", label: "Academic year" },
  { key: "set_name", label: "Set" },
  { key: "school_id", label: "School id" },
];

export function ClaimGrid({ claim }: { claim: ScannedDocument["claimed_metadata"] }) {
  if (!claim || typeof claim !== "object") {
    return <p className="text-muted-foreground text-sm">No claim recorded.</p>;
  }
  const c = claim as Partial<AnswerPaperClaim>;
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm sm:grid-cols-3">
      {CLAIM_LABELS.map(({ key, label }) => (
        <div key={key}>
          <dt className="text-muted-foreground text-xs">{label}</dt>
          <dd
            className={
              c[key]
                ? "font-medium"
                : key === "set_name"
                  ? "text-muted-foreground"
                  : "text-destructive"
            }
          >
            {c[key] ?? (key === "set_name" ? "—" : "missing")}
          </dd>
        </div>
      ))}
    </dl>
  );
}

// ── event timeline ──────────────────────────────────────────────────────────

export function EventTimeline({ events }: { events: DocumentEvent[] }) {
  if (events.length === 0) return <p className="text-muted-foreground text-sm">No events.</p>;
  return (
    <ol className="space-y-2">
      {events.map((ev) => (
        <li key={String(ev.id)} className="flex items-start gap-3 text-sm">
          <span className="bg-primary mt-1.5 size-2 shrink-0 rounded-full" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium">{ev.event_kind.replace(/_/g, " ")}</span>
              <span className="text-muted-foreground text-xs">{fmtTime(ev.created_at)}</span>
              {ev.actor && <Badge variant="outline">{ev.actor}</Badge>}
            </div>
            {ev.payload != null && (
              <pre className="text-muted-foreground bg-muted/50 mt-0.5 max-h-24 overflow-auto rounded px-2 py-1 text-xs whitespace-pre-wrap">
                {JSON.stringify(ev.payload)}
              </pre>
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

// ── page image with graceful placeholder ────────────────────────────────────
// The proxy 503s when SCAN_IMAGE_BASE isn't configured (piper has no image
// endpoint yet); onError swaps in an honest placeholder.

export function PageImage({
  r2Key,
  alt,
  className,
}: {
  r2Key: string | null;
  alt: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  if (!r2Key || failed) {
    return (
      <div
        className={cn(
          "text-muted-foreground flex flex-col items-center justify-center gap-2 rounded-md border border-dashed p-3 text-center text-xs",
          className,
        )}
      >
        <ImageOff className="size-5" />
        <span>{r2Key ? "Image unavailable" : "No page recorded"}</span>
        {r2Key && <code className="max-w-full break-all text-[10px]">{r2Key}</code>}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={pageImageUrl(r2Key)}
      alt={alt}
      className={className}
      onError={() => setFailed(true)}
    />
  );
}

// Disabled buttons don't emit pointer events, so tooltips on them need a
// focusable wrapper (standard Radix workaround).
export function DisabledWithTooltip({
  reason,
  children,
}: {
  reason: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span tabIndex={0} className="inline-flex">
          {children}
        </span>
      </TooltipTrigger>
      <TooltipContent className="max-w-64">{reason}</TooltipContent>
    </Tooltip>
  );
}
