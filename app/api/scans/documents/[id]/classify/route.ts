import { NextRequest } from "next/server";
import { passthrough, piperFetch, proxyError } from "../../../_lib/piper";

// Classify an unassociated document (piper rejects already-classified docs
// with STATE_CONFLICT — the UI routes those through PATCH /metadata instead).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    return passthrough(
      await piperFetch(req, `/documents/${encodeURIComponent(id)}/classify`, {
        method: "POST",
        body,
      }),
    );
  } catch (err) {
    return proxyError(err);
  }
}
