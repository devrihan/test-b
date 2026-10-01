"use client";

interface CropPreviewProps {
  /** Base64 or blob URL of the cropped image */
  image: string | null;
}

export default function CropPreview({ image }: CropPreviewProps) {
  if (!image) return null;

  return (
    <div>
      <p className="text-xs font-medium text-gray-500 mb-2">Cropped region</p>
      <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
        <img
          src={image}
          alt="Cropped answer region"
          className="w-full h-auto max-h-48 object-contain bg-gray-50"
        />
      </div>
    </div>
  );
}