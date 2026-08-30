"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, PlayCircle, CheckCircle2, XCircle, RotateCcw } from "lucide-react";
import { AscendCardShell } from "@/components/ascend/card-shell";

type ScanState =
  | { phase: "idle" }
  | { phase: "starting" }
  | { phase: "running"; jobId: number }
  | { phase: "completed"; overallScore: number; scoreLabel: string; biggestBottleneck: string }
  | { phase: "failed"; message: string };

const POLL_INTERVAL_MS = 3000;
const MAX_POLL_MS = 5 * 60 * 1000; // 5 min — generous relative to the documented 30-90s typical duration; a genuine timeout is reported honestly, never silently treated as success.

/**
 * The unified product's native Growth Scan trigger — replaces the old
 * "go run this on ascend.divinex.io" link. Orchestration only: this
 * component never talks to Ascend directly, only to this app's own
 * /api/sub-accounts/[id]/growth-scan/* routes, which in turn go through
 * the Intelligence Bridge. On completion it calls router.refresh() so the
 * Growth Score / Assessment / Recommendations cards on this same page
 * (and Home, next time it's visited — both are dynamically rendered, no
 * stale cache to invalidate) pick up the new scan via the dashboard-
 * summary provenance fix — that refreshed card IS the native report, no
 * separate report page or ascend.divinex.io trip required.
 */
export function RunGrowthScanCard({
  saId,
  hasBusinessProfile,
  isFullAscend,
}: {
  saId: string;
  hasBusinessProfile: boolean;
  isFullAscend: boolean;
}) {
  const router = useRouter();
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [state, setState] = useState<ScanState>({ phase: "idle" });
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pollDeadline = useRef<number>(0);

  const stopPolling = useCallback(() => {
    if (pollTimer.current) clearTimeout(pollTimer.current);
    pollTimer.current = null;
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

  const poll = useCallback(
    async (jobId: number) => {
      if (Date.now() > pollDeadline.current) {
        setState({ phase: "failed", message: "This scan is taking longer than expected. Check back shortly — it may still complete." });
        return;
      }
      try {
        const res = await fetch(`/api/sub-accounts/${saId}/growth-scan/status/${jobId}`);
        const body = await res.json();
        if (!res.ok) {
          setState({ phase: "failed", message: body?.error ?? "Could not check scan status." });
          return;
        }
        if (body.status === "processing") {
          pollTimer.current = setTimeout(() => poll(jobId), POLL_INTERVAL_MS);
          return;
        }
        if (body.status === "failed") {
          setState({ phase: "failed", message: body.errorMessage ?? "The scan failed." });
          return;
        }
        if (body.status === "completed" && body.scan) {
          setState({
            phase: "completed",
            overallScore: body.scan.overallScore,
            scoreLabel: body.scan.scoreLabel,
            biggestBottleneck: body.scan.biggestBottleneck,
          });
          router.refresh();
          return;
        }
        setState({ phase: "failed", message: "Unexpected response while checking scan status." });
      } catch {
        // Transient network hiccup — the next tick retries rather than
        // failing the whole scan over one dropped poll request.
        pollTimer.current = setTimeout(() => poll(jobId), POLL_INTERVAL_MS);
      }
    },
    [saId, router],
  );

  async function handleRun() {
    if (state.phase === "starting" || state.phase === "running") return; // guards against a double-click starting two scans
    setState({ phase: "starting" });
    try {
      const res = await fetch(`/api/sub-accounts/${saId}/growth-scan/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(websiteUrl.trim() ? { websiteUrl: websiteUrl.trim() } : {}),
      });
      const body = await res.json();
      if (!res.ok) {
        setState({ phase: "failed", message: body?.error ?? "Could not start the scan." });
        return;
      }
      pollDeadline.current = Date.now() + MAX_POLL_MS;
      setState({ phase: "running", jobId: body.jobId });
      pollTimer.current = setTimeout(() => poll(body.jobId), POLL_INTERVAL_MS);
    } catch {
      setState({ phase: "failed", message: "Could not reach the server to start the scan." });
    }
  }

  if (!isFullAscend) {
    return (
      <AscendCardShell title="Growth Scan">
        <p className="text-sm text-[var(--dx-text-muted)]">Growth Scans are part of Full Ascend — not available on this workspace&apos;s current plan.</p>
      </AscendCardShell>
    );
  }

  if (!hasBusinessProfile) {
    return (
      <AscendCardShell title="Growth Scan">
        <p className="text-sm text-[var(--dx-text-muted)]">
          This workspace isn&apos;t linked to an Ascend business profile yet, so a scan can&apos;t run. This links automatically the next time you sign in
          through Ascend — check back shortly, or contact support if it persists.
        </p>
      </AscendCardShell>
    );
  }

  return (
    <AscendCardShell title="Growth Scan">
      {(state.phase === "idle" || state.phase === "starting") && (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-xs text-[var(--dx-text-muted)]">Website URL (optional — leave blank to use the one on file)</label>
            <input
              type="url"
              value={websiteUrl}
              onChange={(e) => setWebsiteUrl(e.target.value)}
              placeholder="https://example.com"
              disabled={state.phase === "starting"}
              className="w-full rounded-md border border-[var(--dx-border-subtle)] bg-[var(--dx-surface-2)] px-3 py-2 text-sm text-[var(--dx-text-primary)] placeholder:text-[var(--dx-text-primary)]/30 outline-none focus-visible:ring-2 focus-visible:ring-[var(--dx-focus)]"
            />
          </div>
          <button
            onClick={handleRun}
            disabled={state.phase === "starting"}
            className="inline-flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium disabled:opacity-50 dx-primary-action"
          >
            {state.phase === "starting" ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
            {state.phase === "starting" ? "Starting…" : "Run Growth Scan"}
          </button>
        </div>
      )}

      {state.phase === "running" && (
        <div className="flex items-center gap-2 text-sm text-[var(--dx-text-secondary)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          Scanning your website and analyzing results — this usually takes 30-90 seconds.
        </div>
      )}

      {state.phase === "completed" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-emerald-400">
            <CheckCircle2 className="h-4 w-4" />
            Scan complete — score {state.overallScore}/100 ({state.scoreLabel})
          </div>
          <p className="text-xs text-[var(--dx-text-muted)]">Biggest bottleneck: {state.biggestBottleneck}</p>
          <p className="text-xs text-[var(--dx-text-muted)]">Your Growth Score and recommendations below now reflect this scan.</p>
          <button onClick={() => setState({ phase: "idle" })} className="mt-1 inline-flex items-center gap-1.5 text-xs text-[var(--dx-text-muted)] hover:text-[var(--dx-text-primary)]">
            <RotateCcw className="h-3 w-3" /> Run another scan
          </button>
        </div>
      )}

      {state.phase === "failed" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm text-red-400">
            <XCircle className="h-4 w-4" />
            {state.message}
          </div>
          <button
            onClick={() => setState({ phase: "idle" })}
            className="inline-flex items-center gap-1.5 rounded-md border border-[var(--dx-border-subtle)] px-3 py-1.5 text-xs text-[var(--dx-text-secondary)] hover:bg-[var(--dx-surface-2)]"
          >
            <RotateCcw className="h-3 w-3" /> Try again
          </button>
        </div>
      )}
    </AscendCardShell>
  );
}
