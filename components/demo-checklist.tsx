"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, X } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type ChecklistMode = "admin" | "portal";

const adminItems = [
  { label: "View Employers", href: "/admin/employers" },
  { label: "Run Random (Dry Run)", href: "/admin/random?dryRun=1" },
  { label: "Create Test Request", href: "/admin/test-requests" },
  { label: "View Results", href: "/admin/results" },
  { label: "Run Audit Export", href: "/admin/reports" }
];

const portalItems = [
  { label: "Download Certificate", href: "/portal/company" },
  { label: "Add Driver", href: "/portal/drivers" },
  { label: "Create Test Request", href: "/portal/test-requests" },
  { label: "View Random Selections", href: "/portal/random" }
];

export function DemoChecklist({ mode }: { mode: ChecklistMode }) {
  const [enabled, setEnabled] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const storageKey = `demo_checklist_dismissed_${mode}`;
  const items = useMemo(() => (mode === "admin" ? adminItems : portalItems), [mode]);

  useEffect(() => {
    let active = true;
    async function loadConfig() {
      const fromStorage = typeof window !== "undefined" ? window.localStorage.getItem(storageKey) : null;
      if (fromStorage === "1") {
        if (active) setDismissed(true);
      }
      const res = await fetch("/api/public/config");
      const payload = await res.json().catch(() => ({}));
      if (!active) return;
      setEnabled(Boolean(payload.demoMode));
    }
    void loadConfig();
    return () => {
      active = false;
    };
  }, [storageKey]);

  if (!enabled || dismissed) return null;

  return (
    <Card className="border-primary/30 bg-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Demo Checklist</CardTitle>
            <CardDescription>
              {mode === "admin"
                ? "Use this guided list to walk through core admin operations."
                : "Use this guided list to walk through the employer portal."}
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              setDismissed(true);
              if (typeof window !== "undefined") {
                window.localStorage.setItem(storageKey, "1");
              }
            }}
            aria-label="Dismiss demo checklist"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2">
        {items.map((item) => (
          <Link key={item.href} href={item.href} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm hover:bg-muted/40">
            <CheckCircle2 className="h-4 w-4 text-primary" />
            {item.label}
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}

