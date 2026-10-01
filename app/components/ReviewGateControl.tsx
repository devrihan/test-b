"use client";

// Per-paper review control for the editor screens: the maker sends ONE paper for check, the checker marks it Good or Needs work (loam_ops only).

import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "@/app/lib/queryKeys";
import { useSectionTimerContext } from "@/app/context/SectionTimerContext";
import { Check, CheckCheck, ChevronDown, Send, ThumbsUp, Undo2 } from "lucide-react";
import {
  getUnitReviewState,
  approveStage,
  sendPaperForCheck,
  setVerdict,
  getMyEmail,
  getPaperBoxes,
  type PaperBoxes,
  type UnitState,
  type ReviewStage,
} from "@/app/lib/reviewApi";
import ConfirmModal from "@/app/components/ConfirmModal";

// A chunking send or Good waiting for the person's confirmation, with the paper's boxes.
type PendingConfirm = { action: "send" | "good"; boxes: PaperBoxes };

/** "Q3, Q5, Q11" */
const questionList = (keys: string[]) => keys.map((k) => `Q${k}`).join(", ");

/** The confirmation popup's wording for a chunking send or Good. */
function confirmCopy(p: PendingConfirm): { title: string; message: string; confirmText: string; iconType: "warning" | "success" } {
  const b = p.boxes;
  const unverified = b.readiness === "unverified";
  if (p.action === "send") {
    return unverified
      ? { title: "Send with unverified boxes?", message: `${b.unverified} of ${b.boxes} answer boxes are not verified. OCR will skip these questions: ${questionList(b.skipped_questions)}.`, confirmText: "Send anyway", iconType: "warning" }
      : { title: "Send this paper to the checker?", message: `All ${b.boxes} answer boxes are verified.`, confirmText: "Send", iconType: "success" };
  }
  return unverified
    ? { title: "Mark Good with unverified boxes?", message: `${b.unverified} of ${b.boxes} answer boxes are not verified. OCR starts now and will skip these questions: ${questionList(b.skipped_questions)}.`, confirmText: "Mark Good anyway", iconType: "warning" }
    : { title: "Mark chunking Good?", message: "OCR starts for this paper as soon as you confirm.", confirmText: "Mark Good", iconType: "success" };
}

/** The server's own words for a refusal, when it sent any. */
function errorText(e: unknown): string {
  const body = (e as { body?: { error?: string } })?.body;
  return body?.error ?? (e instanceof Error ? e.message : "Failed");
}

// The checker's gate-approve "Check" button, hidden for now; the gate is being handled elsewhere.
const SHOW_CHECK_BUTTON: boolean = false;
// The green "Checked by …" badge from an old gate approval, hidden; it is not the checker's Good / Needs work.
const SHOW_CHECKED_BADGE: boolean = false;

