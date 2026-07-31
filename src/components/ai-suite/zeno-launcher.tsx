"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { doc, onSnapshot } from "firebase/firestore";
import { Sparkles, X } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useAgency } from "@/hooks/use-agency";
import { getFirebaseDb } from "@/lib/firebase/client";
import { AiSuiteChat } from "@/components/ai-suite/ai-suite-chat";
import type { AiSuiteLevel } from "@/types/ai-suite";

/**
 * Persistent "Ask Zeno" bubble, mounted once in the dashboard shell — the
 * operator-facing equivalent of Hostinger's Kodee launcher. Only ever seen
 * by people who log into this dashboard (agency owner, sub-account
 * members); never rendered on any customer-facing surface (public forms,
 * the embeddable AI Agents chat widget, booking pages, etc), so it can't
 * leak DivineX/Flow branding onto a white-labeled sub-account's own
 * customers. Scope (agency vs. sub-account) is read from the URL rather
 * than SubAccountContext so this can mount at the top of the dashboard
 * shell without depending on SubAccountProvider being present.
 */
export function ZenoLauncher() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const saMatch = pathname.match(/^\/sa\/([^/]+)/);
  const subAccountId = saMatch ? saMatch[1] : null;
  const onAgencyPages = pathname.startsWith("/agency");

  const { agencyRole, loading: authLoading } = useAuth();
  const agency = useAgency();

  const [subGate, setSubGate] = useState<boolean | null>(null);
  useEffect(() => {
    if (!subAccountId) {
      setSubGate(null);
      return;
    }
    return onSnapshot(
      doc(getFirebaseDb(), "subAccounts", subAccountId),
      (snap) => setSubGate(snap.data()?.aiSuiteEnabledByAgency === true),
      () => setSubGate(null),
    );
  }, [subAccountId]);

  // Collapse on navigation so a scope change (sub-account A -> B, or into
  // agency) never leaves a stale thread open under the new scope.
  useEffect(() => setOpen(false), [pathname]);

  let level: AiSuiteLevel | null = null;
  let available = false;
  if (subAccountId) {
    level = "sub-account";
    available = subGate === true;
  } else if (onAgencyPages) {
    level = "agency";
    available =
      !authLoading &&
      agencyRole === "owner" &&
      !agency.loading &&
      agency.agencyAssistantEnabled === true;
  }

  if (!level || !available) return null;

  return (
    <>
      {open && (
        <div
          className="fixed bottom-20 right-4 z-40 flex h-[32rem] max-h-[calc(100dvh-6rem)] w-[22rem] max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-2xl border bg-card shadow-2xl md:bottom-24 md:right-6"
          role="dialog"
          aria-label="Ask Zeno"
        >
          <div className="flex items-center justify-between border-b bg-gradient-to-r from-indigo-500/10 via-violet-500/10 to-pink-500/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold leading-none">Zeno</p>
                <p className="mt-1 text-[11px] leading-none text-muted-foreground">
                  Growth Operations Assistant
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close Zeno"
              className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 p-2">
            <AiSuiteChat level={level} subAccountId={subAccountId ?? undefined} />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Close Zeno" : "Ask Zeno"}
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 via-violet-500 to-pink-500 text-white shadow-lg transition-transform hover:scale-105 md:bottom-6 md:right-6"
      >
        {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
      </button>
    </>
  );
}
