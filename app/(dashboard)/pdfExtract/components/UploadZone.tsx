import { Upload } from "lucide-react";

type Props = {
  onFileSelect: () => void;
};

export default function UploadZone({ onFileSelect }: Props) {
  return (
    <div className="flex-1 flex items-center justify-center">

      <div
        onClick={onFileSelect}
        className="
          text-center border-2 border-dashed border-gray-200
          hover:border-indigo-400 bg-white rounded-2xl
          px-20 py-14 cursor-pointer transition-colors max-w-md
        "
      >

        {/* Upload icon */}
        <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Upload size={26} className="text-indigo-500" />
        </div>

        {/* Title */}
        <p className="text-lg font-bold text-gray-900 mb-1.5">
          Upload Student Answer Images
        </p>

        {/* Subtitle */}
        <p className="text-sm text-gray-500 mb-5 leading-relaxed">
          Select multiple images at once (JPG, PNG).
          <br />
          Runs entirely in your browser — files never leave your device.
        </p>

        {/* Workflow hint */}
        <div className="bg-gray-50 rounded-xl p-4 text-xs text-gray-500 text-left leading-relaxed">
          <span className="font-semibold text-indigo-600">Workflow:</span>{" "}
          Upload Images → Mark each question by drawing a box → Extract ZIP
        </div>

      </div>

    </div>
  );
}