import { QP_STORAGE_KEY } from "./constants";
import type { SessionData } from "./types";

export function isValidSessionData(data: unknown): data is SessionData {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return (
    (d.step === "form" || d.step === "review") &&
    typeof d.form === "object" && d.form !== null &&
    Array.isArray(d.questions)
  );
}

export function loadSession(): SessionData | null {
  try {
    const raw = sessionStorage.getItem(QP_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isValidSessionData(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

// Writes session to sessionStorage; silently ignores quota errors
export function saveSession(data: SessionData): void {
  try {
    sessionStorage.setItem(QP_STORAGE_KEY, JSON.stringify(data));
  } catch {
    // quota exceeded — non-fatal
  }
}

export function clearStoredSession(): void {
  sessionStorage.removeItem(QP_STORAGE_KEY);
}
