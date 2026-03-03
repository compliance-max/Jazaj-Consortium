import path from "path";
import { promises as fs } from "fs";
import JSZip from "jszip";
import { beforeEach, describe, expect, test } from "vitest";
import { clearDatabase, testPrisma } from "./helpers/db";
import { generateAuditExport } from "@/lib/services/reports";

describe("Phase 6 audit export package", () => {
  beforeEach(async () => {
    await clearDatabase();
  });

  test("export generates ZIP with index.pdf and required CSV files", async () => {
    const admin = await testPrisma.employerUser.create({
      data: {
        email: "admin-export@example.com",
        fullName: "Admin Export",
        role: "CTPA_ADMIN",
        passwordSet: true
      }
    });

    const employer = await testPrisma.employer.create({
      data: {
        legalName: "Export Carrier",
        address: "400 Export Blvd",
        phone: "3135554000",
        email: "export@example.com",
        status: "ACTIVE"
      }
    });

    await testPrisma.driver.create({
      data: {
        employerId: employer.id,
        firstName: "Export",
        lastName: "Driver",
        dob: new Date("1991-01-01"),
        active: true,
        dotCovered: true
      }
    });

    await testPrisma.testRequest.create({
      data: {
        employerId: employer.id,
        reason: "USER_REQUEST",
        testType: "DRUG",
        status: "REQUESTED",
        paid: true,
        priceCents: 7500
      }
    });

    const result = await generateAuditExport({
      actorUserId: admin.id,
      employerId: employer.id
    });
    expect(result.downloadUrl).toContain("/api/documents/raw?");

    const url = new URL(result.downloadUrl);
    const key = url.searchParams.get("key");
    expect(key).toBeTruthy();

    const zipPath = path.join(process.cwd(), ".local-storage", key!);
    const buffer = await fs.readFile(zipPath);
    const zip = await JSZip.loadAsync(buffer);
    const fileNames = Object.keys(zip.files);

    expect(fileNames).toContain("index.pdf");
    expect(fileNames).toContain("drivers.csv");
    expect(fileNames).toContain("random_events.csv");
    expect(fileNames).toContain("random_selected.csv");
    expect(fileNames).toContain("test_requests.csv");
    expect(fileNames).toContain("documents.csv");
    expect(fileNames).toContain("payments.csv");
    expect(fileNames).toContain("certificates.csv");

    const driversCsv = await zip.file("drivers.csv")?.async("string");
    expect(driversCsv).toBeTruthy();
    const driversHeader = driversCsv!.split("\n")[0].toLowerCase();
    expect(driversHeader).not.toContain("dob");

    const documentsCsv = await zip.file("documents.csv")?.async("string");
    expect(documentsCsv).toBeTruthy();
    const documentsHeader = documentsCsv!.split("\n")[0].toLowerCase();
    expect(documentsHeader).not.toContain("signed_url");
    expect(documentsHeader).not.toContain("download_url");
  });
});
