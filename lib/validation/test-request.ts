import { z } from "zod";

export const portalTestRequestCreateSchema = z.object({
  driverId: z.string().optional().nullable(),
  testType: z.enum(["DRUG", "ALCOHOL", "BOTH"]),
  reasonDetail: z.enum(["PRE_EMPLOYMENT", "POST_ACCIDENT", "REASONABLE_SUSPICION", "USER_REQUEST"]).optional(),
  promoCode: z.string().max(64).optional().nullable()
});

export const adminTestRequestCreateSchema = portalTestRequestCreateSchema.extend({
  employerId: z.string().min(1)
});

export const assignClinicSchema = z.object({
  clinicId: z.string().min(1)
});

export const testRequestCheckoutSchema = z.object({
  promoCode: z.string().max(64).optional().nullable()
});

export const captureResultJsonSchema = z.object({
  resultStatus: z.enum(["NEGATIVE", "POSITIVE", "REFUSAL", "CANCELLED"]),
  collectedAt: z.coerce.date(),
  resultDate: z.coerce.date(),
  notes: z.string().max(4000).optional().nullable()
});
