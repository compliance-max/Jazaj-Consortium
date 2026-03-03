import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export default function PrivacyPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Privacy Policy</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            Jazaj Consortium respects your privacy. We collect business contact details, enrollment data, account access data, and operational testing records required to provide consortium management services.
          </p>
          <p>
            We use service providers such as Stripe for payments, Postmark for transactional email, and secure cloud storage providers for document handling. Data is processed to deliver platform functionality, support compliance workflows, and maintain security and auditability.
          </p>
          <p>
            We apply role-based access controls, tenant isolation, and security safeguards designed to limit unauthorized access. Retention periods are applied by document category and operational need.
          </p>
          <p>
            You may request access or correction of your account information through support. Changes to this policy will be posted on this page with updated effective wording.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

