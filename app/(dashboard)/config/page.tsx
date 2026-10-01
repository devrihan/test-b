"use client";

import { useState, useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useQueryStates } from "nuqs";
import { keys } from "@/app/lib/queryKeys";
import { urlKeys, URL_OPTIONS, CONFIG_TABS } from "@/app/lib/urlKeys";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  BookOpen,
  Layers,
  ClipboardList,
  FileText,
  Building,
  GraduationCap,
  Calendar,
} from "lucide-react";
import { API_BASE, authHeaders } from "./lib/api";
import type { SchoolOption, GradeOption } from "./types";
import { SubjectsPanel } from "./components/SubjectsPanel";
import { SectionsPanel } from "./components/SectionsPanel";
import { ExamTypesPanel } from "./components/ExamTypesPanel";
import { ExamsPanel } from "./components/ExamsPanel";
import { SchoolsPanel } from "./components/SchoolsPanel";
import { GradesPanel } from "./components/GradesPanel";
import { AcademicYearsPanel } from "./components/AcademicYearsPanel";
const TABS = [
  { key: "schools", label: "Schools", icon: Building },
  { key: "grades", label: "Grades", icon: GraduationCap },
  { key: "subjects", label: "Subjects", icon: BookOpen },
  { key: "sections", label: "Sections", icon: Layers },
  { key: "examTypes", label: "Exam Types", icon: ClipboardList },
  { key: "exams", label: "Exams", icon: FileText },
  { key: "academicYears", label: "Academic Years", icon: Calendar },
] as const;

// Derived from urlKeys so a tab added to TABS but not to CONFIG_TABS fails to compile.
type TabKey = (typeof CONFIG_TABS)[number];

const NO_SCHOOLS: SchoolOption[] = [];
const NO_GRADES: GradeOption[] = [];

export default function ConfigPage() {
  const router = useRouter();
  const [{ tab }, setConfig] = useQueryStates(urlKeys.config, URL_OPTIONS);

  const queryClient = useQueryClient();

  // Shares the app-wide registry cache.
  const optionsQuery = useQuery({
    queryKey: keys.registry.batchFormOptions(),
    queryFn: async () => {
      const res = await fetch(`${API_BASE}/api/registry/batch-form-options`, {
        headers: authHeaders(),
      });
      if (!res.ok) throw new Error("Failed to load form options");
      return res.json();
    },
  });

  const schools: SchoolOption[] =
    optionsQuery.data?.schools?.map((s: { id: number; name: string }) => ({ id: s.id, name: s.name })) ?? NO_SCHOOLS;
  const grades: GradeOption[] =
    optionsQuery.data?.grades?.map((g: { id: number; name: string }) => ({ id: g.id, name: g.name })) ?? NO_GRADES;

  const loadFormOptions = useCallback(
    () => queryClient.invalidateQueries({ queryKey: keys.registry.batchFormOptions() }),
    [queryClient]
  );

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => router.push("/")}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 font-medium transition"
          >
            <ArrowLeft size={15} /> Back
          </button>
          <div className="w-px h-5 bg-gray-200" />
          <h1 className="text-lg font-bold text-gray-900">Config Management</h1>
        </div>

        <p className="text-sm text-gray-500 mb-6">
          Manage master data — schools, grades, subjects, sections, exam types,
          exams, and academic years — that feed dropdowns across the platform.
        </p>

        <div className="flex items-center gap-1 mb-6 bg-white border border-gray-200 rounded-xl p-1 overflow-x-auto">
          {TABS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setConfig({ tab: key })}
              className={`flex items-center gap-1.5 px-3 h-8 text-xs font-semibold rounded-lg transition whitespace-nowrap ${
                tab === key
                  ? "bg-indigo-600 text-white"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              <Icon size={13} /> {label}
            </button>
          ))}
        </div>

        {tab === "schools" && <SchoolsPanel />}
        {tab === "grades" && <GradesPanel />}
        {tab === "subjects" && <SubjectsPanel />}
        {tab === "sections" && <SectionsPanel schools={schools} grades={grades} />}
        {tab === "examTypes" && <ExamTypesPanel />}
        {tab === "exams" && <ExamsPanel schools={schools} grades={grades} />}
        {tab === "academicYears" && <AcademicYearsPanel />}
      </div>
    </div>
  );
}
