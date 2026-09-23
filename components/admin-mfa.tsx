"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createClient } from "@/lib/supabase/client";

type TotpFactor = { id: string; status: string; friendly_name?: string };

export function AdminMfa({ factors }: { factors: TotpFactor[] }) {
  const router = useRouter();
  const [factorId, setFactorId] = useState(factors.find((factor) => factor.status === "verified")?.id ?? "");
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function beginEnrollment() {
    setBusy(true); setError("");
    try {
      const supabase = createClient();
      const { data, error: enrollError } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Clipsetu admin" });
      if (enrollError) throw enrollError;
      setFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not start authenticator setup.");
    } finally { setBusy(false); }
  }

  async function verify() {
    if (!factorId || !/^\d{6,8}$/.test(code)) { setError("Enter the current code from your authenticator app."); return; }
    setBusy(true); setError("");
    try {
      const supabase = createClient();
      const { data: challenge, error: challengeError } = await supabase.auth.mfa.challenge({ factorId });
      if (challengeError) throw challengeError;
      const { error: verifyError } = await supabase.auth.mfa.verify({ factorId, challengeId: challenge.id, code });
      if (verifyError) throw verifyError;
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "That verification code could not be confirmed.");
    } finally { setBusy(false); }
  }

  return (
    <section className="content-panel" aria-labelledby="mfa-title">
      <h2 id="mfa-title">Verify admin access</h2>
      <p>Admin review tools require a verified authenticator factor for this session.</p>
      {!factorId && <button className="button" type="button" disabled={busy} onClick={beginEnrollment}>{busy ? "Preparing…" : "Set up an authenticator"}</button>}
      {qrCode && <div className="field"><Image alt="Authenticator setup QR code" width={190} height={190} src={qrCode} unoptimized /><span className="field-help">Or enter this setup key manually: <code>{secret}</code></span></div>}
      {factorId && <div className="field"><label htmlFor="totp-code">Authenticator code</label><input id="totp-code" inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))} /></div>}
      {factorId && <button className="button" type="button" disabled={busy} onClick={verify}>{busy ? "Verifying…" : "Verify and continue"}</button>}
      {error && <p className="form-message error" role="alert">{error}</p>}
    </section>
  );
}
