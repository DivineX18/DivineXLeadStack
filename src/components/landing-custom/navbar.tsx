"use client";

import type { PlanProduct } from "@/types/billing";

import { useState } from "react";
import Link from "next/link";
import { ChevronDown, Menu } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetClose,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ResolvedBrand } from "@/config/landing";
import { BrandLogo } from "./brand-logo";

/** Flat row stays to the three pages a prospect actually needs to decide
 * "is this for me and what does it cost": Platform, Industries, Pricing.
 * Everything else groups into one of two small dropdowns so the row never
 * grows past 5 top-level slots. Features isn't dropped — it's linked from
 * the Platform page's own CTA and the footer — just not top-level nav. */
const RESOURCES_MENU = [
  { href: "/resources", label: "Resources" },
  { href: "/faq", label: "FAQ" },
  { href: "/implementation", label: "Implementation" },
];
const COMPANY_MENU = [
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];
/**
 * Flow's nav only offers what Flow still publishes. Platform, Industries,
 * Resources, FAQ, Implementation and About are retired on this surface and
 * permanently redirect to Ascend, so linking to them from Flow's own header
 * would send a visitor off the product they are reading about.
 */
const FLOW_COMPANY_MENU = COMPANY_MENU.filter((i) => i.href === "/contact");

// `product` is REQUIRED, not defaulted. A default silently gives one
// surface the other's navigation on any call site that forgets it, and the
// compiler finding them is better than a reviewer noticing.
export function Navbar({ brand, product }: { brand: ResolvedBrand; product: PlanProduct }) {
  const isFlow = product !== "unified";
  const { user, loading } = useAuth();
  const [open, setOpen] = useState(false);

  const navItems = (
    <>
      {isFlow ? (
        <Link
          href="/features"
          className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          Features
        </Link>
      ) : (
        <>
          <Link
            href="/platform"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Platform
          </Link>
          <Link
            href="/industries"
            className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Industries
          </Link>
        </>
      )}
      <Link
        href="/pricing"
        className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
      >
        Pricing
      </Link>
{!isFlow && (
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-1 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground">
          Resources <ChevronDown className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {RESOURCES_MENU.map((item) => (
            <DropdownMenuItem key={item.href} render={<Link href={item.href} />}>
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-1 text-sm font-medium text-muted-foreground outline-none transition-colors hover:text-foreground">
          Company <ChevronDown className="h-3.5 w-3.5" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          {(isFlow ? FLOW_COMPANY_MENU : COMPANY_MENU).map((item) => (
            <DropdownMenuItem key={item.href} render={<Link href={item.href} />}>
              {item.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {!loading && (
        <>
          {user ? (
            <Button render={<Link href="/dashboard" />} size="sm">
              Dashboard
            </Button>
          ) : (
            <>
              <Button render={<Link href="/login" />} variant="ghost" size="sm">
                Login
              </Button>
              <Button render={<Link href="/signup" />} size="sm">
                Sign Up
              </Button>
            </>
          )}
        </>
      )}
    </>
  );

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 text-xl font-bold">
          <BrandLogo
            logoUrl={brand.logoUrl}
            name={brand.name}
            size={24}
            idSuffix="-nav"
            imgClassName="h-6 w-auto max-w-[120px] object-contain"
          />
          <span className="bg-gradient-to-r from-emerald-500 via-teal-400 to-emerald-300 bg-clip-text text-transparent">
            {brand.name}
          </span>
        </Link>

        <nav className="hidden items-center gap-4 md:flex">
          <ThemeToggle />
          {navItems}
        </nav>

        <div className="flex items-center gap-2 md:hidden">
          <ThemeToggle />
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
        </div>

        <Sheet open={open} onOpenChange={setOpen}>
          <SheetContent side="right">
            <SheetHeader>
              <SheetTitle>Menu</SheetTitle>
            </SheetHeader>
            <nav className="flex flex-col gap-4 p-4">
              {!isFlow && (
              <SheetClose
                render={<Link href="/platform" />}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Platform
              </SheetClose>
              )}
              <SheetClose
                render={<Link href="/features" />}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Features
              </SheetClose>
              {!isFlow && (
              <SheetClose
                render={<Link href="/industries" />}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Industries
              </SheetClose>
              )}
              <SheetClose
                render={<Link href="/pricing" />}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Pricing
              </SheetClose>
              {!isFlow && (
              <SheetClose
                render={<Link href="/resources" />}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Resources
              </SheetClose>
              )}
              {!isFlow && (
              <SheetClose
                render={<Link href="/faq" />}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                FAQ
              </SheetClose>
              )}
              {!isFlow && (
              <SheetClose
                render={<Link href="/implementation" />}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Implementation
              </SheetClose>
              )}
              {!isFlow && (
              <SheetClose
                render={<Link href="/about" />}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                About
              </SheetClose>
              )}
              <SheetClose
                render={<Link href="/contact" />}
                className="text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              >
                Contact
              </SheetClose>
              {!loading && (
                <>
                  {user ? (
                    <SheetClose render={<span />}>
                      <Button
                        render={<Link href="/dashboard" />}
                        className="w-full"
                        size="sm"
                      >
                        Dashboard
                      </Button>
                    </SheetClose>
                  ) : (
                    <>
                      <SheetClose render={<span />}>
                        <Button
                          render={<Link href="/login" />}
                          variant="ghost"
                          className="w-full"
                          size="sm"
                        >
                          Login
                        </Button>
                      </SheetClose>
                      <SheetClose render={<span />}>
                        <Button
                          render={<Link href="/signup" />}
                          className="w-full"
                          size="sm"
                        >
                          Sign Up
                        </Button>
                      </SheetClose>
                    </>
                  )}
                </>
              )}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