export default function ReviewGateControl({
  batchId,
  studentId,
  stage,
  onChange,
}: {
  batchId: string;
  studentId: string;
  stage: ReviewStage;
  onChange?: () => void;
}) {
  const queryClient = useQueryClient();
  const sectionTimer = useSectionTimerContext();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [me] = useState<string | null>(() => getMyEmail());
  // "Needs work" note being typed; null = closed.
  const [reason, setReason] = useState<string | null>(null);
  // The checker's Good / Needs work menu.
  const [menuOpen, setMenuOpen] = useState(false);
  // Chunking send / Good awaiting confirmation.
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  // All three identifiers are in the key, so switching paper or stage can't let
  // a slow reply land on the wrong gate.
  const stateQuery = useQuery({
    queryKey: keys.review.gate(batchId, studentId, stage),
    queryFn: () => getUnitReviewState({ batchId, studentId, stage }),
  });

  const state = stateQuery.data ?? null;

  const load = useCallback(
    () => queryClient.invalidateQueries({
      queryKey: keys.review.gate(batchId, studentId, stage),
    }),
    [queryClient, batchId, studentId, stage]
  );

  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setErr(null);
    try {
      await fn();
      await load();
      onChange?.();
    } catch (e) {
      setErr(errorText(e));
    } finally {
      setBusy(false);
    }
  };

  const sendBack = () =>
    run(() => setVerdict({ batchId, studentId, stage, verdict: "needs_work", reason: reason?.trim() || undefined }))
      .then(() => { setReason(null); setMenuOpen(false); });

  if (!state) return null;

  const shortName = (e: string | null) => (e ? e.split("@")[0] : "");
  // Maker (1st pass): the active maker, or anyone if nobody's claimed it yet.
  const canMake = !!me && (state.maker === me || state.maker === null);
  // Checker (2nd pass, 4-eyes): can't be the same person who made it.
  const canCheck =
    !!me && me !== state.maker && (state.checker === me || state.checker === null);

  // Checker verdict (loam_ops only): a badge for everyone, the Good / Needs work split button for the checker.
  const verdictBadge =
    state.verdict === "good" ? (
      <span className="inline-flex items-center gap-1 rounded-md border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700" title="Marked good by the checker">
        <ThumbsUp size={13} /> Good
      </span>
    ) : state.verdict === "needs_work" ? (
      <span className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700" title={state.verdict_reason ?? "Sent back by the checker"}>
        <Undo2 size={13} /> Needs work
      </span>
    ) : null;

  // Split button: the main part marks Good in one click (or shows Needs work); the arrow opens the menu.
  const closeMenu = () => { setMenuOpen(false); setReason(null); };

  /**
   * At chunking a send or a Good first reads the paper's boxes: none → the refusal is
   * shown; otherwise a confirmation popup (naming any questions OCR would skip).
   * Other stages go straight through.
   */
  const confirmFirst = async (action: "send" | "good", go: () => Promise<unknown>) => {
    if (stage !== "chunking") return run(go);
    setErr(null);
    try {
      const boxes = await getPaperBoxes({ batchId, studentId });
      if (boxes.readiness === "no_boxes") {
        setErr(action === "send"
          ? "Cannot send to the checker: this paper has no answer boxes yet"
          : "Cannot mark chunking Good: this paper has no answer boxes yet");
        return;
      }
      setPending({ action, boxes });
    } catch (e) {
      setErr(errorText(e));
    }
  };

  const confirmPending = () => {
    const p = pending;
    setPending(null);
    if (!p) return;
    const confirmUnverified = p.boxes.readiness === "unverified";
    run(() => p.action === "send"
      ? sendPaperForCheck({ batchId, studentId, stage, confirmUnverified })
      : setVerdict({ batchId, studentId, stage, verdict: "good", confirmUnverified }));
  };

  const markGood = () => {
    // A verdict is checker work, so it starts the section timer like an edit does.
    sectionTimer.onActivity();
    closeMenu();
    confirmFirst("good", () => setVerdict({ batchId, studentId, stage, verdict: "good" }));
  };

  const needsWork = state.verdict === "needs_work";
  const main = needsWork
    ? { icon: <Undo2 size={15} />, label: "Needs work", cls: "border-red-600 bg-red-600 text-white hover:bg-red-700", tip: state.verdict_reason ?? "Sent back to the maker — open the menu to change it" }
    : state.verdict === "good"
      ? { icon: <ThumbsUp size={15} />, label: "Good", cls: "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700", tip: "Marked good" }
      : { icon: <ThumbsUp size={15} />, label: "Good", cls: "border-gray-300 bg-white text-gray-900 hover:bg-gray-50", tip: "Mark this paper good" };

  const verdictButtons = canCheck && (
    <span className="relative inline-flex">
      <button
        type="button"
        disabled={busy}
        // Good: one click. Needs work: the main part shows it, so a click opens the menu to change it.
        onClick={() => (needsWork ? setMenuOpen(true) : state.verdict === "good" ? undefined : markGood())}
        className={`inline-flex items-center gap-1.5 rounded-l-md border px-3 py-1.5 text-sm font-semibold disabled:opacity-50 ${main.cls}`}
        title={err ?? main.tip}
      >
        {main.icon} {main.label}
        {state.verdict === "good" && <Check size={14} />}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={() => (menuOpen ? closeMenu() : setMenuOpen(true))}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        aria-label="More options"
        className={`inline-flex items-center rounded-r-md border border-l-0 px-1.5 py-1.5 disabled:opacity-50 ${main.cls}`}
      >
        <ChevronDown size={14} />
      </button>
      {menuOpen && (
        <>
          <button type="button" className="fixed inset-0 z-20 cursor-default" aria-label="Close" onClick={closeMenu} />
          <div
            role="menu"
            onKeyDown={(e) => { if (e.key === "Escape") closeMenu(); }}
            className="absolute right-0 top-full z-30 mt-1 w-60 rounded-md border border-gray-200 bg-white py-1 shadow-lg"
          >
            {reason === null ? (
              <>
                {needsWork && (
                  <button
                    type="button"
                    role="menuitem"
                    autoFocus
                    onClick={markGood}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                  >
                    <ThumbsUp size={15} /> Good
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  autoFocus={!needsWork}
                  onClick={() => {
                    sectionTimer.onActivity();
                    setReason("");
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-red-700 hover:bg-red-50"
                >
                  <Undo2 size={15} /> Needs work
                  {needsWork && <Check size={14} className="ml-auto" />}
                </button>
              </>
            ) : (
              <div className="space-y-2 px-3 py-2">
                <input
                  autoFocus
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") sendBack(); }}
                  placeholder="What needs fixing? (optional)"
                  className="w-full rounded-md border border-red-300 px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-red-400"
                />
                <div className="flex items-center justify-end gap-2">
                  <button type="button" onClick={() => setReason(null)} className="text-xs text-gray-500 hover:text-gray-700">
                    Back
                  </button>
                  <button type="button" disabled={busy} onClick={sendBack} className="rounded-md bg-red-600 px-2.5 py-1 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50">
                    Send back
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </span>
  );

  // The old gate approval: its badge and the Check button stay behind their switches at the top.
  const checkedBadge = SHOW_CHECKED_BADGE && state.stage_approved && (
    <span className="inline-flex flex-col items-center rounded-md border border-green-300 bg-green-50 px-2.5 py-0.5 text-sm font-semibold text-green-700 leading-tight">
      <span className="inline-flex items-center gap-1"><CheckCheck size={14} /> Checked</span>
      {state.approvers[0] && (
        <span className="font-normal text-green-600 text-[10px] leading-tight max-w-[90px] truncate">
          {shortName(state.approvers[0])}
        </span>
      )}
    </span>
  );
  const checkButton = SHOW_CHECK_BUTTON && (
    <button
      type="button"
      disabled={busy}
      onClick={() => run(() => approveStage({ batchId, studentId, stage }))}
      className="inline-flex items-center gap-1.5 rounded-md border border-green-300 bg-green-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-50"
      title={err ?? "Check (approve) this paper — advances the gate"}
    >
      <CheckCheck size={15} /> Check
    </button>
  );

  // Sent and not judged since: yellow, the same colour as the section's Waiting for check.
  const readyBadge = (label: string, tip: string) => (
    <span className="inline-flex items-center gap-1 rounded-md border border-yellow-300 bg-yellow-50 px-2 py-1 text-xs font-semibold text-yellow-700" title={tip}>
      <Check size={13} /> {label}
    </span>
  );

  // A paper can be judged once sent, once it has a verdict, or if the older section hand-over marked it made.
  const judgeable = state.ready || state.verdict !== null || state.status === "awaiting_approval";

  // The refusal, visible next to the buttons, and the confirmation popup.
  const errorLine = err && <span className="max-w-xs text-xs text-red-600">{err}</span>;
  const copy = pending && confirmCopy(pending);
  const confirmModal = copy && (
    <ConfirmModal
      isOpen
      title={copy.title}
      message={copy.message}
      confirmText={copy.confirmText}
      cancelText="Cancel"
      iconType={copy.iconType}
      onConfirm={confirmPending}
      onCancel={() => setPending(null)}
    />
  );

  // Checker (4-eyes): the Good / Needs work split button.
  if (canCheck && judgeable) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {confirmModal}
        {errorLine}
        {verdictButtons}
        {checkButton}
        {checkedBadge}
      </span>
    );
  }

  // Maker: sends this one paper for check, and again after Needs work.
  if (canMake) {
    if (state.ready || state.verdict === "good") {
      return (
        <span className="inline-flex items-center gap-1.5">
          {state.ready ? readyBadge("Sent", "Sent for check — waiting for the checker") : verdictBadge}
          {checkedBadge}
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5">
        {confirmModal}
        {errorLine}
        {verdictBadge}
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            // Sending is maker work, so it starts the section timer like an edit does.
            sectionTimer.onActivity();
            confirmFirst("send", () => sendPaperForCheck({ batchId, studentId, stage }));
          }}
          className="inline-flex items-center gap-1.5 rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50"
          title={err ?? "Send this paper to the checker"}
        >
          <Send size={14} /> {state.verdict === "needs_work" ? "Send again" : "Send for check"}
        </button>
        {checkedBadge}
      </span>
    );
  }

  // Everyone else: read-only.
  if (judgeable) {
    return (
      <span className="inline-flex items-center gap-1.5">
        {state.ready ? readyBadge("Ready for check", "Sent for check by the maker") : verdictBadge}
        {checkedBadge}
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-gray-400" title={state.maker ?? undefined}>
      {state.maker ? `Maker: ${shortName(state.maker)}` : "Unassigned"}
    </span>
  );
}
