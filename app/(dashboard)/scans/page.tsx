"use client";

// Scanning — ONE consolidated screen (/scans, spec rev 2): dispatch rail on
// the left, everything right of it scoped to the selected dispatch; human
// resolution happens in a dialog over the same screen, never on another page.
//
// Data flow: piper via /api/scans/* proxies. Documents are scoped to a
// dispatch by joining GET /dispatches/:id/pages (document_id per page)
// against GET /documents client-side — piper has no by-dispatch endpoint yet.
// Polls ~10s while the dispatch is open/sorting; paused when the tab is
// hidden; the freshness pill shows poll age.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast, Toaster } from "sonner";
import {
  Badge,
  Button,
  Card,
  CardContent,
  Spinner,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  TooltipProvider,
  cn,
} from "@student-ds/ui";
import { AlertTriangle, Pause, Play, RefreshCw, RotateCw } from "lucide-react";
import type {
  Dispatch,
  DispatchPage,
  RosterStudent,
  ScannedDocument,
  SortAction,
} from "@/app/lib/scanApi";
import {
  computeAttention,
  errMsg,
  fetchRoster,
  getDispatch,
  getDispatchPages,
  getDocument,
  joinDispatchDocuments,
  listDispatches,
  listDocuments,
  sortControl,
} from "@/app/lib/scanApi";
import {
  DisabledWithTooltip,
  DispatchIntakeBadge,
  DispatchSortBadge,
  CounterStrip,
  FreshnessPill,
  fmtClock,
  fmtDate,
  railLabel,
} from "./components";
import { DocumentsTable, NewDocsPill } from "./documents-tab";
import { DocumentSearch } from "./search";
import { importFromDispatch } from "@/app/(dashboard)/pdfExtract/lib/beaverApi";
import { ApiError } from "@/app/lib/apiClient";
import { PagesTable } from "./pages-tab";
import { ResolveDialog } from "./resolve-dialog";

const POLL_MS = 10_000;
// How long the decode/sort counters can sit unchanged (on a live, un-paused
// dispatch with pending pages) before we flag the sort as stalled.
const STALL_MS = 60_000;

