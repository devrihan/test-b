"use client";

// Documents / Needs-attention tabs: one DS table, two modes.
// - "all": row click expands an inline accordion row (claim, thumbnails,
//   event timeline, Send to processing). Every row also carries an
//   Edit-claim pencil (and the expanded panel a button) that opens the
//   resolution dialog — claim editing is not limited to attention rows.
// - "attention": rows carry reason chips; row click opens the resolution
//   dialog instead.
//
// Row identity: rows are keyed by document_id (NEVER array index) — the 10s
// poll can insert rows, and the parent freezes visible order while a row is
// expanded or the dialog is open, surfacing a "n new documents" pill instead.

import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Alert,
  AlertDescription,
  AlertTitle,
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Spinner,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
} from "@student-ds/ui";
import { AlertTriangle, CheckCircle2, ChevronDown, ChevronRight, Pencil, Send } from "lucide-react";
import type { AttentionReason, DispatchDocument, DocumentDetail } from "@/app/lib/scanApi";
import {
  claimSummary,
  errMsg,
  getDocument,
  sendBlockReason,
  sendToProcessing,
} from "@/app/lib/scanApi";
import {
  ClaimGrid,
  DisabledWithTooltip,
  EventTimeline,
  KindBadge,
  OriginBadge,
  PageImage,
  fmtClock,
  shortId,
} from "./components";

export function NewDocsPill({ count, onRefresh }: { count: number; onRefresh: () => void }) {
  if (count === 0) return null;
  return (
    <Button variant="outline" size="sm" className="h-7 rounded-full text-xs" onClick={onRefresh}>
      {count} new document{count === 1 ? "" : "s"} — refresh list
    </Button>
  );
}

function ThumbStrip({
  detail,
  onOpen,
}: {
  detail: DocumentDetail;
  onOpen: (pageNumber: number) => void;
}) {
  if (detail.pages.length === 0)
    return <p className="text-muted-foreground text-sm">No pages recorded.</p>;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {detail.pages.map((p) => (
        <button
          key={p.page_number}
          type="button"
          onClick={() => onOpen(p.page_number)}
          className="group shrink-0 text-center"
          title={`Page ${p.page_number}`}
        >
          <PageImage
            r2Key={p.r2_key_downscaled}
            alt={`Page ${p.page_number}`}
            className="h-28 w-20 rounded border object-cover transition group-hover:ring-2 group-hover:ring-ring"
          />
          <span className="text-muted-foreground text-[10px]">p{p.page_number}</span>
        </button>
      ))}
    </div>
  );
}

