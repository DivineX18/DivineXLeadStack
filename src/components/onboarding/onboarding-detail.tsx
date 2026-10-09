"use client";

import { useState } from "react";
import Link from "next/link";
import type {
  ClientOnboardingDoc,
  OnboardingAssetDoc,
  OnboardingPlatformAccessDoc,
} from "@/types/client-onboarding";

/**
 * One engagement, and the actions on it.
 *
 * The verify control is the point of this screen. The client can say they sent
 * an invitation; only someone here can say we are actually in the account, and
 * the record keeps who said it.
 */
export function OnboardingDetail({
  onboarding,
  access,
  assets,
  outstanding,
}: {
  onboarding: ClientOnboardingDoc;
  access: OnboardingPlatformAccessDoc[];
  assets: OnboardingAssetDoc[];
  outstanding: string[];
}) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [state, setState] = useState({ access, outstanding });

  async function act(payload: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    setMsg(null);
    try {
      const res = await fetch(`/api/agency/onboarding/${onboarding.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json().catch(() => null)) as
        | { ok?: boolean; error?: string; outstanding?: string[]; subAccountId?: string; tasksCreated?: number }
        | null;
      if (!res.ok || !data?.ok) {
        setErr(
          data?.outstanding?.length
            ? `${data.error} Outstanding: ${data.outstanding.join("; ")}`
            : (data?.error ?? "That didn't work."),
        );
        if (data?.outstanding) setState((s) => ({ ...s, outstanding: data.outstanding! }));
        return;
      }
      if (data.subAccountId) {
        setMsg(`Workspace ${data.subAccountId} ready, ${data.tasksCreated ?? 0} task(s) opened.`);
      } else {
        setMsg("Done.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function reissue() {
    setBusy(true);
    const res = await fetch("/api/agency/onboarding", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ onboardingId: onboarding.id }),
    });
    const data = (await res.json().catch(() => null)) as { inviteUrl?: string; error?: string } | null;
    setBusy(false);
    if (data?.inviteUrl) setMsg(`New invite link: ${data.inviteUrl}`);
    else setErr(data?.error ?? "Couldn't reissue that link.");
  }

  return (
    <div>
      <Link href="/app/command-center/onboarding" className="text-sm text-muted-foreground hover:underline">
        Back to onboarding
      </Link>
      <h1 className="mt-3 text-2xl font-bold">{onboarding.businessName}</h1>
      <p className="text-sm text-muted-foreground">
        {onboarding.package.name} · {onboarding.contactEmail} · {onboarding.completion.overallPct}% complete
      </p>

      {msg && <p className="mt-4 break-all rounded-lg border border-emerald-500/40 bg-emerald-500/5 px-4 py-3 text-sm">{msg}</p>}
      {err && <p className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3 text-sm text-destructive">{err}</p>}

      <div className="mt-6 flex flex-wrap gap-2">
        <Btn disabled={busy} onClick={() => void reissue()}>Resend invite</Btn>
        <Btn disabled={busy} onClick={() => void act({ action: "set_status", status: "paused" })}>Pause</Btn>
        <Btn disabled={busy} onClick={() => void act({ action: "set_status", status: "in_progress" })}>Resume</Btn>
        <Btn disabled={busy} onClick={() => void act({ action: "handoff" })}>Mark ready for production</Btn>
      </div>

      {state.outstanding.length > 0 && (
        <section className="mt-8 rounded-xl border p-5">
          <h2 className="font-semibold">Outstanding</h2>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-muted-foreground">
            {state.outstanding.map((o) => <li key={o}>{o}</li>)}
          </ul>
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Platform access</h2>
        <div className="space-y-2">
          {state.access.map((a) => (
            <div key={a.key} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3">
              <div>
                <p className="text-sm font-medium">{a.key}</p>
                <p className="text-xs text-muted-foreground">
                  {a.permissionLevel} · {a.state}
                  {a.verifiedByUid ? " · verified by staff" : ""}
                </p>
              </div>
              {a.state !== "verified" && (
                <Btn
                  disabled={busy}
                  onClick={async () => {
                    await act({ action: "verify_access", key: a.key, state: "verified" });
                    setState((s) => ({
                      ...s,
                      access: s.access.map((x) => (x.key === a.key ? { ...x, state: "verified" } : x)),
                    }));
                  }}
                >
                  I confirmed access
                </Btn>
              )}
            </div>
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-semibold">Files ({assets.length})</h2>
        {assets.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing uploaded yet.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {assets.map((a) => (
              <li key={a.id}>
                {a.key}: {a.filename} ({Math.round(a.sizeBytes / 1024)}KB)
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Btn({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" {...rest} className="rounded-lg border px-3 py-1.5 text-sm disabled:opacity-50">
      {children}
    </button>
  );
}
