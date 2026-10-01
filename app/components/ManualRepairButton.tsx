"use client";

// Send-to-Manual-Repair (error bucket) button and its popup, shared by Answer Chunking and Answer Editing.

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle } from "lucide-react";
import { keys } from "@/app/lib/queryKeys";
import { sendToErrorBucket, ERROR_BUCKET_REASONS } from "@/app/(dashboard)/pdfExtract/lib/beaverApi";

export default function ManualRepairButton({
  batchId,
  studentId,
  onError,
}: {
  batchId: string;
  studentId: string;
  onError: (message: string) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [bucketing, setBucketing] = useState(false);
  const [bucketModal, setBucketModal] = useState<boolean>(false);
  const [bucketTab, setBucketTab] = useState<"repair" | "rescan">("repair");
  const [bucketReason, setBucketReason] = useState<string>("");
  const [bucketNotes, setBucketNotes] = useState<string>("");
  const [bucketSent, setBucketSent] = useState<boolean>(false);

  const closeBucketModal = useCallback(() => {
    setBucketModal(false);
    setBucketTab("repair");
    setBucketReason("");
    setBucketNotes("");
    setBucketSent(false);
  }, []);

  const handleSendToErrorBucket = useCallback(async (reason: string, notes: string) => {
    if (bucketing) return;
    setBucketing(true);
    try {
      const fullReason = bucketTab === "rescan" && reason ? `Rescan — ${reason}` : reason;
      await sendToErrorBucket(batchId, studentId, fullReason || undefined, notes || undefined);
      setBucketSent(true);
    } catch (e) {
      onError(e instanceof Error ? e.message : "Failed to send");
    } finally {
      setBucketing(false);
    }
  }, [batchId, studentId, bucketing, bucketTab, onError]);

  return (
    <>
      <button
        onClick={() => setBucketModal(true)}
        disabled={bucketing}
        className="flex items-center justify-center h-8 w-8 border border-gray-200 hover:border-amber-300 rounded-xl transition shrink-0 disabled:opacity-50"
        title="Send this student to Manual Repair (error bucket)"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/bucket.png" alt="Send to Manual Repair" className="w-4 h-4 object-contain" />
      </button>

      {bucketModal && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={closeBucketModal}>
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
            {bucketSent ? (
              <>
                <div className="px-5 py-6 text-center">
                  <div className="mx-auto w-10 h-10 rounded-full bg-green-100 flex items-center justify-center mb-3">
                    <CheckCircle size={20} className="text-green-600" />
                  </div>
                  <h3 className="text-sm font-semibold text-gray-900">Sent to Manual Repair</h3>
                  <p className="text-xs text-gray-500 mt-1">This student has been added to the repair queue.</p>
                </div>
                <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-center gap-2">
                  <button
                    onClick={closeBucketModal}
                    className="h-8 px-3 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                  >
                    Continue here
                  </button>
                  <button
                    onClick={() => { closeBucketModal(); queryClient.invalidateQueries({ queryKey: keys.errorBucket("open") }); router.push("/manualRepair"); }}
                    className="h-8 px-4 text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition"
                  >
                    Go to Manual Repair →
                  </button>
                </div>
              </>
            ) : (
              <>
                <div className="px-5 pt-4 pb-0">
                  <h3 className="text-sm font-semibold text-gray-900">Send to Manual Repair</h3>
                  <p className="text-xs text-gray-500 mt-0.5">Select a reason and add optional notes</p>
                  <div className="flex gap-1 mt-3 border-b border-gray-200">
                    {(["repair", "rescan"] as const).map(t => (
                      <button
                        key={t}
                        onClick={() => { setBucketTab(t); setBucketReason(""); }}
                        className={`px-3 py-1.5 text-xs font-medium border-b-2 transition ${
                          bucketTab === t
                            ? t === "rescan" ? "border-red-600 text-red-700" : "border-amber-600 text-amber-700"
                            : "border-transparent text-gray-500 hover:text-gray-700"
                        }`}
                      >
                        {t === "repair" ? "Repair" : "Rescan"}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="px-5 py-4 space-y-3">
                  {bucketTab === "rescan" ? (
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1.5 block">Reason</label>
                      <div className="flex gap-1.5">
                        {["Missing Pages", "Other"].map(r => (
                          <button
                            key={r}
                            onClick={() => setBucketReason(r)}
                            className={`px-2.5 py-1.5 rounded-lg text-xs transition border ${
                              bucketReason === r
                                ? "bg-red-50 border-red-300 text-red-800 font-semibold"
                                : "border-gray-200 text-gray-600 hover:border-red-200 hover:bg-red-50/50"
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div>
                      <label className="text-xs font-medium text-gray-700 mb-1.5 block">Reason</label>
                      <div className="grid grid-cols-2 gap-1.5">
                        {ERROR_BUCKET_REASONS.map(r => (
                          <button
                            key={r}
                            onClick={() => setBucketReason(r)}
                            className={`text-left px-2.5 py-1.5 rounded-lg text-xs transition border ${
                              bucketReason === r
                                ? "bg-amber-50 border-amber-300 text-amber-800 font-semibold"
                                : "border-gray-200 text-gray-600 hover:border-amber-200 hover:bg-amber-50/50"
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">Notes <span className="text-gray-400 font-normal">(optional)</span></label>
                    <textarea
                      value={bucketNotes}
                      onChange={e => setBucketNotes(e.target.value)}
                      placeholder="Any extra details…"
                      rows={2}
                      className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-100 resize-none"
                    />
                  </div>
                </div>
                <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-end gap-2">
                  <button
                    onClick={closeBucketModal}
                    className="h-8 px-3 text-xs font-medium text-gray-600 border border-gray-200 rounded-lg hover:bg-gray-50 transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleSendToErrorBucket(bucketReason, bucketNotes)}
                    disabled={!bucketReason || bucketing}
                    className={`h-8 px-4 text-xs font-semibold text-white rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed ${
                      bucketTab === "rescan" ? "bg-red-600 hover:bg-red-700" : "bg-amber-600 hover:bg-amber-700"
                    }`}
                  >
                    {bucketing ? "Sending…" : bucketTab === "rescan" ? "Send to Rescan" : "Send to Repair"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
