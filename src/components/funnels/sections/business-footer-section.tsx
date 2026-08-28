import { Mail, MapPin, Phone, ShieldCheck } from "lucide-react";
import type { BusinessFooterConfig } from "@/types/funnels";

/**
 * Business identity footer (Business Reality Engine, slice B) — grounds the
 * page in a real organization. CONTEXTUAL by design: renders only the
 * fields that exist (all verified workspace/operator data), so it scales
 * from a minimal "name + email" line on a fresh workspace up to a full
 * identity block (logo, tagline, contact, address, credentials) without
 * ever inventing depth. Quiet visual register: this is the page's ground
 * truth, not another persuasion beat.
 */
export function BusinessFooterSection({
  config,
  accentColor,
}: {
  config: BusinessFooterConfig;
  accentColor: string;
}) {
  const hasAny =
    config.businessName || config.email || config.phone || config.address || (config.credentials?.length ?? 0) > 0;
  if (!hasAny) return null;

  return (
    <footer className="border-t px-4 py-10" style={{ borderColor: `${accentColor}22` }}>
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-4 text-center sm:flex-row sm:items-start sm:justify-between sm:text-left">
        <div className="min-w-0">
          <div className="flex items-center justify-center gap-2.5 sm:justify-start">
            {config.logoUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={config.logoUrl} alt="" className="h-7 w-auto max-w-[120px] object-contain" />
            )}
            {config.businessName && (
              <p className="text-sm font-bold tracking-tight">{config.businessName}</p>
            )}
          </div>
          {config.tagline && <p className="mt-1.5 text-xs opacity-60">{config.tagline}</p>}
          {(config.credentials?.length ?? 0) > 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 sm:justify-start">
              {config.credentials!.map((c, i) => (
                <span key={i} className="inline-flex items-center gap-1.5 text-xs opacity-70">
                  <ShieldCheck className="h-3.5 w-3.5 shrink-0" style={{ color: accentColor }} />
                  {c}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex flex-col items-center gap-1.5 text-xs opacity-75 sm:items-end">
          {config.email && (
            <a href={`mailto:${config.email}`} className="inline-flex items-center gap-1.5 hover:opacity-100">
              <Mail className="h-3.5 w-3.5" style={{ color: accentColor }} />
              {config.email}
            </a>
          )}
          {config.phone && (
            <a href={`tel:${config.phone}`} className="inline-flex items-center gap-1.5 hover:opacity-100">
              <Phone className="h-3.5 w-3.5" style={{ color: accentColor }} />
              {config.phone}
            </a>
          )}
          {config.address && (
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5" style={{ color: accentColor }} />
              {config.address}
            </span>
          )}
        </div>
      </div>
    </footer>
  );
}

/** Slim identity strip above the hero — logo + business name only. The
 *  smallest possible "a real organization is speaking" signal. */
export function TopIdentityStrip({
  config,
  accentColor,
}: {
  config: BusinessFooterConfig;
  accentColor: string;
}) {
  if (config.showTopBar === false) return null;
  if (!config.businessName && !config.logoUrl) return null;
  return (
    <div className="flex items-center justify-center gap-2 border-b px-4 py-3" style={{ borderColor: `${accentColor}14` }}>
      {config.logoUrl && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={config.logoUrl} alt="" className="h-6 w-auto max-w-[110px] object-contain" />
      )}
      {config.businessName && <span className="text-sm font-bold tracking-tight">{config.businessName}</span>}
    </div>
  );
}
