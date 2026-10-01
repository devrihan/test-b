"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Check, X } from "lucide-react";
import { EMPTY_SCOPE, isEmptyScope, type Scope, type SectionBoard } from "./scanboard";

// ScopeNav — the top breadcrumb + macOS-Finder-columns filter for the scoreboard.
//
// Closed: a horizontal breadcrumb of the committed selection. Hovering it widens the
// bar and shows a downward "pull-down" nudge. Clicking anywhere on it drops the panel.
//
// Open: Finder columns — School → Grade·Year → Subject·Exam → Section. Hovering a row
// loads the next column (no click needed); arrow keys move within a column, → / Enter
// advance, ← goes back, Esc closes. The board filters LIVE off whatever row is being
// previewed (mouse or keyboard), then settles to the committed path when you leave.
//
// The grade·year and subject·exam levels are ONE column each with the second attribute
// nested inline under the first (a vertical child-drawer), per the nav spec. Today only
// subject·exam has child data (academic_year isn't on the Batch yet) so grades render as
// flat advancing rows; the nesting lights up for free once year is plumbed.
//
// Scoped to this pane for now — built self-contained so it can be promoted site-wide.

type NavRow =
  | { kind: "school"; value: string; count: number }
  | { kind: "grade"; value: string; count: number; child: boolean }
  | { kind: "year"; grade: string; value: string; count: number; child: boolean }
  | { kind: "subject"; value: string; count: number; child: boolean }
  | { kind: "exam"; subject: string; value: string; count: number; child: boolean }
  | { kind: "section"; section: SectionBoard };

const COL_TITLES = ["School", "Grade · Year", "Subject · Exam", "Section"];

const norm = (s: string | null | undefined) => (s ?? "").trim();

