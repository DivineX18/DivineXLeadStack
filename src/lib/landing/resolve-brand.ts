import "server-only";

import { getAdminDb } from "@/lib/firebase/admin";
import { CUSTOM_BRAND, type ResolvedBrand } from "@/config/landing";
import { brandForProduct, resolveProductSurface } from "@/lib/landing/resolve-product-surface";
import type { AgencyDoc } from "@/types";

/**
 * THE BRAND IS DECIDED HERE, NOT AT EACH CALL SITE.
 *
 * This deployment serves two products from one app: crm.divinex.io is Flow,
 * app.divinex.io is Ascend. The host-aware swap used to live in
 * `brandForProduct()`, applied by whichever page remembered to call it — six
 * did, and around twenty-five did not. The result was that nine of twelve
 * public pages on the ASCEND host called themselves Flow, in body copy and in
 * `<title>`, which is what Google indexes and what social shares display.
 *
 * Patching twenty-five call sites would have left the same trap set for the
 * twenty-sixth page. So the swap moved INTO the shared resolver: every
 * consumer now gets the right brand for the host it is being rendered on,
 * without knowing this problem exists.
 *
 * The pages that already call `brandForProduct()` themselves are unaffected —
 * it is idempotent, so applying it twice yields the same brand.
 *
 * Reads appConfig/main → firstAgencyId, then agencies/{firstAgencyId}, and
 * merges agency-doc field values over CUSTOM_BRAND defaults. Any field the
 * agency owner hasn't filled in yet falls back to the code-level default,
 * so a fresh deploy still renders cleanly before the owner has touched the
 * branding form.
 *
 * Failures (admin SDK not configured, doc missing, transient Firestore
 * errors) are swallowed — we never want the public landing to 500 on a
 * read error. Worst case: every field falls back to CUSTOM_BRAND.
 *
 * One read per page render today. If landing traffic grows, wrap with ISR
 * (`export const revalidate = 60` on the calling page) or memoize.
 */
export async function resolveCustomBrand(): Promise<ResolvedBrand> {
  return forHost(await resolveAgencyBrand());
}

/**
 * Apply the host's product identity. Deliberately fail-open: `headers()`
 * throws outside a request scope (a script, a build-time evaluation), and a
 * brand lookup must never be the reason one of those dies — it simply falls
 * back to the un-swapped brand, which is Flow's, the established default.
 */
async function forHost(brand: ResolvedBrand): Promise<ResolvedBrand> {
  try {
    return brandForProduct(brand, await resolveProductSurface());
  } catch {
    return brand;
  }
}

/** The agency-doc merge, with no product opinion. */
async function resolveAgencyBrand(): Promise<ResolvedBrand> {
  const fallback: ResolvedBrand = {
    name: CUSTOM_BRAND.name,
    logoUrl: null,
    tagline: CUSTOM_BRAND.tagline,
    shortDescription: CUSTOM_BRAND.shortDescription,
    supportEmail: CUSTOM_BRAND.supportEmail,
    primaryDomain: CUSTOM_BRAND.primaryDomain,
    parentCompany: CUSTOM_BRAND.parentCompany,
    productCategory: CUSTOM_BRAND.productCategory,
  };

  try {
    const db = getAdminDb();
    const configSnap = await db.doc("appConfig/main").get();
    const firstAgencyId = configSnap.exists
      ? (configSnap.data()?.firstAgencyId as string | undefined)
      : undefined;
    if (!firstAgencyId) return fallback;

    const agencySnap = await db.doc(`agencies/${firstAgencyId}`).get();
    if (!agencySnap.exists) return fallback;
    const agency = agencySnap.data() as Partial<AgencyDoc>;

    return {
      name:
        agency.name && agency.name !== "LeadStack"
          ? agency.name
          : fallback.name,
      logoUrl: (agency.logoUrl as string | null) ?? null,
      tagline: fallback.tagline,
      shortDescription: fallback.shortDescription,
      supportEmail: agency.supportEmail || fallback.supportEmail,
      primaryDomain: agency.primaryDomain || fallback.primaryDomain,
      // No agency-doc override exists for these two — always CUSTOM_BRAND's.
      parentCompany: fallback.parentCompany,
      productCategory: fallback.productCategory,
    };
  } catch {
    return fallback;
  }
}

/**
 * The deployment's brand name for use in transactional copy (emails, etc.).
 * Prefers the agency Branding name, falls back to `CUSTOM_BRAND.name`, and
 * only lands on "LeadStack" if both are somehow empty. Never throws.
 */
export async function resolveBrandName(): Promise<string> {
  try {
    const { name } = await resolveCustomBrand();
    return name || CUSTOM_BRAND.name;
  } catch {
    return CUSTOM_BRAND.name;
  }
}
