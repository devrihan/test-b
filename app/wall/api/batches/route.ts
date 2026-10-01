import { NextResponse } from "next/server";

// ── LOCAL/dev real-data bridge ───────────────────────────────────────────────
// Proxies the wall's batch poll to beaver-api with the internal service token
// injected SERVER-SIDE — so the secret never reaches the browser and no Keycloak
// login is needed to view real ops data locally. Gated on NEXT_PUBLIC_WALL_OPS=1;
// returns empty otherwise so it's inert in any normal build. (Not a production
// path: prod auth flows through beaver's apiClient cookie, see page.tsx.)
export async function GET() {
  if (process.env.NEXT_PUBLIC_WALL_OPS !== "1") return NextResponse.json({ batches: [] });
  const base = process.env.BEAVER_API_URL ?? "http://localhost:4000";
  const key = process.env.INTERNAL_SERVICE_KEY ?? "";
  const r = await fetch(`${base}/api/batches`, {
    headers: { "x-river-service-token": key },
    cache: "no-store",
  });
  return new NextResponse(await r.text(), {
    status: r.status,
    headers: { "content-type": "application/json" },
  });
}
