import { redirect } from "next/navigation";
import { auth } from "@/auth";

const ADMIN_ROLES = new Set(["CTPA_ADMIN", "CTPA_MANAGER"]);
const PORTAL_ROLES = new Set(["EMPLOYER_DER", "READONLY_AUDITOR"]);

export default async function PostLoginRedirectPage() {
  const session = await auth();
  const user = session?.user;

  if (!user?.id) {
    redirect("/login?error=session");
  }

  if (user.disabledAt) {
    redirect("/login?error=disabled");
  }

  if (user.role && ADMIN_ROLES.has(user.role)) {
    redirect("/admin");
  }

  if (user.role && PORTAL_ROLES.has(user.role)) {
    if (!user.employerId) {
      redirect("/login?error=scope");
    }

    if (!user.emailVerifiedAt) {
      redirect("/verify-email?required=1");
    }

    redirect("/portal");
  }

  redirect("/login?error=role");
}
