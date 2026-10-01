import { getAuthToken } from "@/app/lib/auth";

export const API_BASE = process.env.NEXT_PUBLIC_AGGREGATED_DATA_API_URL ?? "http://localhost:8082";
export const BEAVER_BASE = process.env.NEXT_PUBLIC_BEAVER_API_URL ?? "http://localhost:4000";
export const R2_PUBLIC_BASE = process.env.NEXT_PUBLIC_R2_PUBLIC_URL || process.env.R2_PUBLIC_URL || "";


export function authHeaders(): Record<string, string> {
  const token = getAuthToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Turns a stored fileName into a fully-qualified URL: absolute → as-is, has slash → R2 key, no slash → prepend canonical prefix
export function resolvePdfUrl(fileName: string | undefined): string | null {
  if (!fileName || fileName === "null") return null;
  if (fileName.startsWith("http")) return fileName;
  const key = fileName.includes("/") ? fileName : `question_papers/${fileName}`;
  return `${R2_PUBLIC_BASE}/${key}`;
}
