"use client";

import { FormEvent, useEffect, useState } from "react";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get("token") || "");
  }, []);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    const res = await fetch("/api/auth/reset-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password })
    });
    const payload = await res.json().catch(() => ({}));
    setLoading(false);
    setStatus(res.ok ? "Password reset complete. You can now login." : payload.error || "Reset failed.");
  }

  return (
    <main>
      <div className="card">
        <h1>Reset Password</h1>
        <form className="row" onSubmit={onSubmit}>
          <input
            type="password"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <button type="submit" disabled={loading || !token}>
            {loading ? "Resetting..." : "Reset password"}
          </button>
        </form>
        {status ? <p>{status}</p> : null}
      </div>
    </main>
  );
}
