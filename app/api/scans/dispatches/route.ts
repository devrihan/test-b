import { NextRequest, NextResponse } from "next/server";
import { passthrough, piperFetch, proxyError } from "../_lib/piper";

// Dispatch list for the scanning monitor.
//
// KNOWN GAP: piper has no `GET /dispatches` list endpoint yet (verified
// against feat/dispatch-intake — only POST /dispatches, GET /dispatches/:id
// and GET /dispatches/current exist). Until it grows one, this route:
//   1. tries GET /dispatches upstream (future-proof: passthrough if it lands),
//   2. otherwise derives the list from recent documents' mint events
//      (each `sorted_from_dispatch*` event carries its dispatch_id).
// Consequence: a dispatch with no minted documents yet is invisible here —
// the UI compensates with lookup-by-id and lookup-by-laptop inputs.

interface MintEvent {
  event_kind: string;
  payload?: { dispatch_id?: string } | null;
}

export async function GET(req: NextRequest) {
  try {
    const laptopId = req.nextUrl.searchParams.get("laptop_id");
    if (laptopId) {
      const r = await piperFetch(req, `/dispatches/current?laptop_id=${encodeURIComponent(laptopId)}`);
      if (r.status !== 200) return passthrough(r);
      return NextResponse.json({ dispatches: [r.body], source: "piper" });
    }

    const upstream = await piperFetch(req, "/dispatches");
    if (upstream.status === 200) {
      const body = upstream.body as { dispatches?: unknown[] } | unknown[];
      const dispatches = Array.isArray(body) ? body : (body?.dispatches ?? []);
      return NextResponse.json({ dispatches, source: "piper" });
    }
    if (upstream.status !== 404) return passthrough(upstream);

    // Fallback: discover dispatch ids via recent documents.
    const docsRes = await piperFetch(req, "/documents");
    if (docsRes.status !== 200) return passthrough(docsRes);
    const docs = (docsRes.body as { documents: { document_id: string }[] }).documents ?? [];

    const details = await Promise.all(
      docs.slice(0, 40).map((d) => piperFetch(req, `/documents/${d.document_id}`)),
    );
    const dispatchIds = new Set<string>();
    for (const det of details) {
      if (det.status !== 200) continue;
      const events = ((det.body as { events?: MintEvent[] }).events ?? []);
      for (const ev of events) {
        if (ev.event_kind.startsWith("sorted_from_dispatch") && ev.payload?.dispatch_id) {
          dispatchIds.add(ev.payload.dispatch_id);
        }
      }
    }

    const dispatches = (
      await Promise.all([...dispatchIds].map((id) => piperFetch(req, `/dispatches/${id}`)))
    )
      .filter((r) => r.status === 200)
      .map((r) => r.body as { opened_at: string });
    dispatches.sort((a, b) => (a.opened_at < b.opened_at ? 1 : -1));

    return NextResponse.json({ dispatches, source: "derived-from-documents" });
  } catch (err) {
    return proxyError(err);
  }
}
