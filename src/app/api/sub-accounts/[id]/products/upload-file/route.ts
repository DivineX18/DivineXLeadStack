import { NextResponse } from "next/server";
import { requireSubAccountMember } from "@/lib/auth/require-tenancy";
import { getAdminStorageBucket } from "@/lib/firebase/admin";
import { MAX_PRODUCT_FILE_BYTES } from "@/lib/products/upload-file";

export const dynamic = "force-dynamic";

/**
 * Server-side digital-product file upload, via the Admin SDK.
 *
 * Originally this was a client-direct Firebase Storage upload (matching the
 * Community avatar/image pattern), gated by storage.rules' cross-service
 * firestore.get() membership check. That check turned out to be unreliable
 * on this project (Storage-to-Firestore cross-service rule evaluation
 * stayed broken well past normal propagation time, across two buckets in
 * two regions) — this route sidesteps it entirely: authorization happens
 * the normal way every other route in this app does it
 * (requireSubAccountMember), then the write goes through the Admin SDK,
 * which bypasses storage.rules altogether. storage.rules' productFiles
 * write path is now `allow write: if false` — nothing client-side writes
 * there anymore.
 *
 * Trade-off: request bodies on serverless functions are capped well below
 * the 250 MB client-direct-upload design (Vercel's default is ~4.5 MB) —
 * MAX_PRODUCT_FILE_BYTES reflects that new, smaller ceiling. Fine for
 * PDFs/guides/short audio; long-form video/course files need a different
 * mechanism later (out of scope for this pass).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: subAccountId } = await params;

  const access = await requireSubAccountMember(request, subAccountId);
  if (access instanceof NextResponse) return access;

  let file: File | null = null;
  try {
    const form = await request.formData();
    const f = form.get("file");
    if (f instanceof File) file = f;
  } catch {
    return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  }
  if (!file) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }
  if (file.size > MAX_PRODUCT_FILE_BYTES) {
    return NextResponse.json(
      {
        error: `File is too large — keep it under ${Math.round(MAX_PRODUCT_FILE_BYTES / (1024 * 1024))} MB.`,
      },
      { status: 400 },
    );
  }

  const uploadId = crypto.randomUUID();
  const safeName = file.name.replace(/[^\w.\-() ]+/g, "_").slice(0, 300) || "file";
  const path = `productFiles/${subAccountId}/${uploadId}/${safeName}`;
  const contentType = file.type || "application/octet-stream";

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    await getAdminStorageBucket().file(path).save(buffer, {
      resumable: false,
      metadata: { contentType },
    });
  } catch (err) {
    console.error("[products/upload-file] Storage write failed", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    storagePath: path,
    fileName: file.name,
    sizeBytes: file.size,
    contentType,
  });
}
