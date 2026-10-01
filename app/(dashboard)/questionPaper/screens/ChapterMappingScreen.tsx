"use client";
import { useState, useCallback, useMemo, useRef, Fragment } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { keys } from "@/app/lib/queryKeys";
import { ArrowLeft, Upload, Loader2, Pencil, ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { API_BASE, authHeaders as baseAuthHeaders } from "../lib/api";
import { usePersistentState } from "../../../lib/usePersistentState";

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  return { ...baseAuthHeaders(), ...extra };
}

type ConceptNode = { id: number; name: string; code: string | null };
type ChapterNode = { id: number; name: string; code: string | null; weightageMarks: number | null; concepts: ConceptNode[] };
type UnitNode    = { id: number; name: string; weightageMarks: number | null; chapters: ChapterNode[] };
type CurriculumData = { units: UnitNode[]; chaptersWithoutUnit: ChapterNode[] };

type FlatRow = {
  unitId:        number | null;
  unitName:      string | null;
  unitMarks:     number | null;
  chapterId:     number;
  chapterName:   string;
  chapterCode:   string | null;
  chapterMarks:  number | null;
  concepts:      ConceptNode[];
  isFirstInUnit: boolean;
};

function flatten(data: CurriculumData): FlatRow[] {
  const rows: FlatRow[] = [];
  for (const u of data.units) {
    u.chapters.forEach((ch, i) =>
      rows.push({ unitId: u.id, unitName: u.name, unitMarks: u.weightageMarks, chapterId: ch.id, chapterName: ch.name, chapterCode: ch.code, chapterMarks: ch.weightageMarks, concepts: ch.concepts, isFirstInUnit: i === 0 })
    );
  }
  for (const ch of data.chaptersWithoutUnit) {
    rows.push({ unitId: null, unitName: null, unitMarks: null, chapterId: ch.id, chapterName: ch.name, chapterCode: ch.code, chapterMarks: ch.weightageMarks, concepts: ch.concepts, isFirstInUnit: true });
  }
  return rows;
}

// Numeric-aware compare so codes like "M2" sort before "M10" instead of after.
function nameCompare(a: string, b: string, dir: "asc" | "desc"): number {
  const c = a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
  return dir === "asc" ? c : -c;
}

// Numeric compare for weightage — nulls always sort last.
function marksCompare(a: number | null, b: number | null, dir: "asc" | "desc"): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return dir === "asc" ? a - b : b - a;
}

type SortKey = "unit" | "unitWeight" | "chapter" | "chapterCode" | "chapterWeight" | "concepts" | "conceptCode";
type SortSpec = { key: SortKey; dir: "asc" | "desc" } | null;

// Backend sorts with plain SQL (Unit 10 before Unit 2), so the default view needs a numeric pass too.
function naturalSortChapters(chapters: ChapterNode[]): ChapterNode[] {
  return [...chapters]
    .sort((a, b) => nameCompare(a.name, b.name, "asc"))
    .map(ch => ({ ...ch, concepts: [...ch.concepts].sort((a, b) => nameCompare(a.name, b.name, "asc")) }));
}

function naturalSort(data: CurriculumData): CurriculumData {
  return {
    units: [...data.units]
      .sort((a, b) => nameCompare(a.name, b.name, "asc"))
      .map(u => ({ ...u, chapters: naturalSortChapters(u.chapters) })),
    chaptersWithoutUnit: naturalSortChapters(data.chaptersWithoutUnit),
  };
}

function sortCurriculum(data: CurriculumData, spec: SortSpec): CurriculumData {
  const base = naturalSort(data);
  if (!spec) return base;
  const { key, dir } = spec;

  const sortChapters = (chapters: ChapterNode[]) => {
    let list = chapters;
    if (key === "chapter")       list = [...list].sort((a, b) => nameCompare(a.name, b.name, dir));
    if (key === "chapterCode")   list = [...list].sort((a, b) => nameCompare(a.code ?? "", b.code ?? "", dir));
    if (key === "chapterWeight") list = [...list].sort((a, b) => marksCompare(a.weightageMarks, b.weightageMarks, dir));
    return list.map(ch => ({
      ...ch,
      concepts:
        key === "concepts"    ? [...ch.concepts].sort((a, b) => nameCompare(a.name, b.name, dir)) :
        key === "conceptCode" ? [...ch.concepts].sort((a, b) => nameCompare(a.code ?? "", b.code ?? "", dir)) :
        ch.concepts,
    }));
  };

  let units = base.units;
  if (key === "unit")       units = [...units].sort((a, b) => nameCompare(a.name, b.name, dir));
  if (key === "unitWeight") units = [...units].sort((a, b) => marksCompare(a.weightageMarks, b.weightageMarks, dir));

  return {
    units: units.map(u => ({ ...u, chapters: sortChapters(u.chapters) })),
    chaptersWithoutUnit: sortChapters(base.chaptersWithoutUnit),
  };
}

