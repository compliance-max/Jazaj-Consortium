import { UserRole } from "@prisma/client";

export function validateEmployerUserInvariant(input: { role: UserRole; employerId: string | null }) {
  if (input.role === "EMPLOYER_DER" && !input.employerId) {
    throw new Error("EMPLOYER_DER_REQUIRES_EMPLOYER");
  }

  if (input.role !== "EMPLOYER_DER" && input.employerId) {
    throw new Error("GLOBAL_ROLE_MUST_NOT_HAVE_EMPLOYER");
  }
}