function ExpandedDocument({
  docId,
  onChanged,
  onEditClaim,
}: {
  docId: string;
  onChanged: () => void;
  onEditClaim: () => void;
}) {
  const [detail, setDetail] = useState<DocumentDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [lightbox, setLightbox] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    setDetail(null);
    setError(null);
    getDocument(docId)
      .then((d) => alive && setDetail(d))
      .catch((e) => alive && setError(errMsg(e)));
    return () => {
      alive = false;
    };
  }, [docId]);

  if (error)
    return (
      <Alert variant="destructive">
        <AlertTriangle />
        <AlertTitle>Could not load document</AlertTitle>
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  if (!detail)
    return (
      <div className="text-muted-foreground flex items-center gap-2 py-4 text-sm">
        <Spinner className="size-4" /> Loading document…
      </div>
    );

  const blockReason = sendBlockReason(detail);
  const send = async () => {
    setSending(true);
    try {
      const res = await sendToProcessing(docId);
      toast.success(`Sent to processing (workflow ${res.workflow_id})`);
      onChanged();
      // refresh the local detail so the button disables itself
      setDetail(await getDocument(docId).catch(() => detail));
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSending(false);
    }
  };

  const lightboxPage = lightbox !== null ? detail.pages.find((p) => p.page_number === lightbox) : null;

  return (
    <div className="grid gap-4 py-1 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">
        <div>
          <h4 className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wider uppercase">
            Claim
          </h4>
          <ClaimGrid claim={detail.claimed_metadata} />
        </div>
        <div>
          <h4 className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wider uppercase">
            Pages ({detail.pages.length})
          </h4>
          <ThumbStrip detail={detail} onOpen={setLightbox} />
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={onEditClaim}>
            <Pencil /> Edit claim
          </Button>
          {blockReason ? (
            <DisabledWithTooltip reason={blockReason}>
              <Button disabled variant="secondary">
                <Send /> {blockReason.startsWith("Already") ? blockReason : "Resolve claim first"}
              </Button>
            </DisabledWithTooltip>
          ) : (
            <Button onClick={send} disabled={sending}>
              {sending ? <Spinner className="size-4" /> : <Send />} Send to processing
            </Button>
          )}
          {detail.processing && (
            <Badge variant="outline">stage: {detail.processing.stage}</Badge>
          )}
        </div>
      </div>
      <div className="min-w-0">
        <h4 className="text-muted-foreground mb-1.5 text-xs font-semibold tracking-wider uppercase">
          History
        </h4>
        <div className="max-h-72 overflow-y-auto pr-1">
          <EventTimeline events={detail.events} />
        </div>
      </div>

      <Dialog open={lightbox !== null} onOpenChange={(o) => !o && setLightbox(null)}>
        <DialogContent className="max-h-[92vh] sm:max-w-3xl">
          <DialogTitle className="text-sm">
            Page {lightbox} · {shortId(detail.document_id)}
          </DialogTitle>
          {lightboxPage && (
            <div className="max-h-[78vh] overflow-auto">
              <PageImage
                r2Key={lightboxPage.r2_key_original}
                alt={`Page ${lightboxPage.page_number} full size`}
                className="w-full rounded border"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function DocumentsTable({
  docs,
  attention,
  mode,
  expandedId,
  onToggleExpand,
  onOpenResolve,
  onChanged,
  rosterNotice,
}: {
  docs: DispatchDocument[];
  attention: Map<string, AttentionReason[]>;
  mode: "all" | "attention";
  expandedId: string | null;
  onToggleExpand: (docId: string | null) => void;
  onOpenResolve: (docId: string) => void;
  onChanged: () => void;
  rosterNotice: string | null;
}) {
  const rows = mode === "all" ? docs : docs.filter((d) => (attention.get(d.document_id) ?? []).length > 0);

  if (rows.length === 0) {
    return (
      <Empty className="border border-dashed">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <CheckCircle2 />
          </EmptyMedia>
          <EmptyTitle>{mode === "attention" ? "All clear" : "No documents yet"}</EmptyTitle>
          <EmptyDescription>
            {mode === "attention"
              ? "Every document in this dispatch has a settled claim."
              : "Documents appear as the sorter cuts booklets out of the page stream."}
          </EmptyDescription>
        </EmptyHeader>
        {mode === "attention" && rosterNotice && (
          <p className="text-muted-foreground text-xs">{rosterNotice}</p>
        )}
      </Empty>
    );
  }

  return (
    <div className="space-y-2">
      {mode === "attention" && rosterNotice && (
        <Alert>
          <AlertTriangle />
          <AlertDescription>{rosterNotice}</AlertDescription>
        </Alert>
      )}
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead>Kind</TableHead>
              <TableHead>Claim</TableHead>
              <TableHead>Origin</TableHead>
              <TableHead className="text-right">Pages</TableHead>
              <TableHead>Created</TableHead>
              <TableHead>{mode === "attention" ? "Reason" : ""}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((d) => {
              const reasons = attention.get(d.document_id) ?? [];
              const expanded = expandedId === d.document_id;
              return (
                // Keyed by document_id — see header comment.
                <React.Fragment key={d.document_id}>
                  <TableRow
                    className={cn("cursor-pointer", expanded && "bg-muted/50")}
                    onClick={() =>
                      mode === "attention"
                        ? onOpenResolve(d.document_id)
                        : onToggleExpand(expanded ? null : d.document_id)
                    }
                  >
                    <TableCell className="text-muted-foreground">
                      {mode === "all" &&
                        (expanded ? (
                          <ChevronDown className="size-4" />
                        ) : (
                          <ChevronRight className="size-4" />
                        ))}
                    </TableCell>
                    <TableCell>
                      {d.detail ? (
                        <KindBadge kind={d.detail.kind} />
                      ) : (
                        <Badge variant="outline">older doc</Badge>
                      )}
                    </TableCell>
                    <TableCell className="max-w-[340px] truncate font-medium">
                      {d.detail
                        ? d.detail.kind === null
                          ? "(no cover found)"
                          : claimSummary(d.detail.claimed_metadata)
                        : shortId(d.document_id)}
                    </TableCell>
                    <TableCell>
                      <OriginBadge origin={d.detail?.metadata_origin} />
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{d.page_count}</TableCell>
                    <TableCell className="text-muted-foreground whitespace-nowrap">
                      {fmtClock(d.created_at)}
                    </TableCell>
                    <TableCell>
                      {mode === "attention" ? (
                        <div className="flex flex-wrap gap-1">
                          {reasons.map((r) => (
                            <Badge key={r.rule} variant="destructive">
                              {r.label}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          {reasons.length > 0 && (
                            <span title={reasons.map((r) => r.label).join("; ")}>
                              <AlertTriangle className="size-4 text-amber-500" />
                            </span>
                          )}
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            aria-label="Edit claim"
                            title="Edit claim"
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenResolve(d.document_id);
                            }}
                          >
                            <Pencil className="size-3.5" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                  {mode === "all" && expanded && (
                    // DS gap: the DS table has no expandable-row primitive —
                    // hand-rolled as an extra full-width row.
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={7} className="bg-muted/20 px-6">
                        <ExpandedDocument
                          docId={d.document_id}
                          onChanged={onChanged}
                          onEditClaim={() => onOpenResolve(d.document_id)}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
      {docs.some((d) => !d.detail) && (
        <p className="text-muted-foreground text-xs">
          Rows marked “older doc” fall outside the documents window this screen fetched (first
          1,000) — open them from the Pages tab if needed.
        </p>
      )}
    </div>
  );
}
