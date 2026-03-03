"use client";

import { FormEvent, useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    const res = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const payload = await res.json().catch(() => ({}));
    setLoading(false);
    setStatus(res.ok ? "If your account exists, a reset email has been sent." : payload.error || "Request failed.");
  }

  return (
    <main>
      <div className="card">
        <h1>Forgot Password</h1>
        <form className="row" onSubmit={onSubmit}>
          <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          <button type="submit" disabled={loading}>
            {loading ? "Sending..." : "Send reset link"}
          </button>
        </form>
        {status ? <p>{status}</p> : null}
      </div>
    </main>
  );
}
