"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { signIn } from "next-auth/react";
import { Shield } from "lucide-react";

type Tab = "signin" | "signup";
type Step = "auth" | "verify" | "2fa" | "forgot" | "reset_code" | "reset_password";

export default function SignInPage({ onSignIn }: { onSignIn: () => void }) {
  const [tab, setTab] = useState<Tab>("signin");
  const [step, setStep] = useState<Step>("auth");
  const [loading, setLoading] = useState<"google" | "email" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [verifyCode, setVerifyCode] = useState("");
  const [totpCode, setTotpCode] = useState("");
  const [pendingUserId, setPendingUserId] = useState<string | null>(null);
  const [needs2FA, setNeeds2FA] = useState(false);
  const [resetCode, setResetCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");

  const resetForm = () => {
    setStep("auth");
    setError(null);
    setVerifyCode("");
    setTotpCode("");
    setPendingUserId(null);
    setNeeds2FA(false);
    setResetCode("");
    setNewPassword("");
    setConfirmNewPassword("");
  };

  const handleGoogle = async () => {
    setLoading("google");
    try {
      await signIn("google", { callbackUrl: "/" });
    } finally {
      setLoading(null);
    }
  };

  const handleEmailSignup = async () => {
    setError(null);
    if (!email || !password) return setError("Email and password required");
    if (password !== confirmPassword) return setError("Passwords don't match");
    if (password.length < 8) return setError("Password must be at least 8 characters");

    setLoading("email");
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error);
      setPendingUserId(data.user_id);
      setStep("verify");
    } catch {
      setError("Signup failed");
    } finally {
      setLoading(null);
    }
  };

  const handleVerifyCode = async () => {
    setError(null);
    if (!verifyCode || verifyCode.length !== 6) return setError("Enter the 6-digit code");
    if (!pendingUserId) return setError("Session expired, please try again");

    setLoading("email");
    try {
      const res = await fetch("/api/auth/verify-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: pendingUserId, code: verifyCode }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error);

      const signInRes = await signIn("credentials", {
        redirect: false,
        action: "email_signin",
        email,
        password,
      });
      if (signInRes?.error) {
        setError("Verified! Please sign in.");
        setTab("signin");
        resetForm();
      } else {
        onSignIn();
      }
    } catch {
      setError("Verification failed");
    } finally {
      setLoading(null);
    }
  };

  const handleResendCode = async () => {
    if (!pendingUserId) return;
    await fetch("/api/auth/resend-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: pendingUserId, email }),
    });
    setError("Code resent!");
  };

  const handleEmailSignin = async () => {
    setError(null);
    if (!email || !password) return setError("Email and password required");

    setLoading("email");
    try {
      const res = await signIn("credentials", {
        redirect: false,
        action: "email_signin",
        email,
        password,
        totp_code: needs2FA ? totpCode : undefined,
      });

      if (res?.error) {
        if (res.error.includes("2FA_REQUIRED:")) {
          const userId = res.error.split("2FA_REQUIRED:")[1];
          setPendingUserId(userId);
          setNeeds2FA(true);
          setStep("2fa");
        } else {
          setError(res.error.replace("Error: ", ""));
        }
      } else {
        onSignIn();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setLoading(null);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    if (!email) return setError("Enter your email first");
    setLoading("email");
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error);
      setPendingUserId(data.user_id);
      setStep("reset_code");
    } catch {
      setError("Failed to send reset code");
    } finally {
      setLoading(null);
    }
  };

  const handleResetPassword = async () => {
    setError(null);
    if (!resetCode || resetCode.length !== 6) return setError("Enter the 6-digit code");
    if (!newPassword || newPassword.length < 8) return setError("Password must be at least 8 characters");
    if (newPassword !== confirmNewPassword) return setError("Passwords don't match");
    if (!pendingUserId) return setError("Session expired");
    setLoading("email");
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: pendingUserId, code: resetCode, new_password: newPassword }),
      });
      const data = await res.json();
      if (!res.ok) return setError(data.error);
      setStep("auth");
      setTab("signin");
      setPendingUserId(null);
      setError("Password reset! Sign in with your new password.");
      setResetCode("");
      setNewPassword("");
      setConfirmNewPassword("");
    } catch {
      setError("Failed to reset password");
    } finally {
      setLoading(null);
    }
  };

  const handle2FA = async () => {
    setError(null);
    if (!totpCode || totpCode.length !== 6) return setError("Enter the 6-digit code");
    setLoading("email");
    try {
      const res = await signIn("credentials", {
        redirect: false,
        action: "email_signin",
        email,
        password,
        totp_code: totpCode,
      });
      if (res?.error) {
        setError(res.error.replace("Error: ", ""));
      } else {
        onSignIn();
      }
    } catch {
      setError("2FA verification failed");
    } finally {
      setLoading(null);
    }
  };

  const Spinner = () => (
    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
  );

  const GoogleIcon = () => (
    <svg width="18" height="18" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
    </svg>
  );

  const inputClass = "field-surface w-full px-4 py-3 text-sm";

  return (
    <div className="min-h-[80vh] flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="panel w-full max-w-md p-10 flex flex-col gap-8 relative overflow-hidden"
      >
        <div className="flex flex-col items-center gap-4 text-center relative z-10">
          <div className="flex flex-col gap-1.5">
            <h1 className="font-display text-3xl font-bold tracking-[-0.025em]">
              Welcome to <span className="text-sa-blue">StreamArc</span>
            </h1>
            <p className="text-sm text-sa-text-3">Sign in to browse and publish streaming demos.</p>
          </div>
        </div>

        {step === "verify" && (
          <div className="flex flex-col gap-4">
            <div className="text-center space-y-1">
              <h2 className="text-xl font-bold">Verify your email</h2>
              <p className="text-sm text-sa-text-3">We sent a code to <span className="text-foreground">{email}</span></p>
            </div>
            <div className="flex justify-between gap-2">
              <input
                type="text"
                maxLength={6}
                placeholder="000000"
                value={verifyCode}
                onChange={e => setVerifyCode(e.target.value.replace(/\D/g, ""))}
                className="field-surface w-full h-14 text-center text-xl font-bold"
              />
            </div>
            {error && <p className="text-xs text-sa-red text-center">{error}</p>}
            <button type="button" onClick={handleVerifyCode} disabled={loading === "email"} className="btn btn-accent w-full">
              {loading === "email" ? <Spinner /> : "Verify Code"}
            </button>
            <button type="button" onClick={handleResendCode} className="text-sm text-sa-text-3 hover:text-white transition-colors text-center font-medium cursor-pointer bg-transparent border-none">
              Resend code
            </button>
            <button type="button" onClick={resetForm} className="text-sm text-sa-text-3 hover:text-foreground transition-colors text-center font-medium cursor-pointer bg-transparent border-none">
              ← Back
            </button>
          </div>
        )}

        {step === "2fa" && (
          <div className="flex flex-col gap-4">
            <div className="text-center space-y-1">
              <h2 className="text-xl font-bold">Two-factor authentication</h2>
              <p className="text-sm text-sa-text-3">Enter the 6-digit code from your authenticator app</p>
            </div>
            <input
              type="text"
              maxLength={6}
              placeholder="000000"
              value={totpCode}
              onChange={e => setTotpCode(e.target.value.replace(/\D/g, ""))}
              className="field-surface w-full h-14 text-center text-xl font-bold"
            />
            {error && <p className="text-xs text-sa-red text-center">{error}</p>}
            <button type="button" onClick={handle2FA} disabled={loading === "email"} className="btn btn-accent w-full">
              {loading === "email" ? <Spinner /> : "Verify"}
            </button>
            <button type="button" onClick={resetForm} className="text-sm text-sa-text-3 hover:text-foreground transition-colors text-center font-medium cursor-pointer bg-transparent border-none">
              ← Back
            </button>
          </div>
        )}

        {step === "forgot" && (
          <div className="flex flex-col gap-4">
            <div className="text-center space-y-1">
              <h2 className="text-xl font-bold">Reset password</h2>
              <p className="text-sm text-sa-text-3">Enter your email to receive a reset code</p>
            </div>
            <input
              type="email"
              placeholder="name@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputClass}
            />
            {error && <p className="text-xs text-sa-red text-center">{error}</p>}
            <button type="button" onClick={handleForgotPassword} disabled={loading === "email"} className="btn btn-accent w-full">
              {loading === "email" ? <Spinner /> : "Send reset code"}
            </button>
            <button type="button" onClick={resetForm} className="text-sm text-sa-text-3 hover:text-foreground transition-colors text-center font-medium cursor-pointer bg-transparent border-none">
              ← Back to sign in
            </button>
          </div>
        )}

        {step === "reset_code" && (
          <div className="flex flex-col gap-4">
            <div className="text-center space-y-1">
              <h2 className="text-xl font-bold">Enter reset code</h2>
              <p className="text-sm text-sa-text-3">We sent a code to <span className="text-foreground">{email}</span></p>
            </div>
            <input
              type="text"
              maxLength={6}
              placeholder="000000"
              value={resetCode}
              onChange={(e) => setResetCode(e.target.value.replace(/\D/g, ""))}
              className="field-surface w-full h-14 text-center text-xl font-bold"
            />
            <input
              type="password"
              placeholder="New password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className={inputClass}
            />
            <input
              type="password"
              placeholder="Confirm new password"
              value={confirmNewPassword}
              onChange={(e) => setConfirmNewPassword(e.target.value)}
              className={inputClass}
            />
            {error && <p className="text-xs text-sa-red text-center">{error}</p>}
            <button type="button" onClick={handleResetPassword} disabled={loading === "email"} className="btn btn-accent w-full">
              {loading === "email" ? <Spinner /> : "Reset password"}
            </button>
            <button type="button" onClick={resetForm} className="text-sm text-sa-text-3 hover:text-foreground transition-colors text-center font-medium cursor-pointer bg-transparent border-none">
              ← Back
            </button>
          </div>
        )}

        {step === "auth" && (
          <>
            <div
              className="flex rounded-2xl p-1 border"
              style={{
                background: "hsla(213, 45%, 8%, 0.6)",
                borderColor: "hsla(198, 30%, 30%, 0.3)",
              }}
            >
              <button
                type="button"
                onClick={() => { setTab("signin"); setError(null); }}
                className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all duration-300 cursor-pointer border-none ${
                  tab === "signin"
                    ? "text-black shadow-md"
                    : "text-sa-text-3 hover:text-foreground bg-transparent"
                }`}
                style={
                  tab === "signin"
                    ? {
                        background: "var(--sa-blue)",
                        boxShadow: "0 4px 14px hsla(188, 86%, 50%, 0.3)",
                      }
                    : {}
                }
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setTab("signup"); setError(null); }}
                className={`flex-1 py-2 text-sm font-semibold rounded-xl transition-all duration-300 cursor-pointer border-none ${
                  tab === "signup"
                    ? "text-black shadow-md"
                    : "text-sa-text-3 hover:text-foreground bg-transparent"
                }`}
                style={
                  tab === "signup"
                    ? {
                        background: "var(--sa-blue)",
                        boxShadow: "0 4px 14px hsla(188, 86%, 50%, 0.3)",
                      }
                    : {}
                }
              >
                Sign Up
              </button>
            </div>

            <form className="flex flex-col gap-4" onSubmit={(e) => {
              e.preventDefault();
              tab === "signin" ? handleEmailSignin() : handleEmailSignup();
            }}>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-sa-text-3 uppercase tracking-wider ml-1">Email Address</label>
                <input
                  type="email"
                  placeholder="name@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-bold text-sa-text-3 uppercase tracking-wider ml-1">Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className={inputClass}
                  required
                />
              </div>
              {tab === "signin" && (
                <button
                  type="button"
                  onClick={() => setStep("forgot")}
                  className="text-xs text-sa-text-3 hover:text-foreground bg-transparent border-none cursor-pointer text-right"
                >
                  Forgot password?
                </button>
              )}
              {tab === "signup" && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-sa-text-3 uppercase tracking-wider ml-1">Confirm Password</label>
                  <input
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                    className={inputClass}
                    required
                  />
                </div>
              )}
              <button type="submit" disabled={loading !== null} className="btn btn-primary w-full mt-2 disabled:opacity-60">
                {loading === "email" ? <Spinner /> : tab === "signin" ? "Sign In" : "Create Account"}
              </button>
            </form>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full h-px bg-sa-border/60" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="px-3 text-sa-text-3 bg-sa-bg rounded-full">Or continue with</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <button
                type="button"
                onClick={handleGoogle}
                disabled={loading !== null}
                className="btn btn-glass btn-sm flex gap-2 disabled:opacity-60"
              >
                <GoogleIcon />
                Google
              </button>
              <button type="button" className="btn btn-glass btn-sm flex gap-2">
                <Shield size={16} />
                Web3
              </button>
            </div>

            {error && <p className="text-xs text-sa-red text-center">{error}</p>}
          </>
        )}

        <p className="text-center text-xs text-sa-text-3">
          By continuing you agree to StreamArc&apos;s terms. This is a 60-day testnet experiment.
        </p>
      </motion.div>
    </div>
  );
}
