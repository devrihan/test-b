import { NextRequest } from "next/server";
import { passthrough, piperFetch, proxyError } from "../_lib/piper";

export async function GET(req: NextRequest) {
  try {
    const qs = new URLSearchParams();
    for (const key of ["kind", "dispatch_id", "limit", "offset"]) {
      const v = req.nextUrl.searchParams.get(key);
      if (v !== null) qs.set(key, v);
    }
    const s = qs.toString();
    return passthrough(await piperFetch(req, `/documents${s ? `?${s}` : ""}`));
  } catch (err) {
    return proxyError(err);
  }
}
