import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { prisma } from "@/lib/db/prisma";
import { buildDocumentDownloadUrl, uploadDocumentBinary } from "@/lib/storage/documents";

type ExportInput = {
  actorUserId: string;
  employerId?: string | null;
  dateFrom?: Date | null;
  dateTo?: Date | null;
};

type CsvColumn<T extends Record<string, unknown>> = {
  key: keyof T;
  label: string;
};

function toIsoDate(value: Date | null | undefined) {
  return value ? value.toISOString() : "";
}

function csvEscape(value: unknown) {
  if (value === null || value === undefined) return "";
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, "\"\"")}"`;
  }
  return stringValue;
}

function toCsv<T extends Record<string, unknown>>(rows: T[], columns: Array<CsvColumn<T>>) {
  const header = columns.map((column) => csvEscape(column.label)).join(",");
  const body = rows
    .map((row) => columns.map((column) => csvEscape(row[column.key])).join(","))
    .join("\n");
  return `${header}\n${body}\n`;
}

function toDateRangeFilter(input: { dateFrom?: Date | null; dateTo?: Date | null }) {
  if (!input.dateFrom && !input.dateTo) return undefined;
  return {
    ...(input.dateFrom ? { gte: input.dateFrom } : {}),
    ...(input.dateTo ? { lte: input.dateTo } : {})
  };
}

async function buildIndexPdf(input: {
  employerScopeLabel: string;
  dateFrom?: Date | null;
  dateTo?: Date | null;
  totals: {
    employers: number;
    drivers: number;
    randomEvents: number;
    randomSelected: number;
    testRequests: number;
    documents: number;
    payments: number;
    certificates: number;
  };
  complianceSummary: {
    avgCoveredDrivers: number;
    requiredDrug: number;
    completedDrug: number;
    requiredAlcohol: number;
    completedAlcohol: number;
  };
}) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([792, 612]);
  const fontRegular = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  page.drawText("Consortium Audit Export Package", {
    x: 44,
    y: 560,
    size: 28,
    font: fontBold,
    color: rgb(0.08, 0.24, 0.5)
  });

  page.drawText(`Scope: ${input.employerScopeLabel}`, { x: 44, y: 524, size: 12, font: fontRegular });
  page.drawText(
    `Date range: ${input.dateFrom ? input.dateFrom.toISOString().slice(0, 10) : "ALL"} to ${
      input.dateTo ? input.dateTo.toISOString().slice(0, 10) : "ALL"
    }`,
    { x: 44, y: 506, size: 12, font: fontRegular }
  );

  const totals = [
    `Employers: ${input.totals.employers}`,
    `Drivers: ${input.totals.drivers}`,
    `Random events: ${input.totals.randomEvents}`,
    `Random selections: ${input.totals.randomSelected}`,
    `Test requests: ${input.totals.testRequests}`,
    `Documents: ${input.totals.documents}`,
    `Payments: ${input.totals.payments}`,
    `Certificates: ${input.totals.certificates}`
  ];

  page.drawText("Package Totals", { x: 44, y: 468, size: 14, font: fontBold });
  let y = 448;
  for (const line of totals) {
    page.drawText(line, { x: 54, y, size: 11, font: fontRegular });
    y -= 18;
  }

  page.drawText("Compliance Summary", { x: 44, y: 282, size: 14, font: fontBold });
  const compliance = input.complianceSummary;
  const complianceLines = [
    `Average covered drivers: ${compliance.avgCoveredDrivers.toFixed(2)}`,
    `Required drug randoms: ${compliance.requiredDrug}`,
    `Completed drug randoms: ${compliance.completedDrug}`,
    `Required alcohol randoms: ${compliance.requiredAlcohol}`,
    `Completed alcohol randoms: ${compliance.completedAlcohol}`
  ];
  y = 262;
  for (const line of complianceLines) {
    page.drawText(line, { x: 54, y, size: 11, font: fontRegular });
    y -= 18;
  }

  page.drawText(
    "Integrity evidence: random event eligible/selected hashes plus randomHmac provide reproducibility verification.",
    {
      x: 44,
      y: 130,
      size: 10,
      font: fontRegular,
      color: rgb(0.25, 0.25, 0.25),
      maxWidth: 700
    }
  );

  page.drawText(`Generated at: ${new Date().toISOString()}`, {
    x: 44,
    y: 96,
    size: 10,
    font: fontRegular,
    color: rgb(0.35, 0.35, 0.35)
  });

  return Buffer.from(await pdf.save());
}

