import { ok } from "@/lib/http";

export async function GET() {
  return ok({
    demoMode: process.env.DEMO_MODE === "true"
  });
}

