import { Region } from "../types";

/**
 * Extract one question as a PNG Blob.
 * Takes all regions sorted by order, crops each one,
 * stitches them vertically into one final image.
 */
export async function extractQuestion(
  regions:    Region[],
  imageFiles: Map<string, HTMLImageElement>,
): Promise<Blob> {

  if (regions.length === 0) {
    throw new Error("No regions to extract");
  }

  // ── Step 1: Sort regions by order ─────────────────────
  const sorted = [...regions].sort((a, b) => a.order - b.order);

  // ── Step 2: Draw each needed image onto a canvas ───────
  // We cache canvases so same image is not drawn twice
  // Example: r3 and r4 are both on img_003
  // We draw img_003 once and reuse it for both
  const canvasCache = new Map<string, HTMLCanvasElement>();

  for (const region of sorted) {
    if (canvasCache.has(region.imgId)) continue;

    const img = imageFiles.get(region.imgId);
    if (!img) throw new Error(`Image not found: ${region.imgId}`);
    // Pages stream in progressively; a not-yet-decoded image would draw blank.
    if (!img.complete || img.naturalWidth === 0) {
      throw new Error(`Page ${region.imgId} is still loading — try again in a moment`);
    }

    const canvas  = document.createElement("canvas");
    canvas.width  = img.naturalWidth;
    canvas.height = img.naturalHeight;
    canvas.getContext("2d")!.drawImage(img, 0, 0);

    canvasCache.set(region.imgId, canvas);
  }

  // ── Step 3: Calculate crop for each region ─────────────
  const chunks = sorted.map(region => {
    const canvas = canvasCache.get(region.imgId)!;
    const W      = canvas.width;   // natural width
    const H      = canvas.height;  // natural height

    const cropX1 = Math.floor(region.x1Ratio * W);
    const cropY1 = Math.floor(region.y1Ratio * H);
    const cropX2 = Math.ceil(region.x2Ratio  * W);
    const cropY2 = Math.ceil(region.y2Ratio  * H);
    const cropW  = Math.max(cropX2 - cropX1, 1);
    const cropH  = Math.max(cropY2 - cropY1, 1);

    return { canvas, cropX1, cropY1, cropW, cropH };
  });

  // ── Step 4: Determine Stitching Layout ─────────────────
  const avgAspectRatio = chunks.reduce((sum, c) => sum + (c.cropH / c.cropW), 0) / chunks.length;
  const isHorizontalStitch = avgAspectRatio > 1.2;

  let reverseOrder = false;
  if (chunks.length > 1) {
    for (let i = 0; i < chunks.length - 1; i++) {
      if (sorted[i].imgId === sorted[i+1].imgId) {
        const cx1 = chunks[i].cropX1 + chunks[i].cropW / 2;
        const cx2 = chunks[i+1].cropX1 + chunks[i+1].cropW / 2;
        const cy1 = chunks[i].cropY1 + chunks[i].cropH / 2;
        const cy2 = chunks[i+1].cropY1 + chunks[i+1].cropH / 2;
        
        if (isHorizontalStitch) {
          if (cx2 < cx1) reverseOrder = true;
        } else {
          if (cy2 < cy1) reverseOrder = true;
        }
        break;
      }
    }
  }

  const finalChunks = reverseOrder ? [...chunks].reverse() : chunks;

  // ── Step 5: Calculate output canvas dimensions ─────────
  const outputW = isHorizontalStitch 
    ? finalChunks.reduce((sum, c) => sum + c.cropW, 0)
    : Math.max(...finalChunks.map(c => c.cropW));
    
  const outputH = isHorizontalStitch
    ? Math.max(...finalChunks.map(c => c.cropH))
    : finalChunks.reduce((sum, c) => sum + c.cropH, 0);

  // ── Step 6: Create output canvas ───────────────────────
  const out    = document.createElement("canvas");
  out.width    = Math.max(outputW, 1);
  out.height   = Math.max(outputH, 1);
  const ctx    = out.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, out.width, out.height);

  // ── Step 7: Draw chunks ────────────────────────────────
  let dx = 0;
  let dy = 0;

  for (const chunk of finalChunks) {
    ctx.drawImage(
      chunk.canvas,
      chunk.cropX1, chunk.cropY1, chunk.cropW, chunk.cropH,
      dx,           dy,           chunk.cropW, chunk.cropH,
    );
    if (isHorizontalStitch) {
      dx += chunk.cropW;
    } else {
      dy += chunk.cropH;
    }
  }

  // ── Step 7: Export as PNG Blob ─────────────────────────
  return new Promise<Blob>((resolve) =>
    out.toBlob((blob) => resolve(blob!), "image/png")
  );
}