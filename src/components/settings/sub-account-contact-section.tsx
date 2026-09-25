"use client";

import { useEffect, useState, type FormEvent } from "react";
import {
  Building2,
  CalendarClock,
  Globe,
  Mail,
  MapPin,
  Phone,
  User as UserIcon,
} from "lucide-react";
import { toast } from "sonner";
import { useSubAccount } from "@/context/sub-account-context";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BUSINESS_WEEKDAYS,
  WEEKDAY_LABELS,
  blankBusinessHours,
} from "@/lib/business-profile/profile";
import type { BusinessHours, BusinessWeekday } from "@/types";

/**
 * Settings → Business profile.
 *
 * Two kinds of information sit in one card because an operator thinks of them
 * as one job, but they are not the same kind of thing and the copy says so:
 *
 *  - ACCOUNT CONTACT is the person an agency speaks to about this workspace.
 *  - VERIFIED BUSINESS INFORMATION is the business itself, and it is the
 *    authoritative source for anything factual on a generated website. AI
 *    generation READS these values and never writes them, because an address
 *    and a set of opening hours are claims about a real place rather than
 *    copy. Blank stays blank: a generated page omits what was never stated.
 */
export function SubAccountContactSection() {
  const { subAccount, subAccountId, isAdmin } = useSubAccount();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [businessName, setBusinessName] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [bookingLink, setBookingLink] = useState("");
  const [street, setStreet] = useState("");
  const [street2, setStreet2] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zip, setZip] = useState("");
  const [country, setCountry] = useState("");
  const [addressPublic, setAddressPublic] = useState(true);
  const [hours, setHours] = useState<BusinessHours>(blankBusinessHours());

  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setName(subAccount?.accountContact?.name ?? "");
    setEmail(subAccount?.accountContact?.email ?? "");
    setPhone(subAccount?.accountContact?.phone ?? "");

    const p = subAccount?.businessProfile ?? null;
    setBusinessName(p?.businessName ?? "");
    setWebsiteUrl(p?.websiteUrl ?? "");
    setBookingLink(subAccount?.bookingLink ?? "");
    setStreet(p?.street ?? "");
    setStreet2(p?.street2 ?? "");
    setCity(p?.city ?? "");
    setState(p?.state ?? "");
    setZip(p?.zip ?? "");
    setCountry(p?.country ?? "");
    setAddressPublic(p?.addressPublic !== false);
    setHours(p?.hours ?? blankBusinessHours());
  }, [subAccount]);

  if (!isAdmin) return null;

  function setDay(day: BusinessWeekday, patch: Partial<BusinessHours[BusinessWeekday]>) {
    setHours((prev) => ({ ...prev, [day]: { ...prev[day], ...patch } }));
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const trimmedName = name.trim();
      const trimmedEmail = email.trim();
      const trimmedPhone = phone.trim();
      const contact =
        !trimmedName && !trimmedEmail && !trimmedPhone
          ? null
          : { name: trimmedName, email: trimmedEmail, phone: trimmedPhone };

      const booking = bookingLink.trim();

      const res = await fetch(`/api/agency/sub-accounts/${subAccountId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accountContact: contact,
          bookingLink: booking || null,
          // Sent whole. The route normalises it, drops anything that states
          // nothing, and is the same normalisation website generation reads
          // through — so what saves here is exactly what builds.
          businessProfile: {
            businessName,
            websiteUrl,
            street,
            street2,
            city,
            state,
            zip,
            country,
            addressPublic,
            hours,
          },
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not save.");
      toast.success("Business profile saved.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl border bg-card p-5">
      <div className="mb-4 flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-500/10 text-teal-600 dark:text-teal-400">
          <Building2 className="h-4 w-4" />
        </span>
        <div>
          <h2 className="text-sm font-semibold">Business profile</h2>
          <p className="text-xs text-muted-foreground">
            Your contact person, plus the business details a generated website
            is allowed to publish.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="space-y-4">
          <p className="text-xs font-medium text-muted-foreground">
            Account contact
          </p>

          <div className="space-y-1.5">
            <Label htmlFor="contact-name">Name</Label>
            <div className="relative">
              <UserIcon className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="contact-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Jane Doe"
                className="pl-8"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="contact-email">Public email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="contact-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="hello@acme.com"
                  className="pl-8"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="contact-phone">Public phone</Label>
              <div className="relative">
                <Phone className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="contact-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+15125550000"
                  className="pl-8"
                />
              </div>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            E.164 format recommended. These are the email and phone a generated
            website will show, so use ones a customer can actually reach.
          </p>
        </div>

        <div className="space-y-4 border-t pt-5">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Verified business information
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              You enter these; AI never fills them in or overwrites them.
              Anything you leave blank is simply left off a generated site
              rather than guessed at.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="biz-name">Business name</Label>
              <Input
                id="biz-name"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
                placeholder="Acme Plumbing"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="biz-website">Primary website</Label>
              <div className="relative">
                <Globe className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="biz-website"
                  value={websiteUrl}
                  onChange={(e) => setWebsiteUrl(e.target.value)}
                  placeholder="https://acmeplumbing.com"
                  className="pl-8"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="biz-booking">Booking URL</Label>
            <div className="relative">
              <CalendarClock className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="biz-booking"
                value={bookingLink}
                onChange={(e) => setBookingLink(e.target.value)}
                placeholder="https://cal.com/acme/quote"
                className="pl-8"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              Used for the {"{{bookingLink}}"} merge tag and as the call-to-action
              destination on generated pages.
            </p>
          </div>

          <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Business address</span>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="biz-street">Street address</Label>
              <Input
                id="biz-street"
                value={street}
                onChange={(e) => setStreet(e.target.value)}
                placeholder="1200 Main St"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="biz-street2">Address line 2</Label>
              <Input
                id="biz-street2"
                value={street2}
                onChange={(e) => setStreet2(e.target.value)}
                placeholder="Suite 400"
              />
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="biz-city">City</Label>
                <Input
                  id="biz-city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Houston"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="biz-state">State / region</Label>
                <Input
                  id="biz-state"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  placeholder="TX"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="biz-zip">ZIP / postal code</Label>
                <Input
                  id="biz-zip"
                  value={zip}
                  onChange={(e) => setZip(e.target.value)}
                  placeholder="77002"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="biz-country">Country</Label>
                <Input
                  id="biz-country"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="United States"
                />
              </div>
            </div>

            <label className="flex items-start gap-2.5 pt-1">
              <Checkbox
                checked={addressPublic}
                onCheckedChange={(v) => setAddressPublic(v === true)}
                className="mt-0.5"
              />
              <span className="text-xs">
                Show this address publicly
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  Turn this off if you run a service-area, remote or home-based
                  business. The address stays on file here and is kept off
                  generated websites entirely.
                </span>
              </span>
            </label>
          </div>

          <div className="space-y-3 rounded-xl border bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-xs font-medium">Business hours</span>
            </div>
            {BUSINESS_WEEKDAYS.map((day) => (
              <div key={day} className="flex flex-wrap items-center gap-2">
                <span className="w-10 text-xs font-medium">
                  {WEEKDAY_LABELS[day]}
                </span>
                <label className="flex items-center gap-1.5">
                  <Checkbox
                    checked={hours[day].closed}
                    onCheckedChange={(v) => setDay(day, { closed: v === true })}
                  />
                  <span className="text-[11px] text-muted-foreground">
                    Closed
                  </span>
                </label>
                <Input
                  type="time"
                  aria-label={`${WEEKDAY_LABELS[day]} opening time`}
                  value={hours[day].open}
                  disabled={hours[day].closed}
                  onChange={(e) => setDay(day, { open: e.target.value })}
                  className="h-8 w-[7.5rem]"
                />
                <span className="text-[11px] text-muted-foreground">to</span>
                <Input
                  type="time"
                  aria-label={`${WEEKDAY_LABELS[day]} closing time`}
                  value={hours[day].close}
                  disabled={hours[day].closed}
                  onChange={(e) => setDay(day, { close: e.target.value })}
                  className="h-8 w-[7.5rem]"
                />
              </div>
            ))}
            <p className="text-[11px] text-muted-foreground">
              Leave a day blank if you would rather say nothing about it. A
              week with nothing filled in publishes no hours at all.
            </p>
          </div>
        </div>

        <div className="flex justify-end">
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </form>
    </section>
  );
}
