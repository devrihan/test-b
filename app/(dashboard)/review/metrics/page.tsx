"use client";

import { useQuery } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { keys } from "@/app/lib/queryKeys";
import { urlKeys, URL_OPTIONS, METRICS_GROUP_BY } from "@/app/lib/urlKeys";
import { Pencil, Trash2, Clock } from "lucide-react";
import {
  getReviewMetrics,
  type MetricsRow,
} from "@/app/lib/reviewApi";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@student-ds/ui";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@student-ds/ui";


function fmtMs(ms: number): string {
  if (!ms || ms < 0) return "0m";
  const totalMin = Math.round(ms / 60000);
  if (totalMin < 60) return `${totalMin}m`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
}

function KpiCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
}) {
  return (
    <Card className="py-4">
      <CardContent className="flex items-center gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          {icon}
        </div>
        <div>
          <p className="text-xs text-muted-foreground">{label}</p>
          <p className="text-xl font-semibold">{value}</p>
        </div>
      </CardContent>
    </Card>
  );
}

const NO_ROWS: MetricsRow[] = [];

export default function ReviewMetricsPage() {
  const [{ by }, setMetrics] = useQueryStates(urlKeys.reviewMetrics, URL_OPTIONS);

  const metricsQuery = useQuery({
    queryKey: keys.review.metrics(by),
    queryFn: async () => {
      const data = await getReviewMetrics({ by });
      return Array.isArray(data) ? data : [];
    },
  });

  const rows = metricsQuery.data ?? NO_ROWS;
  const loading = metricsQuery.isPending;
  const error =
    metricsQuery.error instanceof Error ? metricsQuery.error.message : null;

  // ── KPI roll-ups across the visible rows ──────────────────────────────────
  const totalCorrected = rows.reduce((s, r) => s + (r.corrected ?? 0), 0);
  const totalDiscarded = rows.reduce((s, r) => s + (r.discarded ?? 0), 0);
  const totalActiveMs = rows.reduce((s, r) => s + (r.active_ms ?? 0), 0);

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-900">Review metrics</h1>
            <p className="text-xs text-gray-400">
              Correction activity and time spent across the review framework.
            </p>
          </div>

          {/* by=reviewer / by=batch toggle */}
          <div className="inline-flex rounded-lg border border-gray-200 bg-white p-0.5">
            {METRICS_GROUP_BY.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() => setMetrics({ by: g })}
                className={`rounded-md px-3 py-1.5 text-sm font-medium capitalize transition ${
                  by === g
                    ? "bg-gray-900 text-white"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                By {g}
              </button>
            ))}
          </div>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KpiCard
            label="Total corrected"
            value={totalCorrected}
            icon={<Pencil size={18} />}
          />
          <KpiCard
            label="Total discarded"
            value={totalDiscarded}
            icon={<Trash2 size={18} />}
          />
          <KpiCard
            label="Time spent"
            value={fmtMs(totalActiveMs)}
            icon={<Clock size={18} />}
          />
        </div>

        {/* Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">
              {by === "reviewer" ? "By reviewer" : "By batch"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {error && (
              <p className="mb-3 rounded-md bg-red-50 p-2 text-sm text-red-600">
                {error}
              </p>
            )}
            {loading ? (
              <p className="text-sm text-gray-400">Loading metrics…</p>
            ) : rows.length === 0 ? (
              <p className="text-sm italic text-gray-400">No data.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>
                      {by === "reviewer" ? "Reviewer" : "Batch"}
                    </TableHead>
                    <TableHead className="text-right">Corrected</TableHead>
                    <TableHead className="text-right">Discarded</TableHead>
                    <TableHead className="text-right">From blank</TableHead>
                    <TableHead className="text-right">Regenerated</TableHead>
                    <TableHead className="text-right">Unchanged</TableHead>
                    <TableHead className="text-right">Events</TableHead>
                    <TableHead className="text-right">Units</TableHead>
                    <TableHead className="text-right">Time</TableHead>
                    <TableHead className="text-right">Sessions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((r) => (
                    <TableRow key={r.group}>
                      <TableCell className="font-medium">{r.group}</TableCell>
                      <TableCell className="text-right">{r.corrected}</TableCell>
                      <TableCell className="text-right">{r.discarded}</TableCell>
                      <TableCell className="text-right">
                        {r.written_from_blank}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.regenerated}
                      </TableCell>
                      <TableCell className="text-right">{r.unchanged}</TableCell>
                      <TableCell className="text-right">
                        {r.total_events}
                      </TableCell>
                      <TableCell className="text-right">
                        {r.units_touched}
                      </TableCell>
                      <TableCell className="text-right">
                        {fmtMs(r.active_ms)}
                      </TableCell>
                      <TableCell className="text-right">{r.sessions}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
