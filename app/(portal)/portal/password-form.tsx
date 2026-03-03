"use client";

import { FormEvent, useState } from "react";
import { withCsrfHeaders } from "@/lib/client/csrf";

export default function ChangePasswordForm() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    const res = await fetch("/api/portal/change-password", {
      method: "POST",
      headers: withCsrfHeaders({ "Content-Type": "application/json" }),
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const payload = await res.json().catch(() => ({}));
    setLoading(false);
    setStatus(res.ok ? "Password updated." : payload.error || "Failed to update password.");
    if (res.ok) {
      setCurrentPassword("");
      setNewPassword("");
    }
  }

  return (
    <form className="row" onSubmit={onSubmit}>
      <input
        type="password"
        placeholder="Current password"
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        required
      />
      <input
        type="password"
        placeholder="New password"
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        required
      />
      <button type="submit" disabled={loading}>
        {loading ? "Updating..." : "Change password"}
      </button>
      {status ? <p>{status}</p> : null}
    </form>
  );
}
