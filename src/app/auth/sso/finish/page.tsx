"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { signInWithCustomToken } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { createSessionCookie } from "@/lib/firebase/auth";
import { LogoMark } from "@/components/brand/logo-mark";
import { Loader2 } from "lucide-react";

/**
 * Phase E, client half. The callback route already did the hard work
 * (identity verification, workspace authorization, optional provisioning)
 * and left a short-lived HttpOnly bridge cookie. This page:
 *   1. POSTs to /api/auth/sso/exchange-bridge-token (cookie goes along
 *      automatically — never touched by this page's JS).
 *   2. Gets back a Firebase custom token in the JSON body (never a URL).
 *   3. signInWithCustomToken, then the EXISTING createSessionCookie() —
 *      identical to what the normal login form does.
 *   4. Redirects to the sub-account dashboard using ONLY the subAccountId
 *      the server just returned — never a query param, cookie, or
 *      localStorage value (Final rule 3).
 */
export default function SsoFinishPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      try {
        const res = await fetch("/api/auth/sso/exchange-bridge-token", {
          method: "POST",
        });
        const body = (await res.json().catch(() => ({}))) as {
          customToken?: string;
          subAccountId?: string;
          error?: string;
        };
        if (!res.ok || !body.customToken || !body.subAccountId) {
          throw new Error(body.error ?? "SSO sign-in failed");
        }

        const credential = await signInWithCustomToken(
          getFirebaseAuth(),
          body.customToken,
        );
        await createSessionCookie(credential.user);

        if (!cancelled) {
          router.replace(`/sa/${body.subAccountId}/dashboard`);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "SSO sign-in failed");
        }
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4 text-center">
        <div className="flex justify-center">
          <LogoMark size={28} idSuffix="-sso-finish" />
        </div>
        {error ? (
          <>
            <p className="text-sm font-medium text-destructive">
              Couldn&apos;t complete sign-in
            </p>
            <p className="text-sm text-muted-foreground">{error}</p>
            <a
              href={process.env.NEXT_PUBLIC_ASCEND_APP_URL ?? "/login"}
              className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
            >
              Back to Ascend
            </a>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Signing you into Growth Operations…
            </p>
          </>
        )}
      </div>
    </div>
  );
}
