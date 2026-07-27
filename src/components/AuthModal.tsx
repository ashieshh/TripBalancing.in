import { useState, useEffect, FormEvent } from "react";
import { Mail, Lock, User, Compass, AlertCircle, ArrowRight, ArrowLeft, Check, KeyRound } from "lucide-react";
import { db } from "../lib/supabase";

interface AuthModalProps {
  onSuccess: (user: any) => void;
  onClose?: () => void;
}

export default function AuthModal({ onSuccess, onClose }: AuthModalProps) {
  const [view, setView] = useState<"login" | "register" | "forgot_password" | "create_new_password">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  
  // States for new password setting
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Check on mount if we've been redirected with password recovery parameters in the URL
  useEffect(() => {
    const hash = window.location.hash;
    const search = window.location.search;
    if (
      hash.includes("type=recovery") || 
      hash.includes("access_token=") || 
      search.includes("mode=reset") ||
      search.includes("type=recovery")
    ) {
      setView("create_new_password");
      setError(null);
      setSuccessMsg(null);
    }
  }, []);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (view === "login") {
        const { data, error: err } = await db.signIn(email, password);
        if (err) throw err;
        if (data?.user) {
          onSuccess(data.user);
        }
      } else {
        const { data, error: err } = await db.signUp(email, password, fullName);
        if (err) throw err;
        if (data?.user) {
          onSuccess(data.user);
        }
      }
    } catch (err: any) {
      setError(err.message || "An error occurred during authentication.");
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }

    setLoading(true);
    try {
      const { error: err } = await db.resetPasswordForEmail(email);
      if (err) throw err;

      // Consistent security best practice success message
      setSuccessMsg("If an account exists with this email, a password reset link has been sent.");
    } catch (err: any) {
      setError(err.message || "An error occurred while sending the password reset email.");
    } finally {
      setLoading(false);
    }
  };

  const handleCreateNewPasswordSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    // Validate that the password is at least 8 characters long
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }

    // Validate that both passwords match
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const { error: err } = await db.updateUserPassword(newPassword);
      if (err) throw err;

      // Clean up the query parameters or hash from the URL so the user is not stuck in reset mode on reload
      window.history.pushState({}, "", window.location.origin);

      // Reset local password fields and redirect
      setView("login");
      setNewPassword("");
      setConfirmPassword("");
      setPassword("");
      setSuccessMsg("Your password has been reset successfully. Please log in.");
    } catch (err: any) {
      setError(err.message || "Failed to reset your password. The reset link might be expired or invalid.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const { data, error: err } = await db.signInWithGoogle();
      if (err) throw err;
      if (data && 'user' in data && (data as any).user) {
        onSuccess((data as any).user);
      }
    } catch (err: any) {
      setError(err.message || "Failed to sign in with Google.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto overflow-hidden bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-900 rounded-3xl shadow-xl">
      {/* Visual Header */}
      <div className="relative p-8 text-center text-white bg-gradient-to-r from-teal-500 via-emerald-500 to-cyan-500">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-white/20 via-transparent to-transparent pointer-events-none" />
        <div className="inline-flex items-center justify-center p-3 mb-3 bg-white/20 backdrop-blur-md rounded-2xl">
          <Compass className="w-8 h-8 text-white animate-spin-slow" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight">Welcome to TripBalancing</h2>
        <p className="mt-1.5 text-[11px] text-teal-50/90 font-medium italic max-w-[280px] mx-auto leading-tight">
          "Every Journey Begins Beyond the Horizon."
        </p>
        <p className="mt-2 text-sm text-teal-50 font-medium">
          {view === "login" && "Your next journey starts here"}
          {view === "register" && "Join our global travel community"}
          {view === "forgot_password" && "Recover your account credentials"}
          {view === "create_new_password" && "Secure your traveler account"}
        </p>
      </div>

      <div className="p-8">
        {/* Supabase Mock Notice */}
        {db.isMock && (view === "login" || view === "register") && (
          <div className="p-3 mb-5 border rounded-2xl bg-amber-50/50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/40 text-amber-800 dark:text-amber-300 text-xs leading-relaxed">
            <span className="font-semibold block mb-0.5">💡 Instant Demo Account Mode:</span>
            No real credentials needed to test! Just type any email and you will be signed in instantly.
          </div>
        )}

        {/* Tab Selector (only for Login and Register views) */}
        {(view === "login" || view === "register") && (
          <div className="flex p-1 mb-6 bg-slate-100 dark:bg-slate-900 rounded-2xl">
            <button
              id="auth-login-tab"
              type="button"
              onClick={() => { setView("login"); setError(null); setSuccessMsg(null); }}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all ${
                view === "login"
                  ? "bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              Log In
            </button>
            <button
              id="auth-register-tab"
              type="button"
              onClick={() => { setView("register"); setError(null); setSuccessMsg(null); }}
              className={`flex-1 py-2.5 text-sm font-semibold rounded-xl transition-all ${
                view === "register"
                  ? "bg-white dark:bg-slate-800 text-teal-600 dark:text-teal-400 shadow-sm"
                  : "text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200"
              }`}
            >
              Create Account
            </button>
          </div>
        )}

        {error && (
          <div className="flex items-start gap-2.5 p-4 mb-5 border rounded-2xl bg-rose-50/50 dark:bg-rose-950/10 border-rose-100 dark:border-rose-900/30 text-rose-800 dark:text-rose-400 text-sm leading-relaxed">
            <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-500 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="flex items-start gap-2.5 p-4 mb-5 border rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/10 border-emerald-100 dark:border-emerald-900/30 text-emerald-800 dark:text-emerald-400 text-sm leading-relaxed">
            <Check className="w-5 h-5 flex-shrink-0 text-emerald-500 mt-0.5" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* 1. Login or Registration Form */}
        {(view === "login" || view === "register") && (
          <form onSubmit={handleSubmit} className="space-y-4">
            {view === "register" && (
              <div className="space-y-1.5">
                <label htmlFor="fullName" className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">
                  Full Name
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none">
                    <User className="w-4 h-4" />
                  </span>
                  <input
                    id="fullName"
                    type="text"
                    placeholder="John Doe"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-800 dark:text-slate-200 text-sm transition-colors"
                    required={view === "register"}
                  />
                </div>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="email" className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">
                Email Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none">
                  <Mail className="w-4 h-4" />
                </span>
                <input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-800 dark:text-slate-200 text-sm transition-colors"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="password" className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">
                  Password
                </label>
                {view === "login" && (
                  <button
                    type="button"
                    onClick={() => { setView("forgot_password"); setError(null); setSuccessMsg(null); }}
                    className="text-xs font-bold text-teal-600 dark:text-teal-400 hover:underline cursor-pointer focus:outline-none"
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  id="password"
                  type="password"
                  placeholder={view === "login" ? "Enter password" : "Create strong password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-800 dark:text-slate-200 text-sm transition-colors"
                  required
                />
              </div>
            </div>

            <button
              id="auth-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 disabled:opacity-50 text-white font-semibold rounded-xl shadow-md shadow-teal-500/10 cursor-pointer transition-colors mt-2 text-sm"
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  {view === "login" ? "Log In" : "Get Started"}
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* 2. Forgot Password Request Form */}
        {view === "forgot_password" && (
          <form onSubmit={handleForgotPasswordSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="forgot-email" className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">
                Email Address
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none">
                  <Mail className="w-4 h-4" />
                </span>
                <input
                  id="forgot-email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-800 dark:text-slate-200 text-sm transition-colors"
                  required
                />
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed font-semibold">
                Enter your email address and we'll send you a secure link to create a new password.
              </p>
            </div>

            <button
              id="forgot-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 disabled:opacity-50 text-white font-semibold rounded-xl shadow-md shadow-teal-500/10 cursor-pointer transition-colors text-sm"
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  Send Reset Link
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>

            {/* Simulated Link in Developer Mock Mode */}
            {db.isMock && email && (
              <div className="p-4 mt-4 border rounded-2xl bg-teal-50/50 dark:bg-teal-950/20 border-teal-100 dark:border-teal-900/40 text-xs text-teal-800 dark:text-teal-300 space-y-2">
                <p className="font-extrabold flex items-center gap-1 text-[11px] uppercase tracking-wider">
                  💡 Developer Mode: Instant Sandbox Simulator
                </p>
                <p className="font-medium text-slate-500 dark:text-slate-400">
                  Since you are offline, you can instantly test entering the secure password reset screen by clicking below:
                </p>
                <button
                  type="button"
                  onClick={() => {
                    const newUrl = `${window.location.origin}?mode=reset&email=${encodeURIComponent(email)}`;
                    window.history.pushState({}, "", newUrl);
                    setView("create_new_password");
                    setError(null);
                    setSuccessMsg(null);
                  }}
                  className="w-full py-2 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl cursor-pointer text-[10px] uppercase tracking-wider text-center"
                >
                  Simulate Reset Link Click
                </button>
              </div>
            )}

            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => { setView("login"); setError(null); setSuccessMsg(null); }}
                className="text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:underline flex items-center gap-1 cursor-pointer focus:outline-none"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Back to Log In
              </button>
            </div>
          </form>
        )}

        {/* 3. New Password Entry Form (Secure Recovery Page) */}
        {view === "create_new_password" && (
          <form onSubmit={handleCreateNewPasswordSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label htmlFor="new-password" className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">
                New Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none">
                  <KeyRound className="w-4 h-4" />
                </span>
                <input
                  id="new-password"
                  type="password"
                  placeholder="At least 8 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-800 dark:text-slate-200 text-sm transition-colors"
                  required
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="confirm-password" className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider block">
                Confirm Password
              </label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none">
                  <Lock className="w-4 h-4" />
                </span>
                <input
                  id="confirm-password"
                  type="password"
                  placeholder="Confirm new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 rounded-xl focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 text-slate-800 dark:text-slate-200 text-sm transition-colors"
                  required
                />
              </div>
            </div>

            <button
              id="reset-submit-btn"
              type="submit"
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600 disabled:opacity-50 text-white font-semibold rounded-xl shadow-md shadow-teal-500/10 cursor-pointer transition-colors text-sm"
            >
              {loading ? (
                <span className="inline-block w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <>
                  Reset Password
                  <Check className="w-4 h-4" />
                </>
              )}
            </button>

            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => { setView("login"); setError(null); setSuccessMsg(null); }}
                className="text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-teal-600 dark:hover:text-teal-400 hover:underline flex items-center gap-1 cursor-pointer focus:outline-none"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Cancel and Log In
              </button>
            </div>
          </form>
        )}

        {/* Separator & Google OAuth (only for Login and Register views) */}
        {(view === "login" || view === "register") && (
          <>
            <div className="relative flex py-5 items-center">
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
              <span className="flex-shrink mx-4 text-slate-400 text-xs font-medium uppercase tracking-wider bg-white dark:bg-slate-950">Or continue with</span>
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
            </div>

            <button
              id="auth-google-btn"
              type="button"
              onClick={handleGoogleSignIn}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2.5 py-3 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900 text-slate-700 dark:text-slate-300 font-semibold rounded-xl cursor-pointer text-sm transition-colors"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24">
                <path
                  fill="currentColor"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  className="text-[#4285F4]"
                />
                <path
                  fill="currentColor"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  className="text-[#34A853]"
                />
                <path
                  fill="currentColor"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                  className="text-[#FBBC05]"
                />
                <path
                  fill="currentColor"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                  className="text-[#EA4335]"
                />
              </svg>
              Google
            </button>
          </>
        )}
      </div>
    </div>
  );
}
