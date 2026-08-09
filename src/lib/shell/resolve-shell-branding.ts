import type { AscendBrandingContext, ShellMode } from "@/types/ascend-shell";
import type { ResolvedBrand } from "@/config/landing";

/**
 * Ascend OS Phase 2, Slice 8 — pure branding resolver.
 *
 * "crm_only" is a pass-through of Flow's EXISTING resolved brand
 * (lib/landing/resolve-brand.ts, unchanged, unmodified by this slice) —
 * zero visual change for CRM-only customers, matching the instruction to
 * preserve every current Flow route and customer workflow.
 *
 * "full_ascend" carries the Architecture spec's LOCKED design tokens
 * (ASCEND_OS_V1_ARCHITECTURE_SPECIFICATION.md, Locked Decision 4 + Section
 * 8: `--jade: 158 64% 45%`, `--indigo: 239 84% 67%`, `--cobalt: 217 91%
 * 60%`) verbatim — not reinvented values. These are HSL triples (no
 * `hsl()` wrapper) matching how they're declared in the spec and how
 * `globals.css`'s new `.theme-ascend` block consumes them via
 * `hsl(var(--jade))`.
 */
/** The full_ascend branding literal, independent of `mode` -- extracted so
 *  the Command Center's agency-owner bypass (rendered while the REAL
 *  resolved mode is "crm_only", since no workspace is active) can request
 *  Ascend-dark chrome without needing a ResolvedBrand it doesn't have. */
export function ascendDarkBranding(): AscendBrandingContext {
  return {
    mode: "full_ascend",
    productName: "Ascend",
    tagline: "One connected growth operating system.",
    theme: "ascend_dark",
    tokens: {
      jade: "158 64% 45%",
      indigo: "239 84% 67%",
      cobalt: "217 91% 60%",
    },
  };
}

export function resolveShellBranding(mode: ShellMode, flowBrand: ResolvedBrand): AscendBrandingContext {
  if (mode === "crm_only") {
    return {
      mode,
      productName: flowBrand.name,
      tagline: flowBrand.tagline,
      theme: "flow_default",
      tokens: null,
    };
  }

  return ascendDarkBranding();
}
