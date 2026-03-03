import { z } from "zod";
import { trimOrEmpty, upperOrNull, lowerOrEmpty } from "@/lib/validation/normalize";

export const employerCreateSchema = z.object({
  legalName: z.string().min(2).max(200),
  dotNumber: z.string().max(30).optional().nullable(),
  address: z.string().min(4).max(240),
  phone: z.string().min(7).max(40),
  email: z.string().email().max(160),
  timezone: z.string().min(3).max(80).optional(),
  poolMode: z.enum(["MASTER", "INDIVIDUAL"]).optional(),
  derEmail: z.string().email().max(160),
  derFullName: z.string().min(2).max(120)
});

export const employerUpdateSchema = z.object({
  legalName: z.string().min(2).max(200).optional(),
  dotNumber: z.string().max(30).optional().nullable(),
  address: z.string().min(4).max(240).optional(),
  phone: z.string().min(7).max(40).optional(),
  email: z.string().email().max(160).optional(),
  timezone: z.string().min(3).max(80).optional(),
  status: z.enum(["PENDING_PAYMENT", "ACTIVE", "INACTIVE"]).optional(),
  poolMode: z.enum(["MASTER", "INDIVIDUAL"]).optional(),
  migrateDrivers: z.boolean().optional()
});

export const portalCompanyUpdateSchema = z.object({
  address: z.string().min(4).max(240).optional(),
  phone: z.string().min(7).max(40).optional(),
  email: z.string().email().max(160).optional(),
  timezone: z.string().min(3).max(80).optional(),
  poolMode: z.enum(["MASTER", "INDIVIDUAL"]).optional()
});

export function normalizeEmployerCreateInput(input: z.infer<typeof employerCreateSchema>) {
  return {
    legalName: trimOrEmpty(input.legalName),
    dotNumber: upperOrNull(input.dotNumber),
    address: trimOrEmpty(input.address),
    phone: trimOrEmpty(input.phone),
    email: lowerOrEmpty(input.email),
    timezone: trimOrEmpty(input.timezone || "America/Detroit"),
    poolMode: input.poolMode || "INDIVIDUAL",
    derEmail: lowerOrEmpty(input.derEmail),
    derFullName: trimOrEmpty(input.derFullName)
  };
}

export function normalizeEmployerUpdateInput(input: z.infer<typeof employerUpdateSchema>) {
  return {
    legalName: input.legalName ? trimOrEmpty(input.legalName) : undefined,
    dotNumber: input.dotNumber !== undefined ? upperOrNull(input.dotNumber) : undefined,
    address: input.address ? trimOrEmpty(input.address) : undefined,
    phone: input.phone ? trimOrEmpty(input.phone) : undefined,
    email: input.email ? lowerOrEmpty(input.email) : undefined,
    timezone: input.timezone ? trimOrEmpty(input.timezone) : undefined,
    status: input.status,
    poolMode: input.poolMode,
    migrateDrivers: input.migrateDrivers ?? false
  };
}

export function normalizePortalCompanyUpdateInput(input: z.infer<typeof portalCompanyUpdateSchema>) {
  return {
    address: input.address ? trimOrEmpty(input.address) : undefined,
    phone: input.phone ? trimOrEmpty(input.phone) : undefined,
    email: input.email ? lowerOrEmpty(input.email) : undefined,
    timezone: input.timezone ? trimOrEmpty(input.timezone) : undefined,
    poolMode: input.poolMode
  };
}
