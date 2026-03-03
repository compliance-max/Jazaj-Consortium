import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function TermsPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Terms and Conditions</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            By using Consortium Manager, you agree to use the platform for lawful consortium administration activities and to maintain accurate account and operational data.
          </p>
          <p>
            Billing terms include annual enrollment and per-test request fees according to published pricing. Platform access and specific workflows may depend on payment and account status.
          </p>
          <p>
            Users are responsible for credential security and authorized usage. Misuse, unauthorized access attempts, or disruptive behavior may result in suspension or termination.
          </p>
          <p>
            Jazaj Consortium provides software and administrative workflow support and does not replace legal counsel, MRO determinations, or laboratory functions.
          </p>
          <p>
            See our <Link href="/privacy" className="text-primary hover:underline">Privacy Policy</Link> for data handling practices.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

