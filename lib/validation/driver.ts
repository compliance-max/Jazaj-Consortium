import { z } from "zod";
import { trimOrNull, upperOrNull } from "@/lib/validation/normalize";

const dateSchema = z.coerce.date();

export const driverCreateSchema = z.object({
  firstName: z.string().min(1).max(80),
  lastName: z.string().min(1).max(80),
  dob: dateSchema,
  cdlNumber: z.string().max(40).optional().nullable(),
  state: z.string().max(12).optional().nullable(),
  email: z.string().email().max(160).optional().nullable(),
  phone: z.string().max(40).optional().nullable(),
  dotCovered: z.boolean().optional().default(true),
  active: z.boolean().optional().default(true)
});

export const driverUpdateSchema = driverCreateSchema.extend({
  id: z.string().min(1)
});

export const driverDeactivateSchema = z.object({
  id: z.string().min(1)
});

export function normalizeDriverInput<T extends z.infer<typeof driverCreateSchema>>(input: T) {
  return {
    firstName: input.firstName.trim(),
    lastName: input.lastName.trim(),
    dob: input.dob,
    cdlNumber: upperOrNull(input.cdlNumber),
    state: upperOrNull(input.state),
    email: trimOrNull(input.email)?.toLowerCase() || null,
    phone: trimOrNull(input.phone),
    dotCovered: input.dotCovered ?? true,
    active: input.active ?? true
  };
}
