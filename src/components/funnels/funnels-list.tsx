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
  Loader2,
  Lock,
  Plus,
  Radio,
  ReceiptText,
  Tag,
  Trash2,
  Users,
} from "lucide-react";
import { doc, onSnapshot } from "firebase/firestore";
import { getFirebaseDb } from "@/lib/firebase/client";
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
];

interface Row {
  id: string;
  name: string;
  genre: FunnelGenre;
  status: FunnelStatus;
}

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
  const { saPath } = useSubAccount();
  const router = useRouter();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [gate, setGate] = useState<boolean | null>(null);

  useEffect(() => {
    return onSnapshot(
      doc(getFirebaseDb(), "subAccounts", saId),
      (snap) => setGate(snap.data()?.funnelsEnabledByAgency === true),
      () => setGate(null),
    );
  }, [saId]);

  async function load() {
    const res = await fetch(`/api/sub-accounts/${saId}/funnels`);
    const d = (await res.json().catch(() => ({}))) as { funnels?: Row[] };
    setRows(d.funnels ?? []);
  }
  useEffect(() => {
    if (gate) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saId, gate]);

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
    setRows((r) => r?.filter((x) => x.id !== id) ?? null);
    const res = await fetch(`/api/sub-accounts/${saId}/funnels/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      toast.error("Couldn't delete");
      void load();
    }
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
          <Button
            variant="outline"
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