export default function ScansPage() {
  // ── core data ────────────────────────────────────────────────────────────
  const [dispatches, setDispatches] = useState<Dispatch[] | null>(null);
  const [listError, setListError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState("documents");
  // Search click-through: pages tab locked to one document's pages until cleared.
  const [focusDoc, setFocusDoc] = useState<{
    docId: string;
    dispatchId: string;
    label: string;
    claim: { student_name?: string; roll_number?: string | number; grade?: string | number; section?: string; subject?: string; admission_no?: string } | null;
  } | null>(null);
  const [selected, setSelected] = useState<Dispatch | null>(null);
  const [pages, setPages] = useState<DispatchPage[]>([]);
  const [documents, setDocuments] = useState<ScannedDocument[] | null>(null);
  // roster: undefined = loading, null = unavailable (degrade: skip rule)
  const [roster, setRoster] = useState<RosterStudent[] | null | undefined>(undefined);
  const [railAttention, setRailAttention] = useState<Map<string, number>>(new Map());

  // Search click-through: locate the document's dispatch (from its sort
  // event), select it, and land on the Pages tab filtered to that document.
  const openSearchedDocument = useCallback(async (doc: import("@/app/lib/scanApi").ScannedDocument) => {
    try {
      const detail = await getDocument(doc.document_id);
      const ev = (detail.events ?? []).find((e) => e.event_kind === "sorted_from_dispatch");
      const dispatchId = (ev?.payload as { dispatch_id?: string } | null)?.dispatch_id;
      if (!dispatchId) {
        toast.error("This document has no dispatch link yet (not sorted) — cannot jump to its pages.");
        return;
      }
      const c = (doc.claimed_metadata ?? {}) as {
        student_name?: string; roll_number?: string | number; grade?: string | number;
        section?: string; subject?: string; admission_no?: string;
      };
      setFocusDoc({ docId: doc.document_id, dispatchId, label: c.student_name ?? doc.document_id.slice(0, 8), claim: c });
      setSelectedId(dispatchId);
      setTab("pages");
    } catch (e) {
      toast.error(errMsg(e));
    }
  }, []);

  // "Upload to batch": for a paper that exists in dispatch but is missing
  // from its batch. Probe first (server 409s with the matched batch), confirm
  // with the operator, then import + pipeline start.
  const uploadFocusedToBatch = useCallback(async () => {
    if (!focusDoc?.claim) return;
    const c = focusDoc.claim;
    if (!c.student_name || c.roll_number == null || !c.subject || c.grade == null || !c.section) {
      toast.error("This document's QR claim is incomplete (need name, roll, grade, section, subject).");
      return;
    }
    const docPages = pages
      .filter((p) => p.document_id === focusDoc.docId)
      .sort((a, b) => (a.page_no ?? 0) - (b.page_no ?? 0));
    const keys = docPages.map((p) => p.r2_key_original).filter(Boolean);
    if (keys.length === 0) {
      toast.error("No original page keys found for this document.");
      return;
    }
    const payload = {
      student_name: String(c.student_name),
      roll_number: String(c.roll_number),
      grade: String(c.grade),
      section: String(c.section),
      subject: String(c.subject),
      ...(c.admission_no ? { admission_no: String(c.admission_no) } : {}),
      page_keys: keys,
    };
    try {
      await importFromDispatch(payload);
      // No 409 means the server imported without confirmation — not the
      // expected contract, but the outcome is the same.
      toast.success("Paper uploaded to its batch — pipeline started.");
      return;
    } catch (e) {
      const body = e instanceof ApiError ? (e.body as {
        needs_confirmation?: boolean; already_exists?: boolean; error?: string;
        batch?: { batch_id: string; subject: string; grade: string; section: string; exam_type: string | null };
      } | undefined) : undefined;
      if (e instanceof ApiError && e.status === 409 && body?.needs_confirmation && body.batch) {
        const b = body.batch;
        if (!window.confirm(
          `Upload ${keys.length} original page(s) as ${c.student_name} (roll ${c.roll_number}) into\n\n` +
          `${b.batch_id}\n${b.subject} · grade ${b.grade} · section ${b.section}${b.exam_type ? ` · ${b.exam_type}` : ""}\n\n` +
          `A new paper is created and the pipeline starts. Continue?`
        )) return;
        try {
          const done = await importFromDispatch({ ...payload, confirm: true });
          toast.success(`Uploaded ${done.pages} page(s) to ${done.batch_id} — pipeline started.`);
        } catch (e2) {
          toast.error(e2 instanceof Error ? e2.message : "Upload failed");
        }
        return;
      }
      toast.error(body?.error ?? (e instanceof Error ? e.message : "Upload failed"));
    }
  }, [focusDoc, pages]);

  // ── ui state ─────────────────────────────────────────────────────────────
  const [lastPollAt, setLastPollAt] = useState<number | null>(null);
  const [secondsAgo, setSecondsAgo] = useState<number | null>(null);
  const [tabHidden, setTabHidden] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogIndex, setDialogIndex] = useState(0);
  const [dialogQueueIds, setDialogQueueIds] = useState<string[]>([]);
  const [frozenIds, setFrozenIds] = useState<string[] | null>(null);
  // Sort-stall detection: the sort workflow can fail silently server-side
  // (piper doesn't expose its Temporal state), leaving pages stuck at
  // "awaiting decode". We infer a stall when the decode/sort counters don't
  // advance for a while on a live, un-paused dispatch with pending pages.
  const sortProgressRef = useRef<{ sig: string; at: number } | null>(null);
  const [sortStalled, setSortStalled] = useState(false);
  const [sortBusy, setSortBusy] = useState<SortAction | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);

  // ── initial loads ────────────────────────────────────────────────────────

  const loadDispatches = useCallback(async () => {
    try {
      const res = await listDispatches();
      setDispatches(res.dispatches);
      setListError(null);
      return res.dispatches;
    } catch (e) {
      setListError(errMsg(e));
      setDispatches([]);
      return [];
    }
  }, []);

  useEffect(() => {
    void (async () => {
      const ds = await loadDispatches();
      // default selection: newest non-sorted, else newest
      const preferred = ds.find((d) => d.status !== "sorted") ?? ds[0];
      if (preferred) setSelectedId((cur) => cur ?? preferred.dispatch_id);
    })();
    listDocuments({ limit: 1000 })
      .then((r) => setDocuments(r.documents))
      .catch(() => setDocuments([]));
    fetchRoster()
      .then(setRoster)
      .catch(() => setRoster(null));
  }, [loadDispatches]);

  // ── selected dispatch: fetch + poll ──────────────────────────────────────

  const pollSelected = useCallback(async (id: string) => {
    const [d, p, docs] = await Promise.all([
      getDispatch(id),
      getDispatchPages(id),
      listDocuments({ limit: 1000 }).catch(() => null),
    ]);
    setSelected(d);
    setPages(p.pages);
    if (docs) setDocuments(docs.documents);
    setLastPollAt(Date.now());
    // keep the rail's copy of this dispatch fresh too
    setDispatches((list) =>
      list ? list.map((x) => (x.dispatch_id === id ? d : x)) : list,
    );
  }, []);

  useEffect(() => {
    if (!selectedId) return;
    setSelected(null);
    setPages([]);
    setExpandedId(null);
    setFrozenIds(null);
    void pollSelected(selectedId).catch((e) => toast.error(errMsg(e)));
  }, [selectedId, pollSelected]);

  // visibility → pause polling when the tab is hidden
  useEffect(() => {
    const onVis = () => setTabHidden(document.hidden);
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Stall detection: reset the timer whenever the counters advance; flag a
  // stall once they've sat unchanged past STALL_MS while pages are pending.
  const sortCanStall =
    selected !== null &&
    selected.status !== "sorted" &&
    !selected.sort_paused &&
    selected.counters.pages_pending_decode > 0;
  useEffect(() => {
    if (!selected) {
      sortProgressRef.current = null;
      setSortStalled(false);
      return;
    }
    const c = selected.counters;
    const sig = `${c.pages_pending_decode}-${c.pages_sorted}-${c.documents_minted}`;
    if (!sortProgressRef.current || sortProgressRef.current.sig !== sig) {
      sortProgressRef.current = { sig, at: Date.now() };
      setSortStalled(false);
    }
  }, [selected]);
  useEffect(() => {
    if (!sortCanStall) {
      setSortStalled(false);
      return;
    }
    const t = setInterval(() => {
      const p = sortProgressRef.current;
      if (p && Date.now() - p.at > STALL_MS) setSortStalled(true);
    }, 5_000);
    return () => clearInterval(t);
  }, [sortCanStall, selectedId]);

  const live = selected !== null && selected.status !== "sorted";
  useEffect(() => {
    if (!selectedId || !live || tabHidden) return;
    const t = setInterval(() => {
      void pollSelected(selectedId).catch(() => {
        /* transient poll failure — pill age keeps growing, no toast spam */
      });
    }, POLL_MS);
    return () => clearInterval(t);
  }, [selectedId, live, tabHidden, pollSelected]);

  // freshness pill ticker
  useEffect(() => {
    const t = setInterval(
      () => setSecondsAgo(lastPollAt ? Math.round((Date.now() - lastPollAt) / 1000) : null),
      1000,
    );
    return () => clearInterval(t);
  }, [lastPollAt]);

  // ── derived: documents of the selected dispatch + needs-attention ────────

  const dispatchDocs = useMemo(
    () => joinDispatchDocuments(pages, documents ?? []),
    [pages, documents],
  );
  const attention = useMemo(
    () => computeAttention(dispatchDocs, roster ?? null),
    [dispatchDocs, roster],
  );
  const attentionCount = useMemo(
    () => [...attention.values()].filter((r) => r.length > 0).length,
    [attention],
  );

  // Freeze visible order while a row is expanded or the dialog is open — the
  // poll can insert documents and re-ordering under an open row would re-bind
  // it. New arrivals surface via the "n new documents" pill instead.
  const frozen = expandedId !== null || dialogOpen;
  useEffect(() => {
    if (frozen) {
      setFrozenIds((cur) => cur ?? dispatchDocs.map((d) => d.document_id));
    } else {
      setFrozenIds(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frozen]);

  const displayDocs = useMemo(() => {
    if (!frozenIds) return dispatchDocs;
    const byId = new Map(dispatchDocs.map((d) => [d.document_id, d]));
    return frozenIds.map((id) => byId.get(id)).filter((d): d is NonNullable<typeof d> => !!d);
  }, [dispatchDocs, frozenIds]);
  const pendingNew = frozenIds
    ? dispatchDocs.filter((d) => !frozenIds.includes(d.document_id)).length
    : 0;
  const refreshOrder = () => setFrozenIds(dispatchDocs.map((d) => d.document_id));

  // ── rail ⚠ counts (computed once per load / after writes, not per poll) ──

  useEffect(() => {
    if (!dispatches || dispatches.length === 0 || documents === null || roster === undefined)
      return;
    let alive = true;
    void (async () => {
      const entries = await Promise.all(
        dispatches.map(async (d) => {
          try {
            const { pages: p } = await getDispatchPages(d.dispatch_id);
            const docs = joinDispatchDocuments(p, documents);
            const att = computeAttention(docs, roster ?? null);
            return [d.dispatch_id, [...att.values()].filter((r) => r.length > 0).length] as const;
          } catch {
            return [d.dispatch_id, 0] as const;
          }
        }),
      );
      if (alive) setRailAttention(new Map(entries));
    })();
    return () => {
      alive = false;
    };
    // refreshTick re-runs after resolution writes; deliberately NOT keyed on
    // the polled `documents` identity to avoid refetching every dispatch's
    // pages every 10s.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dispatches?.length, documents === null, roster === undefined, refreshTick]);

  // ── actions ──────────────────────────────────────────────────────────────

  const runSort = async (action: SortAction) => {
    if (!selectedId) return;
    setSortBusy(action);
    try {
      await sortControl(selectedId, action);
      await pollSelected(selectedId);
      toast.success(
        action === "start" ? "Sort workflow (re)started" : `Sort ${action}d`,
      );
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setSortBusy(null);
    }
  };

  const onDataChanged = () => {
    if (selectedId) void pollSelected(selectedId).catch(() => {});
    setRefreshTick((n) => n + 1);
  };

  const openResolve = (docId: string) => {
    // freeze the queue at open time so prev/next stays stable while reasons
    // resolve underneath
    const ids = displayDocs
      .filter((d) => (attention.get(d.document_id) ?? []).length > 0)
      .map((d) => d.document_id);
    const queue = ids.includes(docId) ? ids : [docId, ...ids];
    setDialogQueueIds(queue);
    setDialogIndex(queue.indexOf(docId));
    setDialogOpen(true);
  };

  const dialogQueue = useMemo(() => {
    const byId = new Map(dispatchDocs.map((d) => [d.document_id, d]));
    return dialogQueueIds
      .map((id) => byId.get(id))
      .filter((d): d is NonNullable<typeof d> => !!d);
  }, [dialogQueueIds, dispatchDocs]);

  const rosterNotice =
    roster === null
      ? "Roster unavailable — the roster check was skipped for these rows."
      : null;

  // ── render ───────────────────────────────────────────────────────────────

  return (
    <TooltipProvider>
      <Toaster richColors position="bottom-right" />
      <div className="flex min-h-[calc(100vh-5rem)] w-full">
        {/* ── dispatch rail ── */}
        <aside className="bg-muted/30 w-60 shrink-0 border-r px-3 py-4">
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="text-muted-foreground text-xs font-semibold tracking-wider uppercase">
              Dispatches
            </h2>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label="Refresh dispatches"
              onClick={() => {
                void loadDispatches();
                onDataChanged();
              }}
            >
              <RefreshCw className="size-3.5" />
            </Button>
          </div>
          {dispatches === null ? (
            <div className="text-muted-foreground flex items-center gap-2 px-1 text-sm">
              <Spinner className="size-4" /> Loading…
            </div>
          ) : dispatches.length === 0 ? (
            <Card className="border-dashed py-4">
              <CardContent className="text-muted-foreground px-4 text-center text-xs">
                {listError
                  ? `Could not load dispatches: ${listError}`
                  : "Dispatches appear here when a scanning laptop opens one."}
              </CardContent>
            </Card>
          ) : (
            <nav className="flex flex-col gap-1.5">
              {dispatches.map((d) => {
                const active = d.dispatch_id === selectedId;
                const warn =
                  d.dispatch_id === selectedId && selected
                    ? attentionCount
                    : (railAttention.get(d.dispatch_id) ?? 0);
                return (
                  <button
                    key={d.dispatch_id}
                    type="button"
                    onClick={() => {
                      if (focusDoc && focusDoc.dispatchId !== d.dispatch_id) setFocusDoc(null);
                      setSelectedId(d.dispatch_id);
                    }}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-left transition",
                      active
                        ? "bg-background border-ring shadow-sm"
                        : "hover:bg-background/60 border-transparent",
                    )}
                  >
                    <div className="truncate text-sm font-medium">{railLabel(d)}</div>
                    <div className="text-muted-foreground truncate text-xs">
                      {d.exam_type_name ?? "no exam type"}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <DispatchIntakeBadge status={d.status} />
                      <DispatchSortBadge
                        status={d.status}
                        paused={d.sort_paused}
                        pendingDecode={d.counters.pages_pending_decode}
                      />
                      {warn > 0 && (
                        <Badge variant="destructive" className="gap-1">
                          <AlertTriangle className="size-3" /> {warn}
                        </Badge>
                      )}
                    </div>
                  </button>
                );
              })}
            </nav>
          )}
        </aside>

        {/* ── main area (scoped to selected dispatch) ── */}
        <main className="min-w-0 flex-1 space-y-4 px-6 py-4">
          <div className="flex items-start justify-between gap-3">
            <h1 className="text-lg font-semibold">Dispatch</h1>
            <div className="flex min-w-0 flex-1 justify-center px-4">
              <DocumentSearch onOpen={openSearchedDocument} />
            </div>
            <FreshnessPill live={live} secondsAgo={secondsAgo} hidden={tabHidden} />
          </div>

          {!selectedId ? (
            <p className="text-muted-foreground text-sm">Select a dispatch to inspect it.</p>
          ) : !selected ? (
            <div className="text-muted-foreground flex items-center gap-2 text-sm">
              <Spinner className="size-4" /> Loading dispatch…
            </div>
          ) : (
            <>
              {/* header */}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <h2 className="truncate text-xl font-semibold">{selected.name}</h2>
                    <Badge variant="outline" className="shrink-0 font-normal">
                      {selected.exam_type_name ?? "no exam type"}
                    </Badge>
                    <DispatchIntakeBadge status={selected.status} />
                    <DispatchSortBadge
                      status={selected.status}
                      paused={selected.sort_paused}
                      pendingDecode={selected.counters.pages_pending_decode}
                      stalled={sortStalled}
                    />
                  </div>
                  <p className="text-muted-foreground mt-0.5 text-sm">
                    opened {fmtClock(selected.opened_at)} {fmtDate(selected.opened_at)}
                    {selected.closed_at
                      ? ` · closed ${fmtClock(selected.closed_at)} ${fmtDate(selected.closed_at)}`
                      : ""}
                  </p>
                </div>
                {selected.status !== "sorted" && (
                  <div className="flex items-center gap-2">
                    {selected.sort_paused ? (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={sortBusy !== null}
                        onClick={() => void runSort("resume")}
                      >
                        {sortBusy === "resume" ? <Spinner className="size-4" /> : <Play />} Resume
                      </Button>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={sortBusy !== null}
                        onClick={() => void runSort("pause")}
                      >
                        {sortBusy === "pause" ? <Spinner className="size-4" /> : <Pause />} Pause
                      </Button>
                    )}
                    <Button
                      size="sm"
                      disabled={sortBusy !== null}
                      onClick={() => void runSort("start")}
                    >
                      {sortBusy === "start" ? <Spinner className="size-4" /> : <RotateCw />} Start
                      sort
                    </Button>
                    {selected.status === "open" && (
                      <DisabledWithTooltip reason="The operator at the scanning laptop owns 'stream complete' — closing happens from flycatcher, not here.">
                        <Button variant="ghost" size="sm" disabled>
                          Close
                        </Button>
                      </DisabledWithTooltip>
                    )}
                  </div>
                )}
              </div>

              {/* sort-stalled warning — the workflow may have failed server-side */}
              {sortStalled && (
                <div className="border-destructive/40 bg-destructive/10 text-destructive flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm">
                  <span className="flex items-center gap-2">
                    <AlertTriangle className="size-4 shrink-0" />
                    Sorting isn&apos;t progressing — {selected.counters.pages_pending_decode}{" "}
                    page(s) stuck awaiting decode. The sort may have failed; retry, or check
                    with the team.
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={sortBusy !== null}
                    onClick={() => void runSort("start")}
                  >
                    {sortBusy === "start" ? <Spinner className="size-4" /> : <RotateCw />} Retry
                    sort
                  </Button>
                </div>
              )}

              {/* counter tiles */}
              <CounterStrip counters={selected.counters} />

              {/* body tabs */}
              <Tabs value={tab} onValueChange={setTab}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <TabsList>
                    <TabsTrigger value="documents">
                      Documents ({dispatchDocs.length})
                    </TabsTrigger>
                    <TabsTrigger value="attention">
                      Needs attention ({attentionCount})
                    </TabsTrigger>
                    <TabsTrigger value="pages">Pages ({pages.length})</TabsTrigger>
                  </TabsList>
                  <NewDocsPill count={pendingNew} onRefresh={refreshOrder} />
                </div>
                <TabsContent value="documents" className="mt-3">
                  <DocumentsTable
                    docs={displayDocs}
                    attention={attention}
                    mode="all"
                    expandedId={expandedId}
                    onToggleExpand={setExpandedId}
                    onOpenResolve={openResolve}
                    onChanged={onDataChanged}
                    rosterNotice={rosterNotice}
                  />
                </TabsContent>
                <TabsContent value="attention" className="mt-3">
                  <DocumentsTable
                    docs={displayDocs}
                    attention={attention}
                    mode="attention"
                    expandedId={null}
                    onToggleExpand={() => {}}
                    onOpenResolve={openResolve}
                    onChanged={onDataChanged}
                    rosterNotice={rosterNotice}
                  />
                </TabsContent>
                <TabsContent value="pages" className="mt-3">
                  <PagesTable
                    pages={pages}
                    focusDocumentId={focusDoc?.dispatchId === selectedId ? focusDoc.docId : null}
                    focusLabel={focusDoc?.label ?? null}
                    onClearFocus={() => setFocusDoc(null)}
                    onUploadToBatch={focusDoc?.claim ? uploadFocusedToBatch : undefined}
                  />
                </TabsContent>
              </Tabs>
            </>
          )}
        </main>
      </div>

      <ResolveDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        queue={dialogQueue}
        index={dialogIndex}
        onNavigate={setDialogIndex}
        attention={attention}
        roster={roster ?? null}
        allDocs={dispatchDocs}
        onChanged={onDataChanged}
      />
    </TooltipProvider>
  );
}
