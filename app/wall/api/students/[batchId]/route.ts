import { NextResponse } from "next/server";

// LOCAL/dev real-data bridge — per-batch student roster for drill-in. Same
// server-side-token pattern + gating as ../batches/route.ts.
export async function GET(_req: Request, { params }: { params: Promise<{ batchId: string }> }) {
  if (process.env.NEXT_PUBLIC_WALL_OPS !== "1") return NextResponse.json({ students: [] });
  const { batchId } = await params;
  const base = process.env.BEAVER_API_URL ?? "http://localhost:4000";
  const key = process.env.INTERNAL_SERVICE_KEY ?? "";
  const r = await fetch(`${base}/api/${encodeURIComponent(batchId)}/students`, {
    headers: { "x-river-service-token": key },
    cache: "no-store",
  });
  return new NextResponse(await r.text(), {
    status: r.status,
    headers: { "content-type": "application/json" },
  });
}
