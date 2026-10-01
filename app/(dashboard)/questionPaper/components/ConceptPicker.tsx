"use client";
import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Search, X, Check } from "lucide-react";
import type { ConceptOption } from "../lib/types";

const PICKER_WIDTH = 416; // px, matches w-[26rem]

type ChapterGroup = { chapterId: number; chapterName: string; concepts: ConceptOption[] };
type UnitGroup    = { unitKey: string; unitName: string | null; chapters: ChapterGroup[] };

function groupConcepts(concepts: ConceptOption[]): UnitGroup[] {
  const groups: UnitGroup[] = [];
  const unitIdx    = new Map<string, number>();
  const chapterIdx = new Map<string, number>();

  for (const c of concepts) {
    const uKey = c.unitId != null ? `u${c.unitId}` : `nu${c.chapterId}`;
    if (!unitIdx.has(uKey)) {
      unitIdx.set(uKey, groups.length);
      groups.push({ unitKey: uKey, unitName: c.unitName, chapters: [] });
    }
    const gi   = unitIdx.get(uKey)!;
    const cKey = `${uKey}::${c.chapterId}`;
    if (!chapterIdx.has(cKey)) {
      chapterIdx.set(cKey, groups[gi].chapters.length);
      groups[gi].chapters.push({ chapterId: c.chapterId, chapterName: c.chapterName, concepts: [] });
    }
    groups[gi].chapters[chapterIdx.get(cKey)!].concepts.push(c);
  }
  return groups;
}

export function ConceptPicker({
  concepts,
  value,
  onSelect,
  onClear,
  onClose,
  anchorEl,
  align = "left",
}: {
  concepts: ConceptOption[];
  value: number | null;
  onSelect: (c: ConceptOption) => void;
  onClear: () => void;
  onClose: () => void;
  anchorEl: HTMLElement | null;
  align?: "left" | "right";
}) {
  const [search, setSearch] = useState("");
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => { inputRef.current?.focus(); }, []);

  // portal + real screen coords so this can't be clipped by an ancestor's overflow-hidden
  useEffect(() => {
    if (!anchorEl) { setPos(null); return; }
    const rect = anchorEl.getBoundingClientRect();
    setPos({
      top:  rect.bottom + 4,
      left: align === "right" ? rect.right - PICKER_WIDTH : rect.left,
    });
  }, [anchorEl, align]);

  useEffect(() => {
    function onDown(e: MouseEvent) {
      const target = e.target as Node;
      if (panelRef.current?.contains(target)) return;
      if (anchorEl?.contains(target)) return;
      onClose();
    }
    // close on page scroll so it doesn't drift from its anchor; capture:true also fires for the picker's own list, so that's excluded
    function onScroll(e: Event) {
      if (panelRef.current?.contains(e.target as Node)) return;
      onClose();
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
    };
  }, [anchorEl, onClose]);

  const filtered = search.trim()
    ? concepts.filter(c =>
        c.conceptName.toLowerCase().includes(search.toLowerCase()) ||
        c.chapterName.toLowerCase().includes(search.toLowerCase()) ||
        (c.unitName ?? "").toLowerCase().includes(search.toLowerCase())
      )
    : concepts;

  const groups = groupConcepts(filtered);

  if (!pos) return null;

  return createPortal(
    <div
      ref={panelRef}
      style={{ position: "fixed", top: pos.top, left: pos.left }}
      className="z-50 w-[26rem] bg-white border border-gray-200 rounded-xl shadow-xl overflow-hidden"
    >
      <div className="p-2.5 border-b border-gray-100 flex items-center gap-2">
        <Search size={14} className="text-gray-400 shrink-0" />
        <input
          ref={inputRef}
          value={search}
          onChange={e => setSearch(e.target.value)}
          onKeyDown={e => e.key === "Escape" && onClose()}
          placeholder="Search concepts…"
          className="flex-1 text-sm focus:outline-none bg-transparent"
        />
        {search && (
          <button onClick={() => setSearch("")} className="text-gray-300 hover:text-gray-500">
            <X size={12} />
          </button>
        )}
      </div>

      <div className="overflow-y-auto max-h-[26rem]">
        {value != null && (
          <button
            onClick={onClear}
            className="w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50 transition border-b border-gray-100"
          >
            — Clear concept
          </button>
        )}
        {groups.length === 0 && (
          <div className="px-3 py-4 text-xs text-gray-400 text-center">No concepts found</div>
        )}
        {groups.map(g => (
          <div key={g.unitKey}>
            {g.unitName && (
              <div className="flex items-baseline gap-1.5 px-3 py-1.5 text-xs font-bold text-indigo-700 bg-indigo-50/60 border-b border-indigo-100">
                <span className="text-[9px] font-bold uppercase tracking-wider text-indigo-400 shrink-0">Unit</span>
                {g.unitName}
              </div>
            )}
            {g.chapters.map(ch => (
              <div key={ch.chapterId}>
                <div className="flex items-baseline gap-1.5 px-3 py-1 text-xs font-semibold text-gray-600 bg-gray-50 border-b border-gray-100">
                  <span className="text-[9px] font-bold uppercase tracking-wider text-gray-400 shrink-0">Chapter</span>
                  {ch.chapterName}
                </div>
                {ch.concepts.map(c => (
                  <button
                    key={c.conceptId}
                    onClick={() => onSelect(c)}
                    className={`w-full text-left px-4 py-1.5 text-xs transition flex items-center gap-2 ${
                      value === c.conceptId
                        ? "bg-indigo-50 text-indigo-700 font-semibold"
                        : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {value === c.conceptId
                      ? <Check size={10} className="text-indigo-600 shrink-0" />
                      : <span className="w-2.5 shrink-0" />
                    }
                    {c.conceptName}
                  </button>
                ))}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>,
    document.body
  );
}