/** Distinct values in first-seen order, naturally sorted. */
function distinct(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  for (const v of values) { const t = norm(v); if (t) seen.add(t); }
  return [...seen].sort((a, b) => a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" }));
}

/** Which scope a row selects (built on the committed base so deeper levels reset). */
function scopeOf(r: NavRow, base: Scope): Scope {
  switch (r.kind) {
    case "school": return { school: r.value, grade: null, year: null, subject: null, exam: null, section: null };
    case "grade": return { ...base, grade: r.value, year: null, subject: null, exam: null, section: null };
    case "year": return { ...base, grade: r.grade, year: r.value, subject: null, exam: null, section: null };
    case "subject": return { ...base, subject: r.value, exam: null, section: null };
    case "exam": return { ...base, subject: r.subject, exam: r.value, section: null };
    case "section": return { ...base, section: r.section.section }; // narrows the board AND opens the drawer
  }
}

/** Does a row match a given scope? (used to tell COMMITTED vs merely PREVIEWED rows apart) */
function matches(r: NavRow, sc: Scope): boolean {
  switch (r.kind) {
    case "school": return sc.school === r.value;
    case "grade": return sc.grade === r.value;
    case "year": return sc.grade === r.grade && sc.year === r.value;
    case "subject": return sc.subject === r.value;
    case "exam": return sc.subject === r.subject && sc.exam === r.value;
    case "section": return sc.section === r.section.section;
  }
}

const rowKey = (r: NavRow) =>
  r.kind === "section" ? `section:${r.section.key}`
  : r.kind === "year" ? `year:${r.grade}:${r.value}`
  : r.kind === "exam" ? `exam:${r.subject}:${r.value}`
  : `${r.kind}:${r.value}`;

export default function ScopeNav({
  sections,
  onFilter,
  onPickSection,
}: {
  sections: SectionBoard[];
  /** Called with the committed scope when it's applied (on click/Enter or clear). */
  onFilter: (scope: Scope) => void;
  /** A leaf section was chosen — open its drawer. */
  onPickSection: (key: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [nudge, setNudge] = useState(false);
  // `committed` is the APPLIED scope (drives the board). `explore` is the transient
  // hover/keyboard path — it only decides which columns show + what's highlighted, and
  // NEVER touches the board. So hovering can't disturb your committed selection; only a
  // click/Enter (commit) changes the board, and it closes the panel. Clear roles:
  // hover = browse the tree, click = decide & apply.
  const [committed, setCommitted] = useState<Scope>(EMPTY_SCOPE);
  const [explore, setExplore] = useState<Scope>(EMPTY_SCOPE);
  const [focus, setFocus] = useState<{ col: number; row: number } | null>(null);
  const [kbd, setKbd] = useState(false); // true while navigating by keyboard (gates DOM focus)

  const eff = explore; // columns build off the exploration path
  const panelRef = useRef<HTMLDivElement | null>(null);
  const btnRefs = useRef(new Map<string, HTMLButtonElement>());

  // Commit a scope: apply to the board AND close the panel (a click/Enter is a decision).
  const commit = useCallback((sc: Scope) => {
    setCommitted(sc);
    onFilter(sc);
    setOpen(false);
    setFocus(null);
  }, [onFilter]);

  // ── build the visible columns from the effective scope ──────────────────────
  const cols = useMemo<NavRow[][]>(() => {
    const out: NavRow[][] = [];

    out.push(distinct(sections.map((s) => s.school)).map((v) => ({
      kind: "school" as const, value: v,
      count: sections.filter((s) => s.school === v).length,
    })));

    if (eff.school) {
      const inSchool = sections.filter((s) => s.school === eff.school);
      const col: NavRow[] = [];
      for (const g of distinct(inSchool.map((s) => s.grade))) {
        const gSecs = inSchool.filter((s) => s.grade === g);
        col.push({ kind: "grade", value: g, count: gSecs.length, child: false });
        const years = distinct(gSecs.map((s) => s.year));
        if (eff.grade === g && years.length) {
          for (const y of years)
            col.push({ kind: "year", grade: g, value: y, child: true, count: gSecs.filter((s) => s.year === y).length });
        }
      }
      out.push(col);
    }

    if (eff.grade) {
      const inGrade = sections.filter(
        (s) => s.school === eff.school && s.grade === eff.grade && (!eff.year || s.year === eff.year),
      );
      const col: NavRow[] = [];
      for (const sub of distinct(inGrade.map((s) => s.subject))) {
        const subSecs = inGrade.filter((s) => s.subject === sub);
        col.push({ kind: "subject", value: sub, count: subSecs.length, child: false });
        const exams = distinct(subSecs.map((s) => s.exam));
        if (eff.subject === sub && exams.length) {
          for (const e of exams)
            col.push({ kind: "exam", subject: sub, value: e, child: true, count: subSecs.filter((s) => s.exam === e).length });
        }
      }
      out.push(col);
    }

    if (eff.subject) {
      const inSub = sections.filter(
        (s) =>
          s.school === eff.school && s.grade === eff.grade && (!eff.year || s.year === eff.year) &&
          s.subject === eff.subject && (!eff.exam || s.exam === eff.exam),
      );
      out.push(inSub.map((s) => ({ kind: "section" as const, section: s })));
    }

    return out;
  }, [sections, eff.school, eff.grade, eff.year, eff.subject, eff.exam]);

  // ── open / close ────────────────────────────────────────────────────────────
  const openPanel = useCallback(() => {
    setOpen(true);
    setExplore(committed); // start exploring from the applied scope
    setKbd(true);
    setFocus({ col: 0, row: 0 }); // keyboard preselects the first school
  }, [committed]);

  // Closing never touches the board — it only ever changed on commit. So closing (Esc /
  // click-away / toggle) just dismisses the panel; the committed scope stays applied.
  const closePanel = useCallback(() => {
    setOpen(false);
    setFocus(null);
  }, []);

  // Click outside the whole component closes.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) closePanel();
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, [open, closePanel]);

  // Keep keyboard focus on the focused row's button (only while navigating by keyboard,
  // so mouse-hover rebuilds of the columns don't yank focus or nudge-scroll).
  useEffect(() => {
    if (!open || !focus || !kbd) return;
    const col = cols[focus.col];
    const r = col?.[focus.row];
    if (!r) return;
    const el = btnRefs.current.get(`${focus.col}:${rowKey(r)}`);
    el?.focus();
    el?.scrollIntoView({ block: "nearest" });
  }, [open, focus, cols, kbd]);

  // ── row interactions ─────────────────────────────────────────────────────────
  // Hover = explore only: reveal this row's child column + highlight it, board untouched.
  const hoverRow = (r: NavRow) => { setKbd(false); setExplore(scopeOf(r, explore)); };

  // Click = decide: apply the path to this row to the board and close.
  const activateRow = (r: NavRow) => {
    commit(scopeOf(r, explore));
    if (r.kind === "section") onPickSection(r.section.key); // also opens its inline list
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") { e.preventDefault(); closePanel(); return; }
    if (!focus) return;
    const col = cols[focus.col] ?? [];
    if (["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Enter", " "].includes(e.key)) setKbd(true);
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      const next = Math.max(0, Math.min(col.length - 1, focus.row + (e.key === "ArrowDown" ? 1 : -1)));
      setFocus({ col: focus.col, row: next });
      const r = col[next];
      if (r) setExplore(scopeOf(r, explore)); // explore only — never the board
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      const r = col[focus.row];
      if (r && r.kind !== "section") { setExplore(scopeOf(r, explore)); setFocus({ col: focus.col + 1, row: 0 }); }
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const r = col[focus.row];
      if (r) activateRow(r); // commit + close
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      if (focus.col > 0) setFocus({ col: focus.col - 1, row: 0 });
    }
  };

  // ── breadcrumb chips (from the committed selection) ──────────────────────────
  const crumbs = useMemo(() => {
    const c = committed;
    const out: string[] = [];
    if (c.school) out.push(c.school);
    if (c.grade) out.push(c.year ? `${c.grade} · ${c.year}` : c.grade);
    if (c.subject) out.push(c.exam ? `${c.subject} · ${c.exam}` : c.subject);
    if (c.section) out.push(`Section ${c.section}`);
    return out;
  }, [committed]);

  const clear = (e: React.MouseEvent) => { e.stopPropagation(); setCommitted(EMPTY_SCOPE); setExplore(EMPTY_SCOPE); onFilter(EMPTY_SCOPE); };

  return (
    <div ref={panelRef} className="relative z-30" onKeyDown={onKeyDown}>
      {/* ── breadcrumb bar ─────────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => (open ? closePanel() : openPanel())}
        onMouseEnter={() => setNudge(true)}
        onMouseLeave={() => setNudge(false)}
        className={`group flex w-full items-center gap-2 text-left transition-all duration-150 rounded-xl border ${
          open || nudge
            ? "border-indigo-200 bg-indigo-50/60 px-3 py-2 shadow-sm"
            : "border-slate-200 bg-white px-3 py-1.5"
        }`}
      >
        <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400 shrink-0">Scope</span>

        <div className="flex items-center gap-1 min-w-0 flex-1">
          {crumbs.length === 0 ? (
            <span className="text-sm text-slate-400">All schools · all sections</span>
          ) : (
            crumbs.map((label, i) => (
              <span key={i} className="inline-flex items-center gap-1 min-w-0">
                {i > 0 && <ChevronRight size={13} className="text-slate-300 shrink-0" />}
                <span className="truncate max-w-[180px] rounded-md bg-white px-2 py-0.5 text-sm font-semibold text-slate-700 ring-1 ring-slate-200">
                  {label}
                </span>
              </span>
            ))
          )}
        </div>

        {!isEmptyScope(committed) && (
          <span
            role="button"
            tabIndex={-1}
            onClick={clear}
            title="Clear filter"
            className="grid place-items-center w-6 h-6 rounded-md text-slate-400 hover:bg-slate-200 hover:text-slate-700 shrink-0"
          >
            <X size={14} />
          </span>
        )}

        {/* pull-down nudge: two stacked chevrons that appear on hover */}
        <span className={`flex flex-col -space-y-1.5 text-indigo-400 transition-opacity shrink-0 ${nudge || open ? "opacity-100" : "opacity-0"}`} aria-hidden>
          <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
          <ChevronDown size={13} className={`transition-transform ${open ? "rotate-180" : ""}`} />
        </span>
      </button>

      {/* ── Finder columns dropdown ─────────────────────────────────── */}
      {open && (
        <div className="absolute left-0 right-0 top-full mt-1.5 z-40 rounded-2xl bg-white ring-1 ring-slate-200 shadow-2xl shadow-black/10 overflow-hidden">
          <div className="flex max-h-[60vh]">
            {cols.map((col, ci) => (
              <div key={ci} className="w-60 shrink-0 flex flex-col border-r border-slate-100 last:border-r-0">
                <div className="shrink-0 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-100 bg-slate-50/70">
                  {COL_TITLES[ci] ?? "Items"}
                </div>
                <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5">
                  {col.length === 0 && <p className="px-2 py-3 text-xs text-slate-400">— none —</p>}
                  {col.map((r) => {
                    const child = r.kind === "year" || r.kind === "exam";
                    // COMMITTED (clicked → locked in): solid indigo + a check. PREVIEW
                    // (mouse/keyboard peeking, not yet committed): a lighter, transient
                    // slate tint. This makes "I selected 11 and stopped" unmistakable vs.
                    // "I'm just hovering 11" — the differentiation Fahad asked for.
                    const isCommitted = matches(r, committed);
                    const isExplore = !isCommitted && matches(r, explore);
                    const label = r.kind === "section" ? `Section ${r.section.section || "—"}` : r.value;
                    const count = r.kind === "section" ? r.section.metrics.papers : r.count;
                    return (
                      <button
                        key={rowKey(r)}
                        ref={(el) => { if (el) btnRefs.current.set(`${ci}:${rowKey(r)}`, el); else btnRefs.current.delete(`${ci}:${rowKey(r)}`); }}
                        onMouseEnter={() => hoverRow(r)}
                        onClick={() => activateRow(r)}
                        aria-pressed={isCommitted}
                        className={`group/row flex items-center gap-2 w-full h-8 rounded-lg text-left text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ${
                          child ? "pl-6 pr-2.5" : "px-2.5"
                        } ${
                          isCommitted
                            ? "bg-indigo-100 text-indigo-800 font-semibold ring-1 ring-inset ring-indigo-300"
                            : isExplore
                            ? "bg-slate-100 text-slate-800"
                            : "text-slate-700 hover:bg-slate-50"
                        }`}
                      >
                        {child && <span className="w-1 h-1 rounded-full bg-slate-300 shrink-0" />}
                        <span className="flex-1 truncate">{label}</span>
                        {isCommitted && <Check size={13} className="text-indigo-600 shrink-0" />}
                        <span className={`text-[11px] tabular-nums ${isCommitted ? "text-indigo-500" : "text-slate-400"}`}>{count}</span>
                        {r.kind !== "section" && (
                          <ChevronRight size={13} className={isCommitted ? "text-indigo-400" : isExplore ? "text-slate-400" : "text-slate-300"} />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
