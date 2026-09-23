"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type Copy = {
  title: string;
  intro: string;
  name: string;
  role: string;
  business: string;
  clipper: string;
  email: string;
  password: string;
  submit: string;
  switchToSignup: string;
  switchToLogin: string;
  pending: string;
  reset: string;
  forgot: string;
};

const copy: Record<"en" | "hi", Copy> = {
  en: {
    title: "Your Clipsetu workspace",
    intro: "Create an account or sign in. New accounts are reviewed before campaign actions are enabled.",
    name: "Your name",
    role: "I’m joining as",
    business: "Business / creator team",
    clipper: "Clipper",
    email: "Email address",
    password: "Password",
    submit: "Continue",
    switchToSignup: "New to Clipsetu? Create an account",
    switchToLogin: "Already registered? Sign in",
    pending: "Check your email to verify your account. Your requested role will remain pending review.",
    reset: "If that address is registered, a password reset link will arrive by email.",
    forgot: "Forgot password?",
  },
  hi: {
    title: "आपका Clipsetu workspace",
    intro: "खाता बनाएँ या साइन इन करें। कैंपेन की सुविधाएँ शुरू होने से पहले नए खातों की समीक्षा होगी।",
    name: "आपका नाम",
    role: "मैं जुड़ रहा/रही हूँ",
    business: "बिज़नेस / क्रिएटर टीम",
    clipper: "क्लिपर",
    email: "ईमेल पता",
    password: "पासवर्ड",
    submit: "जारी रखें",
    switchToSignup: "Clipsetu पर नए हैं? खाता बनाएँ",
    switchToLogin: "पहले से खाता है? साइन इन करें",
    pending: "खाता सत्यापित करने के लिए ईमेल देखें। आपकी भूमिका समीक्षा के लिए लंबित रहेगी।",
    reset: "अगर यह ईमेल पंजीकृत है, तो पासवर्ड बदलने का लिंक भेजा जाएगा।",
    forgot: "पासवर्ड भूल गए?",
  },
};

export function AuthForm({ initialMode = "signin" }: { initialMode?: "signin" | "signup" }) {
  const router = useRouter();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">(initialMode);
  const [role, setRole] = useState<"business" | "clipper">("clipper");
  const [language, setLanguage] = useState<"en" | "hi">("en");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const text = copy[language];

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const supabase = createClient();
      if (mode === "reset") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        });
        if (resetError) throw resetError;
        setMessage(text.reset);
      } else if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
            data: { full_name: fullName.trim(), requested_role: role },
          },
        });
        if (signUpError) throw signUpError;
        if (data.session) router.replace("/dashboard");
        else setMessage(text.pending);
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInError) throw signInError;
        router.replace("/dashboard");
        router.refresh();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "We could not complete that request. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="auth-card" aria-labelledby="auth-title">
      <h1 id="auth-title">{text.title}</h1>
      <p>{text.intro}</p>
      <div className="language-toggle" aria-label="Choose language">
        <span>Language / भाषा:</span>
        <button type="button" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>English</button>
        <span aria-hidden="true">·</span>
        <button type="button" aria-pressed={language === "hi"} onClick={() => setLanguage("hi")}>हिन्दी</button>
      </div>
      <form onSubmit={handleSubmit}>
        {mode === "signup" && (
          <>
            <div className="field">
              <label htmlFor="full-name">{text.name}</label>
              <input id="full-name" autoComplete="name" maxLength={120} required value={fullName} onChange={(event) => setFullName(event.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="role">{text.role}</label>
              <select id="role" value={role} onChange={(event) => setRole(event.target.value as "business" | "clipper")}>
                <option value="clipper">{text.clipper}</option>
                <option value="business">{text.business}</option>
              </select>
              <span className="field-help">Admin access is never available through public signup.</span>
            </div>
          </>
        )}
        <div className="field">
          <label htmlFor="email">{text.email}</label>
          <input id="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} />
        </div>
        {mode !== "reset" && <div className="field">
          <label htmlFor="password">{text.password}</label>
          <input id="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} />
          {mode === "signup" && <span className="field-help">Use at least 12 characters. Email verification is required.</span>}
        </div>}
        <button className="button" type="submit" disabled={busy}>{busy ? "Please wait…" : mode === "reset" ? "Send reset link" : text.submit}</button>
      </form>
      {error && <p role="alert" className="form-message error">{error}</p>}
      {message && <p role="status" className="form-message">{message}</p>}
      {mode === "signin" && <div className="auth-switch"><button type="button" onClick={() => { setMode("reset"); setError(""); setMessage(""); }}>{text.forgot}</button></div>}
      <div className="auth-switch">
        <button type="button" onClick={() => { setMode(mode === "signup" ? "signin" : "signup"); setError(""); setMessage(""); }}>
          {mode === "signup" ? text.switchToLogin : text.switchToSignup}
        </button>
      </div>
    </section>
  );
}
