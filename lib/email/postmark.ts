type EmailInput = {
  to: string;
  subject: string;
  textBody: string;
  htmlBody?: string;
};

type EmailAttachment = {
  name: string;
  contentType: string;
  contentBase64: string;
};

type TemplateModel = Record<string, unknown>;

type TemplateAliasKey =
  | "verify_email"
  | "set_password"
  | "reset_password"
  | "enrollment_receipt"
  | "test_request_receipt"
  | "renewal_receipt"
  | "random_selected_notice"
  | "random_not_selected_notice"
  | "quarter_end_roster_review"
  | "clinic_assigned_notice"
  | "result_posted_notice"
  | "certificate_issued";

type TemplateMessageStream = "transactional" | "notifications";

type TemplateInput = {
  to: string;
  templateAlias: string;
  model: TemplateModel;
  messageStream: TemplateMessageStream;
  attachments?: EmailAttachment[];
};

const APP_NAME = "Consortium Manager";
const TEMPLATE_ALIAS_ENV: Record<TemplateAliasKey, string> = {
  verify_email: "POSTMARK_TEMPLATE_VERIFY_EMAIL_ALIAS",
  set_password: "POSTMARK_TEMPLATE_SET_PASSWORD_ALIAS",
  reset_password: "POSTMARK_TEMPLATE_RESET_PASSWORD_ALIAS",
  enrollment_receipt: "POSTMARK_TEMPLATE_ENROLLMENT_RECEIPT_ALIAS",
  test_request_receipt: "POSTMARK_TEMPLATE_TEST_REQUEST_RECEIPT_ALIAS",
  renewal_receipt: "POSTMARK_TEMPLATE_RENEWAL_RECEIPT_ALIAS",
  random_selected_notice: "POSTMARK_TEMPLATE_RANDOM_SELECTED_NOTICE_ALIAS",
  random_not_selected_notice: "POSTMARK_TEMPLATE_RANDOM_NOT_SELECTED_NOTICE_ALIAS",
  quarter_end_roster_review: "POSTMARK_TEMPLATE_QUARTER_END_ROSTER_REVIEW_ALIAS",
  clinic_assigned_notice: "POSTMARK_TEMPLATE_CLINIC_ASSIGNED_NOTICE_ALIAS",
  result_posted_notice: "POSTMARK_TEMPLATE_RESULT_POSTED_NOTICE_ALIAS",
  certificate_issued: "POSTMARK_TEMPLATE_CERTIFICATE_ISSUED_ALIAS"
};

const TEMPLATE_ALIAS_DEFAULT: Record<TemplateAliasKey, string> = {
  verify_email: "verify_email",
  set_password: "set_password",
  reset_password: "reset_password",
  enrollment_receipt: "enrollment_receipt",
  test_request_receipt: "test_request_receipt",
  renewal_receipt: "renewal_receipt",
  random_selected_notice: "random_selected_notice",
  random_not_selected_notice: "random_not_selected_notice",
  quarter_end_roster_review: "quarter_end_roster_review",
  clinic_assigned_notice: "clinic_assigned_notice",
  result_posted_notice: "result_posted_notice",
  certificate_issued: "certificate_issued"
};

function appUrl() {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}

function supportEmail() {
  return process.env.SUPPORT_EMAIL || process.env.EMAIL_FROM || "support@example.com";
}

function supportPhone() {
  return process.env.SUPPORT_PHONE || null;
}

function supportAddress() {
  return process.env.SUPPORT_ADDRESS || null;
}

function resolveTemplateAlias(aliasKey: TemplateAliasKey) {
  const envKey = TEMPLATE_ALIAS_ENV[aliasKey];
  const fromEnv = process.env[envKey]?.trim();
  return fromEnv || TEMPLATE_ALIAS_DEFAULT[aliasKey];
}

function resolveMessageStream(stream: TemplateMessageStream) {
  if (stream === "notifications") {
    return process.env.POSTMARK_MESSAGE_STREAM_NOTIFICATIONS || "outbound";
  }
  return process.env.POSTMARK_MESSAGE_STREAM_TRANSACTIONAL || "transactional";
}

function sharedTemplateModel(extra: TemplateModel = {}): TemplateModel {
  return {
    appName: APP_NAME,
    appUrl: appUrl(),
    portalUrl: `${appUrl()}/portal/dashboard`,
    loginUrl: `${appUrl()}/login`,
    supportEmail: supportEmail(),
    supportPhone: supportPhone(),
    supportAddress: supportAddress(),
    currentYear: new Date().getUTCFullYear(),
    ...extra
  };
}

