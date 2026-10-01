"use client";

import { useRouter } from "next/navigation";
import { getUserRoles } from "@/app/lib/auth";
import { getMyRoles } from "@/app/lib/reviewApi";
import { useEffect, useState } from "react";

const AI_WORKFLOW_ROLES = ["OPERATIONS", "OPERATIONS-LEAD", "ADMIN"];

export default function SelectToolPage() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [canRunAiWorkflows, setCanRunAiWorkflows] = useState(false);

  useEffect(() => {
    setIsAdmin(getUserRoles().includes("ADMIN"));
    const realmRoles = getMyRoles();
    setCanRunAiWorkflows(AI_WORKFLOW_ROLES.some((r) => realmRoles.includes(r)));
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-8">
      <div className="w-full max-w-4xl">

        <div className="text-center mb-10">
          <img
            src="/beaver1.jpg"
            alt="Beaver"
            className="w-64 h-64 mx-auto mb-6 rounded-full object-cover "
          />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">
            Choose a tool
          </h1>
          <p className="text-sm text-gray-500">
            What would you like to do today?
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">

          {/* Question Paper */}
          <button
            onClick={() => router.push("/questionPaper")}
            className="group text-left bg-[#FFF9E2] border border-gray-200 rounded-2xl p-6 hover:border-indigo-400 hover:shadow-md transition-all duration-200 ring-1 ring-black/5 focus:outline-none flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-5 group-hover:bg-indigo-100 transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/>
                  <polyline points="14 2 14 8 20 8"/>
                  <line x1="16" y1="13" x2="8" y2="13"/>
                  <line x1="16" y1="17" x2="8" y2="17"/>
                  <polyline points="10 9 9 9 8 9"/>
                </svg>
              </div>
              <h2 className="text-base font-bold text-gray-900 mb-2">Question Paper</h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                Upload question paper PDFs and parse/edit templates globally for grading layouts.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1.5 text-indigo-600 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
              Open
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
          </button>


          {/* Answer Key */}
          <button
            onClick={() => router.push("/answerKey")}
            className="group text-left bg-sky-50 border border-gray-200 rounded-2xl p-6 hover:border-indigo-400 hover:shadow-md transition-all duration-200 ring-1 ring-black/5 focus:outline-none flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-5 group-hover:bg-indigo-100 transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 11l3 3L22 4"/>
                  <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                </svg>
              </div>
              <h2 className="text-base font-bold text-gray-900 mb-2">Answer Key</h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                Upload answer key PDFs, validate marks, and publish for AI grading.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1.5 text-indigo-600 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
              Open
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
          </button>

          {/* Answer Chunking */}
          <button
            onClick={() => router.push("/pdfExtract")}
            className="group text-left bg-violet-50 border border-gray-200 rounded-2xl p-6 hover:border-indigo-400 hover:shadow-md transition-all duration-200 ring-1 ring-black/5 focus:outline-none flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-5 group-hover:bg-indigo-100 transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7"/>
                  <rect x="14" y="3" width="7" height="7"/>
                  <rect x="3" y="14" width="7" height="7"/>
                  <rect x="14" y="14" width="7" height="7"/>
                </svg>
              </div>
              <h2 className="text-base font-bold text-gray-900 mb-2">Answer Chunking</h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                Upload student sheets, draw boxes, and extract answers as cropped images.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1.5 text-indigo-600 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
              Open
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
          </button>

          {/* Manual Repair */}
          <button
            onClick={() => router.push("/manualRepair")}
            className="group text-left bg-[#DEC384] border border-gray-200 rounded-2xl p-6 hover:border-indigo-400 hover:shadow-md transition-all duration-200 ring-1 ring-black/5 focus:outline-none flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-5 group-hover:bg-indigo-100 transition-colors">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/bucket.png" alt="Manual Repair" className="w-7 h-7 object-contain" />
              </div>
              <h2 className="text-base font-bold text-gray-900 mb-2">Manual Repair</h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                Students flagged from Answer Chunking — view pages, delete blanks, and re-process.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1.5 text-indigo-600 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
              Open
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
          </button>

          {/* Answer Editing */}
          <button
            onClick={() => router.push("/answerEditing")}
            className="group text-left bg-rose-50 border border-gray-200 rounded-2xl p-6 hover:border-indigo-400 hover:shadow-md transition-all duration-200 ring-1 ring-black/5 focus:outline-none flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-5 group-hover:bg-indigo-100 transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </div>
              <h2 className="text-base font-bold text-gray-900 mb-2">Answer Editing</h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                Review and edit extracted answers. Adjust marks and save grading outcomes.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1.5 text-indigo-600 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
              Open
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
          </button>

          {/* Review Queue (#97 / #173) */}
          <button
            onClick={() => router.push("/review/queue")}
            className="group text-left bg-sky-50 border border-gray-200 rounded-2xl p-6 hover:border-indigo-400 hover:shadow-md transition-all duration-200 ring-1 ring-black/5 focus:outline-none flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-5 group-hover:bg-indigo-100 transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                  <path d="m9 14 2 2 4-4"/>
                </svg>
              </div>
              <h2 className="text-base font-bold text-gray-900 mb-2">Checking Queue</h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                Assign answer-paper checks to ops, navigate by school/grade/subject/exam, and run two-pass checking (Checker → Re-checker) per gate.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1.5 text-indigo-600 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
              Open
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
          </button>

          {/* Issues */}
          <button
            onClick={() => router.push("/issues")}
            className="group text-left bg-amber-50 border border-gray-200 rounded-2xl p-6 hover:border-indigo-400 hover:shadow-md transition-all duration-200 ring-1 ring-black/5 focus:outline-none flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-5 group-hover:bg-indigo-100 transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10"/>
                  <line x1="12" y1="8" x2="12" y2="12"/>
                  <line x1="12" y1="16" x2="12.01" y2="16"/>
                </svg>
              </div>
              <h2 className="text-base font-bold text-gray-900 mb-2">Issues</h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                Track bugs, rescans, and operational issues reported across the platform.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1.5 text-indigo-600 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
              Open
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
          </button>

          {/* Review Metrics (#97) */}
          <button
            onClick={() => router.push("/review/metrics")}
            className="group text-left bg-teal-50 border border-gray-200 rounded-2xl p-6 hover:border-indigo-400 hover:shadow-md transition-all duration-200 ring-1 ring-black/5 focus:outline-none flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-5 group-hover:bg-indigo-100 transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="20" x2="18" y2="10"/>
                  <line x1="12" y1="20" x2="12" y2="4"/>
                  <line x1="6" y1="20" x2="6" y2="14"/>
                </svg>
              </div>
              <h2 className="text-base font-bold text-gray-900 mb-2">Review Metrics</h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                Reviewer throughput and AI data-quality: time-spent, answers corrected and discarded, per reviewer and batch.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1.5 text-indigo-600 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
              Open
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
          </button>

          {/* Export Data (ADMIN only — the page and its endpoints are gated too) */}
          { isAdmin && (
          <button
            onClick={() => router.push("/exportData")}
            className="group text-left bg-[#FEECD0] border border-gray-200 rounded-2xl p-6 hover:border-indigo-400 hover:shadow-md transition-all duration-200 ring-1 ring-black/5 focus:outline-none flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-5 group-hover:bg-indigo-100 transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
                  <polyline points="7 10 12 15 17 10"></polyline>
                  <line x1="12" y1="15" x2="12" y2="3"></line>
                </svg>
              </div>
              <h2 className="text-base font-bold text-gray-900 mb-2">Export Data</h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                Download a self-serve CSV export of student OCR and answer data for review.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1.5 text-indigo-600 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
              Open
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
          </button>
          )}

          {/* Scanning (dispatch intake monitor — /scans) */}
          <button
            onClick={() => router.push("/scans")}
            className="group text-left bg-[#D6E4E5] border border-gray-200 rounded-2xl p-6 hover:border-indigo-400 hover:shadow-md transition-all duration-200 ring-1 ring-black/5 focus:outline-none flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-5 group-hover:bg-indigo-100 transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 7V5a2 2 0 0 1 2-2h2"/>
                  <path d="M17 3h2a2 2 0 0 1 2 2v2"/>
                  <path d="M21 17v2a2 2 0 0 1-2 2h-2"/>
                  <path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
                  <line x1="7" y1="12" x2="17" y2="12"/>
                </svg>
              </div>
              <h2 className="text-base font-bold text-gray-900 mb-2">Dispatch</h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                Live dispatch monitor — what the scanners uploaded, what the sorter cut, which papers need a human, and search across all dispatches by student name.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1.5 text-indigo-600 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
              Open
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
          </button>

          {/* Attendance */}
          <button
            onClick={() => router.push("/attendance")}
            className="group text-left bg-[#C8E6C9] border border-gray-200 rounded-2xl p-6 hover:border-indigo-400 hover:shadow-md transition-all duration-200 ring-1 ring-black/5 focus:outline-none flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-5 group-hover:bg-indigo-100 transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4-4v2"/>
                  <circle cx="9" cy="7" r="4"/>
                  <path d="M22 11l-2 2-2-2"/>
                  <path d="M20 13V7"/>
                </svg>
              </div>
              <h2 className="text-base font-bold text-gray-900 mb-2">Attendance</h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                Mark student attendance during scanning. Filter by school, grade, section, and subject.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1.5 text-indigo-600 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
              Open
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
          </button>

          {/* Scanning Scoreboard (per-batch upload-completeness buckets) */}
          <button
            onClick={() => router.push("/wall/scoreboard")}
            className="group text-left bg-[#EBECCC] border border-gray-200 rounded-2xl p-6 hover:border-indigo-400 hover:shadow-md transition-all duration-200 ring-1 ring-black/5 focus:outline-none flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-5 group-hover:bg-indigo-100 transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="6" y1="20" x2="6" y2="10"/>
                  <line x1="12" y1="20" x2="12" y2="4"/>
                  <line x1="18" y1="20" x2="18" y2="14"/>
                </svg>
              </div>
              <h2 className="text-base font-bold text-gray-900 mb-2">Scanning Scoreboard</h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                Per-batch scoreboard of scanned papers — green when every expected student has arrived, red on misplaced or failed scans.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1.5 text-indigo-600 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
              Open
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
          </button>

          {/* Health Check (OCR + workflow health) */}
          <button
            onClick={() => router.push("/healthCheck")}
            className="group text-left bg-[#D3E4CD] border border-gray-200 rounded-2xl p-6 hover:border-indigo-400 hover:shadow-md transition-all duration-200 ring-1 ring-black/5 focus:outline-none flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-5 group-hover:bg-indigo-100 transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
                </svg>
              </div>
              <h2 className="text-base font-bold text-gray-900 mb-2">Health Check</h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                OCR quality over the last 24 hours, freshest completed students, re-extraction consensus, stuck workflows and failures.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1.5 text-indigo-600 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
              Open
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
          </button>

          {/* AI Workflows (error classification + OCR sweeps run by heron) */}
          { canRunAiWorkflows && (
          <button
            onClick={() => router.push("/aiWorkflows")}
            className="group text-left bg-[#DDD6FE] border border-gray-200 rounded-2xl p-6 hover:border-indigo-400 hover:shadow-md transition-all duration-200 ring-1 ring-black/5 focus:outline-none flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-5 group-hover:bg-indigo-100 transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="4" width="16" height="16" rx="2"/>
                  <rect x="9" y="9" width="6" height="6"/>
                  <line x1="9" y1="1" x2="9" y2="4"/>
                  <line x1="15" y1="1" x2="15" y2="4"/>
                  <line x1="9" y1="20" x2="9" y2="23"/>
                  <line x1="15" y1="20" x2="15" y2="23"/>
                  <line x1="20" y1="9" x2="23" y2="9"/>
                  <line x1="20" y1="14" x2="23" y2="14"/>
                  <line x1="1" y1="9" x2="4" y2="9"/>
                  <line x1="1" y1="14" x2="4" y2="14"/>
                </svg>
              </div>
              <h2 className="text-base font-bold text-gray-900 mb-2">AI Workflows</h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                Have an agent say what went wrong in each answer that lost marks, or re-read the scans to correct the stored text. Check readiness, start a run, watch it, apply the result.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1.5 text-indigo-600 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
              Open
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
          </button>
          )}

          {/* Ops TO-DO (answers with no bounding box, raised by AI Workflows) */}
          { canRunAiWorkflows && (
          <button
            onClick={() => router.push("/opsTodo")}
            className="group text-left bg-[#FDE68A] border border-gray-200 rounded-2xl p-6 hover:border-indigo-400 hover:shadow-md transition-all duration-200 ring-1 ring-black/5 focus:outline-none flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-5 group-hover:bg-indigo-100 transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="8" y="2" width="8" height="4" rx="1"/>
                  <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
                  <path d="m9 14 2 2 4-4"/>
                </svg>
              </div>
              <h2 className="text-base font-bold text-gray-900 mb-2">Ops TO-DO</h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                Answers that lost marks but have no bounding box drawn. Open each one in Answer Chunking, draw the box, and the entry clears itself.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1.5 text-indigo-600 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
              Open
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
          </button>
          )}

          {/* Batch Management */}
          <button
            onClick={() => router.push("/batches")}
            className="group text-left bg-[#E79897] border border-gray-200 rounded-2xl p-6 hover:border-indigo-400 hover:shadow-md transition-all duration-200 ring-1 ring-black/5 focus:outline-none flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-5 group-hover:bg-indigo-100 transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="2" y="3" width="20" height="4" rx="1"/>
                  <rect x="2" y="10" width="20" height="4" rx="1"/>
                  <rect x="2" y="17" width="20" height="4" rx="1"/>
                </svg>
              </div>
              <h2 className="text-base font-bold text-gray-900 mb-2">Batch Management</h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                Create and manage batches. Ingest ZIP student sheets and monitor progress.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1.5 text-indigo-600 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
              Open
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
          </button>

          {/* Config Management */}
          <button
            onClick={() => router.push("/config")}
            className="group text-left bg-[#E9C5D1] border border-gray-200 rounded-2xl p-6 hover:border-indigo-400 hover:shadow-md transition-all duration-200 ring-1 ring-black/5 focus:outline-none flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-5 group-hover:bg-indigo-100 transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="21" x2="4" y2="14"/>
                  <line x1="4" y1="10" x2="4" y2="3"/>
                  <line x1="12" y1="21" x2="12" y2="12"/>
                  <line x1="12" y1="8" x2="12" y2="3"/>
                  <line x1="20" y1="21" x2="20" y2="16"/>
                  <line x1="20" y1="12" x2="20" y2="3"/>
                  <line x1="1" y1="14" x2="7" y2="14"/>
                  <line x1="9" y1="8" x2="15" y2="8"/>
                  <line x1="17" y1="16" x2="23" y2="16"/>
                </svg>
              </div>
              <h2 className="text-base font-bold text-gray-900 mb-2">Config Management</h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                Manage the canonical subjects and sections that feed dropdowns across the app.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1.5 text-indigo-600 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
              Open
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
          </button>

          {/* Reconciliation */}
          <button
            onClick={() => router.push("/reconcile")}
            className="group text-left bg-[#DCA278] border border-gray-200 rounded-2xl p-6 hover:border-indigo-400 hover:shadow-md transition-all duration-200 ring-1 ring-black/5 focus:outline-none flex flex-col justify-between"
          >
            <div>
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-5 group-hover:bg-indigo-100 transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="16 3 21 3 21 8"/>
                  <line x1="4" y1="20" x2="21" y2="3"/>
                  <polyline points="21 16 21 21 16 21"/>
                  <line x1="15" y1="15" x2="21" y2="21"/>
                  <line x1="4" y1="4" x2="9" y2="9"/>
                </svg>
              </div>
              <h2 className="text-base font-bold text-gray-900 mb-2">Reconciliation</h2>
              <p className="text-xs text-gray-500 leading-relaxed">
                Match ingested batch students to the IT-dept roster and attach admission numbers.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-1.5 text-indigo-600 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
              Open
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
          </button>

          {/* Student Onboarding */}
          { isAdmin && (
            <button
            onClick={() => router.push("/students")}
            className="group text-left bg-[#FCC88A] border border-gray-200 rounded-2xl p-8 hover:border-indigo-400 hover:shadow-md transition-all duration-200 ring-1 ring-black/5 focus:outline-none"
          >
            <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-5 group-hover:bg-indigo-100 transition-colors">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4-4v2"/>
                <circle cx="8.5" cy="7" r="4"/>
                <line x1="20" y1="8" x2="20" y2="14"/>
                <line x1="23" y1="11" x2="17" y2="11"/>
              </svg>
            </div>
            <h2 className="text-lg font-bold text-gray-900 mb-2">Student Onboarding</h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              Upload student list via Excel. Register students with admission numbers for tracking.
            </p>
            <div className="mt-6 flex items-center gap-1.5 text-indigo-600 text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
              Open
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M5 12h14M12 5l7 7-7 7"/>
              </svg>
            </div>
          </button>
          )

          }

          {/* OCR Eval */}
          { isAdmin && (
            <button
              onClick={() => router.push("/eval/glm-ocr")}
              className="group text-left bg-[#CDD4B1] border border-gray-200 rounded-2xl p-6 hover:border-indigo-400 hover:shadow-md transition-all duration-200 ring-1 ring-black/5 focus:outline-none flex flex-col justify-between"
            >
              <div>
                <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-5 group-hover:bg-indigo-100 transition-colors">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3L22 4"/>
                    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
                  </svg>
                </div>
                <h2 className="text-base font-bold text-gray-900 mb-2">OCR Eval</h2>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Score GLM-OCR against a versioned test set. Track CER/WER history and pin a baseline.
                </p>
              </div>
              <div className="mt-6 flex items-center gap-1.5 text-indigo-600 text-xs font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                Open
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
              </div>
            </button>
          )
          }

          {/* Push to LOAM */}
          { isAdmin && (
            <button
              onClick={() => router.push("/push")}
              className="group text-left bg-[#d2e7d6] border border-gray-200 rounded-2xl p-8 hover:border-indigo-400 hover:shadow-md transition-all duration-200 ring-1 ring-black/5 focus:outline-none"
            >
              <div className="w-12 h-12 bg-indigo-50 rounded-xl flex items-center justify-center mb-5 group-hover:bg-indigo-100 transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 19V5M5 12l7-7 7 7" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-gray-900 mb-2">Push to LOAM</h2>
              <p className="text-sm text-gray-500 leading-relaxed">
                Push verified scan data to the LOAM dashboard.
              </p>
              <div className="mt-6 flex items-center gap-1.5 text-indigo-600 text-sm font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                Open
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 12h14M12 5l7 7-7 7" />
                </svg>
              </div>
            </button>
          )
          }

        </div>
      </div>
    </div>
  );
}