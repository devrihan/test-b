"use client";

import { useRouter } from "next/navigation";
import { UserPlus, GitPullRequest } from "lucide-react";

export default function StudentsPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50 px-6 py-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-lg font-bold text-gray-900 mb-6">Students</h1>

        <div className="space-y-3">
          <button
            onClick={() => router.push("/students/onboard")}
            className="w-full flex items-center gap-4 p-5 bg-white border border-gray-200 rounded-xl hover:border-indigo-300 hover:shadow-sm transition text-left"
          >
            <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center shrink-0">
              <UserPlus size={20} className="text-indigo-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800">Student Onboarding</p>
              <p className="text-xs text-gray-400 mt-0.5">Upload school Excel to register new students in the system</p>
            </div>
          </button>

          <button
            onClick={() => router.push("/students/reconcile")}
            className="w-full flex items-center gap-4 p-5 bg-white border border-gray-200 rounded-xl hover:border-indigo-300 hover:shadow-sm transition text-left"
          >
            <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center shrink-0">
              <GitPullRequest size={20} className="text-amber-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-gray-800">Student Reconciliation</p>
              <p className="text-xs text-gray-400 mt-0.5">Match students missing admission numbers with school records</p>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}