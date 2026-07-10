"use client";

import { useState, use } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { signInWithEmail } from "@/lib/firebase/auth";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { LogoMark } from "@/components/brand/logo-mark";

/**
 * Public — where the "Set your password" email from a self-serve signup
 * lands. The Firebase Auth account already exists (created server-side
 * with a random, never-shared password when checkout completed); this page
 * lets the buyer set the one they'll actually use, then signs them in.
 */
export default function ActivatePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = use(params);
  const router = useRouter();

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError("");

    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const payload = (await res.json().catch(() => ({}))) as {
        error?: string;
        email?: string;
        subAccountId?: string;
      };
      if (!res.ok || !payload.email) {
        throw new Error(payload.error ?? "Could not activate your account.");
      }

      await signInWithEmail(payload.email, password);

      router.push(
        payload.subAccountId
          ? `/sa/${payload.subAccountId}/dashboard`
          : "/dashboard",
      );
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not activate your account.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center gap-2">
            <LogoMark size={24} idSuffix="-activate" />
          </Link>
          <p className="mt-2 text-sm text-muted-foreground">
            Set your password to access your new workspace.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Set your password</CardTitle>
            <CardDescription>
              Choose a password to log in from now on.
            </CardDescription>
          </CardHeader>
          <form onSubmit={handleSubmit}>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Create a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirm password</Label>
                <Input
                  id="confirm-password"
                  type="password"
                  placeholder="Confirm your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
              {error && <p className="text-sm text-destructive">{error}</p>}
            </CardContent>
            <CardFooter>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? "Activating…" : "Set password & log in"}
              </Button>
            </CardFooter>
          </form>
        </Card>
      </div>
    </div>
  );
}
