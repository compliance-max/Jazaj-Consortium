import Link from "next/link";
import { PublicNav } from "@/components/app-shell";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <PublicNav />
      <main className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">{children}</main>
      <footer className="border-t border-border bg-card/60">
        <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 md:grid-cols-2">
          <div>
            <p className="text-sm font-semibold">Jazaj Consortium</p>
            <p className="mt-1 text-sm text-muted-foreground">
              FMCSA consortium operations platform for enrollment, random testing administration, results, and audit readiness.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              Contact: compliance@jazaj.com · 313-784-8126 · Westland, MI
            </p>
          </div>
          <div className="flex flex-wrap items-start gap-4 text-sm">
            <Link href="/privacy" className="text-muted-foreground hover:text-foreground">
              Privacy
            </Link>
            <Link href="/terms" className="text-muted-foreground hover:text-foreground">
              Terms
            </Link>
            <Link href="/login" className="text-muted-foreground hover:text-foreground">
              Login
            </Link>
            <Link href="/enroll" className="text-muted-foreground hover:text-foreground">
              Enroll
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
