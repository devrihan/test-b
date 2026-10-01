import { NextRequest, NextResponse } from "next/server";

// Server-side piper client for the /api/scans/* proxy routes.
// The service token stays here (env), never in the browser; the signed-in
// operator's email rides along as x-actor so piper attributes manual writes.

function piperBase(): string {
  const base = process.env.PIPER_INTAKE_URL;
  if (!base) throw new Error("PIPER_INTAKE_URL is not set");
  return base.replace(/\/$/, "");
}

// Beaver stores the Keycloak access token in the `token` cookie at login
// (app/lib/auth.ts). We decode its payload for attribution — same trust
// level as the rest of the app, which nowhere verifies signatures itself.
export function actorFromRequest(req: NextRequest): string | null {
  const token = req.cookies.get("token")?.value;
  if (!token) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(token.split(".")[1], "base64url").toString("utf8"),
    ) as { email?: string; preferred_username?: string };
    return payload.email ?? payload.preferred_username ?? null;
  } catch {
    return null;
  }
}

export interface PiperResult {
  status: number;
  body: unknown;
}

export async function piperFetch(
  req: NextRequest,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<PiperResult> {
  const token = process.env.PIPER_INTAKE_TOKEN;
  if (!token) return { status: 500, body: { message: "PIPER_INTAKE_TOKEN is not set" } };

  const actor = actorFromRequest(req);
  const res = await fetch(`${piperBase()}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      "x-piper-service-token": token,
      ...(actor ? { "x-actor": actor } : {}),
      ...(init?.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { message: text };
  }
  return { status: res.status, body };
}

// Pass piper's status + JSON straight through to the browser.
export const passthrough = ({ status, body }: PiperResult) =>
  NextResponse.json(body ?? {}, { status });

export function proxyError(err: unknown): NextResponse {
  const message = err instanceof Error ? err.message : "piper proxy failed";
  return NextResponse.json({ message }, { status: 502 });
}
