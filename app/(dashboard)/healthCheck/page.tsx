"use client";

// Health Check — OCR pipeline + workflow health at a glance. Built on the
// Inferentics Design System (@student-ds/ui), following the /scans page
// conventions. Auto-refreshes every minute; funnel deltas are computed
// client-side between refreshes.

import { useCallback, useRef } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "@/app/lib/queryKeys";
import { useRouter } from "next/navigation";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  cn,
} from "@student-ds/ui";
import { Activity, ArrowLeft, RefreshCw, Workflow } from "lucide-react";
import { apiClient } from "@/app/lib/apiClient";

const BEAVER_BASE = process.env.NEXT_PUBLIC_BEAVER_API_URL ?? "http://localhost:4000";

// ── API shapes (mirror beaver-api /api/health/*) ─────────────────────────────
interface OcrHealth {
  last24h: {
    answers: number;
    with_text: number;
    fill_pct: number | null;
    avg_chars: number | null;
    avg_confidence: number | null;
    answers_last_hour: number;
  };
  last_ocr_at: string | null;
  recent_students: {
    student_name: string; batch_id: string; student_id: string;
    exam_type: string; section: string; answers: number;
    ocr_at: string; fill_pct: number; avg_confidence: number | null;
  }[];
  reextraction_24h: {
    pipeline_extractions: number; reextractions: number;
    pipeline_blocked?: number; blocked_rate_pct?: number | null;
    consensus_agree: number; consensus_rate_pct: number | null;
  };
}

interface PaperWorkflowState {
  status: string;               // RUNNING | TERMINATED | NOT_FOUND | ...
  pending_activity: string | null;
  attempt: number | null;       // >1 = actively retrying
}

interface WorkflowHealth {
  funnel: { status: string; count: number }[];
  stuck_active: {
    student_name: string; batch_id: string; student_id: string; status: string;
    current_activity: string | null; updated_at: string; exam_type: string; section: string;
    workflow: PaperWorkflowState | null;
  }[];
  failed_recent: {
    student_name: string; batch_id: string; student_id: string;
    error_message: string | null; updated_at: string; exam_type: string; section: string;
  }[];
  waiting_on_ops: number;
  ready_to_extract: {
    student_name: string; batch_id: string; student_id: string;
    exam_type: string; section: string; bboxes: number; last_verified_at: string;
  }[];
  uploaded_breakdown: {
    exam_type: string; students: number; oldest: string; newest: string;
  }[];
}

// Pipeline order for the funnel display (unknown statuses append at the end).
const STAGE_ORDER = [
  "created", "uploaded", "preprocessing", "preprocessed",
  "bbox_detecting", "bbox_detected", "bbox_validating", "bbox_validated",
  "ocr_running", "ocr_completed",
  "extracting_grid", "processing_grid", "grid_processed",
  "recognizing_structures", "completed", "failed",
];

