"use client";

import { useSubAccount } from "@/context/sub-account-context";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  BookOpen,
  Eye,
  ExternalLink,
  MoreHorizontal,
  Pencil,
  Sparkles,
  ChevronDown,
  Clapperboard,
  ClipboardCheck,
  Funnel,
  LayoutTemplate,
  Loader2,
  Lock,
  Plus,
  Radio,
  ReceiptText,
  RefreshCw,
  Tag,
  TriangleAlert,
  Trash2,
  Users,
  CalendarCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TemplateGallery } from "@/components/funnels/template-gallery";
import type { FunnelGenre, FunnelStatus } from "@/types/funnels";

const GENRES: { id: FunnelGenre; label: string; hint: string; icon: typeof BookOpen }[] = [
  {
    id: "lead_magnet",
    label: "Lead Magnet",
    hint: "Free book/offer -> headline, proof, story, FAQ",
    icon: BookOpen,
  },
  {
    id: "vsl",
    label: "VSL",
    hint: "High-ticket video sales page -> price anchor, one CTA",
    icon: Clapperboard,
  },
  {
    id: "challenge",
    label: "Challenge",
    hint: "Multi-day challenge registration -> agenda, ticket tiers",
    icon: Users,
  },
  {
    id: "application",
    label: "Application",
    hint: "Qualify leads before a call -> proof, story, application form",
    icon: ClipboardCheck,
  },
  {
    id: "tripwire",
    label: "Tripwire",
    hint: "Low-ticket entry offer -> priced offer, trust badges, guarantee",
    icon: Tag,
  },
  {
    id: "webinar",
    label: "Webinar",
    hint: "Single-session registration -> countdown, agenda, signup",
    icon: Radio,
  },
  {
    id: "lead_gen",
    label: "Lead Gen",
    hint: "Generic interest capture -> no specific magnet asset",
    icon: BookOpen,
  },
  {
    id: "booking",
    label: "Booking",
    hint: "Consultation, assessment or appointment -> a time in the diary, no file",
    icon: CalendarCheck,
  },
];

interface Row {
  id: string;
  name: string;
  genre: FunnelGenre;
  status: FunnelStatus;
}

/**
 * LOADING AND FAILURE ARE DIFFERENT THINGS.
 *
 * They were the same value here, and that is the whole defect. The list held
 * `rows: Row[] | null` and a `gate: boolean | null`, and BOTH the "haven't
 * heard back yet" state and the "the read failed" state were `null` — so a
 * Firestore listener error, a rejected fetch and a 403 were all indistinguish-
 * able from a request still in flight. The component rendered a spinner and
 * kept rendering it, silently, for as long as the page stayed open. An operator
 * sat looking at a workspace with funnels in it and was told nothing at all.
 *
 * A spinner is a PROMISE that something is still coming. Making failure
 * representable is what lets us stop breaking that promise.
 */
type ListState =
  | { status: "loading" }
  | { status: "ready"; rows: Row[] }
  | { status: "error"; message: string };