// rows are a derived, re-sorted view — edits patch the source tree instead.
function updateChapterIn(data: CurriculumData, chapterId: number, fn: (ch: ChapterNode) => ChapterNode): CurriculumData {
  return {
    units: data.units.map(u => ({ ...u, chapters: u.chapters.map(ch => (ch.id === chapterId ? fn(ch) : ch)) })),
    chaptersWithoutUnit: data.chaptersWithoutUnit.map(ch => (ch.id === chapterId ? fn(ch) : ch)),
  };
}

function updateConceptIn(data: CurriculumData, conceptId: number, fn: (c: ConceptNode) => ConceptNode): CurriculumData {
  const mapCh = (ch: ChapterNode) => ({ ...ch, concepts: ch.concepts.map(c => (c.id === conceptId ? fn(c) : c)) });
  return {
    units: data.units.map(u => ({ ...u, chapters: u.chapters.map(mapCh) })),
    chaptersWithoutUnit: data.chaptersWithoutUnit.map(mapCh),
  };
}

type SaveStatus = "idle" | "saving" | "saved" | "error";

function InlineEdit({
  value,
  onSave,
  placeholder = "—",
  numeric = false,
  dim = false,
  className = "",
}: {
  value: string | null;
  onSave: (v: string) => Promise<void>;
  placeholder?: string;
  numeric?: boolean;
  dim?: boolean;
  className?: string;
}) {
  const [active, setActive]   = useState(false);
  const [draft,  setDraft]    = useState("");
  const [status, setStatus]   = useState<SaveStatus>("idle");

  const activate = () => { setDraft(value ?? ""); setActive(true); };

  const commit = async (v: string) => {
    setActive(false);
    if (v === (value ?? "")) return;
    setStatus("saving");
    try {
      await onSave(v.trim());
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1400);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2500);
    }
  };

  if (active) {
    return (
      <input
        autoFocus
        type={numeric ? "number" : "text"}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter")  e.currentTarget.blur();
          if (e.key === "Escape") setActive(false);
        }}
        className={`w-full px-1.5 py-0.5 text-sm border border-indigo-400 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400/50 ${className}`}
      />
    );
  }

  return (
    <span
      onDoubleClick={activate}
      title="Double-click to edit"
      className={`group/ie inline-flex items-center gap-1 cursor-default select-none rounded px-0.5 hover:bg-gray-100 transition ${
        dim ? "text-gray-400" : ""
      } ${status === "saved" ? "text-green-600" : status === "error" ? "text-red-500" : ""} ${className}`}
    >
      {status === "saving" && <Loader2 size={9} className="shrink-0 animate-spin text-gray-400" />}
      {status === "saved"  && <span className="shrink-0 text-[10px] text-green-500">✓</span>}
      {status === "error"  && <span className="shrink-0 text-[10px] text-red-400">!</span>}
      <span className={value ? "" : "text-gray-300 italic text-xs"}>{value || placeholder}</span>
      <Pencil size={8} className="shrink-0 opacity-0 group-hover/ie:opacity-30 text-gray-500 transition" />
    </span>
  );
}

