import { PrismaClient } from "@prisma/client";

export const testPrisma = new PrismaClient();

export async function clearDatabase() {
  await testPrisma.chatMessage.deleteMany();
  await testPrisma.chatConversation.deleteMany();
  await testPrisma.checkoutConfirmToken.deleteMany();
  await testPrisma.enrollmentCertificate.deleteMany();
  await testPrisma.document.deleteMany();
  await testPrisma.payment.deleteMany();
  await testPrisma.enrollmentSubmission.deleteMany();
  await testPrisma.clinic.deleteMany();
  await testPrisma.accountToken.deleteMany();
  await testPrisma.randomEligibleDriver.deleteMany();
  await testPrisma.randomSelectedDriver.deleteMany();
  await testPrisma.testRequest.deleteMany();
  await testPrisma.randomSelectionEvent.deleteMany();
  await testPrisma.poolSnapshot.deleteMany();
  await testPrisma.complianceYearSummary.deleteMany();
  await testPrisma.randomPeriod.deleteMany();
  await testPrisma.dotRateConfig.deleteMany();
  await testPrisma.driverPoolMembership.deleteMany();
  await testPrisma.auditLog.deleteMany();
  await testPrisma.driver.deleteMany();
  await testPrisma.employerUser.deleteMany();
  await testPrisma.pool.deleteMany();
  await testPrisma.employer.deleteMany();
}
