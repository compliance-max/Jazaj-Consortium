import crypto from "crypto";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { EnrollmentCertificateStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { buildDocumentDownloadUrl, uploadDocumentBinary } from "@/lib/storage/documents";

type Tx = Prisma.TransactionClient;

function addOneYear(input: Date) {
  const next = new Date(input);
  next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
}

function formatDate(input: Date) {
  return input.toISOString().slice(0, 10);
}

function generateCertificateId() {
  return `JC-${new Date().getUTCFullYear()}-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
}

async function buildCertificatePdf(input: {
  certificateId: string;
  legalName: string;
  dotNumber: string | null;
  effectiveDate: Date;
  expirationDate: Date;
}) {
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const verifyUrl = `${appUrl}/verify/certificate/${encodeURIComponent(input.certificateId)}`;
  const qrDataUrl = await QRCode.toDataURL(verifyUrl, { margin: 1, width: 256 });
  const qrBytes = Buffer.from(qrDataUrl.split(",")[1], "base64");

  const pdf = await PDFDocument.create();
  const page = pdf.addPage([792, 612]);
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const qrImage = await pdf.embedPng(qrBytes);

  page.drawRectangle({
    x: 24,
    y: 24,
    width: 744,
    height: 564,
    borderWidth: 2,
    borderColor: rgb(0.1, 0.3, 0.6)
  });
  page.drawText("Consortium Enrollment Certificate", {
    x: 180,
    y: 530,
    size: 30,
    font: fontBold,
    color: rgb(0.08, 0.24, 0.5)
  });
  page.drawText("Jazaj Consortium Drug & Alcohol Testing", {
    x: 220,
    y: 500,
    size: 14,
    font: fontRegular,
    color: rgb(0.24, 0.24, 0.24)
  });

  const lines = [
    `Certificate ID: ${input.certificateId}`,
    `Employer: ${input.legalName}`,
    `USDOT Number: ${input.dotNumber || "Not provided"}`,
    `Effective Date: ${formatDate(input.effectiveDate)}`,
    `Expiration Date: ${formatDate(input.expirationDate)}`,
    "This certifies enrollment in a DOT/FMCSA random testing consortium."
  ];
  let y = 440;
  for (const line of lines) {
    page.drawText(line, { x: 80, y, size: 14, font: fontRegular, color: rgb(0.1, 0.1, 0.1) });
    y -= 30;
  }

  page.drawImage(qrImage, {
    x: 560,
    y: 80,
    width: 160,
    height: 160
  });
  page.drawText("Scan to verify", {
    x: 586,
    y: 60,
    size: 12,
    font: fontRegular,
    color: rgb(0.2, 0.2, 0.2)
  });

  return Buffer.from(await pdf.save());
}

async function createCertificateDocument(
  tx: Tx,
  input: {
    employerId: string;
    certificateId: string;
    pdfBytes: Buffer;
  }
) {
  const upload = await uploadDocumentBinary({
    buffer: input.pdfBytes,
    filename: `${input.certificateId}.pdf`,
    contentType: "application/pdf",
    keyPrefix: `certificates/${input.employerId}`
  });

  return tx.document.create({
    data: {
      employerId: input.employerId,
      entityType: "CERTIFICATE",
      entityId: input.certificateId,
      storageKey: upload.storageKey,
      filename: `${input.certificateId}.pdf`,
      contentType: "application/pdf",
      retentionCategory: "CERTIFICATE"
    }
  });
}

export async function issueEnrollmentCertificate(input: {
  employerId: string;
  actorUserId?: string | null;
  effectiveDate?: Date;
  expirationDate?: Date;
}) {
  const employer = await prisma.employer.findUnique({
    where: { id: input.employerId }
  });
  if (!employer) throw new Error("EMPLOYER_NOT_FOUND");

  const effectiveDate = input.effectiveDate || new Date();
  const expirationDate = input.expirationDate || employer.renewalDueDate || addOneYear(effectiveDate);
  const certificateId = generateCertificateId();

  const pdfBytes = await buildCertificatePdf({
    certificateId,
    legalName: employer.legalName,
    dotNumber: employer.dotNumber,
    effectiveDate,
    expirationDate
  });

  return prisma.$transaction(async (tx) => {
    const document = await createCertificateDocument(tx, {
      employerId: employer.id,
      certificateId,
      pdfBytes
    });

    const certificate = await tx.enrollmentCertificate.create({
      data: {
        id: certificateId,
        employerId: employer.id,
        effectiveDate,
        expirationDate,
        status: "ACTIVE",
        documentId: document.id
      }
    });

    await tx.auditLog.create({
      data: {
        userId: input.actorUserId || null,
        employerId: employer.id,
        action: "CERTIFICATE_GENERATED",
        entityType: "EnrollmentCertificate",
        entityId: certificate.id,
        metadata: {
          documentId: document.id
        }
      }
    });

    return { certificate, document, pdfBytes };
  });
}

export async function regenerateEnrollmentCertificate(input: { employerId: string; actorUserId?: string | null }) {
  const employer = await prisma.employer.findUnique({
    where: { id: input.employerId },
    include: {
      certificates: {
        where: { status: "ACTIVE" },
        orderBy: { createdAt: "desc" },
        take: 1
      }
    }
  });
  if (!employer) throw new Error("EMPLOYER_NOT_FOUND");
  if (employer.certificates.length === 0) {
    return issueEnrollmentCertificate({
      employerId: employer.id,
      actorUserId: input.actorUserId || null
    });
  }

  const certificate = employer.certificates[0];
  const pdfBytes = await buildCertificatePdf({
    certificateId: certificate.id,
    legalName: employer.legalName,
    dotNumber: employer.dotNumber,
    effectiveDate: certificate.effectiveDate,
    expirationDate: certificate.expirationDate
  });

  return prisma.$transaction(async (tx) => {
    const document = await createCertificateDocument(tx, {
      employerId: employer.id,
      certificateId: certificate.id,
      pdfBytes
    });

    const updated = await tx.enrollmentCertificate.update({
      where: { id: certificate.id },
      data: {
        documentId: document.id
      }
    });

    await tx.auditLog.create({
      data: {
        userId: input.actorUserId || null,
        employerId: employer.id,
        action: "CERTIFICATE_REGENERATED",
        entityType: "EnrollmentCertificate",
        entityId: certificate.id,
        metadata: {
          oldDocumentId: certificate.documentId,
          newDocumentId: document.id
        }
      }
    });

    return { certificate: updated, document, pdfBytes };
  });
}

export async function voidEnrollmentCertificate(input: {
  certificateId: string;
  reason: string;
  actorUserId: string;
}) {
  const certificate = await prisma.enrollmentCertificate.findUnique({
    where: { id: input.certificateId }
  });
  if (!certificate) throw new Error("CERTIFICATE_NOT_FOUND");

  if (certificate.status === EnrollmentCertificateStatus.VOID) return certificate;

  const updated = await prisma.enrollmentCertificate.update({
    where: { id: input.certificateId },
    data: {
      status: "VOID",
      voidedAt: new Date(),
      voidReason: input.reason
    }
  });

  await prisma.auditLog.create({
    data: {
      userId: input.actorUserId,
      employerId: updated.employerId,
      action: "CERTIFICATE_VOIDED",
      entityType: "EnrollmentCertificate",
      entityId: updated.id,
      metadata: {
        reason: input.reason
      }
    }
  });

  return updated;
}

export async function getPublicCertificateStatus(certificateId: string) {
  const certificate = await prisma.enrollmentCertificate.findUnique({
    where: { id: certificateId },
    include: {
      employer: {
        select: {
          legalName: true,
          dotNumber: true
        }
      }
    }
  });
  if (!certificate) return null;
  return {
    certificateId: certificate.id,
    legalName: certificate.employer.legalName,
    dotNumber: certificate.employer.dotNumber,
    effectiveDate: certificate.effectiveDate,
    expirationDate: certificate.expirationDate,
    status: certificate.status
  };
}

export async function getCertificateDownloadUrl(certificateId: string) {
  const certificate = await prisma.enrollmentCertificate.findUnique({
    where: { id: certificateId },
    include: { document: true }
  });
  if (!certificate) return null;
  const url = await buildDocumentDownloadUrl({
    storageKey: certificate.document.storageKey,
    filename: certificate.document.filename,
    contentType: certificate.document.contentType
  });
  return {
    certificate,
    url
  };
}
