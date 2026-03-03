"use client";

import { FormEvent, useEffect, useState } from "react";

export default function VerifyEmailPage() {
  const [token, setToken] = useState("");
  const [required, setRequired] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token") || "");
    setRequired(params.get("required") === "1");
  }, []);

  const [status, setStatus] = useState<string>("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);

  async function verifyNow(event: FormEvent) {
    event.preventDefault();
    if (!token) {
      setStatus("Missing token.");
      return;
    }

    setLoading(true);
    const res = await fetch("/api/auth/verify-email", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token })
    });
    const payload = await res.json().catch(() => ({}));
    setLoading(false);
    setStatus(res.ok ? "Email verified. You can go back to login." : payload.error || "Verification failed.");
  }

  async function resend(event: FormEvent) {
    event.preventDefault();
    if (!email) return;
    setLoading(true);
    await fetch("/api/auth/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    setLoading(false);
    setStatus("If your account exists, a verification email was sent.");
  }

  return (
    <main>
      <div className="card">
        <h1>Verify Email</h1>
        {required ? <p className="error">Email verification is required before portal access.</p> : null}
        {token ? (
          <form onSubmit={verifyNow} className="row">
            <button type="submit" disabled={loading}>
              {loading ? "Verifying..." : "Verify now"}
            </button>
          </form>
        ) : null}

        <form onSubmit={resend} className="row">
          <input
            type="email"
            placeholder="Enter your email for a new link"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <button type="submit" disabled={loading}>
            Resend verification
          </button>
        </form>
        {status ? <p>{status}</p> : null}
      </div>
    </main>
  );
}
