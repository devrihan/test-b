"use client";

// Cross-dispatch document search by student name. The dispatch rail scopes
// everything else on this screen to ONE dispatch; this box answers the other
// question operators actually have — "where did this student's paper land?" —
// by matching the QR claim across ALL documents, then jumping the screen to
// that document's dispatch with the Pages tab filtered to its original pages.

import { useRef, useState } from "react";
import { Button, Card, Input, Spinner, cn } from "@student-ds/ui";
import { Search, X } from "lucide-react";
import type { AnswerPaperClaim, ScannedDocument } from "@/app/lib/scanApi";
import { listDocuments } from "@/app/lib/scanApi";

const norm = (s: string | null | undefined) =>
  (s ?? "").trim().toUpperCase().replace(/\s+/g, " ");

export interface DocSearchHit {
  doc: ScannedDocument;
  label: string;
}

export function DocumentSearch({
  onOpen,
}: {
  onOpen: (doc: ScannedDocument) => void | Promise<void>;
}) {
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [hits, setHits] = useState<DocSearchHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The full document list is fetched once per mount and reused across
  // searches — it's ~5k rows of metadata, and new documents only appear when
  // a dispatch is actively sorting.
  const cacheRef = useRef<ScannedDocument[] | null>(null);

  const run = async () => {
    const needle = norm(q);
    if (needle.length < 3) {
      setError("Type at least 3 characters of the student's name.");
      setHits(null);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!cacheRef.current) {
        const docs: ScannedDocument[] = [];
        for (let offset = 0; ; offset += 1000) {
          const page = await listDocuments({ limit: 1000, offset });
          docs.push(...page.documents);
          if (page.documents.length === 0 || docs.length >= (page.total ?? docs.length)) break;
        }
        cacheRef.current = docs;
      }
      const found = cacheRef.current
        .filter((d) => {
          const c = (d.claimed_metadata ?? {}) as Partial<AnswerPaperClaim>;
          return norm(typeof c.student_name === "string" ? c.student_name : "").includes(needle);
        })
        .sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""))
        .slice(0, 30)
        .map((doc) => {
          const c = (doc.claimed_metadata ?? {}) as Partial<AnswerPaperClaim>;
          const bits = [
            c.subject,
            c.grade && c.section ? `${c.grade}-${c.section}` : c.section,
            c.roll_number != null ? `r${c.roll_number}` : null,
          ].filter(Boolean);
          return { doc, label: `${c.student_name ?? "(unnamed)"} · ${bits.join(" ")}` };
        });
      setHits(found);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Search failed");
    } finally {
      setBusy(false);
    }
  };

  const clear = () => {
    setQ("");
    setHits(null);
    setError(null);
  };

  return (
    <div className="relative w-full max-w-md">
      <div className="flex items-center gap-2">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void run();
            if (e.key === "Escape") clear();
          }}
          placeholder="Search student name across all dispatches…"
          className="h-8"
        />
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void run()}>
          {busy ? <Spinner className="size-4" /> : <Search />}
        </Button>
        {(hits !== null || q) && (
          <Button variant="ghost" size="sm" onClick={clear} aria-label="Clear search">
            <X />
          </Button>
        )}
      </div>
      {error && <p className="text-destructive mt-1 text-xs">{error}</p>}
      {hits !== null && (
        <Card className="absolute z-30 mt-1 max-h-80 w-full overflow-auto p-1 shadow-lg">
          {hits.length === 0 ? (
            <p className="text-muted-foreground px-3 py-2 text-sm">
              No documents claim a matching student name.
            </p>
          ) : (
            hits.map(({ doc, label }) => (
              <button
                key={doc.document_id}
                onClick={() => {
                  setHits(null);
                  void onOpen(doc);
                }}
                className={cn(
                  "hover:bg-accent block w-full rounded px-3 py-1.5 text-left text-sm",
                )}
              >
                <span className="font-medium">{label}</span>
                <span className="text-muted-foreground ml-2 text-xs">
                  {(doc.created_at || "").slice(0, 10)} · {doc.document_id.slice(0, 8)}
                </span>
              </button>
            ))
          )}
        </Card>
      )}
    </div>
  );
}
