"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown, X } from "lucide-react";
import type { SelectOption } from "./SmartSelect";

/* ── Multi Select ─────────────────────────────────────────────
   Checkbox-dropdown that mirrors SmartSelect's styling. Selected
   values are shown as removable chips. Used in bulk batch creation
   to pick several grades / sections / subjects at once.
   ───────────────────────────────────────────────────────────── */

export default function MultiSelect({
  label,
  required,
  values,
  options,
  placeholder,
  helperText,
  onChange,
}: {
  label: string;
  required?: boolean;
  values: string[];
  options: SelectOption[];
  placeholder: string;
  helperText?: string;
  onChange: (v: string[]) => void;
}) {
  const disabled = options.length === 0;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  const toggle = (value: string) => {
    if (values.includes(value)) {
      onChange(values.filter(v => v !== value));
    } else {
      onChange([...values, value]);
    }
  };

  const selectedOptions = options.filter(o => values.includes(o.value));

  return (
    <div ref={ref}>
      <label className="block text-xs font-semibold text-gray-600 mb-1.5">
        {label} {required && <span className="text-red-400">*</span>}
      </label>

      <div className="relative">
        <button
          type="button"
          onClick={() => !disabled && setOpen(o => !o)}
          disabled={disabled}
          className="
            w-full min-h-9 px-3 pr-8 py-1 text-sm text-left border border-gray-200 rounded-lg
            focus:outline-none focus:border-indigo-400
            focus:ring-2 focus:ring-indigo-500/10
            transition bg-white cursor-pointer
            disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed
          "
        >
          {selectedOptions.length === 0 ? (
            <span className="text-gray-400">
              {disabled ? `No ${label.toLowerCase()} available` : placeholder}
            </span>
          ) : (
            <div className="flex flex-wrap gap-1 py-0.5">
              {selectedOptions.map(opt => (
                <span
                  key={opt.value}
                  className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-medium rounded-md"
                >
                  {opt.label}
                  <span
                    role="button"
                    tabIndex={0}
                    onClick={(e) => { e.stopPropagation(); toggle(opt.value); }}
                    className="text-indigo-400 hover:text-red-400 transition"
                  >
                    <X size={11} />
                  </span>
                </span>
              ))}
            </div>
          )}
        </button>

        <ChevronDown
          size={14}
          className="absolute right-3 top-3 text-gray-400 pointer-events-none"
        />

        {open && !disabled && (
          <div className="absolute z-20 mt-1 w-full max-h-56 overflow-y-auto bg-white border border-gray-200 rounded-lg shadow-lg">
            {options.map(opt => {
              const checked = values.includes(opt.value);
              return (
                <label
                  key={opt.value}
                  className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-indigo-50/50 transition"
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(opt.value)}
                    className="text-indigo-600 focus:ring-indigo-500 rounded"
                  />
                  <span className={checked ? "text-indigo-700 font-medium" : "text-gray-700"}>
                    {opt.label}
                  </span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {disabled && helperText && (
        <p className="mt-1 text-[11px] text-amber-600">{helperText}</p>
      )}
    </div>
  );
}
