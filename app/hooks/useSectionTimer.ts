"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  startSectionTiming,
  completeSectionTiming,
  getSectionTiming,
  heartbeatReviewSession,
  type OpenSectionSession,
  type OpsStatus,
  type ReviewStage,
} from "../lib/reviewApi";

// Sixty seconds is the most work that can be unaccounted for if the tab dies.
const ACTIVITY_STAMP_MS = 60_000;

interface UseSectionTimerArgs {
  batchId: string | null | undefined;
  stage: ReviewStage;
}

interface UseSectionTimerReturn {
  /** Call on every click into marks or answer text; only the first one opens a record. */
  onActivity: () => void;
  /** The pass under way, if any — what the Done button shows, and when it started. */
  open: OpenSectionSession | null;
  /** Who holds each role here, so the row names them even when nothing is running. */
  makers: string[];
  checkers: string[];
  /** The section's status, refreshed on auto start and after the pass ends. */
  opsStatus: OpsStatus | null;
  /** Ends the pass. Resolves false when nothing was closed, so a failure stays visible. */
  done: () => Promise<boolean>;
}

/** Section timing: a click opens the record, Done closes it, nothing is counted here. */
export function useSectionTimer({
  batchId,
  stage,
}: UseSectionTimerArgs): UseSectionTimerReturn {
  const sectionKey = `${batchId ?? ""}::${stage}`;
  const [open, setOpen] = useState<OpenSectionSession | null>(null);
  const [makers, setMakers] = useState<string[]>([]);
  const [checkers, setCheckers] = useState<string[]>([]);
  const [opsStatus, setOpsStatus] = useState<OpsStatus | null>(null);
  // Bumped after a start or an end, so the status is fetched again.
  const [statusTick, setStatusTick] = useState(0);

  // A ref, not state: the guard must read the live value or a second click opens a second record.
  const rec = useRef<{ key: string; id: number | null; starting: boolean }>({
    key: sectionKey,
    id: null,
    starting: false,
  });

  // These fire on focus, so a click before the batch loads is lost unless it is held.
  const pendingRef = useRef(false);

  // Ask whether a pass is already under way here, or a forgotten one stays invisible.
  useEffect(() => {
    if (!batchId) return;
    let cancelled = false;
    void (async () => {
      try {
        const state = await getSectionTiming({ batchId, stage });
        if (cancelled) return;
        if (state.open) {
          rec.current = { key: sectionKey, id: state.open.session_id, starting: false };
        }
        setOpen(state.open);
        setMakers(state.makers);
        setCheckers(state.checkers);
        setOpsStatus(state.ops_status ?? null);
      } catch {
        /* timing is best-effort; never block the editor */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [batchId, stage, sectionKey, statusTick]);

  // A different section must not show the previous one's status while its own loads.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setOpsStatus(null); }, [sectionKey]);

  const onActivity = useCallback(() => {
    if (!batchId) {
      pendingRef.current = true;
      return;
    }
    // A different section is different work, so the previous record is not ours to touch.
    if (rec.current.key !== sectionKey) {
      rec.current = { key: sectionKey, id: null, starting: false };
    }
    if (rec.current.id || rec.current.starting) return;
    rec.current.starting = true;

    void (async () => {
      try {
        const s = await startSectionTiming({ batchId, stage });
        if (rec.current.key !== sectionKey) return;
        rec.current.id = s.session_id;
        setOpen({ session_id: s.session_id, role: s.role, started_at: s.started_at });
        setStatusTick((n) => n + 1);
      } catch {
        // starting stays set: retrying per keystroke would hammer an already-failing server.
      }
    })();
  }, [batchId, stage, sectionKey]);

  useEffect(() => {
    if (!batchId || !pendingRef.current) return;
    pendingRef.current = false;
    onActivity();
  }, [batchId, onActivity]);

  // The safety net: records only that the operator was still here, so an abandon lands right.
  useEffect(() => {
    const t = window.setInterval(() => {
      const id = rec.current.id;
      if (!id) return;
      if (document.visibilityState !== "visible" || !document.hasFocus()) return;
      void heartbeatReviewSession(String(id)).catch((err) => {
        // 404 means it was closed elsewhere - Done in another tab, or the idle sweep.
        if ((err as { status?: number })?.status === 404) {
          rec.current.id = null;
          setOpen(null);
        }
      });
    }, ACTIVITY_STAMP_MS);
    return () => window.clearInterval(t);
  }, []);

  const done = useCallback(async () => {
    if (!batchId) return false;
    try {
      await completeSectionTiming({ batchId, stage });
      rec.current.id = null;
      rec.current.starting = false;
      setOpen(null);
      setStatusTick((n) => n + 1);
      return true;
    } catch {
      // Left showing as running on purpose: a failed Done must not look like it saved.
      return false;
    }
  }, [batchId, stage]);

  return { onActivity, open, makers, checkers, opsStatus, done };
}
