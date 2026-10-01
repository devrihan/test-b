"use client";

// Pages tab: the raw upload ledger from GET /dispatches/:id/pages —
// live-scanning supervision and debugging. Secondary by design.

import { useEffect, useMemo, useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@student-ds/ui";
import { ChevronLeft, ChevronRight, FileQuestion, UploadCloud } from "lucide-react";
import type { DispatchPage, PageDecodeStatus } from "@/app/lib/scanApi";
import { DecodeBadge, FlagBadge, PageImage, fmtClock, shortId } from "./components";

const DECODE_FILTERS: { value: PageDecodeStatus | "all"; label: string }[] = [
  { value: "all", label: "All decode states" },
  { value: "pending", label: "Awaiting decode" },
  { value: "decoded", label: "QR decoded" },
  { value: "no_qr", label: "No QR" },
  { value: "decode_error", label: "Decode error" },
];

export function PagesTable({
  pages,
  focusDocumentId = null,
  focusLabel = null,
  onClearFocus,
  onUploadToBatch,
}: {
  pages: DispatchPage[];
  // Search click-through: restrict the ledger to one document's pages.
  focusDocumentId?: string | null;
  focusLabel?: string | null;
  onClearFocus?: () => void;
  // Present when the focused document's paper may be missing from its batch:
  // creates the paper from these originals (ADMIN; server-guarded).
  onUploadToBatch?: () => void;
}) {
  const [filter, setFilter] = useState<PageDecodeStatus | "all">("all");
  // Index into `rows` (the currently-filtered view) of the previewed page, or
  // null when the dialog is closed. Prev/next walk this same filtered list.
  const [previewIdx, setPreviewIdx] = useState<number | null>(null);

  const rows = useMemo(() => {
    const base = focusDocumentId ? pages.filter((p) => p.document_id === focusDocumentId) : pages;
    return filter === "all" ? base : base.filter((p) => p.decode_status === filter);
  }, [pages, filter, focusDocumentId]);

  // A stale preview index from a wider view must not survive a narrowing.
  useEffect(() => {
    setPreviewIdx(null);
  }, [focusDocumentId]);

  if (pages.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <FileQuestion />
          </EmptyMedia>
          <EmptyTitle>No pages yet</EmptyTitle>
          <EmptyDescription>
            Pages appear here as the scanning laptop uploads them.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="space-y-2">
      {focusDocumentId && (
        <div className="bg-accent/60 flex items-center justify-between gap-2 rounded-lg border px-3 py-1.5 text-sm">
          <span>
            Showing the original pages of <span className="font-medium">{focusLabel ?? shortId(focusDocumentId)}</span>
            {" "}({rows.length} page{rows.length === 1 ? "" : "s"})
          </span>
          <span className="flex items-center gap-1">
            {onUploadToBatch && (
              <Button variant="outline" size="sm" onClick={onUploadToBatch}>
                <UploadCloud /> Upload to batch
              </Button>
            )}
            {onClearFocus && (
              <Button variant="ghost" size="sm" onClick={onClearFocus}>
                Show all pages
              </Button>
            )}
          </span>
        </div>
      )}
      <div className="flex items-center justify-between gap-2">
        <Select value={filter} onValueChange={(v) => setFilter(v as PageDecodeStatus | "all")}>
          <SelectTrigger className="w-52" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {DECODE_FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-muted-foreground text-xs tabular-nums">
          {rows.length} of {pages.length} pages
        </span>
      </div>
      <div className="max-h-[60vh] overflow-auto rounded-lg border">
        <Table>
          <TableHeader className="bg-background sticky top-0">
            <TableRow>
              <TableHead>File</TableHead>
              <TableHead>Stream</TableHead>
              <TableHead className="text-right">Page</TableHead>
              <TableHead>Decode</TableHead>
              <TableHead>Flags</TableHead>
              <TableHead>Document</TableHead>
              <TableHead>Uploaded</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p, i) => (
              <TableRow
                key={p.page_id}
                onClick={() => setPreviewIdx(i)}
                className="cursor-pointer"
              >
                <TableCell className="max-w-[220px] truncate font-mono text-xs">
                  {p.file_name}
                </TableCell>
                <TableCell className="font-mono text-xs">{p.stream ?? "—"}</TableCell>
                <TableCell className="text-right tabular-nums">{p.page_no ?? "—"}</TableCell>
                <TableCell>
                  <DecodeBadge status={p.decode_status} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">
                    {(p.flags ?? []).map((f) => (
                      <FlagBadge key={f} flag={f} />
                    ))}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground font-mono text-xs">
                  {p.document_id ? shortId(p.document_id) : "—"}
                </TableCell>
                <TableCell className="text-muted-foreground whitespace-nowrap text-xs">
                  {fmtClock(p.created_at)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <PagePreviewDialog
        rows={rows}
        index={previewIdx}
        onIndexChange={setPreviewIdx}
        onClose={() => setPreviewIdx(null)}
      />
    </div>
  );
}

function PagePreviewDialog({
  rows,
  index,
  onIndexChange,
  onClose,
}: {
  rows: DispatchPage[];
  index: number | null;
  onIndexChange: (i: number) => void;
  onClose: () => void;
}) {
  const page = index === null ? null : (rows[index] ?? null);
  const hasPrev = index !== null && index > 0;
  const hasNext = index !== null && index < rows.length - 1;

  // Arrow keys navigate while the dialog is open.
  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft" && hasPrev) onIndexChange(index - 1);
      if (e.key === "ArrowRight" && hasNext) onIndexChange(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, hasPrev, hasNext, onIndexChange]);

  return (
    <Dialog open={page !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl">
        <DialogTitle className="flex items-center justify-between gap-2 pr-8">
          <span className="truncate font-mono text-sm">{page?.file_name}</span>
          {index !== null && (
            <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
              {index + 1} of {rows.length}
            </span>
          )}
        </DialogTitle>
        {page && (
          <PageImage
            r2Key={page.r2_key_downscaled || page.r2_key_original}
            alt={page.file_name}
            className="max-h-[70vh] w-full rounded-md object-contain"
          />
        )}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={!hasPrev}
            onClick={() => index !== null && onIndexChange(index - 1)}
          >
            <ChevronLeft className="size-4" /> Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!hasNext}
            onClick={() => index !== null && onIndexChange(index + 1)}
          >
            Next <ChevronRight className="size-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
