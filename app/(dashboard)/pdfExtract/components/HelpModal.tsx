import { X } from "lucide-react";

type Props = {
  onClose: () => void;
};

const STEPS = [
  [
    "Upload PDF",
    "Click 'Upload PDF' or drag & drop your student answer PDF anywhere on the page.",
  ],
  [
    "Rotate if needed",
    "Hover over any page to see ↺ ↻ buttons top-right. Use 'Rotate all' in the toolbar to fix all pages at once. Marks reposition automatically after rotation.",
  ],
  [
    "Set question count",
    "Type the number of questions in the top bar (default 32) and press Enter.",
  ],
  [
    "Mark each question",
    "Click Q1 in the sidebar → ＋ Start → amber banner appears → click where Q1 begins on the PDF. Auto-switches to End mode — click where Q1 ends. A colored region highlights the captured area.",
  ],
  [
    "Extract",
    "Use ↓ PNG for a single question, or Extract ZIP for all marked questions at once as q1.png, q2.png…",
  ],
] as const;

export default function HelpModal({ onClose }: Props) {
  return (
    <div
      className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >

      {/* Card */}
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-8 ring-1 ring-black/5"
        onClick={e => e.stopPropagation()}
      >

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-bold text-gray-900">
            How to use PDF Extractor
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Steps */}
        {STEPS.map(([title, desc], i) => (
          <div key={i} className="flex gap-4 mb-5 last:mb-0">

            {/* Step number */}
            <div className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
              {i + 1}
            </div>

            {/* Step content */}
            <div>
              <p className="text-sm font-semibold text-gray-900 mb-0.5">
                {title}
              </p>
              <p className="text-sm text-gray-500">
                {desc}
              </p>
            </div>

          </div>
        ))}

        {/* Tips box */}
        <div className="mt-5 p-4 bg-indigo-50 rounded-xl text-sm text-indigo-700 leading-relaxed">
          💡 Press <strong>Esc</strong> to cancel a mark at any time.
          Questions spanning multiple pages are stitched into one image automatically.
          Extracted images are high resolution (2.5× scale).
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="mt-5 w-full h-11 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl transition"
        >
          Got it!
        </button>

      </div>
    </div>
  );
}