"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useRouter, usePathname } from "next/navigation";
import { Home, LogOut, User, LayoutGrid } from "lucide-react";
import { logout } from "../lib/auth";

// Slim top nav for the wall — gives the immersive canvas the same beaver chrome
// (logo → home, profile → sign out) as the dashboard screens, so the wall reads as
// part of beaver and stays navigable. It deliberately does NOT pull in beaver's
// full Header (which is wired to the dashboard's filter contexts and per-route
// bars); it reuses the same design system — Tailwind utilities, lucide icons, the
// shared `logout`/auth lib — in a self-contained bar. Beaver's globals.css (loaded
// app-wide) supplies the Tailwind layer; `.wall-nav` resets the font to Poppins.
export default function WallNav({ center }: { center?: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const onScoreboard = pathname?.startsWith("/wall/scoreboard");
  const [profileOpen, setProfileOpen] = useState(false);
  const [username, setUsername] = useState("ops.team");
  const [email, setEmail] = useState("");

  useEffect(() => {
    const raw =
      sessionStorage.getItem("keycloak_user") || localStorage.getItem("keycloak_user");
    if (!raw) return;
    try {
      const user = JSON.parse(raw);
      setUsername(user.name || user.username || "ops.team");
      setEmail(user.email || "");
    } catch {
      // invalid JSON — keep the fallback
    }
  }, []);

  return (
    <nav className="wall-nav flex items-center gap-4 h-14 px-4 bg-white border-b border-gray-200 shrink-0 z-30">
      {/* Left: logo (→ home) + wall title + explicit Home button */}
      <div className="flex items-center gap-3 min-w-0 shrink-0">
        <button
          onClick={() => router.push("/")}
          className="cursor-pointer shrink-0"
          aria-label="Beaver home"
        >
          <img
            src="/BeaverLogo3.png"
            alt="Beaver"
            className="w-9 h-9 rounded-full object-cover"
          />
        </button>
        <span className="text-base font-semibold text-gray-800 truncate hidden lg:block">The Beaver Wall</span>
        <button
          onClick={() => router.push("/")}
          className="flex items-center gap-1.5 h-8 px-3 ml-1 text-xs font-medium text-gray-600 hover:text-indigo-600 hover:border-indigo-400 border border-gray-200 rounded-lg transition shrink-0"
        >
          <Home size={13} /> Home
        </button>
        {!onScoreboard && (
          <button
            onClick={() => router.push("/wall/scoreboard")}
            className="flex items-center gap-1.5 h-8 px-3 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition shrink-0"
          >
            <LayoutGrid size={13} /> Scanning Scoreboard
          </button>
        )}
      </div>

      {/* Center: page-injected slot — the site-wide scope bar lives here (see nav spec:
          one navigation primitive for all of beaver). Empty on pages that don't use it. */}
      <div className="flex-1 min-w-0">{center}</div>

      {/* Right: profile → sign out */}
      <div className="relative shrink-0 ml-auto">
        <button
          onClick={() => setProfileOpen((v) => !v)}
          className="flex items-center gap-2 h-9 pl-1 pr-2.5 rounded-lg hover:bg-gray-100 transition"
          aria-label="Account menu"
        >
          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
            <User size={18} className="text-indigo-600" />
          </div>
        </button>

        {profileOpen && (
          <div className="absolute right-0 top-11 w-56 bg-white border border-gray-200 rounded-xl shadow-lg shadow-black/10 overflow-hidden z-50">
            <div className="px-4 py-3 border-b border-gray-100">
              <p className="text-sm font-semibold text-gray-800 truncate">{username}</p>
              {email && <p className="text-xs text-gray-400 mt-0.5 truncate">{email}</p>}
            </div>
            <button
              onClick={() => { setProfileOpen(false); logout(); }}
              className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition font-medium"
            >
              <LogOut size={15} /> Sign out
            </button>
          </div>
        )}
      </div>
    </nav>
  );
}
