import { z } from "zod";

export const adminUsersQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
  role: z.enum(["CTPA_ADMIN", "CTPA_MANAGER", "EMPLOYER_DER", "READONLY_AUDITOR"]).optional()
});

export const adminCreateGlobalUserSchema = z.object({
  email: z.string().email().max(160),
  role: z.enum(["CTPA_ADMIN", "CTPA_MANAGER"])
});

export const adminCreateEmployerUserSchema = z.object({
  email: z.string().email().max(160),
  role: z.enum(["EMPLOYER_DER", "READONLY_AUDITOR"])
});

export const adminPatchUserSchema = z
  .object({
    role: z.enum(["CTPA_ADMIN", "CTPA_MANAGER", "EMPLOYER_DER", "READONLY_AUDITOR"]).optional(),
    disabled: z.boolean().optional()
  })
  .refine((value) => value.role !== undefined || value.disabled !== undefined, {
    message: "At least one field is required"
  });

export function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

export function normalizeQueryString(value?: string | null) {
  return value?.trim() || "";
}
