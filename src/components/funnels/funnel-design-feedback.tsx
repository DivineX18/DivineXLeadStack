"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles, ThumbsUp, ThumbsDown, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DESIGN_REVIEW_CRITERION_LABELS,
  DESIGN_REVIEW_PASS_THRESHOLD,
  type FunnelDesignReview,
} from "@/types/design-intelligence";

/**
 * Landing Page Calibration Engine v1 — the two operator-facing surfaces
 * from the locked North Star spec, both scoped to one funnel:
 *
 *   1. The internal design review's score + below-bar categories (read-only
 *      here — scoring itself runs automatically after Zeno generates a
 *      funnel; the Rescore button covers hand-edited funnels).
 *   2. The "designer feedback loop" — what improved and why, which feeds
 *      the Design Knowledge Vault via extraction. This is the actual
 *      calibrate-and-give-feedback capture surface.
 *
 * Mounted from FunnelBuilder with just {saId, funnelId} — same shape as
 * FunnelDomainsSection — so it benefits both the standalone Flow CRM
 * funnel editor AND the unified Ascend Create surface automatically, since
 * both mount this exact component (zero-fork reuse).
 */
export function FunnelDesignFeedback({
  saId,
  funnelId,
}: {
  saId: string;
  funnelId: string;
}) {
  const [review, setReview] = useState<FunnelDesignReview | null | undefined>(undefined);
  const [scoring, setScoring] = useState(false);
  const [rating, setRating] = useState<"helpful" | "not_helpful" | null>(null);
  const [whatImproved, setWhatImproved] = useState("");
  const [why, setWhy] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  async function loadReview() {
    try {
      const res = await fetch(`/api/sub-accounts/${saId}/funnels/${funnelId}/design-review`);
      const data = await res.json();
      setReview(data.review ?? null);
    } catch {
      setReview(null);
    }
  }

  useEffect(() => {
    void loadReview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saId, funnelId]);

  async function rescore() {
    setScoring(true);
    try {
      const res = await fetch(`/api/sub-accounts/${saId}/funnels/${funnelId}/design-review`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Design review failed.");
      setReview(data.review);
      toast.success("Design review updated.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Design review failed.");
    } finally {
      setScoring(false);
    }
  }

  async function submitFeedback() {
    if (!rating || !whatImproved.trim() || !why.trim()) {
      toast.error("Pick helpful/not helpful and fill in both fields.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/sub-accounts/${saId}/funnels/${funnelId}/design-feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rating, whatImproved, why }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Couldn't save feedback.");
      setSubmitted(true);
      toast.success(
        data.extracted && data.principleId
          ? "Thanks — Zeno learned a new design principle from this."
          : "Thanks — feedback saved.",
      );
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't save feedback.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Sparkles className="h-4 w-4 text-emerald-500" />
          Design intelligence
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={scoring}
          onClick={() => void rescore()}
          className="h-7 gap-1.5 text-xs"
        >
          {scoring ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
          {review ? "Re-score" : "Score this page"}
        </Button>
      </div>

      {review === undefined ? (
        <div className="h-16 animate-pulse rounded-lg bg-muted" />
      ) : review ? (
        <div className="space-y-2 rounded-lg border bg-background p-3">
          <div className="flex items-center gap-2">
            <span
              className={
                "rounded-full px-2 py-0.5 text-xs font-semibold " +
                (review.overallScore >= DESIGN_REVIEW_PASS_THRESHOLD
                  ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                  : "bg-amber-500/10 text-amber-600 dark:text-amber-400")
              }
            >
              {review.overallScore}/10
            </span>
            <span className="text-xs text-muted-foreground">
              {review.belowBar.length === 0
                ? "Every category cleared the premium bar."
                : `${review.belowBar.length} categor${review.belowBar.length === 1 ? "y" : "ies"} below the premium bar.`}
            </span>
          </div>
          {review.belowBar.length > 0 && (
            <ul className="space-y-1 text-xs text-muted-foreground">
              {review.belowBar.map((c) => (
                <li key={c}>
                  <span className="font-medium text-foreground">{DESIGN_REVIEW_CRITERION_LABELS[c]}</span>
                  {review.notes[c] ? ` — ${review.notes[c]}` : ""}
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Not scored yet. AI-generated funnels are scored automatically; click &quot;Score this page&quot; for a hand-built one.
        </p>
      )}

      <div className="border-t pt-3">
        <p className="mb-2 text-xs font-medium text-foreground">
          Calibrate Zeno — what worked or didn&apos;t on this page?
        </p>
        {submitted ? (
          <p className="text-xs text-muted-foreground">
            Feedback saved — thanks. This is exactly how the design vault gets sharper over time.
          </p>
        ) : (
          <div className="space-y-2">
            <div className="flex gap-2">
              <Button
                type="button"
                variant={rating === "helpful" ? "default" : "outline"}
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setRating("helpful")}
              >
                <ThumbsUp className="h-3 w-3" /> Worked well
              </Button>
              <Button
                type="button"
                variant={rating === "not_helpful" ? "default" : "outline"}
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => setRating("not_helpful")}
              >
                <ThumbsDown className="h-3 w-3" /> Needed changes
              </Button>
            </div>
            <Textarea
              value={whatImproved}
              onChange={(e) => setWhatImproved(e.target.value)}
              placeholder="What did you change (or would you change)? e.g. 'Moved the guarantee above the FAQ.'"
              className="min-h-16 text-xs"
            />
            <Textarea
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              placeholder="Why is that better? e.g. 'Objection-handling should land before the reader has a chance to leave.'"
              className="min-h-16 text-xs"
            />
            <Button
              type="button"
              size="sm"
              disabled={submitting}
              onClick={() => void submitFeedback()}
              className="h-8 gap-1.5 text-xs"
            >
              {submitting && <Loader2 className="h-3 w-3 animate-spin" />}
              Submit feedback
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
