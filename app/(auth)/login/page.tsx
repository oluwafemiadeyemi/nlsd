"use client";

import { useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { Loader2, Eye, EyeOff, Mail, Lock, ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type AuthMode = "signin" | "signup" | "forgot";

function getPasswordStrength(password: string) {
  if (!password) return { score: 0, label: "", color: "" };
  let score = 0;
  if (password.length >= 6) score++;
  if (password.length >= 10) score++;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[^a-zA-Z0-9]/.test(password)) score++;
  score = Math.min(score, 4);
  const levels = [
    { label: "Very Weak", color: "bg-red-500" },
    { label: "Weak", color: "bg-orange-500" },
    { label: "Fair", color: "bg-yellow-500" },
    { label: "Good", color: "bg-blue-500" },
    { label: "Strong", color: "bg-emerald-500" },
  ];
  return { score, ...levels[score] };
}

export default function LoginPage() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmTouched, setConfirmTouched] = useState(false);

  function getFieldError(field: "email" | "password" | "confirm"): string | null {
    if (field === "email") {
      if (!emailTouched) return null;
      if (!email.trim()) return "Email is required";
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Please enter a valid email address";
    }
    if (field === "password") {
      if (!passwordTouched) return null;
      if (!password) return "Password is required";
      if (mode === "signin" && password.length < 6) return "Password must be at least 6 characters";
      if (mode === "signup" && password.length < 8) return "Password must be at least 8 characters";
    }
    if (field === "confirm") {
      if (!confirmTouched) return null;
      if (!confirmPassword) return "Please confirm your password";
      if (confirmPassword !== password) return "Passwords do not match";
    }
    return null;
  }

  const switchMode = useCallback((newMode: AuthMode) => {
    setIsTransitioning(true);
    setError(null);
    setMessage(null);
    setEmailTouched(false);
    setPasswordTouched(false);
    setConfirmTouched(false);
    setTimeout(() => {
      setMode(newMode);
      setPassword("");
      setConfirmPassword("");
      setShowPassword(false);
      setShowConfirmPassword(false);
      setTimeout(() => setIsTransitioning(false), 50);
    }, 150);
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    const supabase = createClient();

    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.href = "/dashboard";
        return;
      }
      if (mode === "signup") {
        if (confirmPassword !== password) {
          setError("Passwords do not match");
          setLoading(false);
          return;
        }
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setMessage("Check your email for a confirmation link to complete your registration.");
        setLoading(false);
        return;
      }
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/callback?next=/settings`,
        });
        if (error) throw error;
        setMessage("Password reset instructions have been sent to your email.");
        setLoading(false);
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setLoading(false);
    }
  }

  const strength = getPasswordStrength(password);

  return (
    <div className="min-h-screen flex">
      {/* Left — Auth form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-10" style={{ background: "#e8eaef" }}>
        <div className="w-full max-w-[420px]">
          {/* Auth Card */}
          <div className="rounded-2xl bg-white border border-gray-100 shadow-sm px-6 py-5 sm:px-8 sm:py-6">
            {/* Logo */}
            <div className="flex justify-center mb-4">
              <img src="/company-logo.jpg" alt="NLSD" className="h-20 w-auto object-contain" />
            </div>

            {/* Header */}
            <div className="mb-4">
              <h1 className="text-2xl font-bold text-gray-900">
                {mode === "signin" && "Sign In"}
                {mode === "signup" && "Create Account"}
                {mode === "forgot" && "Reset Password"}
              </h1>
              <p className="text-sm text-gray-400 mt-1">
                {mode === "signin" && "Enter your credentials to continue"}
                {mode === "signup" && "Fill in your details to get started"}
                {mode === "forgot" && "We\u2019ll send you a reset link"}
              </p>
            </div>

            {/* Error banner */}
            {error && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-100 text-red-600 text-sm flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0 text-xs font-bold text-red-500">!</span>
                <span>{error}</span>
              </div>
            )}

            {/* Success banner */}
            {message && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-700 text-sm flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>{message}</span>
              </div>
            )}

            {/* Form */}
            <div className={cn(
              "transition-all duration-200 ease-out",
              isTransitioning ? "opacity-0 translate-y-1" : "opacity-100 translate-y-0"
            )}>
              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Email */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      onBlur={() => setEmailTouched(true)}
                      placeholder="you@company.com"
                      required
                      className={cn(
                        "w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm transition-all duration-200",
                        "bg-gray-50 focus:bg-white outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
                        getFieldError("email") ? "border-red-300" : "border-gray-200"
                      )}
                    />
                  </div>
                  {getFieldError("email") && (
                    <p className="text-red-500 text-xs mt-1">{getFieldError("email")}</p>
                  )}
                </div>

                {/* Password */}
                {mode !== "forgot" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type={showPassword ? "text" : "password"}
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        onBlur={() => setPasswordTouched(true)}
                        placeholder={mode === "signup" ? "Min. 8 characters" : "Enter your password"}
                        required
                        minLength={mode === "signup" ? 8 : 6}
                        className={cn(
                          "w-full pl-10 pr-12 py-2.5 rounded-xl border text-sm transition-all duration-200",
                          "bg-gray-50 focus:bg-white outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
                          getFieldError("password") ? "border-red-300" : "border-gray-200"
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        tabIndex={-1}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    {getFieldError("password") && (
                      <p className="text-red-500 text-xs mt-1">{getFieldError("password")}</p>
                    )}

                    {/* Password strength (signup only) */}
                    {mode === "signup" && password.length > 0 && (
                      <div className="mt-2">
                        <div className="flex gap-1 mb-1">
                          {[0, 1, 2, 3].map((i) => (
                            <div key={i} className="h-1.5 flex-1 rounded-full bg-gray-100 overflow-hidden">
                              <div
                                className={cn(
                                  "h-full rounded-full transition-all duration-500",
                                  i < strength.score ? strength.color : "bg-transparent"
                                )}
                                style={{ width: i < strength.score ? "100%" : "0%" }}
                              />
                            </div>
                          ))}
                        </div>
                        <p className={cn(
                          "text-xs font-medium",
                          strength.score <= 1 ? "text-red-500" :
                          strength.score === 2 ? "text-yellow-600" :
                          strength.score === 3 ? "text-blue-600" :
                          "text-emerald-600"
                        )}>
                          {strength.label}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Confirm password (signup only) */}
                {mode === "signup" && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm password</label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type={showConfirmPassword ? "text" : "password"}
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        onBlur={() => setConfirmTouched(true)}
                        placeholder="Re-enter your password"
                        required
                        className={cn(
                          "w-full pl-10 pr-12 py-2.5 rounded-xl border text-sm transition-all duration-200",
                          "bg-gray-50 focus:bg-white outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
                          getFieldError("confirm")
                            ? "border-red-300"
                            : confirmPassword && confirmPassword === password
                              ? "border-emerald-300"
                              : "border-gray-200"
                        )}
                      />
                      <button
                        type="button"
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        tabIndex={-1}
                      >
                        {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                      {confirmPassword && confirmPassword === password && (
                        <div className="absolute right-10 top-1/2 -translate-y-1/2">
                          <Check className="w-4 h-4 text-emerald-500" />
                        </div>
                      )}
                    </div>
                    {getFieldError("confirm") && (
                      <p className="text-red-500 text-xs mt-1">{getFieldError("confirm")}</p>
                    )}
                  </div>
                )}

                {/* Forgot password link (signin only) */}
                {mode === "signin" && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => switchMode("forgot")}
                      className="text-sm text-primary hover:text-primary/80 font-medium"
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                {/* Submit */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-xl bg-primary text-white font-semibold text-sm flex items-center justify-center gap-2 hover:bg-primary/90 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      {mode === "signin" && "Sign In"}
                      {mode === "signup" && "Create Account"}
                      {mode === "forgot" && "Send Reset Link"}
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>

              {/* Divider */}
              {mode !== "forgot" && (
                <div className="flex items-center gap-3 my-4">
                  <div className="flex-1 h-px bg-gray-200" />
                  <span className="text-xs text-gray-400">or</span>
                  <div className="flex-1 h-px bg-gray-200" />
                </div>
              )}

              {/* Microsoft SSO */}
              {mode !== "forgot" && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={async () => {
                    setLoading(true);
                    setError(null);
                    const supabase = createClient();
                    const { error } = await supabase.auth.signInWithOAuth({
                      provider: "azure",
                      options: {
                        scopes: "openid profile email",
                        redirectTo: `${window.location.origin}/auth/callback`,
                      },
                    });
                    if (error) {
                      setError(error.message);
                      setLoading(false);
                    }
                  }}
                  className="w-full py-2.5 rounded-xl border border-gray-200 bg-white text-gray-700 font-semibold text-sm flex items-center justify-center gap-2.5 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                >
                  <svg className="w-4 h-4" viewBox="0 0 21 21" fill="none">
                    <rect x="1" y="1" width="9" height="9" fill="#F25022" />
                    <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
                    <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
                    <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
                  </svg>
                  Continue with Microsoft
                </button>
              )}

              {/* Mode switch links */}
              <div className="mt-4 text-center text-sm text-gray-500">
                {mode === "signin" && (
                  <p>
                    Don&apos;t have an account?{" "}
                    <button onClick={() => switchMode("signup")} className="text-primary font-semibold hover:text-primary/80">
                      Create one
                    </button>
                  </p>
                )}
                {mode === "signup" && (
                  <p>
                    Already have an account?{" "}
                    <button onClick={() => switchMode("signin")} className="text-primary font-semibold hover:text-primary/80">
                      Sign in
                    </button>
                  </p>
                )}
                {mode === "forgot" && (
                  <p>
                    Remember your password?{" "}
                    <button onClick={() => switchMode("signin")} className="text-primary font-semibold hover:text-primary/80">
                      Back to sign in
                    </button>
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Footer */}
          <p className="mt-4 text-center text-xs text-gray-400">
            &copy; {new Date().getFullYear()} NLSD. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right — Full-size image (hidden on mobile) */}
      <div className="hidden lg:block lg:w-1/2">
        <img
          src="/auth-image.jpg"
          alt=""
          className="h-full w-full object-cover"
        />
      </div>
    </div>
  );
}
