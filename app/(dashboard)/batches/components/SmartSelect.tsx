"use client";

import { ChevronDown } from "lucide-react";

/* ── Smart Select ─────────────────────────────────────────────
   - Has options → dropdown with "＋ Add new" at the bottom
   - No options  → plain text input (no useless empty dropdown)
   ───────────────────────────────────────────────────────────── */

export type SelectOption = {
  label: string;
  value: string;
};

export default function SmartSelect({
  label,
  required,
  value,
  options,
  placeholder,
  helperText,
  onChange,
}: {
  label: string;
  required?: boolean;
  value: string;
  options: SelectOption[];
  placeholder: string;
  helperText?: string;
  onChange: (v: string) => void;
}) {
  const disabled = options.length === 0;

  return (
    <div>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>

      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="
            w-full h-9 px-3 pr-8 text-sm border border-gray-200 rounded-lg
            focus:outline-none focus:border-indigo-400
            focus:ring-2 focus:ring-indigo-500/10
            transition appearance-none
            bg-white cursor-pointer
            disabled:bg-gray-100
            disabled:text-gray-400
            disabled:cursor-not-allowed
          "
        >
          <option value="" disabled>
            {disabled
              ? `No ${label.toLowerCase()} available`
              : placeholder
            }
          </option>

          {options.map(opt => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>

        <ChevronDown
          size={14}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
        />
      </div>

      {disabled && helperText && (
        <p className="mt-1 text-[11px] text-amber-600">
          {helperText}
        </p>
      )}
    </div>
  );
}