export function FunnelsList({
  saId,
  baseHref = `/sa/${saId}/funnels`,
}: {
  saId: string;
  /** Ascend OS launch pass — lets the /app/create native mount point at
   *  /app/create/funnels instead of the legacy /sa/{id}/funnels, so
   *  clicking into a specific funnel also stays inside Ascend chrome.
   *  Defaults to the original legacy path — zero behavior change for the
   *  existing CRM-only page, which never passes this prop. */
  baseHref?: string;
}) {
  // ONE SUBSCRIPTION TO THIS WORKSPACE, NOT TWO.
  //
  // This component used to open its own onSnapshot on subAccounts/{saId} purely
  // to read one boolean. SubAccountProvider — which is already mounted above
  // every mount of this list, in both shells — subscribes to that same document
  // and has all the things the private copy lacked: it waits for Firebase Auth
  // before subscribing, re-subscribes on [user, subAccountId], and unsubscribes
  // on change. The private copy subscribed at mount whether or not auth had
  // hydrated, and a single permission-denied killed the listener permanently
  // with nothing to restart it. That is the spinner.
  //
  // So the fix is not a more careful second listener. It is not having one.
  // The gate stays live (the provider's listener is still a subscription, so an
  // agency flipping the gate still reaches an open page), and this remains a
  // PRESENTATION decision only: /api/sub-accounts/[id]/funnels re-checks
  // funnelsEnabledByAgency server-side on every call, so nothing here is
  // authorization and an optimistic client gate could not grant access.
  const { saPath, subAccount, loading: workspaceLoading } = useSubAccount();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [state, setState] = useState<ListState>({ status: "loading" });
  const [reloadToken, setReloadToken] = useState(0);

  // null means "not known yet" and ONLY that. The provider reports a workspace
  // it could not read as (loading: false, subAccount: null), which is a real
  // failure and is handled as one below rather than folded back into "loading".
  const gate: boolean | null = workspaceLoading || !subAccount ? null : subAccount.funnelsEnabledByAgency === true;
  const workspaceUnreadable = !workspaceLoading && !subAccount;

  useEffect(() => {
    if (workspaceUnreadable) {
      setState({
        status: "error",
        message: "We couldn't read this workspace. Check your connection, then try again.",
      });
      return;
    }
    if (gate !== true) return; // still resolving, or locked — both rendered below

    // A NEWER WORKSPACE'S ANSWER MUST WIN. Switching workspace (or retrying)
    // starts a second request while the first is still open; without this flag
    // whichever happened to land last would set the list, so a slow response
    // for the workspace you just left could overwrite the one you are on.
    let cancelled = false;
    setState({ status: "loading" });
    void (async () => {
      try {
        const res = await fetch(`/api/sub-accounts/${saId}/funnels`);
        if (cancelled) return;
        if (!res.ok) {
          // A non-ok response used to fall through `.catch(() => ({}))` into
          // `setRows([])`, so a 403 rendered "No funnels yet. Create your first
          // one." — telling an operator their funnels did not exist.
          setState({
            status: "error",
            message:
              res.status === 403
                ? "Funnels isn't enabled for this workspace."
                : `We couldn't load your funnels (error ${res.status}).`,
          });
          return;
        }
        const d = (await res.json()) as { funnels?: Row[] };
        if (cancelled) return;
        setState({ status: "ready", rows: d.funnels ?? [] });
      } catch {
        if (cancelled) return;
        setState({ status: "error", message: "We couldn't reach the server. Check your connection, then try again." });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [saId, gate, workspaceUnreadable, reloadToken]);

  const rows = state.status === "ready" ? state.rows : null;

  async function create(genre: FunnelGenre) {
    setCreating(true);
    try {
      const res = await fetch(`/api/sub-accounts/${saId}/funnels`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ genre }),
      });
      const d = (await res.json()) as { id?: string };
      if (!res.ok || !d.id) throw new Error();
      router.push(`${baseHref}/${d.id}`);
    } catch {
      toast.error("Couldn't create funnel");
      setCreating(false);
    }
  }

  async function remove(id: string) {
    setState((s) => (s.status === "ready" ? { status: "ready", rows: s.rows.filter((x) => x.id !== id) } : s));
    try {
      const res = await fetch(`/api/sub-accounts/${saId}/funnels/${id}`, { method: "DELETE" });
      if (res.ok) return;
      toast.error("Couldn't delete");
    } catch {
      toast.error("Couldn't delete");
    }
    // Put the optimistically-removed row back by re-reading, rather than
    // leaving the operator looking at a list the server does not agree with.
    setReloadToken((t) => t + 1);
  }

  if (gate === false) {
    return (
      <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Lock className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-base font-semibold">
          Funnels is locked by your agency
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Ask your agency administrator to enable Funnels for this sub-account.
        </p>
      </div>
    );
  }

  // A FAILURE THE OPERATOR CAN ACT ON, instead of a spinner that never stops.
  if (state.status === "error") {
    return (
      <div className="rounded-2xl border border-dashed bg-card p-10 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
          <TriangleAlert className="h-6 w-6" />
        </span>
        <h2 className="mt-4 text-base font-semibold">We couldn&apos;t load your funnels</h2>
        <p className="mt-1 text-sm text-muted-foreground">{state.message}</p>
        <Button variant="outline" className="mt-4" onClick={() => setReloadToken((t) => t + 1)}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />
          Try again
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Funnels</h1>
          <p className="text-sm text-muted-foreground">
            High-converting single-page funnels, hosted directly on this
            platform.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setShowTemplates((v) => !v)}>
            <LayoutTemplate className="mr-1 h-4 w-4" />
            {showTemplates ? "Hide templates" : "Start from a template"}
          </Button>
          <Button
            variant="outline"
            className="hidden sm:inline-flex"
            render={<Link href={saPath("/funnels/orders")} />}
          >
            <ReceiptText className="mr-1 h-4 w-4" />
            Orders
          </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={<Button type="button" disabled={creating} />}
          >
            {creating ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-1 h-4 w-4" />
            )}
            New funnel
            <ChevronDown className="ml-1 h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Funnel type</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {GENRES.map((g) => (
                <DropdownMenuItem
                  key={g.id}
                  onClick={() => create(g.id)}
                  className="flex flex-col items-start gap-0.5"
                >
                  <span className="flex items-center gap-2 font-medium">
                    <g.icon className="h-4 w-4" /> {g.label}
                  </span>
                  <span className="pl-6 text-xs text-muted-foreground">
                    {g.hint}
                  </span>
                </DropdownMenuItem>
              ))}
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </div>

      {/* The gallery sits above the list rather than on its own route: someone
          about to build a page should see the ready-made starting points
          without leaving the place they came to build. */}
      {showTemplates && (
        <div className="mb-6 rounded-xl border bg-card p-4 sm:p-5">
          <p className="text-sm font-semibold tracking-tight">Start from a template</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Each one is a different page structure, not a different colour. Picking one creates a draft you can edit
            straight away.
          </p>
          <div className="mt-4">
            <TemplateGallery saId={saId} baseHref={baseHref} />
          </div>
        </div>
      )}

      {rows === null ? (
        <div className="flex justify-center py-16 text-muted-foreground">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center">
          <Funnel className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            No funnels yet. Create your first one.
          </p>
        </div>
      ) : (
        <div className="divide-y overflow-hidden rounded-xl border bg-card">
          {rows.map((f) => {
            const genre = GENRES.find((g) => g.id === f.genre);
            return (
              <div key={f.id} className="flex flex-wrap items-center gap-3 p-4 hover:bg-muted/40">
                {/* The row itself opens the editor — but the explicit
                    actions below are what the customer actually reaches
                    for. Delete is demoted into the overflow menu: it must
                    never sit beside the primary action. */}
                <Link href={`${baseHref}/${f.id}`} className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-medium">{f.name}</span>
                    <span
                      className={
                        f.status === "published"
                          ? "rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                          : "rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-medium text-amber-600 dark:text-amber-400"
                      }
                    >
                      {f.status === "published" ? "Published" : "Draft"}
                    </span>
                  </div>
                  <div className="text-xs text-muted-foreground">{genre?.label ?? f.genre}</div>
                </Link>

                <div className="flex items-center gap-1.5">
                  {/* PREVIEW — the fix for "Zeno built it but I never saw
                      it". Always available, draft or published, via the one
                      canonical preview route. */}
                  <Button variant="secondary" size="sm" render={<Link href={`/preview/funnel/${f.id}`} />}>
                    <Eye className="mr-1.5 h-3.5 w-3.5" /> Preview
                  </Button>
                  <Button variant="ghost" size="sm" render={<Link href={`${baseHref}/${f.id}`} />}>
                    <Pencil className="mr-1.5 h-3.5 w-3.5" /> Edit
                  </Button>
                  {/* Continue with Zeno — opens Zeno already scoped to this
                      funnel and its current state. */}
                  <Button variant="ghost" size="sm" className="hidden sm:inline-flex" render={<Link href={`/app/zeno?funnel=${f.id}`} />}>
                    <Sparkles className="mr-1.5 h-3.5 w-3.5" /> Continue with Zeno
                  </Button>

                  <DropdownMenu>
                    <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`More actions for ${f.name}`} />}>
                      <MoreHorizontal className="h-4 w-4" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {f.status === "published" && (
                        <DropdownMenuItem render={<a href={`/lp/${f.id}`} target="_blank" rel="noreferrer" />}>
                          <ExternalLink className="mr-2 h-4 w-4" /> View live page
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem render={<Link href={`/app/zeno?funnel=${f.id}`} />}>
                        <Sparkles className="mr-2 h-4 w-4" /> Continue with Zeno
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() => remove(f.id)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="mr-2 h-4 w-4" /> Delete funnel
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
