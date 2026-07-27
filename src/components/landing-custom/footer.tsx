import Link from "next/link";
import type { ResolvedBrand } from "@/config/landing";
import { Logo } from "./logo";

export function Footer({ brand }: { brand: ResolvedBrand }) {
  return (
    <footer className="border-t py-12">
      <div className="container mx-auto px-4">
        <div className="grid gap-8 sm:grid-cols-4">
          <div className="sm:col-span-1">
            <Link href="/" className="flex items-center gap-2 text-lg font-bold">
              {brand.logoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={brand.logoUrl}
                  alt={`${brand.name} logo`}
                  className="h-5 w-auto max-w-[100px] object-contain"
                />
              ) : (
                <Logo size={20} idSuffix="-footer" />
              )}
              <span className="bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 bg-clip-text text-transparent">
                {brand.name}
              </span>
            </Link>
            <p className="mt-3 text-sm text-muted-foreground">
              {brand.tagline}.
            </p>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold">Product</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link
                  href="/platform"
                  className="transition-colors hover:text-foreground"
                >
                  Platform
                </Link>
              </li>
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
              <li>
                <Link
                  href="/implementation"
                  className="transition-colors hover:text-foreground"
                >
                  Implementation
                </Link>
              </li>
              <li>
                <Link
                  href="/faq"
                  className="transition-colors hover:text-foreground"
                >
                  FAQ
                </Link>
              </li>
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
            <h3 className="mb-3 text-sm font-semibold">Contact</h3>
            <ul className="space-y-2 text-sm text-muted-foreground">
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
              <li>
                <a
                  href={`https://${brand.primaryDomain}`}
                  className="transition-colors hover:text-foreground"
                >
                  {brand.primaryDomain}
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