function ConceptChip({
  concept,
  onSave,
}: {
  concept: ConceptNode;
  onSave: (id: number, name: string) => Promise<void>;
}) {
  const [active, setActive] = useState(false);
  const [draft,  setDraft]  = useState("");
  const [status, setStatus] = useState<SaveStatus>("idle");

  const commit = async (v: string) => {
    setActive(false);
    if (!v.trim() || v.trim() === concept.name) return;
    setStatus("saving");
    try {
      await onSave(concept.id, v.trim());
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1400);
    } catch {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 2500);
    }
  };

  if (active) {
    return (
      <input
        autoFocus
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={e => commit(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter")  e.currentTarget.blur();
          if (e.key === "Escape") setActive(false);
        }}
        className="block h-7 px-2.5 text-xs border border-indigo-400 rounded-md focus:outline-none focus:ring-1 focus:ring-indigo-400/40 w-full min-w-[16rem] max-w-md"
      />
    );
  }

  return (
    <span
      onDoubleClick={() => { setDraft(concept.name); setActive(true); }}
      title="Double-click to edit"
      className={`inline-flex items-start gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium leading-snug border cursor-default select-none transition ${
        status === "saving" ? "bg-gray-100 text-gray-400 border-gray-200" :
        status === "saved"  ? "bg-green-50 text-green-700 border-green-200" :
        status === "error"  ? "bg-red-50 text-red-500 border-red-200" :
        "bg-gray-50 text-gray-700 border-gray-200 hover:border-indigo-300 hover:bg-indigo-50/40"
      }`}
    >
      {status === "saving" && <Loader2 size={8} className="animate-spin shrink-0" />}
      {status === "saved"  && <span className="text-[9px]">✓</span>}
      {concept.name}
    </span>
  );
}

