import { NextRequest, NextResponse } from "next/server";

// Streams a scan page image to the browser by its R2 key.
//
// KNOWN GAP: piper has no page-image-serving endpoint yet (its R2 keys are
// returned in page rows, but nothing serves the bytes). Until it grows one,
// this route streams from the bucket's public/base URL (SCAN_IMAGE_BASE env,
// server-side only). When piper gets a real endpoint, point this route at it
// and delete the env.
//
// Key validation: only the two key shapes piper mints (documents/… and
// dispatches/…) are proxied — this is not an open image proxy.

const KEY_RE = /^(documents|dispatches)\/[0-9a-f-]{36}\/pages\/[A-Za-z0-9._-]+$/;

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get("key");
  if (!key || !KEY_RE.test(key)) {
    return NextResponse.json({ message: "missing or invalid key" }, { status: 400 });
  }

  const base = process.env.SCAN_IMAGE_BASE;
  if (!base) {
    return NextResponse.json(
      { message: "SCAN_IMAGE_BASE is not configured — scan images unavailable" },
      { status: 503 },
    );
  }

  const res = await fetch(`${base.replace(/\/$/, "")}/${key}`, { cache: "no-store" });
  if (!res.ok || !res.body) {
    return NextResponse.json({ message: `image fetch failed (${res.status})` }, { status: 502 });
  }
  return new Response(res.body, {
    headers: {
      "Content-Type": res.headers.get("content-type") ?? "image/webp",
      // Keys are content-stable (a retry overwrites the same key), so cache.
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
    },
  });
}
