import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { resolveShellContextForPage } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { getDivinexProfileSnapshot } from "@/lib/divinex/contract";
import { EmptyState, Panel, PageHeader, PrimaryAction, StatusChip } from "@/components/divinex/ui";

export const dynamic = "force-dynamic";

/**
 * Brand & Assets — nested under Intelligence (P0.3).
 *
 * No longer a top-level peer. Brand is part of what Ascend KNOWS about the
 * business, so it belongs with business memory rather than competing for a
 * primary navigation slot.
 *
 * A READ-ONLY window onto the canonical profile Ascend publishes
 * (divinexProfiles/{subAccountId}). Ascend Postgres is the authority; this
 * page never writes it, which is why editing links out to brand discovery
 * rather than offering inline fields. Assets show their real status because
 * only "approved" assets are allowed into generated pages — showing that
 * plainly is what makes the approval step make sense to the customer.
 */
export default async function IntelligenceBrandPage() {
  const shell = await resolveShellContextForPage();
  const saId = shell?.workspace?.workspaceId ?? null;

  if (!saId) {
    return (
      <AscendSectionPlaceholder
        title="Brand & Assets"
        description="No active workspace yet."
        links={[]}
      />
    );
  }

  const snapshot = await getDivinexProfileSnapshot(saId);

  if (!snapshot) {
    return (
      <div className="max-w-5xl">
        <PageHeader
          title="Brand & Assets"
          description="What DivineX knows about how your business looks and sounds."
        />
        <EmptyState
          title="We haven't captured your brand yet"
          body="Once your business profile is connected, your colors, fonts, logos and imagery appear here — and everything Zeno builds uses them automatically."
          primary={<PrimaryAction href="/app/onboarding">Set up your business profile</PrimaryAction>}
        />
      </div>
    );
  }

  const business = (snapshot.business ?? {}) as { name?: string; website?: string; industry?: string };
  const brand = (snapshot.brand ?? {}) as {
    visual?: { tokens?: { palette?: string[]; fonts?: string[] } };
    voice?: { tone?: string };
  };
  const palette = brand.visual?.tokens?.palette ?? [];
  const fonts = brand.visual?.tokens?.fonts ?? [];
  const assets = snapshot.assets ?? [];
  const approved = assets.filter((a) => a.status === "approved");
  const candidates = assets.filter((a) => a.status !== "approved");

  return (
    <div className="max-w-5xl space-y-6">
      <PageHeader
        title="Brand & Assets"
        description="What DivineX knows about how your business looks and sounds. Everything Zeno builds uses this."
        action={
          <PrimaryAction href="/app/onboarding">
            Update brand <ArrowRight className="h-4 w-4" />
          </PrimaryAction>
        }
      />

      <Panel>
        <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dx-text-muted)" }}>
          Business
        </p>
        <p className="mt-2 text-lg font-semibold" style={{ color: "var(--dx-text-primary)" }}>
          {business.name ?? "Unnamed business"}
        </p>
        <p className="mt-1 text-sm" style={{ color: "var(--dx-text-secondary)" }}>
          {[business.industry, business.website].filter(Boolean).join(" · ") || "No industry or website on file yet."}
        </p>
        <p className="mt-3 text-xs" style={{ color: "var(--dx-text-muted)" }}>
          Synced from your DivineX business profile (version {snapshot.profileVersion}).
        </p>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2">
        <Panel>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dx-text-muted)" }}>
            Colors
          </p>
          {palette.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {palette.map((c) => (
                <span key={c} className="flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs"
                  style={{ borderColor: "var(--dx-border-subtle)", color: "var(--dx-text-secondary)" }}>
                  <span className="h-3.5 w-3.5 rounded-full" style={{ backgroundColor: c }} aria-hidden />
                  {c}
                </span>
              ))}
            </div>
          ) : (
            <p className="mt-3 text-sm" style={{ color: "var(--dx-text-secondary)" }}>
              No brand colors captured yet — pages use neutral defaults until we have them.
            </p>
          )}
        </Panel>

        <Panel>
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dx-text-muted)" }}>
            Typography
          </p>
          {fonts.length ? (
            <ul className="mt-3 space-y-1 text-sm" style={{ color: "var(--dx-text-secondary)" }}>
              {fonts.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm" style={{ color: "var(--dx-text-secondary)" }}>
              No brand typography captured yet.
            </p>
          )}
        </Panel>
      </div>

      <Panel>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--dx-text-muted)" }}>
            Assets
          </p>
          <StatusChip label={`${approved.length} approved`} tone={approved.length ? "growth" : "neutral"} dot />
        </div>
        {assets.length === 0 ? (
          <p className="mt-3 text-sm" style={{ color: "var(--dx-text-secondary)" }}>
            No logos or imagery captured yet.
          </p>
        ) : (
          <>
            <p className="mt-3 text-sm" style={{ color: "var(--dx-text-secondary)" }}>
              Only approved assets are used on the pages we build for you.
              {candidates.length > 0 &&
                ` ${candidates.length} more ${candidates.length === 1 ? "is" : "are"} waiting for your review.`}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              {assets.slice(0, 8).map((a) => (
                <div
                  key={a.id}
                  className="rounded-[var(--dx-radius)] border p-2"
                  style={{ borderColor: "var(--dx-border-subtle)", backgroundColor: "var(--dx-surface-1)" }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.fileUrl} alt={a.purpose ?? "Brand asset"} className="h-20 w-full rounded object-contain" />
                  <div className="mt-2">
                    <StatusChip
                      label={a.status === "approved" ? "Approved" : "Needs review"}
                      tone={a.status === "approved" ? "growth" : "opportunity"}
                    />
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </Panel>

      <p className="text-xs" style={{ color: "var(--dx-text-muted)" }}>
        Brand data is managed in your DivineX business profile.{" "}
        <Link href="/app/onboarding" className="underline">
          Review or correct it
        </Link>
        .
      </p>
    </div>
  );
}
