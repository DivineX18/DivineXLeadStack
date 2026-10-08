import type { ResolvedBrand } from "@/config/landing";

/**
 * "Flow is part of DivineX" — the one line that connects this deployment to
 * the company that runs it, for visitors and for search engines.
 *
 * RENDERS NOTHING unless the brand names BOTH a parent company and a site for
 * it. That default is the point: this codebase is a white-label template, and
 * a buyer who has branded it as their own product must never have their
 * customers pointed at someone else's company. Only a deployment that has
 * deliberately set `parentCompanyUrl` makes the claim.
 *
 * `rel="noopener"` without `noreferrer`, deliberately: the parent site should
 * be able to see in its own analytics that the visit came from the app.
 */
export function ParentCompanyLine({
  brand,
  className = "",
}: {
  brand: ResolvedBrand;
  className?: string;
}) {
  if (!brand.parentCompany || !brand.parentCompanyUrl) return null;
  return (
    <a
      href={brand.parentCompanyUrl}
      target="_blank"
      rel="noopener"
      className={`transition-colors hover:text-foreground ${className}`}
    >
      {brand.parentCompanyPhrase ?? `${brand.name} is part of ${brand.parentCompany}`}
    </a>
  );
}
