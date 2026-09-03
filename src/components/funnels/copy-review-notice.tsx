import { AlertTriangle } from "lucide-react";
import type { FunnelDoc } from "@/types/funnels";

/**
 * COPY REVIEW NOTICE — shown in preview, before anything can be published.
 *
 * WHY THIS EXISTS. The Landing Page Critic reviews every generated page and
 * its verdict is persisted on the funnel — but nothing rendered it, so a
 * customer could publish a page carrying a detected defect (a heading that
 * promises something the section does not deliver) without ever being told
 * one was found. Detection with no surface is indistinguishable from no
 * detection.
 *
 * DELIBERATELY A WARNING, NOT A FIX. Auto-rewriting headings is off because
 * the Critic's false-positive rate is unproven — it has flagged honest
 * headings in adversarial testing. So this shows the customer what was
 * noticed and lets THEM judge, which is correct while calibration is
 * unproven: a human reading their own page is a better arbiter than an
 * uncalibrated rewrite.
 *
 * Minor findings are omitted. A notice that fires on every page is one
 * customers learn to dismiss, which would defeat its purpose.
 */
export function CopyReviewNotice({ funnel }: { funnel: Pick<FunnelDoc, "criticVerdict"> }) {
  const verdict = funnel.criticVerdict;
  if (!verdict) return null;

  const worth = verdict.findings.filter((f) => f.severity === "blocking" || f.severity === "major");
  if (worth.length === 0) return null;

  return (
    <div
      className="mx-auto my-6 max-w-3xl rounded-[var(--dx-radius-lg)] border p-5"
      style={{ backgroundColor: "var(--dx-surface-1)", borderColor: "var(--dx-border-subtle)" }}
    >
      <p
        className="flex items-center gap-2 text-sm font-semibold"
        style={{ color: "var(--dx-text-primary)" }}
      >
        <AlertTriangle className="h-4 w-4" style={{ color: "var(--dx-warning, #f59e0b)" }} />
        Worth a read before you publish
      </p>
      <p className="mt-1 text-xs" style={{ color: "var(--dx-text-muted)" }}>
        We reviewed this page and noticed {worth.length === 1 ? "something" : `${worth.length} things`} you
        may want to change. Your call — nothing has been altered.
      </p>
      <ul className="mt-3 space-y-2">
        {worth.map((f, i) => (
          <li key={`${f.sectionType}-${i}`} className="text-sm" style={{ color: "var(--dx-text-primary)" }}>
            {/* Customer nouns. The category name and the model's reasoning
                stay internal — U1 applies here as everywhere else. */}
            <span className="text-xs uppercase tracking-wider" style={{ color: "var(--dx-text-muted)" }}>
              {f.sectionType.replace(/_/g, " ")}
            </span>
            <br />
            {f.correction}
          </li>
        ))}
      </ul>
    </div>
  );
}
