"use client";

import { useEffect } from "react";

export default function ErrorPage({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("App route error", error);
  }, [error]);

  return (
    <main>
      <div className="card">
        <h1>Something went wrong</h1>
        <p>We could not complete this request. Please try again.</p>
        <p style={{ color: "#6b7280", fontSize: 12 }}>Error ID: {error.digest || "n/a"}</p>
        <button type="button" onClick={reset}>
          Retry
        </button>
      </div>
    </main>
  );
}