function SortableHeader({
  label, sortKey, spec, onClick, align = "left", className = "",
}: {
  label: string;
  sortKey: SortKey;
  spec: SortSpec;
  onClick: (key: SortKey) => void;
  align?: "left" | "right";
  className?: string;
}) {
  const active = spec?.key === sortKey;
  const Icon = active ? (spec!.dir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <th className={`py-3 ${align === "right" ? "text-right" : ""} ${className}`}>
      <button
        onClick={() => onClick(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-indigo-600 transition w-full ${
          active ? "text-indigo-600" : ""
        } ${align === "right" ? "justify-end" : ""}`}
      >
        <span className={align === "right" ? "text-right" : "text-left"}>{label}</span>
        <Icon size={11} className={`shrink-0 ${active ? "opacity-100" : "opacity-40"}`} />
      </button>
    </th>
  );
}

const NO_ITEMS: { id: number; name: string }[] = [];
const NO_GRADE_SUBJECTS: Record<string, number[]> = {};

export default function ChapterMappingScreen({ onBack }: { onBack: () => void }) {
  const queryClient = useQueryClient();
  const [gradeId,   setGradeId]   = usePersistentState<number | "">("chm:gradeId", "");
  const [subjectId, setSubjectId] = usePersistentState<number | "">("chm:subjectId", "");
  const [sortSpec,  setSortSpec]  = usePersistentState<SortSpec>("chm:sortSpec", null);


  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading,  setUploading]  = useState(false);
  const [uploadMsg,  setUploadMsg]  = useState<{ ok: boolean; text: string } | null>(null);

  // Shares the app-wide registry cache.
  const registryQuery = useQuery({
    queryKey: keys.registry.batchFormOptions(),
    queryFn: async () => {
      const r = await fetch(`${API_BASE}/api/registry/batch-form-options`, { headers: authHeaders() });
      if (!r.ok) throw new Error("Failed to load registry");
      return r.json();
    },
  });

  const grades: { id: number; name: string }[] = registryQuery.data?.grades ?? NO_ITEMS;
  const subjects: { id: number; name: string }[] = registryQuery.data?.subjects ?? NO_ITEMS;
  // gradeId -> subjectIds from curriculum.grade-subjects; missing grade = unrestricted.
  const gradeSubjectIds: Record<string, number[]> =
    registryQuery.data?.gradeSubjectIds ?? NO_GRADE_SUBJECTS;

  // grade + subject are both in the key, so switching either can't let a slow
  // reply for the previous pair land on the current one.
  const curriculumQuery = useQuery({
    queryKey: keys.questionPaper.curriculum(
      gradeId === "" ? null : gradeId,
      subjectId === "" ? null : subjectId,
    ),
    queryFn: async (): Promise<CurriculumData> => {
      const res = await fetch(
        `${API_BASE}/api/data-quality/curriculum?gradeId=${gradeId}&subjectId=${subjectId}`,
        { headers: authHeaders() }
      );
      if (!res.ok) throw new Error("Failed to load curriculum");
      return res.json();
    },
    enabled: !!gradeId && !!subjectId,
  });

  const curriculum = curriculumQuery.data ?? null;
  const loading = !!gradeId && !!subjectId && curriculumQuery.isPending;
  const error =
    curriculumQuery.error instanceof Error ? curriculumQuery.error.message : null;

  // Inline edits write straight into the cached curriculum, so the existing
  // `setCurriculum(cur => …)` call sites keep working unchanged.
  const setCurriculum = useCallback(
    (updater: (prev: CurriculumData | null) => CurriculumData | null | undefined) =>
      queryClient.setQueryData<CurriculumData>(
        keys.questionPaper.curriculum(
          gradeId === "" ? null : gradeId,
          subjectId === "" ? null : subjectId,
        ),
        prev => updater(prev ?? null) ?? undefined,
      ),
    [queryClient, gradeId, subjectId]
  );

  const fetchCurriculum = useCallback(
    () => queryClient.invalidateQueries({
      queryKey: keys.questionPaper.curriculum(
        gradeId === "" ? null : gradeId,
        subjectId === "" ? null : subjectId,
      ),
    }),
    [queryClient, gradeId, subjectId]
  );

  const subjectsForGrade = useMemo(() => {
    if (!gradeId) return [];
    const allowed = gradeSubjectIds[String(gradeId)];
    return allowed ? subjects.filter(s => allowed.includes(s.id)) : subjects;
  }, [gradeId, gradeSubjectIds, subjects]);

  const rows = useMemo(
    () => (curriculum ? flatten(sortCurriculum(curriculum, sortSpec)) : []),
    [curriculum, sortSpec]
  );

  // Third click on the same column clears sorting back to upload order.
  const toggleSort = (key: SortKey) => {
    setSortSpec(prev => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  };

  async function putJson(path: string, body: Record<string, unknown>) {
    const res = await fetch(`${API_BASE}${path}`, {
      method:  "PUT",
      headers: authHeaders({ "Content-Type": "application/json" }),
      body:    JSON.stringify(body),
    });
    if (!res.ok) {
      const b = await res.json().catch(() => ({})) as { error?: string };
      throw new Error(b.error || "Save failed");
    }
  }

  const saveUnitName = async (unitId: number, name: string) => {
    await putJson(`/api/data-quality/units/${unitId}`, { name });
    setCurriculum(cur => cur && { ...cur, units: cur.units.map(u => (u.id === unitId ? { ...u, name } : u)) });
  };

  const saveUnitMarks = async (unitId: number, raw: string) => {
    const marks = raw.trim() === "" ? null : parseInt(raw, 10);
    if (raw.trim() !== "" && isNaN(marks!)) throw new Error("Invalid number");
    await putJson(`/api/data-quality/units/${unitId}`, { weightageMarks: marks });
    setCurriculum(cur => cur && { ...cur, units: cur.units.map(u => (u.id === unitId ? { ...u, weightageMarks: marks } : u)) });
  };

  const saveChapterName = async (chapterId: number, name: string) => {
    await putJson(`/api/data-quality/chapters/${chapterId}`, { name });
    setCurriculum(cur => cur && updateChapterIn(cur, chapterId, ch => ({ ...ch, name })));
  };

  const saveChapterCode = async (chapterId: number, code: string) => {
    await putJson(`/api/data-quality/chapters/${chapterId}`, { code: code.trim() || null });
    setCurriculum(cur => cur && updateChapterIn(cur, chapterId, ch => ({ ...ch, code: code.trim() || null })));
  };

  const saveChapterMarks = async (chapterId: number, raw: string) => {
    const marks = raw.trim() === "" ? null : parseInt(raw, 10);
    if (raw.trim() !== "" && isNaN(marks!)) throw new Error("Invalid number");
    await putJson(`/api/data-quality/chapters/${chapterId}`, { weightageMarks: marks });
    setCurriculum(cur => cur && updateChapterIn(cur, chapterId, ch => ({ ...ch, weightageMarks: marks })));
  };

  const saveConceptName = async (conceptId: number, name: string) => {
    await putJson(`/api/data-quality/concepts/${conceptId}`, { name });
    setCurriculum(cur => cur && updateConceptIn(cur, conceptId, c => ({ ...c, name })));
  };

  const saveConceptCode = async (conceptId: number, code: string) => {
    await putJson(`/api/data-quality/concepts/${conceptId}`, { code: code.trim() || null });
    setCurriculum(cur => cur && updateConceptIn(cur, conceptId, c => ({ ...c, code: code.trim() || null })));
  };

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !gradeId || !subjectId) return;
    setUploading(true);
    setUploadMsg(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("gradeId",   String(gradeId));
      fd.append("subjectId", String(subjectId));
      const res = await fetch(`${API_BASE}/api/data-quality/curriculum/upload`, {
        method: "POST", headers: authHeaders(), body: fd,
      });
      const body = await res.json().catch(() => ({})) as Record<string, number | string>;
      if (!res.ok) throw new Error(String(body.error ?? "Upload failed"));
      setUploadMsg({ ok: true, text: `Uploaded — ${body.unitsCreated ?? 0} units, ${body.chaptersCreated ?? 0} chapters, ${body.conceptsCreated ?? 0} concepts added` });
      await fetchCurriculum();
    } catch (e) {
      setUploadMsg({ ok: false, text: e instanceof Error ? e.message : "Upload failed" });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const hasData = rows.length > 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-6 py-6">

        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium transition mb-6"
        >
          <ArrowLeft size={15} /> Back
        </button>

        <div className="flex items-center justify-between mb-6">
          <h1 className="text-xl font-bold text-gray-900">Chapter–Concept Mapping</h1>
          <p className="text-xs text-gray-400">Double-click any cell to edit · changes save automatically</p>
        </div>

        <div className="flex items-center gap-3 mb-5 flex-wrap">
          <select
            value={gradeId}
            onChange={e => { setGradeId(e.target.value ? Number(e.target.value) : ""); setSubjectId(""); }}
            className="h-9 pl-3 pr-8 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 appearance-none"
          >
            <option value="">Grade</option>
            {grades.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>

          <select
            value={subjectId}
            onChange={e => setSubjectId(e.target.value ? Number(e.target.value) : "")}
            disabled={!gradeId}
            className="h-9 pl-3 pr-8 text-sm border border-gray-200 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-400 appearance-none disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <option value="" disabled>{!gradeId ? "Select grade first" : subjectsForGrade.length ? "Select" : "None for this grade"}</option>
            {subjectsForGrade.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <div className="flex-1" />

          <input ref={fileRef} type="file" accept=".xlsx,.xls" className="hidden" onChange={handleFile} />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={!gradeId || !subjectId || uploading}
            className="flex items-center gap-1.5 h-9 px-4 text-sm font-medium bg-white border border-gray-200 rounded-lg hover:border-indigo-400 hover:text-indigo-600 transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
            Upload Excel
          </button>
        </div>

        {uploadMsg && (
          <div className={`mb-5 px-4 py-3 rounded-lg text-sm font-medium border ${
            uploadMsg.ok
              ? "bg-green-50 text-green-700 border-green-200"
              : "bg-red-50 text-red-600 border-red-200"
          }`}>
            {uploadMsg.text}
          </div>
        )}

        {error && (
          <div className="mb-5 px-4 py-3 rounded-lg text-sm text-red-600 bg-red-50 border border-red-200">{error}</div>
        )}

        {(!gradeId || !subjectId) ? (
          <div className="text-center py-24 text-gray-400 text-sm">Select a grade and subject to view the curriculum</div>
        ) : loading ? (
          <div className="flex justify-center py-24"><Loader2 size={24} className="animate-spin text-indigo-400" /></div>
        ) : !hasData ? (
          <div className="text-center py-24 text-gray-400 text-sm">
            No curriculum data for this grade and subject.
            <br /><span className="text-xs mt-1 block">Upload an Excel file with Unit / Chapter / Concept columns to get started.</span>
          </div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-2xl overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="text-left text-[10px] font-bold uppercase tracking-wider text-gray-400 bg-gray-50 border-b border-gray-200">
                    <SortableHeader label="Unit"              sortKey="unit"          spec={sortSpec} onClick={toggleSort} className="px-4" />
                    <SortableHeader label="Unit Weightage"    sortKey="unitWeight"    spec={sortSpec} onClick={toggleSort} align="right" className="px-3 w-24" />
                    <SortableHeader label="Chapter Code"      sortKey="chapterCode"   spec={sortSpec} onClick={toggleSort} className="px-3 w-20" />
                    <SortableHeader label="Chapter"           sortKey="chapter"       spec={sortSpec} onClick={toggleSort} className="px-4" />
                    <SortableHeader label="Chapter Weightage" sortKey="chapterWeight" spec={sortSpec} onClick={toggleSort} align="right" className="px-3 w-28" />
                    <SortableHeader label="Concept Code"      sortKey="conceptCode"   spec={sortSpec} onClick={toggleSort} className="px-3 w-20" />
                    <SortableHeader label="Concepts"          sortKey="concepts"      spec={sortSpec} onClick={toggleSort} className="px-4" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => {
                    const isNewUnit = row.isFirstInUnit && i > 0;
                    return (
                      <tr
                        key={row.chapterId}
                        className={`border-b border-gray-100 hover:bg-gray-50/50 transition-colors ${isNewUnit ? "border-t-2 border-t-gray-200" : ""}`}
                      >
                        <td className="px-4 py-3 align-top">
                          {row.unitId != null ? (
                            <InlineEdit
                              value={row.unitName}
                              onSave={v => saveUnitName(row.unitId!, v)}
                              placeholder="Unit name"
                              dim={!row.isFirstInUnit}
                              className={row.isFirstInUnit ? "font-semibold text-gray-900" : "text-gray-400 text-xs"}
                            />
                          ) : (
                            <span className="text-gray-300 text-xs italic">No unit</span>
                          )}
                        </td>

                        <td className="px-3 py-3 align-top text-right">
                          {row.unitId != null && row.isFirstInUnit ? (
                            <InlineEdit
                              value={row.unitMarks != null ? String(row.unitMarks) : null}
                              onSave={v => saveUnitMarks(row.unitId!, v)}
                              placeholder="—"
                              numeric
                              className="font-mono text-xs text-gray-600"
                            />
                          ) : null}
                        </td>

                        <td className="px-3 py-3 align-top">
                          <InlineEdit
                            value={row.chapterCode}
                            onSave={v => saveChapterCode(row.chapterId, v)}
                            placeholder="—"
                            className="font-mono text-xs text-gray-500"
                          />
                        </td>

                        <td className="px-4 py-3 align-top">
                          <InlineEdit
                            value={row.chapterName}
                            onSave={v => saveChapterName(row.chapterId, v)}
                            placeholder="Chapter name"
                            className="font-medium text-gray-800"
                          />
                        </td>

                        <td className="px-3 py-3 align-top text-right">
                          <InlineEdit
                            value={row.chapterMarks != null ? String(row.chapterMarks) : null}
                            onSave={v => saveChapterMarks(row.chapterId, v)}
                            placeholder="—"
                            numeric
                            className="font-mono text-xs text-gray-600"
                          />
                        </td>

                        <td className="px-3 py-3 align-top" colSpan={2}>
                          {row.concepts.length === 0 ? (
                            <span className="text-gray-300 text-xs italic">No concepts</span>
                          ) : (
                            // code + pill share a grid row so wrapped text can't misalign them
                            <div className="grid grid-cols-[5rem_1fr] gap-x-3 gap-y-1.5 items-start max-w-md">
                              {row.concepts.map(c => (
                                <Fragment key={c.id}>
                                  <InlineEdit
                                    value={c.code}
                                    onSave={v => saveConceptCode(c.id, v)}
                                    placeholder="—"
                                    className="font-mono text-xs text-gray-500 h-7 flex items-center"
                                  />
                                  <ConceptChip concept={c} onSave={saveConceptName} />
                                </Fragment>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 flex items-center gap-4 text-xs text-gray-400">
              <span>{rows.filter(r => r.unitId != null).length > 0 ? `${[...new Set(rows.filter(r => r.unitId).map(r => r.unitId))].length} units` : ""}</span>
              <span>{rows.length} chapters</span>
              <span>{rows.reduce((n, r) => n + r.concepts.length, 0)} concepts</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
