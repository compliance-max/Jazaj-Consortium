"use client";

export default function GlobalError({
  error,
  reset
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body>
        <main style={{ padding: 24 }}>
          <div className="card">
            <h1>System error</h1>
            <p>An unexpected error occurred while rendering this page.</p>
            <p style={{ color: "#6b7280", fontSize: 12 }}>Error ID: {error.digest || "n/a"}</p>
            <button type="button" onClick={reset}>
              Retry
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
