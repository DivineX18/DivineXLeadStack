import Link from "next/link";
import { LogoMark } from "@/components/brand/logo-mark";
import { Button } from "@/components/ui/button";
import { resolveCustomBrand } from "@/lib/landing/resolve-brand";

/**
 * App-wide 404 — matches every other Next.js route unless a page defines
 * its own more specific "not found" state (several detail pages already
 * do, e.g. contacts/[id], forms/[id]). Reuses the auth pages' visual
 * language rather than inventing a new layout.
 */
export default async function NotFound() {
  const brand = await resolveCustomBrand();
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6 text-center">
        <Link href="/" className="inline-flex items-center gap-2">
          <LogoMark size={24} idSuffix="-404" />
          <span className="text-2xl font-bold">{brand.name}</span>
        </Link>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">Page not found</h1>
          <p className="text-sm text-muted-foreground">
            The page you&apos;re looking for doesn&apos;t exist, or may have moved.
          </p>
        </div>
        <Button render={<Link href="/" />}>Back to home</Button>
      </div>
    </div>
  );
}
