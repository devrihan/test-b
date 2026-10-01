export async function mergeOCRRegions(
  images: string[]
): Promise<string> {
  const loaded = await Promise.all(
    images.map(src => {
      return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();

        img.onload = () => resolve(img);
        img.onerror = reject;

        img.src = src;
      });
    })
  );

  const width = Math.max(...loaded.map(i => i.width));

  const height = loaded.reduce(
    (sum, img) => sum + img.height,
    0
  );

  const canvas = document.createElement("canvas");

  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");

  if (!ctx) {
    throw new Error("Canvas failed");
  }

  let y = 0;

  for (const img of loaded) {
    ctx.drawImage(img, 0, y);

    y += img.height;
  }

  return canvas.toDataURL("image/png");
}