async function sendWithPostmarkTemplate(input: TemplateInput) {
  const token = process.env.POSTMARK_SERVER_TOKEN;
  const from = process.env.EMAIL_FROM;
  if (!token || !from) {
    throw new Error("Postmark is not configured");
  }

  const response = await fetch("https://api.postmarkapp.com/email/withTemplate", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Postmark-Server-Token": token
    },
    body: JSON.stringify({
      From: from,
      To: input.to,
      TemplateAlias: input.templateAlias,
      TemplateModel: input.model,
      MessageStream: resolveMessageStream(input.messageStream),
      ...(input.attachments?.length
        ? {
            Attachments: input.attachments.map((attachment) => ({
              Name: attachment.name,
              ContentType: attachment.contentType,
              Content: attachment.contentBase64
            }))
          }
        : {})
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Postmark template send failed: ${response.status} ${body}`);
  }

  const payload = (await response.json()) as { MessageID?: string };
  return payload.MessageID || null;
}

export async function sendEmailTemplate(
  to: string,
  templateAlias: string,
  model: TemplateModel,
  messageStream: TemplateMessageStream,
  attachments?: EmailAttachment[]
) {
  const allowConsoleFallback = process.env.ALLOW_EMAIL_CONSOLE_FALLBACK !== "false";
  const disableHttpInTest = process.env.NODE_ENV === "test" && process.env.POSTMARK_ALLOW_TEST_HTTP !== "true";
  if (disableHttpInTest) {
    console.log("[email:template-test-skip]", { to, templateAlias, messageStream });
    return { messageId: "test-skip" };
  }
  try {
    const messageId = await sendWithPostmarkTemplate({
      to,
      templateAlias,
      model,
      messageStream,
      attachments
    });
    return { messageId };
  } catch (error) {
    if (!allowConsoleFallback) throw error;
    console.log("[email:template-fallback]", {
      to,
      templateAlias,
      messageStream,
      model
    });
    return { messageId: "console-fallback" };
  }
}

export async function sendEmail(input: EmailInput) {
  const allowConsoleFallback = process.env.ALLOW_EMAIL_CONSOLE_FALLBACK !== "false";
  if (!allowConsoleFallback) {
    throw new Error("Raw email delivery is disabled. Use Postmark templates.");
  }
  console.log("[email:raw-fallback]", {
    to: input.to,
    subject: input.subject,
    textBody: input.textBody,
    hasHtmlBody: Boolean(input.htmlBody)
  });
  return { messageId: "console-fallback" };
}

export async function sendVerificationEmail(input: { to: string; token: string }) {
  const verifyUrl = `${appUrl()}/verify-email?token=${encodeURIComponent(input.token)}`;
  return sendEmailTemplate(
    input.to,
    resolveTemplateAlias("verify_email"),
    sharedTemplateModel({
      verifyUrl,
      expiresIn: "24 hours"
    }),
    "transactional"
  );
}

export async function sendSetPasswordEmail(input: { to: string; token: string }) {
  const setPasswordUrl = `${appUrl()}/set-password?token=${encodeURIComponent(input.token)}`;
  return sendEmailTemplate(
    input.to,
    resolveTemplateAlias("set_password"),
    sharedTemplateModel({
      setPasswordUrl,
      expiresIn: "24 hours"
    }),
    "transactional"
  );
}

export async function sendResetPasswordEmail(input: { to: string; token: string }) {
  const resetPasswordUrl = `${appUrl()}/reset-password?token=${encodeURIComponent(input.token)}`;
  return sendEmailTemplate(
    input.to,
    resolveTemplateAlias("reset_password"),
    sharedTemplateModel({
      resetPasswordUrl,
      expiresIn: "30 minutes"
    }),
    "transactional"
  );
}

export async function sendRandomSelectionNotice(input: {
  to: string;
  year: number;
  quarter: number;
  selectedDrivers: Array<{ firstName: string; lastName: string; testType: "DRUG" | "ALCOHOL" | "BOTH" }>;
}) {
  const selectedDrivers = input.selectedDrivers.map((driver) => ({
    firstName: driver.firstName,
    lastName: driver.lastName,
    fullName: `${driver.firstName} ${driver.lastName}`,
    testType: driver.testType
  }));
  return sendEmailTemplate(
    input.to,
    resolveTemplateAlias("random_selected_notice"),
    sharedTemplateModel({
      year: input.year,
      quarter: input.quarter,
      selectedCount: selectedDrivers.length,
      selectedDrivers,
      selectedDriversText: selectedDrivers.map((driver) => `${driver.fullName} (${driver.testType})`).join(", "),
      randomUrl: `${appUrl()}/portal/random`
    }),
    "notifications"
  );
}

export async function sendRandomNoSelectionNotice(input: {
  to: string;
  year: number;
  quarter: number;
  poolSize: number;
}) {
  return sendEmailTemplate(
    input.to,
    resolveTemplateAlias("random_not_selected_notice"),
    sharedTemplateModel({
      year: input.year,
      quarter: input.quarter,
      poolSize: input.poolSize,
      randomUrl: `${appUrl()}/portal/random`
    }),
    "notifications"
  );
}

export async function sendQuarterEndRosterReviewEmail(input: { to: string; year: number; quarter: number }) {
  return sendEmailTemplate(
    input.to,
    resolveTemplateAlias("quarter_end_roster_review"),
    sharedTemplateModel({
      year: input.year,
      quarter: input.quarter,
      driversUrl: `${appUrl()}/portal/drivers`
    }),
    "notifications"
  );
}

export async function sendEnrollmentCompleteEmail(input: {
  to: string;
  legalName: string;
  certificateId: string;
  certificateUrl: string;
  pdfAttachment?: Buffer;
}) {
  return sendEmailTemplate(
    input.to,
    resolveTemplateAlias("enrollment_receipt"),
    sharedTemplateModel({
      legalName: input.legalName,
      certificateId: input.certificateId,
      certificateUrl: input.certificateUrl
    }),
    "transactional",
    input.pdfAttachment
      ? [
          {
            name: `${input.certificateId}.pdf`,
            contentType: "application/pdf",
            contentBase64: input.pdfAttachment.toString("base64")
          }
        ]
      : undefined
  );
}

export async function sendCertificateIssuedEmail(input: {
  to: string;
  legalName: string;
  certificateId: string;
  certificateUrl: string;
}) {
  return sendEmailTemplate(
    input.to,
    resolveTemplateAlias("certificate_issued"),
    sharedTemplateModel({
      legalName: input.legalName,
      certificateId: input.certificateId,
      certificateUrl: input.certificateUrl
    }),
    "transactional"
  );
}

export async function sendTestPaymentReceiptEmail(input: {
  to: string;
  requestId: string;
  amountCents: number;
}) {
  return sendEmailTemplate(
    input.to,
    resolveTemplateAlias("test_request_receipt"),
    sharedTemplateModel({
      requestId: input.requestId,
      amountCents: input.amountCents,
      amountUsd: (input.amountCents / 100).toFixed(2),
      testRequestsUrl: `${appUrl()}/portal/test-requests`
    }),
    "transactional"
  );
}

export async function sendClinicAssignmentEmail(input: {
  to: string;
  requestId: string;
  clinicName: string;
  clinicAddress: string;
  instructions?: string | null;
}) {
  return sendEmailTemplate(
    input.to,
    resolveTemplateAlias("clinic_assigned_notice"),
    sharedTemplateModel({
      requestId: input.requestId,
      clinicName: input.clinicName,
      clinicAddress: input.clinicAddress,
      instructions: input.instructions || "",
      testRequestsUrl: `${appUrl()}/portal/test-requests`
    }),
    "notifications"
  );
}

export async function sendResultPostedEmail(input: {
  to: string;
  requestId: string;
  resultStatus: "NEGATIVE" | "POSITIVE" | "REFUSAL" | "CANCELLED" | "PENDING";
  resultDate: Date;
}) {
  return sendEmailTemplate(
    input.to,
    resolveTemplateAlias("result_posted_notice"),
    sharedTemplateModel({
      requestId: input.requestId,
      resultStatus: input.resultStatus,
      resultDate: input.resultDate.toISOString().slice(0, 10),
      resultsUrl: `${appUrl()}/portal/results`
    }),
    "notifications"
  );
}

export async function sendRenewalReceiptEmail(input: {
  to: string;
  legalName: string;
  amountCents: number;
  renewalDueDate: Date;
}) {
  return sendEmailTemplate(
    input.to,
    resolveTemplateAlias("renewal_receipt"),
    sharedTemplateModel({
      legalName: input.legalName,
      amountCents: input.amountCents,
      amountUsd: (input.amountCents / 100).toFixed(2),
      renewalDueDate: input.renewalDueDate.toISOString().slice(0, 10),
      companyUrl: `${appUrl()}/portal/company`
    }),
    "transactional"
  );
}
