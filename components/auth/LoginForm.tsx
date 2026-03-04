"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2 } from "lucide-react";

export function LoginForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devEmail, setDevEmail] = useState("");
  const [devPassword, setDevPassword] = useState("");

  async function handleDevLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithPassword({
        email: devEmail,
        password: devPassword,
      });
      if (error) throw error;
      window.location.href = "/dashboard";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      setLoading(false);
    }
  }

  async function handleMicrosoftLogin() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "azure",
        options: {
          scopes: "openid profile email",
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            // Restrict to single tenant
            tenant: process.env.NEXT_PUBLIC_AZURE_TENANT_ID ?? "organizations",
          },
        },
      });
      if (error) throw error;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
      setLoading(false);
    }
  }

  return (
    <div className="bg-white/10 backdrop-blur-md border border-white/20 rounded-2xl p-8 shadow-2xl">
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-500/20 border border-red-500/30 text-red-200 text-sm">
          {error}
        </div>
      )}

      <button
        onClick={handleMicrosoftLogin}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3 px-4 py-3 bg-white text-slate-900 font-medium rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : (
          <MicrosoftIcon />
        )}
        <span>{loading ? "Signing in…" : "Continue with Microsoft"}</span>
      </button>

      <div className="flex items-center gap-3 my-5">
        <div className="flex-1 border-t border-white/20" />
        <span className="text-xs text-slate-400">or</span>
        <div className="flex-1 border-t border-white/20" />
      </div>

      <form onSubmit={handleDevLogin} className="space-y-3">
        <input
          type="email"
          placeholder="Email"
          value={devEmail}
          onChange={(e) => setDevEmail(e.target.value)}
          required
          className="w-full px-3 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <input
          type="password"
          placeholder="Password"
          value={devPassword}
          onChange={(e) => setDevPassword(e.target.value)}
          required
          className="w-full px-3 py-2.5 rounded-lg bg-white/10 border border-white/20 text-white placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 rounded-xl bg-blue-600 text-white font-medium text-sm hover:bg-blue-500 transition-colors disabled:opacity-50"
        >
          {loading ? <Loader2 className="w-4 h-4 animate-spin mx-auto" /> : "Sign In"}
        </button>
      </form>

      <p className="mt-5 text-center text-xs text-slate-400">
        By signing in, you agree to your organisation&apos;s data policies.
      </p>
    </div>
  );
}

function MicrosoftIcon() {
  return (
    <svg viewBox="0 0 21 21" className="w-5 h-5" fill="none">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}
