const crypto = require("crypto");
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function hmac(input) {
  const secret = process.env.RANDOM_PROOF_SECRET || "demo-random-proof-secret";
  return crypto.createHmac("sha256", secret).update(input).digest("hex");
}

async function main() {
  const now = new Date();
  const year = 2026;
  const localBaseUrl = process.env.APP_URL || "http://localhost:3000";

  const adminPasswordHash = await bcrypt.hash("Password123!", 12);
  const derPasswordHash = await bcrypt.hash("Password123!", 12);

  const admin = await prisma.employerUser.upsert({
    where: { email: "admin@example.com" },
    update: {
      fullName: "CTPA Admin",
      role: "CTPA_ADMIN",
      employerId: null,
      passwordHash: adminPasswordHash,
      passwordSet: true,
      emailVerifiedAt: now
    },
    create: {
      email: "admin@example.com",
      fullName: "CTPA Admin",
      role: "CTPA_ADMIN",
      employerId: null,
      passwordHash: adminPasswordHash,
      passwordSet: true,
      emailVerifiedAt: now
    }
  });

  const existingEmployer = await prisma.employer.findFirst({
    where: { email: "ops@bestwayfreight.com" },
    select: { id: true }
  });
  const employer = existingEmployer
    ? await prisma.employer.update({
        where: { id: existingEmployer.id },
        data: {
          legalName: "Best Way Freight LLC",
          dotNumber: "1234567",
          address: "37354 Amherst Dr, Westland, MI 48185",
          phone: "313-784-8126",
          timezone: "America/Detroit",
          status: "ACTIVE",
          poolMode: "INDIVIDUAL",
          renewalDueDate: new Date(Date.UTC(2027, 0, 31))
        }
      })
    : await prisma.employer.create({
        data: {
          legalName: "Best Way Freight LLC",
          dotNumber: "1234567",
          address: "37354 Amherst Dr, Westland, MI 48185",
          phone: "313-784-8126",
          email: "ops@bestwayfreight.com",
          timezone: "America/Detroit",
          status: "ACTIVE",
          poolMode: "INDIVIDUAL",
          renewalDueDate: new Date(Date.UTC(2027, 0, 31))
        }
      });

  await prisma.$transaction(async (tx) => {
    await tx.chatConversation.deleteMany({ where: { employerId: employer.id } });
    await tx.randomSelectionEvent.deleteMany({ where: { employerId: employer.id } });
    await tx.poolSnapshot.deleteMany({ where: { employerId: employer.id } });
    await tx.complianceYearSummary.deleteMany({ where: { employerId: employer.id } });
    await tx.payment.deleteMany({ where: { employerId: employer.id } });
    await tx.testRequest.deleteMany({ where: { employerId: employer.id } });
    await tx.enrollmentCertificate.deleteMany({ where: { employerId: employer.id } });
    await tx.document.deleteMany({ where: { employerId: employer.id } });
    await tx.driverPoolMembership.deleteMany({ where: { driver: { employerId: employer.id } } });
    await tx.driver.deleteMany({ where: { employerId: employer.id } });
  });

  const der = await prisma.employerUser.upsert({
    where: { email: "der@example.com" },
    update: {
      fullName: "DER Manager",
      role: "EMPLOYER_DER",
      employerId: employer.id,
      passwordHash: derPasswordHash,
      passwordSet: true,
      emailVerifiedAt: now
    },
    create: {
      email: "der@example.com",
      fullName: "DER Manager",
      role: "EMPLOYER_DER",
      employerId: employer.id,
      passwordHash: derPasswordHash,
      passwordSet: true,
      emailVerifiedAt: now
    }
  });

  const pool = await prisma.pool.upsert({
    where: {
      employerId_type: {
        employerId: employer.id,
        type: "INDIVIDUAL"
      }
    },
    update: {
      dotAgency: "FMCSA",
      cadence: "QUARTERLY",
      timezone: "America/Detroit"
    },
    create: {
      type: "INDIVIDUAL",
      employerId: employer.id,
      dotAgency: "FMCSA",
      cadence: "QUARTERLY",
      timezone: "America/Detroit"
    }
  });

  await prisma.employer.update({
    where: { id: employer.id },
    data: {
      activePoolId: pool.id,
      poolMode: "INDIVIDUAL"
    }
  });

  const driversSeed = [
    ["Ethan", "Cole", "A1001"],
    ["Mason", "Blake", "A1002"],
    ["Noah", "Reed", "A1003"],
    ["Liam", "Brooks", "A1004"],
    ["Logan", "Hayes", "A1005"],
    ["Aiden", "Ward", "A1006"],
    ["Lucas", "Stone", "A1007"],
    ["James", "Price", "A1008"],
    ["Henry", "Miles", "A1009"],
    ["Owen", "Fox", "A1010"]
  ];

  const drivers = [];
  for (let i = 0; i < driversSeed.length; i += 1) {
    const seed = driversSeed[i];
    const d = await prisma.driver.create({
      data: {
        employerId: employer.id,
        firstName: seed[0],
        lastName: seed[1],
        dob: new Date(Date.UTC(1988 + (i % 8), i % 11, 10 + (i % 12))),
        cdlNumber: seed[2],
        state: "MI",
        email: `${seed[0].toLowerCase()}.${seed[1].toLowerCase()}@bestwayfreight.com`,
        phone: `31355501${String(i + 10).padStart(2, "0")}`,
        dotCovered: true,
        active: true,
        currentPoolId: pool.id
      }
    });
    drivers.push(d);

    await prisma.driverPoolMembership.create({
      data: {
        driverId: d.id,
        poolId: pool.id,
        effectiveStart: new Date(Date.UTC(2026, 0, 1)),
        changedByUserId: admin.id,
        reason: "seed_demo_assignment"
      }
    });
  }

  const clinic = await prisma.clinic.create({
    data: {
      name: "Detroit FastCare Clinic",
      address: "1122 W Jefferson Ave, Detroit, MI",
      phone: "313-555-4000",
      email: "detroit@fastcare.example",
      instructions: "Bring CDL and employer authorization.",
      active: true
    }
  });

  const period = await prisma.randomPeriod.upsert({
    where: {
      year_periodType_periodNumber: {
        year,
        periodType: "QUARTER",
        periodNumber: 1
      }
    },
    update: {},
    create: {
      year,
      periodType: "QUARTER",
      periodNumber: 1,
      startDate: new Date(Date.UTC(year, 0, 1)),
      endDate: new Date(Date.UTC(year, 2, 31))
    }
  });

  await prisma.poolSnapshot.upsert({
    where: {
      poolId_randomPeriodId_employerId: {
        poolId: pool.id,
        randomPeriodId: period.id,
        employerId: employer.id
      }
    },
    update: { coveredDriverCount: drivers.length },
    create: {
      poolId: pool.id,
      randomPeriodId: period.id,
      employerId: employer.id,
      coveredDriverCount: drivers.length
    }
  });

  const selectedDrivers = [drivers[1], drivers[4], drivers[7]];
  const eligibleIds = drivers.map((d) => d.id).sort();
  const selectedDrugIds = selectedDrivers.map((d) => d.id).sort();
  const eligibleHash = sha256(eligibleIds.join(","));
  const selectedHashDrug = sha256(selectedDrugIds.join(","));
  const selectedHashAlcohol = sha256("");
  const runAt = new Date(Date.UTC(year, 0, 8, 14, 30, 0));
  const algorithmVersion = "v1";
  const proofInput = `${pool.id}|${period.id}|${runAt.toISOString()}|${eligibleHash}|${selectedHashDrug}|${selectedHashAlcohol}|${algorithmVersion}`;

  const event = await prisma.randomSelectionEvent.upsert({
    where: { poolId_randomPeriodId: { poolId: pool.id, randomPeriodId: period.id } },
    update: {
      employerId: employer.id,
      eligibleCount: drivers.length,
      selectedCountDrug: selectedDrivers.length,
      selectedCountAlcohol: 0,
      eligibleHash,
      selectedHashDrug,
      selectedHashAlcohol,
      algorithmVersion,
      randomHmac: hmac(proofInput),
      selectionLocked: true,
      runAt
    },
    create: {
      poolId: pool.id,
      randomPeriodId: period.id,
      employerId: employer.id,
      eligibleCount: drivers.length,
      selectedCountDrug: selectedDrivers.length,
      selectedCountAlcohol: 0,
      eligibleHash,
      selectedHashDrug,
      selectedHashAlcohol,
      algorithmVersion,
      randomHmac: hmac(proofInput),
      selectionLocked: true,
      runAt
    }
  });

  await prisma.randomEligibleDriver.createMany({
    data: eligibleIds.map((driverId) => ({ selectionEventId: event.id, driverId })),
    skipDuplicates: true
  });

  const randomRequests = [];
  for (let i = 0; i < selectedDrivers.length; i += 1) {
    const d = selectedDrivers[i];
    const completed = i === 0;
    const tr = await prisma.testRequest.create({
      data: {
        employerId: employer.id,
        driverId: d.id,
        requestedByUserId: der.id,
        reason: "RANDOM",
        testType: "DRUG",
        priceCents: 0,
        paid: true,
        status: completed ? "COMPLETED" : i === 1 ? "SCHEDULED" : "REQUESTED",
        clinicId: clinic.id,
        collectedAt: completed ? new Date(Date.UTC(2026, 0, 12)) : null,
        completedAt: completed ? new Date(Date.UTC(2026, 0, 13)) : null,
        resultStatus: completed ? "NEGATIVE" : "PENDING",
        resultDate: completed ? new Date(Date.UTC(2026, 0, 13)) : null,
        resultReportedAt: completed ? new Date(Date.UTC(2026, 0, 13, 16, 10, 0)) : null,
        notes: completed ? "Specimen collected and finalized." : null
      }
    });
    randomRequests.push(tr);

    await prisma.randomSelectedDriver.create({
      data: {
        selectionEventId: event.id,
        driverId: d.id,
        employerId: employer.id,
        testType: "DRUG",
        status: completed ? "COMPLETED" : i === 1 ? "SCHEDULED" : "NOTIFIED",
        testRequestId: tr.id
      }
    });
  }

  const paidUserRequest = await prisma.testRequest.create({
    data: {
      employerId: employer.id,
      driverId: drivers[0].id,
      requestedByUserId: der.id,
      reason: "USER_REQUEST",
      testType: "BOTH",
      priceCents: 12500,
      paid: true,
      status: "REQUESTED",
      clinicId: clinic.id,
      resultStatus: "PENDING"
    }
  });

  await prisma.testRequest.create({
    data: {
      employerId: employer.id,
      driverId: drivers[2].id,
      requestedByUserId: der.id,
      reason: "USER_REQUEST",
      testType: "DRUG",
      priceCents: 7500,
      paid: false,
      status: "PENDING_PAYMENT",
      resultStatus: "PENDING"
    }
  });

  await prisma.payment.createMany({
    data: [
      {
        employerId: employer.id,
        type: "ENROLLMENT",
        amountCents: 9900,
        status: "PAID",
        stripeSessionId: `demo-enroll-${Date.now()}`,
        paidAt: now
      },
      {
        employerId: employer.id,
        testRequestId: paidUserRequest.id,
        type: "TEST_REQUEST",
        amountCents: 12500,
        status: "PAID",
        stripeSessionId: `demo-request-${Date.now() + 1}`,
        paidAt: now
      }
    ]
  });

  const certDocument = await prisma.document.create({
    data: {
      employerId: employer.id,
      entityType: "CERTIFICATE",
      entityId: employer.id,
      storageKey: `demo/certificates/${employer.id}.pdf`,
      filename: "consortium-enrollment-certificate.pdf",
      contentType: "application/pdf",
      retentionCategory: "CERTIFICATE"
    }
  });

  await prisma.enrollmentCertificate.create({
    data: {
      id: `CERT-${employer.id.slice(-8).toUpperCase()}`,
      employerId: employer.id,
      effectiveDate: new Date(Date.UTC(2026, 0, 1)),
      expirationDate: new Date(Date.UTC(2026, 11, 31)),
      status: "ACTIVE",
      documentId: certDocument.id
    }
  });

  await prisma.document.create({
    data: {
      employerId: employer.id,
      entityType: "TEST_REQUEST",
      entityId: randomRequests[0].id,
      storageKey: `demo/results/${randomRequests[0].id}.pdf`,
      filename: "random-test-result.pdf",
      contentType: "application/pdf",
      retentionCategory: "RANDOM"
    }
  });

  const conversation = await prisma.chatConversation.create({
    data: {
      source: "MEMBER",
      status: "OPEN",
      employerId: employer.id,
      userId: der.id,
      lastMessageAt: now,
      lastMessageText: "Please confirm clinic assignment timing."
    }
  });

  await prisma.chatMessage.createMany({
    data: [
      {
        conversationId: conversation.id,
        senderType: "MEMBER",
        senderUserId: der.id,
        messageText: "Can you confirm when clinic details will be sent?"
      },
      {
        conversationId: conversation.id,
        senderType: "ADMIN",
        senderUserId: admin.id,
        messageText: "Clinic instructions are being finalized and will be sent shortly.",
        readByMemberAt: now
      }
    ]
  });

  await prisma.complianceYearSummary.upsert({
    where: {
      poolId_employerId_year: {
        poolId: pool.id,
        employerId: employer.id,
        year: 2026
      }
    },
    update: {
      avgCoveredDrivers: 10,
      requiredDrug: 5,
      completedDrug: 1,
      requiredAlcohol: 1,
      completedAlcohol: 0,
      lastRecalcAt: now
    },
    create: {
      poolId: pool.id,
      employerId: employer.id,
      year: 2026,
      avgCoveredDrivers: 10,
      requiredDrug: 5,
      completedDrug: 1,
      requiredAlcohol: 1,
      completedAlcohol: 0,
      lastRecalcAt: now
    }
  });

  console.log("Demo seed complete.");
  console.log(`Local base URL: ${localBaseUrl}`);
  console.log(`Seeded employer: ${employer.legalName} (DOT: ${employer.dotNumber || "N/A"})`);
  console.log("Admin login: admin@example.com / Password123!");
  console.log("DER demo login: der@example.com / Password123!");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
