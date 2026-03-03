import { fail } from "@/lib/http";
import { readLocalDocument, verifyLocalSignedToken } from "@/lib/storage/documents";

export async function GET(req: Request) {
  if (process.env.NODE_ENV === "production") return fail("Not found", 404);

  const url = new URL(req.url);
  const key = url.searchParams.get("key");
  const exp = url.searchParams.get("exp");
  const sig = url.searchParams.get("sig");
  const filename = url.searchParams.get("filename") || "document";

  if (!key || !exp || !sig) return fail("Not found", 404);
  const expNum = Number(exp);
  if (!Number.isFinite(expNum)) return fail("Not found", 404);
  const valid = verifyLocalSignedToken({
    storageKey: key,
    expiresAt: expNum,
    signature: sig
  });
  if (!valid) return fail("Not found", 404);

  try {
    const bytes = await readLocalDocument(key);
    return new Response(bytes, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`
      }
    });
  } catch {
    return fail("Not found", 404);
  }
}
