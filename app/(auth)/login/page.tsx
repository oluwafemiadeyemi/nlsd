"use client";

import { useState, useCallback, useEffect } from "react";

import { motion } from "framer-motion";
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

// Head positions (% of visible container) — adjusted for object-cover crop
// The landscape image is horizontally cropped in the portrait container,
// so only the 3 central people are reliably visible on most viewports.
const HEAD_POSITIONS = [
  { x: 16, y: 20 },  // standing woman (curly hair) — center of hair
  { x: 47, y: 24 },  // center man (cream jacket)
  { x: 79, y: 24 },  // right man (green jacket) — center of head
];

function PartyHat() {
  return (
    <svg width="40" height="48" viewBox="0 0 40 48" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Hat cone */}
      <path d="M20 2L6 40H34L20 2Z" fill="url(#hatGradient)" stroke="#1E40AF" strokeWidth="1.5" />
      {/* Stripes */}
      <path d="M14 25L20 8L26 25" stroke="rgba(255,255,255,0.4)" strokeWidth="2" />
      <path d="M10 33L20 12L30 33" stroke="rgba(255,255,255,0.25)" strokeWidth="1.5" />
      {/* Brim */}
      <ellipse cx="20" cy="40" rx="16" ry="4" fill="#1E3A8A" />
      {/* Pom-pom */}
      <circle cx="20" cy="3" r="3.5" fill="#FACC15" />
      <circle cx="20" cy="3" r="2" fill="#FDE68A" />
      {/* Sparkles around pom-pom */}
      <line x1="20" y1="-4" x2="20" y2="-7" stroke="#FACC15" strokeWidth="1.2" strokeLinecap="round">
        <animate attributeName="opacity" values="1;0.2;1" dur="2s" repeatCount="indefinite" />
      </line>
      <line x1="26" y1="-1" x2="28.5" y2="-3" stroke="#FDE68A" strokeWidth="1.2" strokeLinecap="round">
        <animate attributeName="opacity" values="0.2;1;0.2" dur="2s" repeatCount="indefinite" />
      </line>
      <line x1="14" y1="-1" x2="11.5" y2="-3" stroke="#FDE68A" strokeWidth="1.2" strokeLinecap="round">
        <animate attributeName="opacity" values="0.6;1;0.6" dur="2s" repeatCount="indefinite" />
      </line>
      <line x1="24" y1="5" x2="27" y2="6" stroke="#FACC15" strokeWidth="1" strokeLinecap="round">
        <animate attributeName="opacity" values="1;0.3;1" dur="2.5s" repeatCount="indefinite" />
      </line>
      <line x1="16" y1="5" x2="13" y2="6" stroke="#FACC15" strokeWidth="1" strokeLinecap="round">
        <animate attributeName="opacity" values="0.3;1;0.3" dur="2.5s" repeatCount="indefinite" />
      </line>
      <circle cx="25" cy="-3" r="0.8" fill="#FACC15">
        <animate attributeName="opacity" values="0;1;0" dur="3s" repeatCount="indefinite" />
      </circle>
      <circle cx="14" cy="-4" r="0.8" fill="#FDE68A">
        <animate attributeName="opacity" values="1;0;1" dur="3s" repeatCount="indefinite" />
      </circle>
      {/* Sparkles on hat body */}
      <circle cx="18" cy="15" r="0.9" fill="#FFFFFF">
        <animate attributeName="opacity" values="0;1;0" dur="3.5s" repeatCount="indefinite" />
      </circle>
      <circle cx="23" cy="22" r="0.7" fill="#FFFFFF">
        <animate attributeName="opacity" values="1;0;1" dur="2.8s" repeatCount="indefinite" />
      </circle>
      <circle cx="15" cy="28" r="0.8" fill="#BFDBFE">
        <animate attributeName="opacity" values="0.3;1;0.3" dur="2.4s" repeatCount="indefinite" />
      </circle>
      <circle cx="25" cy="33" r="0.7" fill="#FFFFFF">
        <animate attributeName="opacity" values="0;0.8;0" dur="3.2s" repeatCount="indefinite" />
      </circle>
      <circle cx="12" cy="35" r="0.6" fill="#BFDBFE">
        <animate attributeName="opacity" values="1;0.2;1" dur="2.6s" repeatCount="indefinite" />
      </circle>
      <circle cx="28" cy="26" r="0.6" fill="#FFFFFF">
        <animate attributeName="opacity" values="0.5;1;0.5" dur="3.5s" repeatCount="indefinite" />
      </circle>
      {/* Dots */}
      <circle cx="16" cy="20" r="1.5" fill="#FACC15" />
      <circle cx="24" cy="28" r="1.5" fill="#38BDF8" />
      <circle cx="13" cy="32" r="1.2" fill="#FB923C" />
      <circle cx="27" cy="18" r="1.2" fill="#4ADE80" />
      <defs>
        <linearGradient id="hatGradient" x1="20" y1="2" x2="20" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3B82F6" />
          <stop offset="1" stopColor="#1E3A8A" />
        </linearGradient>
      </defs>
    </svg>
  );
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
  const [hatIndex, setHatIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setHatIndex((prev) => (prev + 1) % HEAD_POSITIONS.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

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
    <div className="min-h-screen flex relative">

      {/* Left — Auth form */}
      <div className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-10 relative" style={{ background: "linear-gradient(135deg, hsl(221 83% 48%) 0%, hsl(221 83% 28%) 100%)" }}>
        {/* Dotted mesh grid overlay */}
        <div
          className="absolute inset-0 pointer-events-none overflow-hidden"
        >
          <div
            className="absolute inset-[-50%] w-[200%] h-[200%]"
            style={{
              backgroundImage:
                "repeating-linear-gradient(0deg, transparent, transparent 19px, rgba(255,255,255,0.04) 19px, rgba(255,255,255,0.04) 20px), repeating-linear-gradient(90deg, transparent, transparent 19px, rgba(255,255,255,0.04) 19px, rgba(255,255,255,0.04) 20px)",
              transform: "rotate(45deg)",
              transformOrigin: "center center",
            }}
          />
        </div>
        <div className="w-full max-w-[420px]">
          {/* Auth Card — outer container */}
          <div className="rounded-2xl bg-white border border-white/50 shadow-lg overflow-hidden">
            {/* Logo section */}
            <div className="px-6 py-2 sm:px-8 sm:py-3 flex justify-center">
              <img src="/company-logo.jpg" alt="NLSD" className="h-24 w-auto object-contain" />
            </div>

            {/* Form section — inner rounded container */}
            <div className="rounded-2xl bg-gray-100 px-6 pt-6 pb-5 sm:px-8 sm:pt-8 sm:pb-6">
            {/* Header */}
            <div className="mb-4">
              <h1 className="text-2xl font-bold text-gray-900">
                {mode === "signin" && "Sign In"}
                {mode === "signup" && "Create Account"}
                {mode === "forgot" && "Reset Password"}
              </h1>
              <p className="text-sm text-gray-600 mt-1">
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
                  <label className="block text-sm font-medium text-gray-800 mb-1.5">Email</label>
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
                        "bg-white focus:bg-white outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
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
                    <label className="block text-sm font-medium text-gray-800 mb-1.5">Password</label>
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
                          "bg-white focus:bg-white outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
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
                    <label className="block text-sm font-medium text-gray-800 mb-1.5">Confirm password</label>
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
                          "bg-white focus:bg-white outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary",
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
                  <div className="flex-1 h-px bg-gray-300" />
                  <span className="text-xs text-gray-500">or</span>
                  <div className="flex-1 h-px bg-gray-300" />
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
                  className="w-full py-2.5 rounded-xl border border-gray-300 bg-white text-gray-800 font-semibold text-sm flex items-center justify-center gap-2.5 hover:bg-gray-50 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
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
              <div className="mt-4 text-center text-sm text-gray-600">
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
          </div>

          {/* Footer */}
          <p className="mt-4 text-center text-xs text-gray-400">
            &copy; {new Date().getFullYear()} NLSD. All rights reserved.
          </p>
        </div>
      </div>

      {/* Right — Full-size image with party hat (hidden on mobile) */}
      <div className="hidden lg:block lg:w-1/2 relative">
        <img
          src="/auth-image.jpg"
          alt=""
          className="h-full w-full object-cover"
        />
        {/* Animated party hat overlay */}
        <motion.div
          className="absolute pointer-events-none"
          animate={{
            left: `${HEAD_POSITIONS[hatIndex % HEAD_POSITIONS.length].x}%`,
            top: `${HEAD_POSITIONS[hatIndex % HEAD_POSITIONS.length].y}%`,
          }}
          transition={{
            type: "spring",
            stiffness: 120,
            damping: 14,
            mass: 0.8,
          }}
          style={{
            transform: "translate(-50%, -85%)",
            filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))",
          }}
        >
          <motion.div
            key={hatIndex}
            initial={{ scale: 0.3, rotate: -20, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{
              type: "spring",
              stiffness: 200,
              damping: 12,
            }}
          >
            <PartyHat />
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
