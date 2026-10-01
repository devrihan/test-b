import { useState, useCallback, RefObject } from "react";
import { Question, Region } from "../types";
import { extractQuestion } from "../lib/extractor";
import { downloadAsZip, triggerDownload } from "../lib/zipper";

export function useExtraction() {

  const [extracting,      setExtracting]      = useState(false);
  const [extractProgress, setExtractProgress] = useState(0);

  // ── Download one question as PNG ──────────────────────────
  const downloadOne = useCallback(async (
    regions:    Region[],
    imageFiles: Map<string, HTMLImageElement>,
    filename:   string,
    onToast:    (t: "success" | "error" | "info", m: string) => void,
  ) => {
    if (regions.length === 0) return;

    onToast("info", `Extracting ${filename}…`);
    try {
      const blob = await extractQuestion(regions, imageFiles);
      triggerDownload(blob, filename);
      onToast("success", `${filename} downloaded!`);
    } catch (err) {
      onToast("error", `Failed to extract ${filename}`);
      console.error(err);
    }
  }, []);

  // ── Extract all marked questions → ZIP ────────────────────
  const extractAll = useCallback(async (
    questionsRef: RefObject<Question[]>,
    imageFiles:   Map<string, HTMLImageElement>,
    onToast:      (t: "success" | "error" | "info", m: string) => void,
  ) => {
    const ready = (questionsRef.current ?? [])
      .filter(q => q.regions.length > 0);

    if (!ready.length) return;

    setExtracting(true);
    setExtractProgress(0);

    try {
      const files: { name: string; blob: Blob }[] = [];

      for (let i = 0; i < ready.length; i++) {
        setExtractProgress(Math.round((i / ready.length) * 90));
        try {
          const blob = await extractQuestion(ready[i].regions, imageFiles);
          const cleanKey = ready[i].questionKey.replace(/^q/i, "").split("_OR_")[0];
          files.push({ name: `${cleanKey}.png`, blob });
        } catch (err) {
          const cleanKey = ready[i].questionKey.replace(/^q/i, "").split("_OR_")[0];
          console.error(`Question ${cleanKey} failed:`, err);
        }
      }

      await downloadAsZip(files, "questions.zip", (pct) => {
        setExtractProgress(90 + Math.round(pct * 0.1));
      });

      onToast("success", `${files.length} images saved in questions.zip!`);
    } catch (err) {
      onToast("error", "Extraction failed");
      console.error(err);
    }

    setExtracting(false);
    setExtractProgress(0);
  }, []);

  return { extracting, extractProgress, downloadOne, extractAll };
}