// ── time helpers: absolute + "how many hours ago" ────────────────────────────
function fmtAbs(ts: string | null): string {
  if (!ts) return "—";
  const d = new Date(ts);
  return d.toLocaleString(undefined, {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function fmtAgo(ts: string | null): string {
  if (!ts) return "";
  const ms = Date.now() - new Date(ts).getTime();
  if (ms < 0) return "";
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 48) return `${hours}h ${mins % 60}m ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function TimeCell({ ts }: { ts: string | null }) {
  return (
    <span className="whitespace-nowrap">
      {fmtAbs(ts)}
      <span className="ml-1.5 text-xs text-muted-foreground">({fmtAgo(ts)})</span>
    </span>
  );
}

// Age-derived activity bucket for an uploaded cohort: a wave whose newest
// row is minutes old is LIVE intake; days old = quiet/paused; weeks = stale.
function uploadBucket(newest: string): { label: string; cls: string } {
  const ageH = (Date.now() - new Date(newest).getTime()) / 3600_000;
  if (ageH < 24) return { label: "live", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
  if (ageH < 24 * 7) return { label: "quiet", cls: "bg-amber-50 text-amber-700 border-amber-200" };
  return { label: "stale", cls: "" };
}

// Live Temporal state for a stuck paper: "still retrying" is an active
// problem; "stopped" (terminated / not found / completed) is a stale row.
function WorkflowBadge({ wf }: { wf: PaperWorkflowState | null }) {
  if (!wf) return <span className="text-xs text-muted-foreground">unknown</span>;
  const retrying = wf.status === "RUNNING" && (wf.attempt ?? 0) > 1;
  if (retrying) {
    return (
      <Badge
        variant="destructive"
        title={`retrying ${wf.pending_activity ?? "activity"} — attempt ${wf.attempt}`}
      >
        retrying · attempt {wf.attempt}
      </Badge>
    );
  }
  if (wf.status === "RUNNING") {
    return (
      <Badge
        variant="secondary"
        className="bg-blue-50 text-blue-700 border-blue-200"
        title={wf.pending_activity ? `in ${wf.pending_activity}` : undefined}
      >
        running{wf.pending_activity ? ` · ${wf.pending_activity}` : ""}
      </Badge>
    );
  }
  const stopped = ["TERMINATED", "CANCELED", "NOT_FOUND", "COMPLETED", "CONTINUED_AS_NEW"].includes(wf.status);
  return (
    <Badge variant={stopped ? "outline" : "destructive"}>
      {wf.status.toLowerCase().replace(/_/g, " ")}
    </Badge>
  );
}

// Waiting-for-ops / parked states are informational; transient states going
// stale are the problem — color accordingly.
function StatTile({ label, value, sub, tone = "default" }: {
  label: string; value: string | number; sub?: string;
  tone?: "default" | "good" | "warn" | "bad";
}) {
  const toneCls =
    tone === "good" ? "text-emerald-600" :
    tone === "warn" ? "text-amber-600" :
    tone === "bad" ? "text-destructive" : "text-foreground";
  return (
    <Card className="py-3">
      <CardContent className="px-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={cn("text-2xl font-bold", toneCls)}>{value}</p>
        {sub && <p className="text-[11px] text-muted-foreground/80 mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function SectionTitle({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <h2 className="text-sm font-semibold text-foreground mb-2">
      {children}
      {hint && <span className="ml-2 font-normal text-xs text-muted-foreground">{hint}</span>}
    </h2>
  );
}

const NO_DELTA: Record<string, number> = {};

export default function HealthCheckPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  // Funnel motion: per-status delta vs the previous refresh (~1 min apart),
  // so the funnel shows where papers moved since you last looked. Computed in
  // the fetch, as it was before — refs may not be touched during render.
  const prevFunnel = useRef<Record<string, number> | null>(null);

  const healthQuery = useQuery({
    queryKey: keys.health(),
    queryFn: async () => {
      const [ocr, wf] = await Promise.all([
        apiClient.get<OcrHealth>(`${BEAVER_BASE}/api/health/ocr`),
        apiClient.get<WorkflowHealth>(`${BEAVER_BASE}/api/health/workflows`),
      ]);
      const now: Record<string, number> = {};
      for (const f of wf.funnel) now[f.status] = f.count;
      const prev = prevFunnel.current;
      prevFunnel.current = now;
      const funnelDelta: Record<string, number> = {};
      if (prev) {
        for (const k of new Set([...Object.keys(now), ...Object.keys(prev)])) {
          const diff = (now[k] ?? 0) - (prev[k] ?? 0);
          if (diff !== 0) funnelDelta[k] = diff;
        }
      }
      return { ocr, wf, funnelDelta };
    },
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });

  const ocr = healthQuery.data?.ocr ?? null;
  const wf = healthQuery.data?.wf ?? null;
  const loading = healthQuery.isFetching;
  const error =
    healthQuery.error instanceof Error ? healthQuery.error.message : null;
  const fetchedAt = healthQuery.dataUpdatedAt
    ? new Date(healthQuery.dataUpdatedAt)
    : null;

  const load = useCallback(
    () => queryClient.invalidateQueries({ queryKey: keys.health() }),
    [queryClient]
  );

  const funnelDelta = healthQuery.data?.funnelDelta ?? NO_DELTA;

  const staleOcr =
    ocr?.last_ocr_at != null &&
    healthQuery.dataUpdatedAt - new Date(ocr.last_ocr_at).getTime() >
      3 * 3600_000;

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/")}
          className="mb-4 -ml-2 text-muted-foreground"
        >
          <ArrowLeft /> Home
        </Button>

        <div className="flex items-end justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold text-foreground">Health Check</h1>
            <p className="text-xs text-muted-foreground mt-1">
              OCR pipeline and workflow health at a glance
              {fetchedAt && <> · refreshed {fmtAgo(fetchedAt.toISOString())}</>}
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            {loading ? <Spinner /> : <RefreshCw />} Refresh
          </Button>
        </div>

        {error && (
          <Card className="mb-4 border-destructive/50 bg-destructive/5">
            <CardContent className="px-4 py-3 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        <Tabs defaultValue="ocr">
          <TabsList className="mb-6">
            <TabsTrigger value="ocr"><Activity /> OCR Health</TabsTrigger>
            <TabsTrigger value="workflows"><Workflow /> Workflow Health</TabsTrigger>
          </TabsList>

          {/* ── OCR Health ── */}
          <TabsContent value="ocr">
            {ocr && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                  <StatTile label="Answers OCR'd (24h)" value={ocr.last24h.answers} />
                  <StatTile
                    label="With text"
                    value={ocr.last24h.fill_pct != null ? `${ocr.last24h.fill_pct}%` : "—"}
                    sub={`${ocr.last24h.with_text} of ${ocr.last24h.answers}`}
                    tone={ocr.last24h.fill_pct != null && ocr.last24h.fill_pct < 95 ? "warn" : "good"}
                  />
                  <StatTile
                    label="Avg confidence"
                    value={ocr.last24h.avg_confidence ?? "—"}
                    tone={ocr.last24h.avg_confidence != null && ocr.last24h.avg_confidence < 0.85 ? "warn" : "default"}
                  />
                  <StatTile label="Avg length" value={ocr.last24h.avg_chars != null ? `${ocr.last24h.avg_chars} ch` : "—"} />
                  <StatTile
                    label="Last OCR write"
                    value={fmtAgo(ocr.last_ocr_at) || "—"}
                    sub={fmtAbs(ocr.last_ocr_at)}
                    tone={staleOcr ? "warn" : "good"}
                  />
                </div>

                {/* Re-extraction / consensus / guard tripwire */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                  <StatTile label="Pipeline extractions (24h)" value={ocr.reextraction_24h.pipeline_extractions} />
                  <StatTile
                    label="Writes blocked by guard"
                    value={ocr.reextraction_24h.blocked_rate_pct != null ? `${ocr.reextraction_24h.blocked_rate_pct}%` : "—"}
                    sub={`${ocr.reextraction_24h.pipeline_blocked ?? 0} preserved — extraction flowing but not landing = guard misfiring`}
                    tone={
                      (ocr.reextraction_24h.blocked_rate_pct ?? 0) > 20 ? "bad"
                      : (ocr.reextraction_24h.blocked_rate_pct ?? 0) > 5 ? "warn" : "good"
                    }
                  />
                  <StatTile label="Re-extractions (Qwen)" value={ocr.reextraction_24h.reextractions} sub="low-confidence second reads" />
                  <StatTile label="Consensus agreements" value={ocr.reextraction_24h.consensus_agree} />
                  <StatTile
                    label="Consensus rate"
                    value={ocr.reextraction_24h.consensus_rate_pct != null ? `${ocr.reextraction_24h.consensus_rate_pct}%` : "—"}
                    sub="both models read identically"
                  />
                </div>

                <SectionTitle>Freshest completed students</SectionTitle>
                <Card className="py-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead>Exam / Section</TableHead>
                        <TableHead className="text-right">Answers</TableHead>
                        <TableHead className="text-right">Filled</TableHead>
                        <TableHead className="text-right">Conf</TableHead>
                        <TableHead>OCR'd at</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {ocr.recent_students.map((s) => (
                        <TableRow key={`${s.batch_id}-${s.student_id}`}>
                          <TableCell className="font-medium">{s.student_name}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{s.batch_id}</TableCell>
                          <TableCell className="text-muted-foreground">{s.exam_type} · {s.section}</TableCell>
                          <TableCell className="text-right">{s.answers}</TableCell>
                          <TableCell className={cn("text-right", s.fill_pct < 100 ? "text-amber-600" : "text-emerald-600")}>
                            {s.fill_pct}%
                          </TableCell>
                          <TableCell className="text-right font-mono">{s.avg_confidence ?? "—"}</TableCell>
                          <TableCell className="text-muted-foreground"><TimeCell ts={s.ocr_at} /></TableCell>
                        </TableRow>
                      ))}
                      {ocr.recent_students.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={7} className="py-6 text-center text-muted-foreground">
                            No OCR completions in the last 48 hours
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </Card>
              </>
            )}
          </TabsContent>

          {/* ── Workflow Health ── */}
          <TabsContent value="workflows">
            {wf && (
              <>
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                  <StatTile
                    label="Waiting on ops"
                    value={wf.waiting_on_ops}
                    sub="bbox_detected — needs box verification"
                  />
                  <StatTile
                    label="Stuck in transit"
                    value={wf.stuck_active.length}
                    sub={(() => {
                      const retrying = wf.stuck_active.filter(
                        (s) => s.workflow?.status === "RUNNING"
                      ).length;
                      const stopped = wf.stuck_active.length - retrying;
                      return wf.stuck_active.length
                        ? `${retrying} live workflow(s) · ${stopped} stopped/stale`
                        : "active state, no progress for 2h+";
                    })()}
                    tone={
                      wf.stuck_active.some((s) => s.workflow?.status === "RUNNING")
                        ? "bad"
                        : wf.stuck_active.length > 0 ? "warn" : "good"
                    }
                  />
                  <StatTile
                    label="Failed (48h)"
                    value={wf.failed_recent.length}
                    tone={wf.failed_recent.length > 0 ? "bad" : "good"}
                  />
                  <StatTile
                    label="Verified, awaiting Extract"
                    value={wf.ready_to_extract.length}
                    sub="all boxes verified — Extract Text never clicked"
                    tone={wf.ready_to_extract.length > 0 ? "warn" : "good"}
                  />
                  <StatTile
                    label="Completed (7d)"
                    value={wf.funnel.find((f) => f.status === "completed")?.count ?? 0}
                    tone="good"
                  />
                </div>

                <SectionTitle hint="batches active in last 7 days · arrows = change since previous refresh (~1 min)">
                  Pipeline funnel in motion
                </SectionTitle>
                <Card className="py-0 mb-6">
                  <CardContent className="p-4">
                    <div className="flex flex-wrap gap-2">
                      {[...wf.funnel]
                        .sort((a, b) => {
                          const ia = STAGE_ORDER.indexOf(a.status); const ib = STAGE_ORDER.indexOf(b.status);
                          return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
                        })
                        .map((f) => {
                          const d = funnelDelta[f.status];
                          return (
                            <Badge key={f.status} variant="secondary" className="gap-1.5">
                              <span className="text-muted-foreground">{f.status}</span>
                              <span className="font-bold text-foreground">{f.count}</span>
                              {d != null && (
                                <span className={cn("font-semibold", d > 0 ? "text-blue-600" : "text-emerald-600")}>
                                  {d > 0 ? `▲${d}` : `▼${-d}`}
                                </span>
                              )}
                            </Badge>
                          );
                        })}
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-2">
                      ▼ on early stages + ▲ on later stages = papers flowing forward. No arrows = no movement in the last minute.
                    </p>
                  </CardContent>
                </Card>

                <SectionTitle hint="live = arriving/draining now · quiet = untouched for a day+ (e.g. a paused cohort) · stale = weeks old">
                  Uploaded backlog by cohort
                </SectionTitle>
                <Card className="py-0 overflow-x-auto mb-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Exam</TableHead>
                        <TableHead className="text-right">Students</TableHead>
                        <TableHead>Newest upload</TableHead>
                        <TableHead>Oldest upload</TableHead>
                        <TableHead>Activity</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {wf.uploaded_breakdown.map((u) => {
                        const bucket = uploadBucket(u.newest);
                        return (
                          <TableRow key={u.exam_type}>
                            <TableCell>{u.exam_type}</TableCell>
                            <TableCell className="text-right font-bold">{u.students}</TableCell>
                            <TableCell className="text-muted-foreground"><TimeCell ts={u.newest} /></TableCell>
                            <TableCell className="text-muted-foreground"><TimeCell ts={u.oldest} /></TableCell>
                            <TableCell>
                              <Badge variant="outline" className={bucket.cls}>{bucket.label}</Badge>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                      {wf.uploaded_breakdown.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="py-6 text-center text-emerald-600">
                            No students waiting in uploaded 🎉
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </Card>

                <SectionTitle>Stuck students (transient state, 2h+ without progress)</SectionTitle>
                <Card className="py-0 overflow-x-auto mb-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead>Exam / Section</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Workflow</TableHead>
                        <TableHead>Last progress</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {wf.stuck_active.map((s) => (
                        <TableRow key={`${s.batch_id}-${s.student_id}`}>
                          <TableCell className="font-medium">{s.student_name}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{s.batch_id}</TableCell>
                          <TableCell className="text-muted-foreground">{s.exam_type} · {s.section}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">{s.status}</Badge>
                          </TableCell>
                          <TableCell><WorkflowBadge wf={s.workflow} /></TableCell>
                          <TableCell className="text-muted-foreground"><TimeCell ts={s.updated_at} /></TableCell>
                        </TableRow>
                      ))}
                      {wf.stuck_active.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={6} className="py-6 text-center text-emerald-600">Nothing stuck 🎉</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </Card>

                <SectionTitle>Verified, awaiting Extract (all boxes verified — OCR never initiated)</SectionTitle>
                <Card className="py-0 overflow-x-auto mb-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead>Exam / Section</TableHead>
                        <TableHead className="text-right">Boxes verified</TableHead>
                        <TableHead>Last verified</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {wf.ready_to_extract.map((s) => (
                        <TableRow key={`${s.batch_id}-${s.student_id}`}>
                          <TableCell className="font-medium">{s.student_name}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{s.batch_id}</TableCell>
                          <TableCell className="text-muted-foreground">{s.exam_type} · {s.section}</TableCell>
                          <TableCell className="text-right">{s.bboxes}</TableCell>
                          <TableCell className="text-muted-foreground"><TimeCell ts={s.last_verified_at} /></TableCell>
                        </TableRow>
                      ))}
                      {wf.ready_to_extract.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={5} className="py-6 text-center text-emerald-600">
                            No verified papers waiting on Extract 🎉
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </Card>

                <SectionTitle>Failures (last 48h)</SectionTitle>
                <Card className="py-0 overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Student</TableHead>
                        <TableHead>Batch</TableHead>
                        <TableHead>Error</TableHead>
                        <TableHead>When</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {wf.failed_recent.map((s) => (
                        <TableRow key={`${s.batch_id}-${s.student_id}`}>
                          <TableCell className="font-medium">{s.student_name}</TableCell>
                          <TableCell className="font-mono text-xs text-muted-foreground">{s.batch_id}</TableCell>
                          <TableCell className="text-xs text-destructive max-w-md truncate" title={s.error_message ?? ""}>
                            {s.error_message ?? "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground"><TimeCell ts={s.updated_at} /></TableCell>
                        </TableRow>
                      ))}
                      {wf.failed_recent.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={4} className="py-6 text-center text-emerald-600">
                            No failures in the last 48 hours 🎉
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </Card>
              </>
            )}
          </TabsContent>
        </Tabs>

        {loading && !ocr && !wf && (
          <div className="flex items-center justify-center gap-2 text-muted-foreground py-12">
            <Spinner /> Loading health data…
          </div>
        )}
      </div>
    </div>
  );
}
