"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

export default function DashboardSessionProofPage() {
  const router = useRouter();
  const { data: session, status } = useSession();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [router, status]);

  if (status === "loading") {
    return <div className="mx-auto max-w-4xl p-8">Loading session...</div>;
  }

  if (!session?.user) {
    return <div className="mx-auto max-w-4xl p-8">No active session.</div>;
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-sm text-muted-foreground">Session wiring proof page.</p>
      <div className="rounded-lg border border-border bg-card p-4">
        <div className="text-sm">
          <strong>Email:</strong> {session.user.email}
        </div>
        <div className="text-sm">
          <strong>Role:</strong> {session.user.role}
        </div>
        <div className="text-sm">
          <strong>Employer ID:</strong> {session.user.employerId || "n/a"}
        </div>
      </div>
      <pre className="overflow-x-auto rounded-md border border-border bg-muted/40 p-3 text-xs">
        {JSON.stringify(session.user, null, 2)}
      </pre>
    </div>
  );
}
