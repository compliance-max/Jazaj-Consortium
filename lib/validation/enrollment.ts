import { z } from "zod";
import { trimOrNull, upperOrNull } from "@/lib/validation/normalize";

export const enrollmentDriverSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  dob: z.string().min(8),
  cdlNumber: z.string().max(40).optional().nullable(),
  state: z.string().max(12).optional().nullable(),
  email: z.string().email().max(160).optional().nullable(),
  phone: z.string().max(40).optional().nullable()
});

export const enrollmentSchema = z.object({
  legalName: z.string().min(2).max(200),
  dotNumber: z.string().max(30).optional().nullable(),
  address: z.string().min(4).max(240),
  phone: z.string().min(7).max(40),
  contactName: z.string().min(2).max(120),
  contactEmail: z.string().email().max(160),
  promoCode: z.string().max(64).optional().nullable(),
  timezone: z.string().min(3).max(80).optional(),
  poolMode: z.enum(["MASTER", "INDIVIDUAL"]).optional(),
  drivers: z.array(enrollmentDriverSchema).max(100).optional().default([])
});

export function normalizeEnrollmentInput(input: z.infer<typeof enrollmentSchema>) {
  return {
    legalName: input.legalName.trim(),
    dotNumber: upperOrNull(input.dotNumber),
    address: input.address.trim(),
    phone: input.phone.trim(),
    contactName: input.contactName.trim(),
    contactEmail: input.contactEmail.trim().toLowerCase(),
    promoCode: trimOrNull(input.promoCode),
    timezone: input.timezone?.trim() || "America/Detroit",
    poolMode: input.poolMode || "INDIVIDUAL",
    drivers: (input.drivers || []).map((row) => ({
      firstName: row.firstName.trim(),
      lastName: row.lastName.trim(),
      dob: row.dob,
      cdlNumber: upperOrNull(row.cdlNumber),
      state: upperOrNull(row.state),
      email: trimOrNull(row.email)?.toLowerCase() || null,
      phone: trimOrNull(row.phone),
      dotCovered: true,
      active: true
    }))
  };
}
