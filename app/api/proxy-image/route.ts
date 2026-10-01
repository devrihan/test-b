import { NextRequest } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");

  if (!url) {
    return new Response("Missing url", { status: 400 });
  }

  const res = await fetch(url);

  if (!res.ok) {
    return new Response("Failed to fetch image", {
      status: res.status,
    });
  }

  const contentType =
    res.headers.get("content-type") ?? "image/png";

  const buffer = await res.arrayBuffer();

  return new Response(buffer, {
    headers: {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": "*",
      // rev-stamped URLs (?rev=size_width_height, stamped by the UI from the
      // page row) change whenever a re-run regenerates the image, so those
      // responses are immutable per URL. Unstamped URLs keep a short TTL —
      // long stale-while-revalidate here made re-run results invisible for
      // up to a day.
      "Cache-Control": url.includes("rev=")
        ? "public, max-age=31536000, immutable"
        : "public, max-age=300, stale-while-revalidate=600",
    },
  });
}