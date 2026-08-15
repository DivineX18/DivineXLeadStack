import "server-only";

import { randomBytes } from "node:crypto";
import { getAdminDb } from "@/lib/firebase/admin";

// Excludes visually ambiguous characters (0/O, 1/I/L) since codes get typed
// into URLs and read aloud on calls.
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 7;
const MAX_ATTEMPTS = 5;

function randomCode(): string {
  const bytes = randomBytes(CODE_LENGTH);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** Generates a unique affiliate code, checked against Firestore for
 *  collisions. Collision odds are astronomically low at this alphabet/length
 *  (32^7), but the check is cheap and this stays correct forever either way. */
export async function generateUniqueAffiliateCode(): Promise<string> {
  const db = getAdminDb();
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const code = randomCode();
    const existing = await db
      .collection("affiliates")
      .where("code", "==", code)
      .limit(1)
      .get();
    if (existing.empty) return code;
  }
  throw new Error("Could not generate a unique affiliate code after several attempts");
}
