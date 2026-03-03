import { fail, ok } from "@/lib/http";
import { requireAdminOrManager } from "@/lib/auth/guard";
import { captureResultJsonSchema } from "@/lib/validation/test-request";
import { captureTestResult } from "@/lib/services/test-requests";

type ParseUploadResult =
  | {
      data: {
        resultStatus: "NEGATIVE" | "POSITIVE" | "REFUSAL" | "CANCELLED";
        collectedAt: Date;
        resultDate: Date;
        notes?: string | null;
      };
      documents: Array<{ filename: string; contentType: string; data: Buffer }>;
    }
  | {
      error: string;
    };

async function parseUploadRequest(req: Request): Promise<ParseUploadResult> {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    const body = await req.json().catch(() => null);
    const parsed = captureResultJsonSchema.safeParse(body);
    if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Invalid payload" } satisfies ParseUploadResult;
    return {
      data: parsed.data,
      documents: [] as Array<{ filename: string; contentType: string; data: Buffer }>
    } satisfies ParseUploadResult;
  }

  const form = await req.formData();
  const parsed = captureResultJsonSchema.safeParse({
    resultStatus: form.get("resultStatus"),
    collectedAt: form.get("collectedAt"),
    resultDate: form.get("resultDate"),
    notes: form.get("notes") || null
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message || "Invalid payload" } satisfies ParseUploadResult;

  const documents: Array<{ filename: string; contentType: string; data: Buffer }> = [];
  for (const value of form.getAll("files")) {
    if (!(value instanceof File)) continue;
    if (value.size <= 0) continue;
    documents.push({
      filename: value.name || "result.pdf",
      contentType: value.type || "application/octet-stream",
      data: Buffer.from(await value.arrayBuffer())
    });
  }

  return {
    data: parsed.data,
    documents
  } satisfies ParseUploadResult;
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  try {
    const actor = await requireAdminOrManager();
    const parsed = await parseUploadRequest(req);
    if ("error" in parsed) return fail(parsed.error, 422);

    const result = await captureTestResult({
      requestId: ctx.params.id,
      actorUserId: actor.id,
      resultStatus: parsed.data.resultStatus,
      collectedAt: parsed.data.collectedAt,
      resultDate: parsed.data.resultDate,
      notes: parsed.data.notes || null,
      documents: parsed.documents
    });

    return ok(result);
  } catch (error) {
    if (error instanceof Error && error.message === "REQUEST_NOT_FOUND") return fail("Request not found", 404);
    if (error instanceof Error && error.message === "REQUEST_NOT_PAID") return fail("Request is unpaid", 409);
    if (process.env.NODE_ENV !== "production") {
      return fail(error instanceof Error ? error.message : "Forbidden", 403);
    }
    return fail("Forbidden", 403);
  }
}
