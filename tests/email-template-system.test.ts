import { afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import {
  sendCertificateIssuedEmail,
  sendClinicAssignmentEmail,
  sendEnrollmentCompleteEmail,
  sendQuarterEndRosterReviewEmail,
  sendRandomNoSelectionNotice,
  sendRandomSelectionNotice,
  sendRenewalReceiptEmail,
  sendResetPasswordEmail,
  sendResultPostedEmail,
  sendSetPasswordEmail,
  sendTestPaymentReceiptEmail,
  sendVerificationEmail
} from "@/lib/email/postmark";

const originalFetch = global.fetch;
const originalAllowTestHttp = process.env.POSTMARK_ALLOW_TEST_HTTP;
const fetchMock = vi.fn();

function setTemplateEnv() {
  process.env.POSTMARK_SERVER_TOKEN = "pm-test-token";
  process.env.EMAIL_FROM = "compliance@jazaj.com";
  process.env.ALLOW_EMAIL_CONSOLE_FALLBACK = "false";
  process.env.POSTMARK_ALLOW_TEST_HTTP = "true";
  process.env.APP_URL = "http://localhost:3000";
  process.env.SUPPORT_EMAIL = "support@jazaj.com";
  process.env.POSTMARK_MESSAGE_STREAM_TRANSACTIONAL = "transactional";
  process.env.POSTMARK_MESSAGE_STREAM_NOTIFICATIONS = "outbound";
  process.env.POSTMARK_TEMPLATE_VERIFY_EMAIL_ALIAS = "verify_email";
  process.env.POSTMARK_TEMPLATE_SET_PASSWORD_ALIAS = "set_password";
  process.env.POSTMARK_TEMPLATE_RESET_PASSWORD_ALIAS = "reset_password";
  process.env.POSTMARK_TEMPLATE_ENROLLMENT_RECEIPT_ALIAS = "enrollment_receipt";
  process.env.POSTMARK_TEMPLATE_TEST_REQUEST_RECEIPT_ALIAS = "test_request_receipt";
  process.env.POSTMARK_TEMPLATE_RENEWAL_RECEIPT_ALIAS = "renewal_receipt";
  process.env.POSTMARK_TEMPLATE_RANDOM_SELECTED_NOTICE_ALIAS = "random_selected_notice";
  process.env.POSTMARK_TEMPLATE_RANDOM_NOT_SELECTED_NOTICE_ALIAS = "random_not_selected_notice";
  process.env.POSTMARK_TEMPLATE_QUARTER_END_ROSTER_REVIEW_ALIAS = "quarter_end_roster_review";
  process.env.POSTMARK_TEMPLATE_CLINIC_ASSIGNED_NOTICE_ALIAS = "clinic_assigned_notice";
  process.env.POSTMARK_TEMPLATE_RESULT_POSTED_NOTICE_ALIAS = "result_posted_notice";
  process.env.POSTMARK_TEMPLATE_CERTIFICATE_ISSUED_ALIAS = "certificate_issued";
}

function assertTemplateRequest(alias: string, stream: "transactional" | "outbound") {
  expect(fetchMock).toHaveBeenCalledTimes(1);
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("https://api.postmarkapp.com/email/withTemplate");
  expect(init?.method).toBe("POST");
  const body = JSON.parse(String(init?.body || "{}")) as Record<string, unknown>;
  expect(body.TemplateAlias).toBe(alias);
  expect(body.MessageStream).toBe(stream);
  expect(body).not.toHaveProperty("Subject");
  expect(body).not.toHaveProperty("TextBody");
  expect(body).not.toHaveProperty("HtmlBody");
  const model = body.TemplateModel as Record<string, unknown>;
  expect(model.appName).toBe("Consortium Manager");
  expect(model.appUrl).toBe("http://localhost:3000");
  expect(model.loginUrl).toBe("http://localhost:3000/login");
  expect(model.portalUrl).toBe("http://localhost:3000/portal/dashboard");
  expect(model.supportEmail).toBe("support@jazaj.com");
  return body;
}

describe("Postmark template delivery", () => {
  beforeEach(() => {
    setTemplateEnv();
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ MessageID: "pm-msg-1" })
    } as Response);
    global.fetch = fetchMock as typeof fetch;
  });

  afterAll(() => {
    global.fetch = originalFetch;
    process.env.POSTMARK_ALLOW_TEST_HTTP = originalAllowTestHttp;
  });

  test("auth template sends use transactional stream and template alias", async () => {
    await sendVerificationEmail({ to: "user@example.com", token: "verify-token" });
    let body = assertTemplateRequest("verify_email", "transactional");
    let model = body.TemplateModel as Record<string, unknown>;
    expect(model.verifyUrl).toBe("http://localhost:3000/verify-email?token=verify-token");
    expect(model.expiresIn).toBe("24 hours");

    fetchMock.mockClear();
    await sendSetPasswordEmail({ to: "user@example.com", token: "set-token" });
    body = assertTemplateRequest("set_password", "transactional");
    model = body.TemplateModel as Record<string, unknown>;
    expect(model.setPasswordUrl).toBe("http://localhost:3000/set-password?token=set-token");

    fetchMock.mockClear();
    await sendResetPasswordEmail({ to: "user@example.com", token: "reset-token" });
    body = assertTemplateRequest("reset_password", "transactional");
    model = body.TemplateModel as Record<string, unknown>;
    expect(model.resetPasswordUrl).toBe("http://localhost:3000/reset-password?token=reset-token");
    expect(model.expiresIn).toBe("30 minutes");
  });

  test("random notices use notification stream and include required model keys", async () => {
    await sendRandomSelectionNotice({
      to: "der@example.com",
      year: 2026,
      quarter: 2,
      selectedDrivers: [
        { firstName: "Jane", lastName: "Miles", testType: "DRUG" },
        { firstName: "Mark", lastName: "Lane", testType: "ALCOHOL" }
      ]
    });
    let body = assertTemplateRequest("random_selected_notice", "outbound");
    let model = body.TemplateModel as Record<string, unknown>;
    expect(model.year).toBe(2026);
    expect(model.quarter).toBe(2);
    expect(model.selectedCount).toBe(2);
    expect(Array.isArray(model.selectedDrivers)).toBe(true);

    fetchMock.mockClear();
    await sendRandomNoSelectionNotice({
      to: "der@example.com",
      year: 2026,
      quarter: 2,
      poolSize: 12
    });
    body = assertTemplateRequest("random_not_selected_notice", "outbound");
    model = body.TemplateModel as Record<string, unknown>;
    expect(model.poolSize).toBe(12);

    fetchMock.mockClear();
    await sendQuarterEndRosterReviewEmail({
      to: "der@example.com",
      year: 2026,
      quarter: 2
    });
    body = assertTemplateRequest("quarter_end_roster_review", "outbound");
    model = body.TemplateModel as Record<string, unknown>;
    expect(model.driversUrl).toBe("http://localhost:3000/portal/drivers");
  });

  test("billing, clinic, result, and certificate sends use template aliases and model fields", async () => {
    await sendEnrollmentCompleteEmail({
      to: "der@example.com",
      legalName: "Blue Haul LLC",
      certificateId: "CERT-1",
      certificateUrl: "http://localhost:3000/verify/certificate/CERT-1",
      pdfAttachment: Buffer.from("pdf-content")
    });
    let body = assertTemplateRequest("enrollment_receipt", "transactional");
    let model = body.TemplateModel as Record<string, unknown>;
    expect(model.legalName).toBe("Blue Haul LLC");
    expect(model.certificateId).toBe("CERT-1");
    expect((body.Attachments as unknown[])?.length || 0).toBe(1);

    fetchMock.mockClear();
    await sendTestPaymentReceiptEmail({
      to: "der@example.com",
      requestId: "req-1",
      amountCents: 12500
    });
    body = assertTemplateRequest("test_request_receipt", "transactional");
    model = body.TemplateModel as Record<string, unknown>;
    expect(model.requestId).toBe("req-1");
    expect(model.amountUsd).toBe("125.00");

    fetchMock.mockClear();
    await sendRenewalReceiptEmail({
      to: "der@example.com",
      legalName: "Blue Haul LLC",
      amountCents: 9900,
      renewalDueDate: new Date("2027-01-01T00:00:00.000Z")
    });
    body = assertTemplateRequest("renewal_receipt", "transactional");
    model = body.TemplateModel as Record<string, unknown>;
    expect(model.renewalDueDate).toBe("2027-01-01");

    fetchMock.mockClear();
    await sendClinicAssignmentEmail({
      to: "der@example.com",
      requestId: "req-2",
      clinicName: "Fast Clinic",
      clinicAddress: "1 Main St, Detroit, MI",
      instructions: "Bring CDL."
    });
    body = assertTemplateRequest("clinic_assigned_notice", "outbound");
    model = body.TemplateModel as Record<string, unknown>;
    expect(model.clinicName).toBe("Fast Clinic");

    fetchMock.mockClear();
    await sendResultPostedEmail({
      to: "der@example.com",
      requestId: "req-2",
      resultStatus: "NEGATIVE",
      resultDate: new Date("2026-03-05T00:00:00.000Z")
    });
    body = assertTemplateRequest("result_posted_notice", "outbound");
    model = body.TemplateModel as Record<string, unknown>;
    expect(model.resultStatus).toBe("NEGATIVE");
    expect(model.resultDate).toBe("2026-03-05");

    fetchMock.mockClear();
    await sendCertificateIssuedEmail({
      to: "der@example.com",
      legalName: "Blue Haul LLC",
      certificateId: "CERT-2",
      certificateUrl: "http://localhost:3000/verify/certificate/CERT-2"
    });
    body = assertTemplateRequest("certificate_issued", "transactional");
    model = body.TemplateModel as Record<string, unknown>;
    expect(model.certificateId).toBe("CERT-2");
  });
});
