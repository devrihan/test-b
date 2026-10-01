import { NextRequest } from "next/server";
import { passthrough, piperFetch, proxyError } from "../../../_lib/piper";

// Send to processing: piper starts the river answer-paper workflow.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return passthrough(
      await piperFetch(req, `/documents/${encodeURIComponent(id)}/workflow`, {
        method: "POST",
      }),
    );
  } catch (err) {
    return proxyError(err);
  }
}
