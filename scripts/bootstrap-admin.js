const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.ADMIN_BOOTSTRAP_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_BOOTSTRAP_PASSWORD || "";
  const fullName = (process.env.ADMIN_BOOTSTRAP_NAME || "CTPA Admin").trim();

  if (!email) {
    throw new Error("ADMIN_BOOTSTRAP_EMAIL is required");
  }
  if (!password || password.length < 10) {
    throw new Error("ADMIN_BOOTSTRAP_PASSWORD is required (min 10 chars)");
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const now = new Date();

  const user = await prisma.employerUser.upsert({
    where: { email },
    update: {
      fullName,
      role: "CTPA_ADMIN",
      employerId: null,
      passwordHash,
      passwordSet: true,
      emailVerifiedAt: now
    },
    create: {
      email,
      fullName,
      role: "CTPA_ADMIN",
      employerId: null,
      passwordHash,
      passwordSet: true,
      emailVerifiedAt: now
    }
  });

  console.log("Admin bootstrap complete.");
  console.log(`email=${user.email}`);
  console.log("role=CTPA_ADMIN");
}

main()
  .catch((error) => {
    console.error("bootstrap-admin failed:", error.message);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
