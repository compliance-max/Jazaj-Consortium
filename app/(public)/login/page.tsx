"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { Building2, ShieldCheck } from "lucide-react";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
      callbackUrl: "/admin"
    });

    setLoading(false);
    if (!result || result.error) {
      setError("Invalid credentials or too many attempts.");
      toast.error("Login failed", { description: "Invalid credentials or too many attempts." });
      return;
    }

    // Hard redirect avoids occasional stale client-session state after credentials login in production.
    window.location.assign("/admin");
  }

  return (
    <div className="mx-auto grid max-w-4xl gap-6 lg:grid-cols-[1fr_360px]">
      <Card>
        <CardHeader>
          <Badge variant="secondary" className="mb-2 w-fit">
            Secure Access
          </Badge>
          <CardTitle>Sign in to Consortium Manager</CardTitle>
          <CardDescription>Use your assigned credentials to access admin or employer workflows.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="space-y-3" onSubmit={onSubmit}>
            <Input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? "Signing in..." : "Sign in"}
            </Button>
          </form>
          {error ? (
            <Alert className="border-destructive/30">
              <AlertTitle>Sign in failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <div className="rounded-md border border-border bg-muted/30 p-3">
            <Link href="/forgot-password" className="text-sm font-medium text-primary hover:underline">
              Forgot password?
            </Link>
            <p className="mt-1 text-xs text-muted-foreground">Use password recovery to request a secure reset link.</p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Role guidance</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted-foreground">
            <p className="flex items-start gap-2">
              <ShieldCheck className="mt-0.5 h-4 w-4 text-primary" />
              Admins: use your admin credentials.
            </p>
            <p className="flex items-start gap-2">
              <Building2 className="mt-0.5 h-4 w-4 text-primary" />
              Employers: use your DER credentials.
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Need an account?</CardTitle>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="w-full">
              <Link href="/enroll">Start Enrollment</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
