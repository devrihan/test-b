"use client";

// Shared filter dropdown: trigger reads "Label: Value" like loam's PageFilters. Radix
// forbids an empty item value and React warns on duplicate keys, so both are filtered out.

import { useMemo } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@student-ds/ui";

const ANY = "__any__";

export interface FilterOption {
  value: string;
  label: string;
}

export function FilterSelect({
  label,
  value,
  onChange,
  placeholder,
  options,
  align = "start",
}: {
  label?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: FilterOption[];
  align?: "start" | "end";
}) {
  const items = useMemo(() => {
    const seen = new Set<string>();
    return options.filter((o) => {
      if (!o.value || seen.has(o.value)) return false;
      seen.add(o.value);
      return true;
    });
  }, [options]);

  return (
    <Select
      value={value === "" ? ANY : value}
      onValueChange={(v) => onChange(v === ANY ? "" : v)}
    >
      <SelectTrigger className="h-auto gap-sp-xs rounded-md bg-white px-sp-lg py-sp-sm text-sm">
        {label && <span className="font-normal text-muted-foreground">{label}:</span>}
        <span className="font-medium text-foreground">
          <SelectValue placeholder={placeholder} />
        </span>
      </SelectTrigger>
      <SelectContent position="popper" align={align}>
        <SelectItem value={ANY} className="text-sm">
          {placeholder}
        </SelectItem>
        {items.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-sm">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
