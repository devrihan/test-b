"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { User } from "lucide-react";
import type { BugUser } from "@/app/components/bug-report/bugsApi";

interface Props {
  value: string;
  onChange: (v: string) => void;
  users: BugUser[];
  rows?: number;
  placeholder?: string;
  className?: string;
}

export default function MentionTextarea({ value, onChange, users, rows = 3, placeholder, className }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [query, setQuery] = useState("");
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [mentionStart, setMentionStart] = useState(-1);

  const filtered = users.filter((u) => {
    const name = (u.display_name?.trim() || u.email).toLowerCase();
    return name.includes(query.toLowerCase());
  });

  const updateDropdownPosition = useCallback(() => {
    const ta = ref.current;
    if (!ta) return;

    const rect = ta.getBoundingClientRect();
    const lineHeight = parseInt(getComputedStyle(ta).lineHeight) || 20;
    const textBefore = value.slice(0, ta.selectionStart);
    const lines = textBefore.split("\n");
    const currentLine = lines.length - 1;

    setDropdownPos({
      top: lineHeight * (currentLine + 1) + 8,
      left: Math.min(lines[currentLine].length * 7.5, rect.width - 200),
    });
  }, [value]);

  const handleInput = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newVal = e.target.value;
    onChange(newVal);

    const cursor = e.target.selectionStart;
    const textBefore = newVal.slice(0, cursor);

    const atIdx = textBefore.lastIndexOf("@");
    if (atIdx >= 0) {
      const charBefore = atIdx > 0 ? textBefore[atIdx - 1] : " ";
      if (charBefore === " " || charBefore === "\n" || atIdx === 0) {
        const fragment = textBefore.slice(atIdx + 1);
        if (!fragment.includes(" ") || fragment.length <= 30) {
          setMentionStart(atIdx);
          setQuery(fragment);
          setShowDropdown(true);
          setSelectedIdx(0);
          updateDropdownPosition();
          return;
        }
      }
    }

    setShowDropdown(false);
  }, [onChange, updateDropdownPosition]);

  const insertMention = useCallback((user: BugUser) => {
    const ta = ref.current;
    if (!ta || mentionStart < 0) return;

    const name = user.display_name?.trim() || user.email;
    const before = value.slice(0, mentionStart);
    const after = value.slice(ta.selectionStart);
    const newVal = `${before}@${name} ${after}`;
    onChange(newVal);
    setShowDropdown(false);

    requestAnimationFrame(() => {
      const pos = mentionStart + name.length + 2;
      ta.selectionStart = pos;
      ta.selectionEnd = pos;
      ta.focus();
    });
  }, [value, mentionStart, onChange]);

  const wrapSelection = useCallback((wrapper: string) => {
    const ta = ref.current;
    if (!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const selected = value.slice(start, end);
    const before = value.slice(0, start);
    const after = value.slice(end);
    if (selected) {
      const newVal = `${before}${wrapper}${selected}${wrapper}${after}`;
      onChange(newVal);
      requestAnimationFrame(() => {
        ta.selectionStart = start + wrapper.length;
        ta.selectionEnd = end + wrapper.length;
        ta.focus();
      });
    } else {
      const newVal = `${before}${wrapper}${wrapper}${after}`;
      onChange(newVal);
      requestAnimationFrame(() => {
        const pos = start + wrapper.length;
        ta.selectionStart = pos;
        ta.selectionEnd = pos;
        ta.focus();
      });
    }
  }, [value, onChange]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "b") {
      e.preventDefault();
      wrapSelection("**");
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === "i") {
      e.preventDefault();
      wrapSelection("_");
      return;
    }

    if (!showDropdown || filtered.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => (i + 1) % filtered.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => (i - 1 + filtered.length) % filtered.length);
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      insertMention(filtered[selectedIdx]);
    } else if (e.key === "Escape") {
      setShowDropdown(false);
    }
  }, [showDropdown, filtered, selectedIdx, insertMention, wrapSelection]);

  useEffect(() => {
    const handleClick = () => setShowDropdown(false);
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  return (
    <div className="relative">
      <textarea
        ref={ref}
        value={value}
        onChange={handleInput}
        onKeyDown={handleKeyDown}
        rows={rows}
        placeholder={placeholder}
        className={className}
      />
      {showDropdown && filtered.length > 0 && (
        <div
          className="absolute z-20 bg-white border border-gray-200 rounded-lg shadow-lg max-h-40 overflow-y-auto w-56"
          style={{ top: dropdownPos.top, left: Math.max(0, dropdownPos.left) }}
          onClick={(e) => e.stopPropagation()}
        >
          {filtered.map((u, i) => (
            <button
              key={u.id}
              onClick={() => insertMention(u)}
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 transition ${
                i === selectedIdx ? "bg-blue-50 text-blue-700" : "text-gray-700 hover:bg-gray-50"
              }`}
            >
              <div className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                <User size={11} className="text-gray-500" />
              </div>
              <span className="truncate">{u.display_name?.trim() || u.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function renderWithMentions(text: string): React.ReactNode[] {
  const parts = text.split(/(@\w+(?: \w+)?|\*\*[^*]+\*\*|_[^_]+_)/g);
  return parts.map((part, i) => {
    if (part.startsWith("@") && part.length > 1) {
      return (
        <span key={i} className="text-blue-600 font-medium bg-blue-50 rounded px-0.5">
          {part}
        </span>
      );
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    if (part.startsWith("_") && part.endsWith("_") && part.length > 2) {
      return <em key={i}>{part.slice(1, -1)}</em>;
    }
    return <span key={i}>{part}</span>;
  });
}
