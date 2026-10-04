import type { PlanProduct } from "@/types/billing";
import Link from "next/link";
import type { ResolvedBrand } from "@/config/landing";
import { BrandLogo } from "./brand-logo";

/**
 * Flow's footer only lists what Flow still publishes. The retired marketing
 * routes permanently redirect to Ascend on this surface, and a footer link
 * to a redirect is an orphan pointing off the product.
 */
export function Footer({ brand, product }: { brand: ResolvedBrand; product: PlanProduct }) {
  const isFlow = product !== "unified";
  return (
    <footer className="border-t py-12">
      <div className="container mx-auto px-4">
        <div className="grid gap-8 sm:grid-cols-4">
          <div className="sm:col-span-1">
            <Link href="/" className="flex items-center gap-2 text-lg font-bold">
              <BrandLogo
                logoUrl={brand.logoUrl}
                name={brand.name}
                size={20}
                idSuffix="-footer"
                imgClassName="h-5 w-auto max-w-[100px] object-contain"
              />
              <span className="bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 bg-clip-text text-transparent">
                {brand.name}
              </span>
            </Link>
            {/* The period is appended only when the tagline lacks one.
                Ascend's tagline already ends in a full stop, so the hardcoded
                one rendered "Then fix it.." in the footer of every page. */}
            <p className="mt-3 text-sm text-muted-foreground">
              {/[.!?]$/.test(brand.tagline) ? brand.tagline : `${brand.tagline}.`}
            </p>
            {/* Parent-company attribution, and only on the surface DivineX
                owns. This footer is also the white-label one a buyer brands
                as their own product, so showing it unconditionally would
                stamp our name across every customer's deployment. `isFlow`
                is the same hostname-resolved flag the rest of this footer
                already uses. Deliberately quiet: a line of provenance, not
                a second call to action. */}
            {!isFlow && (
              <p className="mt-4 text-xs text-muted-foreground/70">
                Powered by{" "}
                <a
                  href="https://divinex.io"
                  aria-label={`DivineX, the parent company behind ${brand.name}`}
                  className="font-medium text-teal-500 transition-colors hover:text-teal-400 dark:text-teal-400 dark:hover:text-teal-300"
                >
                  DivineX
                </a>
              </p>
            )}
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold">Product</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {!isFlow && (
              <li>
                <Link
                  href="/platform"
                  className="transition-colors hover:text-foreground"
                >
                  Platform
                </Link>
              </li>
              )}
              <li>
                <Link
                  href="/features"
                  className="transition-colors hover:text-foreground"
                >
                  Features
                </Link>
              </li>
              <li>
                <Link
                  href="/pricing"
                  className="transition-colors hover:text-foreground"
                >
                  Pricing
                </Link>
              </li>
              {!isFlow && (
              <li>
                <Link
                  href="/implementation"
                  className="transition-colors hover:text-foreground"
                >
                  Implementation
                </Link>
              </li>
              )}
              {!isFlow && (
              <li>
                <Link
                  href="/industries"
                  className="transition-colors hover:text-foreground"
                >
                  Industries
                </Link>
              </li>
              )}
              {!isFlow && (
              <li>
                <Link
                  href="/faq"
                  className="transition-colors hover:text-foreground"
                >
                  FAQ
                </Link>
              </li>
              )}
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold">Legal</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link
                  href="/terms"
                  className="transition-colors hover:text-foreground"
                >
                  Terms of Service
                </Link>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="transition-colors hover:text-foreground"
                >
                  Privacy Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/refund-policy"
                  className="transition-colors hover:text-foreground"
                >
                  Refund Policy
                </Link>
              </li>
              <li>
                <Link
                  href="/responsible-ai"
                  className="transition-colors hover:text-foreground"
                >
                  Responsible AI
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold">Company</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {!isFlow && (
              <li>
                <Link
                  href="/about"
                  className="transition-colors hover:text-foreground"
                >
                  About
                </Link>
              </li>
              )}
              {!isFlow && (
              <li>
                <Link
                  href="/resources"
                  className="transition-colors hover:text-foreground"
                >
                  Resources
                </Link>
              </li>
              )}
              <li>
                <Link
                  href="/contact"
                  className="transition-colors hover:text-foreground"
                >
                  Contact us
                </Link>
              </li>
              <li>
                <a
                  href={`mailto:${brand.supportEmail}`}
                  className="transition-colors hover:text-foreground"
                >
                  {brand.supportEmail}
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t pt-8 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} {brand.name}. All rights
          reserved.
        </div>
      </div>
    </footer>
  );
}
