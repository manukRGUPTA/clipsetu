"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setMessage("Password updated. Sign in again to continue.");
      window.setTimeout(() => router.replace("/sign-in"), 900);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The password could not be updated.");
    } finally { setBusy(false); }
  }

  return <div className="auth-wrap"><section className="auth-card"><p className="eyebrow">Account recovery</p><h1>Choose a new password</h1><p>Use at least 12 characters.</p>
    <form onSubmit={updatePassword}><div className="field"><label htmlFor="new-password">New password</label><input id="new-password" type="password" autoComplete="new-password" minLength={12} required value={password} onChange={(event) => setPassword(event.target.value)} /></div><button className="button" type="submit" disabled={busy}>{busy ? "Saving…" : "Update password"}</button></form>
    {error && <p className="form-message error" role="alert">{error}</p>}{message && <p className="form-message" role="status">{message}</p>}
  </section></div>;
}
