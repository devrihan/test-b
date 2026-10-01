"use client"

import React, { useEffect, useState } from 'react'
import { LogOut, User, Bug } from 'lucide-react';
import { logout, getUsername } from '../lib/auth';
import { usePathname, useRouter } from 'next/navigation';
import { useBatchFilterContext } from '../context/BatchFilterContext';
import BatchFilterBar from '../(dashboard)/pdfExtract/components/BatchFilterBar';
import BatchListFilterBar from '../(dashboard)/batches/components/BatchListFilterBar';
import QuestionPaperFilterBar from '../(dashboard)/questionPaper/components/QuestionPaperFilterBar';
import { useBugReport } from './bug-report/BugReportContext';

function Header() {
  const [profileOpen, setProfileOpen] = useState(false);
  const [username,    setUsername]    = useState("");
  const [email,       setEmail]       = useState("");
  const [loginUsername, setLoginUsername] = useState("");

  const pathname     = usePathname();
  const router       = useRouter();
  const isPdfExtract = pathname?.includes("/pdfExtract");
  const isAnswerEditing = pathname?.includes("/answerEditing");
  const isQuestionPaper = pathname?.includes("/questionPaper");
  const isBatches    = pathname === "/batches";

  const batchFilter = useBatchFilterContext();
  const bugReport   = useBugReport();

  useEffect(() => {
    const raw = sessionStorage.getItem("keycloak_user")
             || localStorage.getItem("keycloak_user");
    if (!raw) return;
    try {
      const user = JSON.parse(raw);
      setUsername(user.name || user.username || "ops.team");
      setEmail(user.email || "ops@classlens.com");
    } catch {
      // invalid JSON
    }
    setLoginUsername(getUsername());
  }, []);

  return (
    <div className="flex w-full min-h-20 border items-center px-4 py-2 justify-between gap-4">

      {/* Left: Logo + filters */}
      <div className="flex items-center gap-x-4 flex-1 min-w-0">

        {/* Logo */}
        <div className="cursor-pointer"
           onClick={() => router.push("/")}>
          <img
            src="/BeaverLogo3.png"
            alt="Beaver"
            className="w-22 h-22 mx-auto  rounded-full object-cover "
          />
        </div>

        {/* pdfExtract → Pipeline batch filter bar */}
        {isPdfExtract && (
          <BatchFilterBar
            {...batchFilter}
            onOpenStudent = {batchFilter.onOpenStudent}
            loading       = {batchFilter.loadingPages}
          />
        )}

        {/* answerEditing → Pipeline batch filter bar. */}
        {isAnswerEditing && (
          <BatchFilterBar
            {...batchFilter}
            onOpenStudent = {batchFilter.onOpenStudent}
            loading       = {batchFilter.loadingPages}
          />
        )}

        {/* /batches → batch list filters */}
        {isBatches && <BatchListFilterBar loginUsername={loginUsername} />}

        {isQuestionPaper && <QuestionPaperFilterBar />}

      </div>

      {/* Right: Bug button + Profile */}
      <div className="flex items-center gap-2 shrink-0">

        <button
          onClick={() => {
            const batch = batchFilter.matchedBatch;
            const student = batchFilter.students?.find(
              (s: { student_id: string }) => s.student_id === batchFilter.selectedStudentId,
            );
            let pageUrl = typeof window !== "undefined" ? window.location.href : pathname || "/";
            if (typeof window !== "undefined" && batch?.batch_id) {
              const base = window.location.origin + window.location.pathname;
              const p = new URLSearchParams(window.location.search);
              p.set("batchId", batch.batch_id);
              if (batchFilter.selectedStudentId) p.set("studentId", batchFilter.selectedStudentId);
              pageUrl = `${base}?${p.toString()}`;
            }
            bugReport.setContext({
              page_url: pageUrl,
              batch_id: batch?.batch_id || null,
              batch_name: batch?.batch_name || null,
              student_id: batchFilter.selectedStudentId || null,
              student_name: student?.student_name || null,
              exam_id: batch?.exam_type || null,
            });
            bugReport.setOpen(true);
          }}
          className="flex items-center gap-1.5 h-8 px-3 rounded-lg border border-gray-200 text-gray-500 hover:border-red-300 hover:text-red-600 hover:bg-red-50 text-xs font-medium transition"
          title="Report a bug"
        >
          <Bug size={14} />
          <span className="hidden sm:inline">Report Bug</span>
        </button>

      <div className="relative">
        <button
          onClick={() => setProfileOpen(v => !v)}
          className="flex items-center gap-2 h-8 pl-1 pr-2.5 rounded-lg hover:bg-gray-100 transition"
        >
          <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
            <User size={24} className="text-indigo-600" />
          </div>
        </button>

        {profileOpen && (
          <div className="absolute right-0 top-10 w-56 bg-white border border-gray-200 rounded-xl shadow-lg shadow-black/10 overflow-hidden z-50">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-[20px] font-semibold text-gray-800">{username}</p>
              <p className="text-[18px] text-gray-400 mt-0.5">{email}</p>
            </div>
            <button
              onClick={() => { setProfileOpen(false); logout(); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-[18px] text-red-600 hover:bg-red-50 transition font-medium"
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
        )}
      </div>

      </div>
    </div>
  );
}

export default Header;
