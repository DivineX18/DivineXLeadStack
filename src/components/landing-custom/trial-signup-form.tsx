"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Step 1: who you are. No card, and no password.
 *
 * The password omission is architectural rather than a shortcut. Provisioning
 * mints a random credential and emails a set-password link once payment
 * clears, so there is nowhere to put a password typed here that would not
 * mean creating an auth user before the customer exists.
 *
 * Inputs are 44px for the same reason every other public-page field is: most
 * of these arrive on a phone, and a mis-tap here is a lost customer with
 * nothing in any log to say it happened.
 */
export function TrialSignupForm({ planId }: { planId: string }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/public/trial-signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ firstName, lastName, email, planId }),
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.error ?? "Could not start your trial.");
      }
      window.location.href = data.url;
    } catch (err) {
      setSubmitting(false);
      setError(err instanceof Error ? err.message : "Could not start your trial.");
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="firstName">First name</Label>
          <Input
            id="firstName"
            name="firstName"
            autoComplete="given-name"
            className="h-11"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="lastName">Last name</Label>
          <Input
            id="lastName"
            name="lastName"
            autoComplete="family-name"
            className="h-11"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Work email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          className="h-11"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button type="submit" size="lg" className="h-11 w-full text-base" disabled={submitting}>
        {submitting ? "Taking you to checkout…" : "Continue →"}
      </Button>
    </form>
  );
}
