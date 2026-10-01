import { NextRequest } from "next/server";
import { passthrough, piperFetch, proxyError } from "../../../_lib/piper";

// Patch claim fields on an already-classified answer paper. Piper flips
// metadata_origin to 'manual' and records a metadata_patched event with the
// x-actor we forward — that event trail IS the human decision record.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const body = await req.json();
    return passthrough(
      await piperFetch(req, `/documents/${encodeURIComponent(id)}/metadata`, {
        method: "PATCH",
        body,
      }),
    );
  } catch (err) {
    return proxyError(err);
  }
}
