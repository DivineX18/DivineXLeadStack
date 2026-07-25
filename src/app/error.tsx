"use client";

import { useEffect } from "react";
import Link from "next/link";
import { LogoMark } from "@/components/brand/logo-mark";
import { Button } from "@/components/ui/button";
import { CUSTOM_BRAND } from "@/config/landing";

/**
 * App-wide error boundary (Next.js App Router `error.tsx` convention — must
 * be a Client Component, so it reads the static CUSTOM_BRAND constant
 * rather than the async, server-only resolveCustomBrand()). Catches any
 * uncaught rendering/runtime error below the root layout so a prospect
 * never sees Next's raw default error screen.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <Link href="/" className="inline-flex items-center gap-2">
          <LogoMark size={24} idSuffix="-error" />
          <span className="text-2xl font-bold">{CUSTOM_BRAND.name}</span>
        </Link>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            We hit an unexpected error. Try again, or head back to the dashboard.
          </p>
        </div>
        <div className="flex justify-center gap-3">
          <Button variant="outline" onClick={() => reset()}>
            Try again
          </Button>
          <Button render={<Link href="/dashboard" />}>Back to dashboard</Button>
        </div>
      </div>
    </div>
  );
}