export async function generateAuditExport(input: ExportInput) {
  const createdAtRange = toDateRangeFilter({
    dateFrom: input.dateFrom,
    dateTo: input.dateTo
  });

  const employerWhere = {
    ...(input.employerId ? { id: input.employerId } : {}),
    ...(createdAtRange ? { createdAt: createdAtRange } : {})
  };

  const employers = await prisma.employer.findMany({
    where: employerWhere,
    orderBy: { createdAt: "asc" }
  });
  const employerIds = employers.map((row) => row.id);
  const [drivers, randomEvents, randomSelected, testRequests, documents, payments, certificates, summaries] =
    await Promise.all([
      prisma.driver.findMany({
        where: {
          ...(input.employerId ? { employerId: input.employerId } : employerIds.length ? { employerId: { in: employerIds } } : {}),
          ...(createdAtRange ? { createdAt: createdAtRange } : {})
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      }),
      prisma.randomSelectionEvent.findMany({
        where: {
          ...(createdAtRange ? { runAt: createdAtRange } : {}),
          ...(input.employerId
            ? {
                OR: [
                  { employerId: input.employerId },
                  {
                    selectedDrivers: {
                      some: {
                        employerId: input.employerId
                      }
                    }
                  }
                ]
              }
            : {})
        },
        include: {
          randomPeriod: true
        },
        orderBy: [{ runAt: "asc" }, { id: "asc" }]
      }),
      prisma.randomSelectedDriver.findMany({
        where: {
          ...(input.employerId ? { employerId: input.employerId } : {}),
          ...(input.dateFrom || input.dateTo
            ? {
                selectionEvent: {
                  runAt: createdAtRange
                }
              }
            : {})
        },
        include: {
          selectionEvent: {
            include: {
              randomPeriod: true
            }
          }
        },
        orderBy: [{ selectionEvent: { runAt: "asc" } }, { id: "asc" }]
      }),
      prisma.testRequest.findMany({
        where: {
          ...(input.employerId
            ? { employerId: input.employerId }
            : employerIds.length
              ? { employerId: { in: employerIds } }
              : {}),
          ...(createdAtRange ? { createdAt: createdAtRange } : {})
        },
        include: {
          randomSelected: {
            select: {
              selectionEventId: true
            }
          }
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      }),
      prisma.document.findMany({
        where: {
          ...(input.employerId ? { employerId: input.employerId } : {}),
          ...(createdAtRange ? { createdAt: createdAtRange } : {})
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      }),
      prisma.payment.findMany({
        where: {
          ...(input.employerId ? { employerId: input.employerId } : {}),
          ...(createdAtRange ? { createdAt: createdAtRange } : {})
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      }),
      prisma.enrollmentCertificate.findMany({
        where: {
          ...(input.employerId ? { employerId: input.employerId } : {}),
          ...(createdAtRange ? { createdAt: createdAtRange } : {})
        },
        include: {
          document: {
            select: {
              storageKey: true,
              filename: true
            }
          }
        },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }]
      }),
      prisma.complianceYearSummary.findMany({
        where: {
          ...(input.employerId ? { employerId: input.employerId } : { employerId: null })
        }
      })
    ]);

  const complianceSummary = summaries.reduce(
    (acc, row) => {
      acc.avgCoveredDrivers += row.avgCoveredDrivers;
      acc.requiredDrug += row.requiredDrug;
      acc.completedDrug += row.completedDrug;
      acc.requiredAlcohol += row.requiredAlcohol;
      acc.completedAlcohol += row.completedAlcohol;
      return acc;
    },
    {
      avgCoveredDrivers: 0,
      requiredDrug: 0,
      completedDrug: 0,
      requiredAlcohol: 0,
      completedAlcohol: 0
    }
  );

  const zip = new JSZip();

  const indexPdf = await buildIndexPdf({
    employerScopeLabel: input.employerId
      ? `Employer ${input.employerId}`
      : "All employers (system-wide export)",
    dateFrom: input.dateFrom || null,
    dateTo: input.dateTo || null,
    totals: {
      employers: employers.length,
      drivers: drivers.length,
      randomEvents: randomEvents.length,
      randomSelected: randomSelected.length,
      testRequests: testRequests.length,
      documents: documents.length,
      payments: payments.length,
      certificates: certificates.length
    },
    complianceSummary
  });
  zip.file("index.pdf", indexPdf);

  if (!input.employerId) {
    zip.file(
      "employers.csv",
      toCsv(
        employers.map((row) => ({
          id: row.id,
          legalName: row.legalName,
          dotNumber: row.dotNumber || "",
          email: row.email,
          status: row.status,
          poolMode: row.poolMode,
          activePoolId: row.activePoolId || "",
          renewalDueDate: toIsoDate(row.renewalDueDate),
          createdAt: toIsoDate(row.createdAt)
        })),
        [
          { key: "id", label: "id" },
          { key: "legalName", label: "legal_name" },
          { key: "dotNumber", label: "dot_number" },
          { key: "email", label: "email" },
          { key: "status", label: "status" },
          { key: "poolMode", label: "pool_mode" },
          { key: "activePoolId", label: "active_pool_id" },
          { key: "renewalDueDate", label: "renewal_due_date" },
          { key: "createdAt", label: "created_at" }
        ]
      )
    );
  }

  zip.file(
    "drivers.csv",
    toCsv(
      drivers.map((row) => ({
        id: row.id,
        employerId: row.employerId,
        firstName: row.firstName,
        lastName: row.lastName,
        active: row.active,
        dotCovered: row.dotCovered,
        cdlNumber: row.cdlNumber || "",
        state: row.state || "",
        createdAt: toIsoDate(row.createdAt)
      })),
      [
        { key: "id", label: "id" },
        { key: "employerId", label: "employer_id" },
        { key: "firstName", label: "first_name" },
        { key: "lastName", label: "last_name" },
        { key: "active", label: "active" },
        { key: "dotCovered", label: "dot_covered" },
        { key: "cdlNumber", label: "cdl_number" },
        { key: "state", label: "state" },
        { key: "createdAt", label: "created_at" }
      ]
    )
  );

  zip.file(
    "random_events.csv",
    toCsv(
      randomEvents.map((row) => ({
        id: row.id,
        poolId: row.poolId,
        employerId: row.employerId || "",
        year: row.randomPeriod.year,
        quarter: row.randomPeriod.periodNumber,
        eligibleCount: row.eligibleCount,
        selectedCountDrug: row.selectedCountDrug,
        selectedCountAlcohol: row.selectedCountAlcohol,
        eligibleHash: row.eligibleHash,
        selectedHashDrug: row.selectedHashDrug,
        selectedHashAlcohol: row.selectedHashAlcohol,
        algorithmVersion: row.algorithmVersion,
        randomHmac: row.randomHmac,
        runAt: toIsoDate(row.runAt)
      })),
      [
        { key: "id", label: "id" },
        { key: "poolId", label: "pool_id" },
        { key: "employerId", label: "employer_id" },
        { key: "year", label: "year" },
        { key: "quarter", label: "quarter" },
        { key: "eligibleCount", label: "eligible_count" },
        { key: "selectedCountDrug", label: "selected_count_drug" },
        { key: "selectedCountAlcohol", label: "selected_count_alcohol" },
        { key: "eligibleHash", label: "eligible_hash" },
        { key: "selectedHashDrug", label: "selected_hash_drug" },
        { key: "selectedHashAlcohol", label: "selected_hash_alcohol" },
        { key: "algorithmVersion", label: "algorithm_version" },
        { key: "randomHmac", label: "random_hmac" },
        { key: "runAt", label: "run_at" }
      ]
    )
  );

  zip.file(
    "random_selected.csv",
    toCsv(
      randomSelected.map((row) => ({
        id: row.id,
        eventId: row.selectionEventId,
        employerId: row.employerId,
        driverId: row.driverId,
        testType: row.testType,
        status: row.status,
        testRequestId: row.testRequestId || "",
        runAt: toIsoDate(row.selectionEvent.runAt),
        year: row.selectionEvent.randomPeriod.year,
        quarter: row.selectionEvent.randomPeriod.periodNumber
      })),
      [
        { key: "id", label: "id" },
        { key: "eventId", label: "selection_event_id" },
        { key: "employerId", label: "employer_id" },
        { key: "driverId", label: "driver_id" },
        { key: "testType", label: "test_type" },
        { key: "status", label: "status" },
        { key: "testRequestId", label: "test_request_id" },
        { key: "runAt", label: "run_at" },
        { key: "year", label: "year" },
        { key: "quarter", label: "quarter" }
      ]
    )
  );

  zip.file(
    "test_requests.csv",
    toCsv(
      testRequests.map((row) => ({
        id: row.id,
        employerId: row.employerId,
        driverId: row.driverId || "",
        reason: row.reason,
        testType: row.testType,
        status: row.status,
        paid: row.paid,
        priceCents: row.priceCents,
        resultStatus: row.resultStatus,
        collectedAt: toIsoDate(row.collectedAt),
        resultDate: toIsoDate(row.resultDate),
        resultReportedAt: toIsoDate(row.resultReportedAt),
        createdAt: toIsoDate(row.createdAt)
      })),
      [
        { key: "id", label: "id" },
        { key: "employerId", label: "employer_id" },
        { key: "driverId", label: "driver_id" },
        { key: "reason", label: "reason" },
        { key: "testType", label: "test_type" },
        { key: "status", label: "status" },
        { key: "paid", label: "paid" },
        { key: "priceCents", label: "price_cents" },
        { key: "resultStatus", label: "result_status" },
        { key: "collectedAt", label: "collected_at" },
        { key: "resultDate", label: "result_date" },
        { key: "resultReportedAt", label: "result_reported_at" },
        { key: "createdAt", label: "created_at" }
      ]
    )
  );

  zip.file(
    "documents.csv",
    toCsv(
      documents.map((row) => ({
        id: row.id,
        employerId: row.employerId || "",
        entityType: row.entityType,
        entityId: row.entityId,
        filename: row.filename,
        contentType: row.contentType,
        storageKey: row.storageKey,
        retentionCategory: row.retentionCategory,
        createdAt: toIsoDate(row.createdAt)
      })),
      [
        { key: "id", label: "id" },
        { key: "employerId", label: "employer_id" },
        { key: "entityType", label: "entity_type" },
        { key: "entityId", label: "entity_id" },
        { key: "filename", label: "filename" },
        { key: "contentType", label: "content_type" },
        { key: "storageKey", label: "storage_key" },
        { key: "retentionCategory", label: "retention_category" },
        { key: "createdAt", label: "created_at" }
      ]
    )
  );

  zip.file(
    "payments.csv",
    toCsv(
      payments.map((row) => ({
        id: row.id,
        employerId: row.employerId || "",
        testRequestId: row.testRequestId || "",
        type: row.type,
        amountCents: row.amountCents,
        status: row.status,
        stripeSessionId: row.stripeSessionId,
        stripePaymentIntentId: row.stripePaymentIntentId || "",
        createdAt: toIsoDate(row.createdAt),
        paidAt: toIsoDate(row.paidAt)
      })),
      [
        { key: "id", label: "id" },
        { key: "employerId", label: "employer_id" },
        { key: "testRequestId", label: "test_request_id" },
        { key: "type", label: "type" },
        { key: "amountCents", label: "amount_cents" },
        { key: "status", label: "status" },
        { key: "stripeSessionId", label: "stripe_session_id" },
        { key: "stripePaymentIntentId", label: "stripe_payment_intent_id" },
        { key: "createdAt", label: "created_at" },
        { key: "paidAt", label: "paid_at" }
      ]
    )
  );

  zip.file(
    "certificates.csv",
    toCsv(
      certificates.map((row) => ({
        id: row.id,
        employerId: row.employerId,
        status: row.status,
        effectiveDate: toIsoDate(row.effectiveDate),
        expirationDate: toIsoDate(row.expirationDate),
        voidedAt: toIsoDate(row.voidedAt),
        voidReason: row.voidReason || "",
        documentStorageKey: row.document.storageKey,
        documentFilename: row.document.filename,
        createdAt: toIsoDate(row.createdAt)
      })),
      [
        { key: "id", label: "certificate_id" },
        { key: "employerId", label: "employer_id" },
        { key: "status", label: "status" },
        { key: "effectiveDate", label: "effective_date" },
        { key: "expirationDate", label: "expiration_date" },
        { key: "voidedAt", label: "voided_at" },
        { key: "voidReason", label: "void_reason" },
        { key: "documentStorageKey", label: "document_storage_key" },
        { key: "documentFilename", label: "document_filename" },
        { key: "createdAt", label: "created_at" }
      ]
    )
  );

  const zipBytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  const filename = `audit-export-${input.employerId || "all"}-${new Date().toISOString().slice(0, 10)}.zip`;
  const keyPrefixRoot = process.env.AUDIT_EXPORT_PREFIX || "audit-exports";
  const uploaded = await uploadDocumentBinary({
    buffer: zipBytes,
    filename,
    contentType: "application/zip",
    keyPrefix: `${keyPrefixRoot}/${input.employerId || "all"}`
  });
  const downloadUrl = await buildDocumentDownloadUrl({
    storageKey: uploaded.storageKey,
    filename,
    contentType: "application/zip"
  });

  await prisma.auditLog.create({
    data: {
      userId: input.actorUserId,
      employerId: input.employerId || null,
      action: "EXPORT_AUDIT",
      entityType: "AuditExport",
      entityId: uploaded.storageKey,
      metadata: {
        employerId: input.employerId || null,
        storageKey: uploaded.storageKey,
        filename,
        dateFrom: input.dateFrom?.toISOString() || null,
        dateTo: input.dateTo?.toISOString() || null,
        totals: {
          employers: employers.length,
          drivers: drivers.length,
          randomEvents: randomEvents.length,
          randomSelected: randomSelected.length,
          testRequests: testRequests.length,
          documents: documents.length,
          payments: payments.length,
          certificates: certificates.length
        }
      }
    }
  });

  return {
    filename,
    storageKey: uploaded.storageKey,
    downloadUrl,
    totals: {
      employers: employers.length,
      drivers: drivers.length,
      randomEvents: randomEvents.length,
      randomSelected: randomSelected.length,
      testRequests: testRequests.length,
      documents: documents.length,
      payments: payments.length,
      certificates: certificates.length
    }
  };
}
