"use client";

import { useEffect } from "react";
import { OCRModel, useOCRExtraction } from "../context/Ocrextractioncontext";
import CropPreview from "./CropPreview";
import OCRTextEditor from "../components/OCRTextEditor";
import OCRActions from "../components/OCRActions";

export default function OCRDrawer({
  latexPreview,
}: {
  latexPreview: boolean;
}) {
    const {
        drawerOpen,
        activeQuestionId,
        regions,
        mergedImage,
        finishOCR,
        extractedText,
        loading,
        updateExtractedText,
        fillOCR,
        retry,
        cancel,
        selectedModel,
        setSelectedModel,
    } = useOCRExtraction();

    // ── Keyboard shortcuts ─────────────────────────────────────
    useEffect(() => {
        if (!drawerOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Enter → Fill OCR (only if not typing in textarea)
            if (e.key === "Enter" && !loading && extractedText) {
                const active = document.activeElement;
                if (active?.tagName !== "TEXTAREA") {
                    e.preventDefault();
                    fillOCR();
                }
            }

            // ESC → Cancel
            if (e.key === "Escape") {
                e.preventDefault();
                cancel();
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [drawerOpen, loading, extractedText, fillOCR, cancel]);

    return (
        <div
            className={`
        fixed top-0 right-0 h-full w-[700px] bg-white border-l border-gray-200
        shadow-xl z-40 flex flex-col
        transition-transform duration-200 ease-out
        ${drawerOpen ? "translate-x-0" : "translate-x-full"}
      `}
        >
            {/* ── Header ── */}
            <div className="shrink-0 px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                <div>
                    <p className="text-sm font-semibold text-gray-800">
                        Extract text
                    </p>

                    {activeQuestionId !== null && (
                        <div className="text-xs text-gray-400 mt-0.5 space-y-0.5">
                            <p>Question {activeQuestionId}</p>

                            <p>
                                {regions.length} region
                                {regions.length !== 1 ? "s" : ""}
                                selected
                            </p>
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-2">
                    <select
                        value={selectedModel}
                        onChange={(e) =>
                            setSelectedModel(e.target.value as OCRModel)
                        }
                        className="text-xs border border-gray-200 rounded-md px-2 py-1 bg-white"
                    >
                        <option value="gpt4o">GPT-4o</option>
                        <option value="claude-sonnet">Claude Sonnet</option>
                        <option value="gemini-flash">Gemini Flash</option>
                    </select>

                    <button
                        onClick={cancel}
                        className="w-7 h-7 rounded-md flex items-center justify-center
                 text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition"
                        title="Close (ESC)"
                    >
                        ✕
                    </button>
                </div>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
                {!mergedImage && regions.length > 0 && (
                    <div className="space-y-3">
                        <p className="text-xs font-medium text-gray-500">
                            Selected regions
                        </p>

                        <div className="grid grid-cols-2 gap-3">
                            {regions.map((region, index) => (
                                <div
                                    key={region.id}
                                    className="border border-gray-200 rounded-lg overflow-hidden bg-gray-50"
                                >
                                    <div className="px-2 py-1 text-[10px] text-gray-500 border-b border-gray-100 bg-white">
                                        Region {index + 1}
                                    </div>

                                    <img
                                        src={region.image}
                                        alt={`Region ${index + 1}`}
                                        className="w-full object-contain max-h-40"
                                    />
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {mergedImage && (
                    <CropPreview image={mergedImage} />
                )}

                {mergedImage && (
                    <OCRTextEditor
                        text={extractedText}
                        loading={loading}
                        onChange={updateExtractedText}
                        latexPreview={latexPreview}
                    />
                )}
            </div>

            {/* ── Footer actions ── */}
            <div className="shrink-0 px-5 py-3 border-t border-gray-100 bg-gray-50/50">
                <button
                    onClick={finishOCR}
                    disabled={regions.length === 0 || loading}
                    className="w-full h-10 mb-3 rounded-lg
             bg-indigo-600 hover:bg-indigo-700
             text-white text-sm font-semibold
             disabled:opacity-40 disabled:cursor-not-allowed transition"
                >
                    {loading
                        ? "Running OCR..."
                        : `Finish OCR (${regions.length})`}
                </button>
                <button
                    onClick={cancel}
                    className="w-full h-9 mb-3 rounded-lg border border-gray-200
             text-xs font-medium text-gray-600
             hover:bg-gray-50 transition"
                >
                    Clear Regions
                </button>
                <OCRActions
                    loading={loading}
                    hasText={extractedText.length > 0}
                    onRetry={retry}
                    onFill={fillOCR}
                    onCancel={cancel}
                />

                {/* Keyboard hint */}
                <p className="text-[10px] text-gray-400 text-center mt-2">
                    Enter to fill · ESC to cancel
                </p>
            </div>
        </div>
    );
}