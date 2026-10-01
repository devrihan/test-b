import { useEffect, useRef, useState } from "react";
import {
  openReviewSession,
  heartbeatReviewSession,
  closeReviewSession,
  closeReviewSessionBeacon,
} from "../lib/reviewApi";

const HEARTBEAT_INTERVAL_MS = 25_000;

interface UseReviewSessionArgs {
  batchId: string | null | undefined;
  studentId: string | null | undefined;
  enabled?: boolean;
}

interface UseReviewSessionReturn {
  activeMs: number;
}

/**
 * Opens a review timing session for the given unit (batch × student) and keeps
 * it alive with periodic heartbeats. Heartbeats only fire while the tab is the
 * focused / visible one, so idle background tabs don't accrue active time.
 *
 * Lifecycle:
 *  - On mount (when enabled + ids present) → POST /sessions to open.
 *  - Every ~25s → POST /sessions/:id/heartbeat, but ONLY if document.hasFocus()
 *    and visibilityState === "visible".
 *  - On unmount AND on `beforeunload` → POST /sessions/:id/close.
 *
 * React 18/19 strict-mode double-mounts effects; a ref latch (`openingRef`)
 * guards against opening two sessions for the same unit.
 */
export function useReviewSession({
  batchId,
  studentId,
  enabled = true,
}: UseReviewSessionArgs): UseReviewSessionReturn {
  const [activeMs, setActiveMs] = useState(0);

  // Holds the live session id once the open call resolves.
  const sessionIdRef = useRef<string | null>(null);
  // Latch so a strict-mode double-mount (or a re-run racing the open call)
  // can't fire two POST /sessions for the same unit.
  const openingRef = useRef(false);
  // Tracks the unit this effect instance owns, so a stale close from a prior
  // unit can't tear down a freshly opened session.
  const unitKeyRef = useRef<string | null>(null);

  const active = Boolean(enabled && batchId && studentId);
  const unitKey = active ? `${batchId}::${studentId}` : null;

  useEffect(() => {
    if (!active || !batchId || !studentId || !unitKey) return;

    let cancelled = false;
    unitKeyRef.current = unitKey;

    // ── Open (guarded) ───────────────────────────────────────────────────
    const open = async () => {
      if (openingRef.current || sessionIdRef.current) return;
      openingRef.current = true;
      try {
        const { session_id } = await openReviewSession({
          batchId,
          studentId,
        });
        // If the effect was cleaned up before the open resolved, close the
        // orphan session immediately rather than leaking it.
        if (cancelled) {
          closeReviewSession(session_id).catch(() => {});
          return;
        }
        sessionIdRef.current = session_id;
      } catch {
        /* session timing is best-effort; never block the editor */
      } finally {
        openingRef.current = false;
      }
    };

    void open();

    // ── Heartbeat (focus/visibility-gated) ───────────────────────────────
    const tick = async () => {
      const id = sessionIdRef.current;
      if (!id) return;
      const visible =
        typeof document !== "undefined" &&
        document.visibilityState === "visible" &&
        document.hasFocus();
      if (!visible) return;
      try {
        const { active_ms } = await heartbeatReviewSession(id);
        if (!cancelled) setActiveMs(active_ms);
      } catch {
        /* ignore transient heartbeat failures */
      }
    };

    const interval = window.setInterval(tick, HEARTBEAT_INTERVAL_MS);

    // ── beforeunload close (best-effort, keepalive) ──────────────────────
    const onBeforeUnload = () => {
      const id = sessionIdRef.current;
      if (id) closeReviewSessionBeacon(id);
    };
    window.addEventListener("beforeunload", onBeforeUnload);

    // ── Cleanup: stop ticking + close session ────────────────────────────
    return () => {
      cancelled = true;
      window.clearInterval(interval);
      window.removeEventListener("beforeunload", onBeforeUnload);
      const id = sessionIdRef.current;
      // Only close if this cleanup owns the current unit (guards strict-mode
      // remount where the second mount should keep the session).
      if (id && unitKeyRef.current === unitKey) {
        sessionIdRef.current = null;
        closeReviewSession(id)
          .then(({ active_ms }) => {
            if (typeof active_ms === "number") setActiveMs(active_ms);
          })
          .catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitKey, active]);

  return { activeMs };
}
