"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LogoMark } from "@/components/brand/logo-mark";
import { AlertCircle } from "lucide-react";

/**
 * Friendly landing for any Phase A/B/C failure in the SSO callback (see
 * /api/auth/sso/callback) — the callback always redirects here with a
 * sanitized `reason` code, never a raw error. This page is the ONLY place
 * that translates those codes into human copy.
 */
const REASON_COPY: Record<string, string> = {
  missing_code: "That sign-in link is missing its authorization code. Go back to Ascend and click Operations again.",
  not_configured: "Operations sign-in isn't configured on this deployment yet.",
  exchange_rejected: "Ascend couldn't verify that sign-in request. It may have expired — go back and try again.",
  network_error: "Couldn't reach Ascend to verify your sign-in. Try again in a moment.",
  unverified_email: "Your Ascend account needs a verified email address before you can use Operations.",
  workspace_unavailable: "The Growth Operations workspace for your account isn't available right now.",
  role_not_recognized: "Your account's assigned role isn't recognized on this workspace. Contact support.",
  account_unavailable: "Your Growth Operations account can't be used for sign-in right now. Contact support.",
  no_workspace_access: "Your account doesn't have active access to this workspace. Contact support.",
  role_mismatch: "Your account's role doesn't match what's expected. Contact support so this can be corrected.",
  setup_needed: "Your Growth Operations workspace hasn't been set up yet. Contact support to finish setup.",
  provisioning_failed: "Couldn't set up your Growth Operations account. Try again, or contact support.",
};

function SsoErrorContent() {
  const params = useSearchParams();
  const reason = params.get("reason") ?? "";
  const message =
    REASON_COPY[reason] ??
    "Something went wrong completing sign-in. Try again, or contact support.";

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-4 text-center">
        <div className="flex justify-center">
          <LogoMark size={28} idSuffix="-sso-error" />
        </div>
        <AlertCircle className="mx-auto h-8 w-8 text-amber-500" />
        <p className="text-sm font-medium">Couldn&apos;t sign you in</p>
        <p className="text-sm text-muted-foreground">{message}</p>
        <a
          href={process.env.NEXT_PUBLIC_ASCEND_APP_URL ?? "/login"}
          className="inline-block text-sm font-medium text-primary underline-offset-4 hover:underline"
        >
          Back to Ascend
        </a>
      </div>
    </div>
  );
}

export default function SsoErrorPage() {
  return (
    <Suspense fallback={<div className="min-h-screen" />}>
      <SsoErrorContent />
    </Suspense>
  );
}
