import { NextRequest, NextResponse } from "next/server";
import { passthrough, piperFetch, proxyError } from "../../../../_lib/piper";

// Manual sort-poller controls (all idempotent on the piper side).
// Close is deliberately NOT proxied in v0: closing a dispatch stays a
// flycatcher-side operator action (the person at the scanner owns
// "stream complete") — the dashboard renders Close as view-only.
const ACTIONS = new Set(["pause", "resume", "start"]);

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; action: string }> },
) {
  try {
    const { id, action } = await ctx.params;
    if (!ACTIONS.has(action)) {
      return NextResponse.json(
        { message: `unknown sort action '${action}' (pause|resume|start)` },
        { status: 400 },
      );
    }
    return passthrough(
      await piperFetch(req, `/dispatches/${encodeURIComponent(id)}/sort/${action}`, {
        method: "POST",
      }),
    );
  } catch (err) {
    return proxyError(err);
  }
}
