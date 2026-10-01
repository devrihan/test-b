import JSZip from "jszip";

/**
 * Bundle multiple PNG blobs into a ZIP and trigger download.
 */
export async function downloadAsZip(
  files:       { name: string; blob: Blob }[],
  zipName:     string = "questions.zip",
  onProgress?: (percent: number) => void,
): Promise<void> {
  const zip = new JSZip();

  for (let i = 0; i < files.length; i++) {
    zip.file(files[i].name, files[i].blob);
    onProgress?.(Math.round(((i + 1) / files.length) * 90));
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  onProgress?.(100);
  triggerDownload(zipBlob, zipName);
}

/**
 * Trigger a browser file download from a Blob.
 */
export function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement("a");
  a.href     = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}