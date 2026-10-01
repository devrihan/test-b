import { getAuthToken as getToken } from "@/app/lib/auth";

export const API_BASE =
  process.env.NEXT_PUBLIC_AGGREGATED_DATA_API_URL ?? "http://localhost:8082";


export function authHeaders(json = false): Record<string, string> {
  const token = getToken();
  const h: Record<string, string> = {};
  if (token) h.Authorization = `Bearer ${token}`;
  if (json) h["Content-Type"] = "application/json";
  return h;
}
