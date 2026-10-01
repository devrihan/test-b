import { NextRequest } from "next/server";
import { passthrough, piperFetch, proxyError } from "../../_lib/piper";

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    return passthrough(await piperFetch(req, `/documents/${encodeURIComponent(id)}`));
  } catch (err) {
    return proxyError(err);
  }
}
