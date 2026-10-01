"use client";

interface MultiSelectProps {
  label: string;
  required?: boolean;
  values: number[];
  options: { label: string; value: number }[];
  emptyText: string;
  helperText?: string;
  onChange: (v: number[]) => void;
}

export default function MultiSelect({
  label, required, values, options, emptyText, helperText, onChange,
}: MultiSelectProps) {
  const disabled = options.length === 0;
  const toggle = (val: number) => {
    onChange(values.includes(val) ? values.filter((v) => v !== val) : [...values, val]);
  };
  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>
      {disabled ? (
        <div className="w-full min-h-9 px-3 py-2 text-sm border border-gray-200 rounded-lg bg-gray-100 text-gray-400">
          {emptyText}
        </div>
      ) : (
        <div className="w-full max-h-36 overflow-y-auto px-3 py-2 border border-gray-200 rounded-lg bg-white flex flex-wrap gap-x-4 gap-y-1.5">
          {options.map((opt) => (
            <label key={opt.value} className="flex items-center gap-1.5 text-sm text-gray-700 cursor-pointer">
              <input
                type="checkbox"
                checked={values.includes(opt.value)}
                onChange={() => toggle(opt.value)}
                className="rounded text-indigo-600 w-3.5 h-3.5"
              />
              {opt.label}
            </label>
          ))}
        </div>
      )}
      {helperText && <p className="mt-1 text-[11px] text-gray-400">{helperText}</p>}
    </div>
  );
}
