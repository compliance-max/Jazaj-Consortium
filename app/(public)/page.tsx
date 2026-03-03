import Link from "next/link";
import {
  ArrowRight,
  Building2,
  FileCheck2,
  FileStack,
  MailCheck,
  ShieldCheck,
  WalletCards
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const faqItems = [
  {
    q: "Do owner-operators need to enroll?",
    a: "If operating DOT-covered CDL-required CMVs, owner-operators are generally required to participate in a compliant random testing program."
  },
  {
    q: "How do random selections work in master vs individual pools?",
    a: "Master pools run across combined eligible drivers; individual pools run separately by employer. Both remain auditable and period-based."
  },
  {
    q: "How are test results recorded?",
    a: "Admins capture collection and result details, upload supporting documents, and the employer portal reflects updated status."
  },
  {
    q: "Can certificates be verified?",
    a: "Yes. Enrollment certificates have a verification route and status lifecycle for active/void control."
  },
  {
    q: "What if a selected driver is unavailable?",
    a: "Replacement workflows require documented reason and auditable override handling in line with configured controls."
  },
  {
    q: "How do annual renewals work?",
    a: "Renewals are processed through checkout. Account status and renewal dates update once payment is confirmed by webhook."
  },
  {
    q: "How is per-test pricing applied?",
    a: "Employer-requested tests use fixed pricing by type: Drug $75, Alcohol $50, Both $125."
  },
  {
    q: "Is support available during onboarding and operations?",
    a: "Yes. A built-in support chat is available for both guests and logged-in employers."
  }
];

export default function HomePage() {
  return (
    <div className="space-y-10 pb-12">
      <section className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-card via-card to-muted/50 p-8 shadow-sm sm:p-12">
        <div className="absolute right-0 top-0 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
        <Badge variant="secondary" className="mb-4">
          FMCSA Consortium Management
        </Badge>
        <h1 className="max-w-4xl text-3xl font-bold tracking-tight sm:text-5xl">
          FMCSA Drug & Alcohol Consortium — Fully Automated, Audit-Ready
        </h1>
        <p className="mt-5 max-w-3xl text-base text-muted-foreground sm:text-lg">
          Enrollment, random selections, results tracking, certificates, and audit exports in one operational platform for carriers and C/TPA teams.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button asChild size="lg">
            <Link href="/enroll">
              Enroll Now <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/login">Login</Link>
          </Button>
        </div>
      </section>

      <section className="space-y-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Pricing</h2>
          <p className="text-sm text-muted-foreground">Simple, transparent pricing with no hidden fees.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle>Annual Enrollment</CardTitle>
              <CardDescription>Platform activation</CardDescription>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">$99</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Drug Test</CardTitle>
              <CardDescription>Per request</CardDescription>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">$75</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Alcohol Test</CardTitle>
              <CardDescription>Per request</CardDescription>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">$50</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Drug + Alcohol</CardTitle>
              <CardDescription>Combined request</CardDescription>
            </CardHeader>
            <CardContent className="text-3xl font-semibold">$125</CardContent>
          </Card>
        </div>
        <p className="text-sm text-muted-foreground">
          Includes employer onboarding workflow, portal access, and operational tracking for test requests and compliance workflows.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">How It Works</h2>
        <div className="grid gap-4 md:grid-cols-4">
          {[
            { step: "1", title: "Enroll", desc: "Submit company details and complete annual enrollment payment." },
            { step: "2", title: "Add Drivers", desc: "Maintain active DOT-covered roster for pool eligibility." },
            { step: "3", title: "Random Selections", desc: "Run or receive scheduled random selections by configured pool." },
            { step: "4", title: "Results + Audit Export", desc: "Capture outcomes, store documents, and export audit packages." }
          ].map((item) => (
            <Card key={item.step}>
              <CardHeader>
                <CardDescription>Step {item.step}</CardDescription>
                <CardTitle>{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{item.desc}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">Trust & Compliance</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {[
            { icon: WalletCards, title: "Secure Payments (Stripe)", desc: "Checkout and webhook-confirmed payment processing." },
            { icon: MailCheck, title: "Domain-Authenticated Email", desc: "Operational email delivery through Postmark." },
            { icon: FileStack, title: "Audit-Ready Exports", desc: "ZIP exports with index PDF and reference data." },
            { icon: FileCheck2, title: "HMAC Integrity Proofs", desc: "Selection event integrity recorded for audit trails." },
            { icon: ShieldCheck, title: "Tenant Isolation + Access Controls", desc: "Role and employer-scoped data access enforcement." },
            { icon: Building2, title: "Data Retention Controls", desc: "Retention categories and cleanup workflows are supported." }
          ].map((item) => (
            <Card key={item.title}>
              <CardHeader>
                <item.icon className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{item.desc}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-2xl font-semibold tracking-tight">FAQ</h2>
        <div className="grid gap-4 md:grid-cols-2">
          {faqItems.map((item) => (
            <Card key={item.q}>
              <CardHeader>
                <CardTitle className="text-base">{item.q}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">{item.a}</CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h3 className="text-xl font-semibold">Ready to activate your consortium operations?</h3>
            <p className="mt-1 text-sm text-muted-foreground">Start onboarding and move into a live compliance workflow in minutes.</p>
          </div>
          <div className="flex gap-3">
            <Button asChild>
              <Link href="/enroll">Start Enrollment</Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/login">Login</Link>
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
