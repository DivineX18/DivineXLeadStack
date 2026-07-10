import "server-only";

import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { verifyActivationToken } from "@/lib/auth/activation-token";

/**
 * Public — the /activate/[token] page posts here to let a brand-new
 * self-serve signup set the password on the Firebase Auth account that was
 * created server-side (with a random, never-shared password) when their
 * checkout completed. Single-use: the token is checked against the SHA-256
 * hash stored on `accountActivations/{uid}` and the doc is marked consumed
 * on success, mirroring the checkout/quote token pattern used elsewhere.
 */

interface ActivateBody {
  token?: string;
  password?: string;
}

export async function POST(request: Request) {
  let body: ActivateBody;
  try {
    body = (await request.json()) as ActivateBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const token = typeof body.token === "string" ? body.token : "";
  const password = typeof body.password === "string" ? body.password : "";
  if (!token) {
    return NextResponse.json({ error: "Missing activation token." }, { status: 400 });
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "Password must be at least 6 characters." },
      { status: 400 },
    );
  }

  const verified = verifyActivationToken(token);
  if (!verified) {
    return NextResponse.json(
      { error: "This activation link isn't valid." },
      { status: 404 },
    );
  }

  const db = getAdminDb();
  const activationRef = db.doc(`accountActivations/${verified.uid}`);
  const snap = await activationRef.get();
  if (!snap.exists) {
    return NextResponse.json(
      { error: "This activation link isn't valid." },
      { status: 404 },
    );
  }
  const activation = snap.data() as {
    tokenHash?: string;
    consumedAt?: unknown;
    expiresAt?: Timestamp;
    email?: string;
    subAccountId?: string;
  };

  if (activation.tokenHash !== verified.hash) {
    return NextResponse.json(
      { error: "A newer activation link has been issued. Use the most recent email." },
      { status: 409 },
    );
  }
  if (activation.consumedAt) {
    return NextResponse.json(
      { error: "This link has already been used. Log in with your password, or reset it." },
      { status: 409 },
    );
  }
  if (activation.expiresAt && activation.expiresAt.toMillis() < Date.now()) {
    return NextResponse.json(
      { error: "This activation link has expired. Contact support for a new one." },
      { status: 410 },
    );
  }

  try {
    await getAdminAuth().updateUser(verified.uid, { password });
  } catch (err) {
    console.error("[api/auth/activate] updateUser failed", err);
    return NextResponse.json(
      { error: "Could not set your password. Please try again." },
      { status: 500 },
    );
  }

  await activationRef.update({ consumedAt: new Date() });

  return NextResponse.json({
    email: activation.email ?? "",
    subAccountId: activation.subAccountId ?? "",
  });
}
