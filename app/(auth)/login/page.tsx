"use client";

import { useState, FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { login } from "@/app/lib/auth";

type Status = "idle" | "loading" | "success" | "error";

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const router = useRouter();

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setStatus("loading");
    setErrorMessage("");

    try {
      await login(email, password);
      setStatus("success");
      router.push("/");
    } catch (err) {
      setStatus("error");
      setErrorMessage(
        err instanceof Error ? err.message : "Something went wrong"
      );
      // reset back to idle after 3 seconds
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="w-[600px] bg-white rounded-2xl shadow-md ring-1 ring-black/5 px-16 py-14">

        {/* Logo */}
        <div className="flex items-center justify-center gap-4 mb-10">
          <div className=" flex items-center justify-center shrink-0">
            <img
            src="/beaver1.jpg"
            alt="Beaver"
            className="w-64 h-64 mx-auto  rounded-full object-cover "
          />
          </div>
          {/* <span className="text-3xl font-bold tracking-wider text-gray-900">
            OPS-HUB
          </span> */}
        </div>

        {/* Heading */}
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Sign in</h2>
        <p className="text-base text-gray-500 mb-10">Internal access only</p>

        {/* Error Message */}
        {status === "error" && (
          <div className="mb-6 px-5 py-4 bg-red-50 border border-red-200 rounded-xl text-red-600 text-base">
            {errorMessage}
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin} autoComplete="off" className="space-y-6">

          {/* Email */}
          <div className="space-y-2.5">
            <label className="block text-base font-medium text-gray-600">
              Email
            </label>
            <input
              type="text"
              placeholder="you@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={status === "loading"}
              className="w-full h-14 px-5 text-lg text-gray-900 bg-white border border-gray-200 rounded-xl outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 placeholder:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
            />
          </div>

          {/* Password */}
          <div className="space-y-2.5">
            <label className="block text-base font-medium text-gray-600">
              Password
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={status === "loading"}
                className="w-full h-14 px-5 pr-14 text-lg text-gray-900 bg-white border border-gray-200 rounded-xl outline-none transition focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/10 placeholder:text-gray-400 disabled:opacity-50 disabled:cursor-not-allowed"
              />
              <button
                type="button"
                tabIndex={-1}
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition"
              >
                {showPassword ? <EyeOff size={24} /> : <Eye size={24} />}
              </button>
            </div>
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={status !== "idle"}
            className="w-full h-14 mt-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 disabled:cursor-not-allowed text-white text-lg font-semibold rounded-xl transition"
          >
            {status === "loading" && "Signing in…"}
            {status === "success" && "✓ Access granted"}
            {status === "error"   && "Try again"}
            {status === "idle"    && "Sign In"}
          </button>

        </form>

        {/* Footer */}
        <p className="mt-8 text-center text-base text-gray-400">
          Issues? Ping{" "}
          <span className="font-semibold text-gray-500">#ops-hub-support</span>
        </p>

      </div>
    </main>
  );
}