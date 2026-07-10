import "server-only";

import { randomBytes } from "node:crypto";
import type Stripe from "stripe";
import type { UserRecord } from "firebase-admin/auth";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "@/lib/firebase/admin";
import { getStripeServer } from "@/lib/stripe/server";
import {
  BillingError,
  SUB_ACCOUNT_PLAN_KIND,
  billingStripeIsConfigured,
  recordBillingEvent,
} from "@/lib/server/billing-service";
import { applyFeatureGates } from "@/lib/server/feature-gates-service";
import { createSubAccountForAgency } from "@/lib/server/sub-accounts-service";
import { emitWebhookEvent } from "@/lib/api/webhooks/dispatch";
import { emailIsConfigured, sendEmail } from "@/lib/comms/resend";
import { resolveBrandName, resolveCustomBrand } from "@/lib/landing/resolve-brand";
import {
  buildActivationUrl,
  issueActivationToken,
} from "@/lib/auth/activation-token";
import {
  PLAN_GATE_KEYS,
  PLAN_GATE_LABELS,
  type BillingPlanDoc,
  type PlanGates,
  type PublicPlanSummary,
  type SubAccountBillingStatus,
} from "@/types/billing";

/**
 * Public self-serve signup (pay → get your own workspace, no agency-owner
 * action needed). Lives in its own file rather than billing-service.ts to
 * avoid a circular import: this needs `createSubAccountForAgency` from
 * `sub-accounts-service.ts`, which itself imports from billing-service.ts
 * for the (unrelated) default-plan auto-assign feature.
 *
 * Stripe linkage: a distinct checkout kind, `PUBLIC_SELF_SERVE_SIGNUP_KIND`,
 * used ONLY for `checkout.session.completed` — there is no pre-existing
 * `subAccountId` to stamp on the session because the workspace doesn't
 * exist yet. Once provisioning succeeds, the subscription's metadata is
 * patched to the standard `SUB_ACCOUNT_PLAN_KIND` shape (with the
 * now-real `subAccountId`), so every future lifecycle event — renewal
 * failure, cancellation — flows through the existing, already-tested
 * `handleSubAccountSubscriptionEvent` with zero new code.
 */

export const PUBLIC_SELF_SERVE_SIGNUP_KIND = "publicSelfServeSignup";

const ACTIVATION_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/** Single-agency-per-deployment lookup, mirrors resolve-brand.ts. */
async function resolveSingleAgencyId(): Promise<string | null> {
  const db = getAdminDb();
  const cfgSnap = await db.doc("appConfig/main").get();
  const fromBootstrap = cfgSnap.exists
    ? (cfgSnap.data()?.firstAgencyId as string | undefined)
    : undefined;
  if (fromBootstrap) return fromBootstrap;
  const agenciesSnap = await db.collection("agencies").limit(1).get();
  return agenciesSnap.empty ? null : agenciesSnap.docs[0].id;
}

/**
 * Plans a stranger can see and pay for on the public pricing page. Only
 * `status: "active"` + `publicSelfServeEnabled: true` plans qualify.
 * Deliberately returns a public-safe shape — no raw gate keys, no Stripe
 * ids.
 */
export async function getPublicPlans(): Promise<{
  agencyId: string | null;
  plans: PublicPlanSummary[];
}> {
  const agencyId = await resolveSingleAgencyId();
  if (!agencyId) return { agencyId: null, plans: [] };

  const snap = await getAdminDb()
    .collection(`agencies/${agencyId}/plans`)
    .where("status", "==", "active")
    .where("publicSelfServeEnabled", "==", true)
    .get();

  const plans = snap.docs
    .map((d) => {
      const data = d.data();
      const gates = (data.gates ?? {}) as Record<string, boolean>;
      const features = PLAN_GATE_KEYS.filter((k) => gates[k] === true).map(
        (k) => PLAN_GATE_LABELS[k],
      );
      const summary: PublicPlanSummary = {
        id: d.id,
        name: String(data.name ?? ""),
        description: (data.description as string | null) ?? null,
        priceMonthlyCents: Number(data.priceMonthlyCents ?? 0),
        currency: String(data.currency ?? "usd"),
        features,
      };
      return summary;
    })
    .sort((a, b) => a.priceMonthlyCents - b.priceMonthlyCents);

  return { agencyId, plans };
}

/**
 * Start a self-serve Checkout session for a plan — no pre-existing
 * customer, no pre-existing sub-account. The workspace is provisioned by
 * {@link handlePublicSelfServeSignupCheckoutCompleted} once Stripe
 * confirms payment.
 */
export async function createPublicSignupCheckoutSession(input: {
  planId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ url: string }> {
  if (!billingStripeIsConfigured()) {
    throw new BillingError(
      "Payments aren't configured on this deployment yet.",
      503,
    );
  }
  const agencyId = await resolveSingleAgencyId();
  if (!agencyId) {
    throw new BillingError("No workspace provider found.", 404);
  }

  const planSnap = await getAdminDb()
    .doc(`agencies/${agencyId}/plans/${input.planId}`)
    .get();
  if (!planSnap.exists) throw new BillingError("Plan not found.", 404);
  const plan = planSnap.data() as BillingPlanDoc;
  if (plan.status !== "active" || plan.publicSelfServeEnabled !== true) {
    throw new BillingError("This plan isn't available for self-serve signup.", 404);
  }
  if (!plan.stripePriceId) {
    throw new BillingError("This plan has no Stripe price configured.", 500);
  }

  const stripe = getStripeServer();
  const metadata = {
    kind: PUBLIC_SELF_SERVE_SIGNUP_KIND,
    agencyId,
    planId: input.planId,
  };
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: plan.stripePriceId, quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    custom_fields: [
      {
        key: "workspace_name",
        label: { type: "custom", custom: "Your business / workspace name" },
        type: "text",
        optional: true,
      },
    ],
    metadata,
    subscription_data: { metadata },
  });
  if (!session.url) {
    throw new BillingError("Stripe did not return a checkout URL.", 502);
  }
  return { url: session.url };
}

/**
 * checkout.session.completed with metadata.kind === PUBLIC_SELF_SERVE_SIGNUP_KIND.
 * Provisions a brand-new sub-account (or, if the buyer's email already has
 * an account, a new workspace under it), activates billing with the real
 * Stripe ids, applies the plan's gates, and emails the buyer a way in.
 *
 * Idempotent via a `publicSignups/{session.id}` claim doc — Stripe webhooks
 * are at-least-once. Any failure after the claim is recorded on that doc
 * (status "failed") and best-effort emailed to support, since this is real
 * money: a silent failure would mean a paying customer with no workspace.
 */
export async function handlePublicSelfServeSignupCheckoutCompleted(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const db = getAdminDb();
  const sessionId = session.id;
  const signupRef = db.doc(`publicSignups/${sessionId}`);

  const claimed = await db.runTransaction(async (tx) => {
    const snap = await tx.get(signupRef);
    if (snap.exists) return false;
    tx.set(signupRef, {
      status: "processing",
      email: session.customer_details?.email ?? null,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return true;
  });
  if (!claimed) return; // Already processed (or in flight) — retry no-op.

  try {
    const agencyId = session.metadata?.agencyId;
    const planId = session.metadata?.planId;
    const email = (
      session.customer_details?.email ??
      session.customer_email ??
      ""
    )
      .trim()
      .toLowerCase();
    if (!agencyId || !planId || !email) {
      throw new Error(
        "Checkout session completed without agencyId/planId metadata or a buyer email",
      );
    }

    const planSnap = await db.doc(`agencies/${agencyId}/plans/${planId}`).get();
    if (!planSnap.exists) {
      throw new Error(`Plan ${planId} not found for agency ${agencyId}`);
    }
    const plan = { ...(planSnap.data() as BillingPlanDoc), id: planSnap.id };

    const workspaceNameField = session.custom_fields?.find(
      (f) => f.key === "workspace_name",
    );
    const workspaceName =
      workspaceNameField?.text?.value?.trim() || `${email.split("@")[0]}'s workspace`;

    const auth = getAdminAuth();
    let existingUser: UserRecord | null = null;
    try {
      existingUser = await auth.getUserByEmail(email);
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code !== "auth/user-not-found") throw err;
    }

    let uid: string;
    let isNewAccount: boolean;
    if (existingUser) {
      const claims = (existingUser.customClaims ?? {}) as { status?: string };
      if (existingUser.disabled || claims.status === "removed") {
        throw new Error(
          `Existing account ${existingUser.uid} (${email}) is disabled/removed — refusing to provision a new workspace for it`,
        );
      }
      uid = existingUser.uid;
      isNewAccount = false;
    } else {
      const created = await auth.createUser({
        email,
        password: randomBytes(24).toString("hex"),
        displayName: email.split("@")[0],
      });
      uid = created.uid;
      await auth.setCustomUserClaims(uid, {
        role: "admin",
        status: "active",
        agencyId,
        agencyRole: null,
      });
      isNewAccount = true;
    }

    // Backfill a slim users/{uid} profile if this account somehow doesn't
    // have one yet. Never clobbers an existing profile.
    const userDocRef = db.doc(`users/${uid}`);
    const userDocSnap = await userDocRef.get();
    if (!userDocSnap.exists) {
      await userDocRef.set({
        uid,
        email,
        displayName: existingUser?.displayName || email.split("@")[0],
        photoURL: existingUser?.photoURL ?? null,
        status: "active",
        primaryAgencyId: agencyId,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    const createResult = await createSubAccountForAgency({
      agencyId,
      uid,
      email,
      displayName: existingUser?.displayName || email.split("@")[0],
      name: workspaceName,
      slug: "",
      timezone: "UTC",
      accountContact: { name: null, email, phone: null },
      skipDefaultPlanAssign: true,
    });
    const subAccountId = createResult.subAccountId;

    // Activate billing directly with the real Stripe ids from this
    // checkout — same shape handleSubAccountPlanCheckoutCompleted writes
    // for the manually-assigned path.
    await db.doc(`subAccounts/${subAccountId}`).update({
      billing: {
        status: "active" satisfies SubAccountBillingStatus,
        planId: plan.id,
        planName: plan.name,
        priceCents: plan.priceMonthlyCents,
        currency: plan.currency,
        specialPriceCents: null,
        stripePriceId: plan.stripePriceId,
        stripeCustomerId: (session.customer as string | null) ?? null,
        stripeSubscriptionId: (session.subscription as string | null) ?? null,
        checkoutTokenHash: null,
        graceUntil: null,
        assignedAt: FieldValue.serverTimestamp(),
        activatedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      },
      updatedAt: FieldValue.serverTimestamp(),
    });

    const gateResult = await applyFeatureGates(
      subAccountId,
      plan.gates as PlanGates,
    );
    if (gateResult.skippedMetaGates.length > 0) {
      console.warn(
        `[public-signup] plan ${plan.id} wants Meta gates but the deployment lacks META_APP_ID/SECRET — left off for ${subAccountId}`,
      );
    }

    // Graduate the subscription into a normal Client Billing subscription
    // (see file header) so future lifecycle events need no new code.
    if (session.subscription) {
      await getStripeServer()
        .subscriptions.update(session.subscription as string, {
          metadata: {
            kind: SUB_ACCOUNT_PLAN_KIND,
            agencyId,
            subAccountId,
            planId: plan.id,
          },
        })
        .catch((err) =>
          console.warn(
            "[public-signup] failed to graduate subscription metadata",
            err,
          ),
        );
    }

    recordBillingEvent({
      agencyId,
      subAccountId,
      event: "activated",
      detail: {
        planId: plan.id,
        planName: plan.name,
        priceCents: plan.priceMonthlyCents,
        stripeSubscriptionId: (session.subscription as string | null) ?? null,
        source: PUBLIC_SELF_SERVE_SIGNUP_KIND,
      },
    });
    void emitWebhookEvent({
      subAccountId,
      agencyId,
      mode: "live",
      type: "billing.activated",
      payload: {
        subAccountId,
        planId: plan.id,
        planName: plan.name,
        priceCents: plan.priceMonthlyCents,
        currency: plan.currency,
      },
    });

    const brandName = await resolveBrandName();
    let requiresActivation = false;
    if (emailIsConfigured()) {
      try {
        if (isNewAccount) {
          const { token, hash } = issueActivationToken(uid);
          await db.doc(`accountActivations/${uid}`).set({
            uid,
            email,
            subAccountId,
            tokenHash: hash,
            createdAt: FieldValue.serverTimestamp(),
            expiresAt: Timestamp.fromMillis(Date.now() + ACTIVATION_TOKEN_TTL_MS),
            consumedAt: null,
          });
          const activationUrl = buildActivationUrl(token);
          await sendEmail({
            to: email,
            subject: `Set your password to access ${workspaceName} on ${brandName}`,
            text: renderActivationText({
              workspaceName,
              planName: plan.name,
              activationUrl,
              brandName,
            }),
            html: renderActivationHtml({
              workspaceName,
              planName: plan.name,
              activationUrl,
              brandName,
            }),
          });
          requiresActivation = true;
        } else {
          const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
          await sendEmail({
            to: email,
            subject: `${workspaceName} is ready on ${brandName}`,
            text: renderReadyText({ workspaceName, planName: plan.name, appUrl, brandName }),
            html: renderReadyHtml({ workspaceName, planName: plan.name, appUrl, brandName }),
          });
        }
      } catch (err) {
        console.warn("[public-signup] activation/ready email failed", err);
      }
    }

    await signupRef.update({
      status: "ready",
      email,
      subAccountId,
      planId: plan.id,
      planName: plan.name,
      workspaceName,
      requiresActivation,
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (err) {
    console.error("[public-signup] provisioning failed", err);
    await signupRef
      .update({
        status: "failed",
        error: err instanceof Error ? err.message : String(err),
        updatedAt: FieldValue.serverTimestamp(),
      })
      .catch(() => undefined);
    await notifySupportOfFailure(sessionId, err).catch(() => undefined);
  }
}

async function notifySupportOfFailure(
  sessionId: string,
  err: unknown,
): Promise<void> {
  if (!emailIsConfigured()) return;
  const { supportEmail } = await resolveCustomBrand();
  if (!supportEmail) return;
  const message = err instanceof Error ? err.message : String(err);
  await sendEmail({
    to: supportEmail,
    subject: "Self-serve signup failed — customer paid, workspace not created",
    text: [
      `A self-serve checkout (Stripe session ${sessionId}) completed payment but workspace provisioning failed:`,
      "",
      message,
      "",
      `The customer has been charged. Check publicSignups/${sessionId} in Firestore and Stripe, then provision their workspace manually from Agency → Sub-accounts and assign them the plan they paid for from Client billing.`,
    ].join("\n"),
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

interface ActivationEmailContext {
  workspaceName: string;
  planName: string;
  activationUrl: string;
  brandName: string;
}

function renderActivationText({
  workspaceName,
  planName,
  activationUrl,
  brandName,
}: ActivationEmailContext): string {
  return [
    `Thanks for subscribing to ${planName} on ${brandName}!`,
    "",
    `Your workspace "${workspaceName}" is ready. Set your password to log in:`,
    activationUrl,
    "",
    `This link expires in 7 days.`,
  ].join("\n");
}

function renderActivationHtml({
  workspaceName,
  planName,
  activationUrl,
  brandName,
}: ActivationEmailContext): string {
  const ws = escapeHtml(workspaceName);
  const plan = escapeHtml(planName);
  const url = escapeHtml(activationUrl);
  const brand = escapeHtml(brandName);
  return emailShell({
    brandName: brand,
    title: "You're all set",
    bodyHtml: `
      <p style="margin:0 0 8px 0; font-size:15px; line-height:1.5; color:#4a4a55;">Thanks for subscribing to <strong style="color:#0a0a0f;">${plan}</strong> on ${brand}!</p>
      <p style="margin:0 0 24px 0; font-size:15px; line-height:1.5; color:#4a4a55;">Your workspace <strong style="color:#0a0a0f;">${ws}</strong> is ready. Set your password to log in:</p>
      <table role="presentation" cellpadding="0" cellspacing="0">
        <tr><td>
          <a href="${url}" style="display:inline-block; background:#7c3aed; color:#ffffff; text-decoration:none; padding:12px 24px; border-radius:8px; font-size:14px; font-weight:600;">Set your password</a>
        </td></tr>
      </table>
      <p style="margin:24px 0 0 0; font-size:13px; line-height:1.5; color:#8a8a95;">Or paste this link into your browser:<br/><a href="${url}" style="color:#7c3aed; word-break:break-all;">${url}</a></p>
      <p style="margin:24px 0 0 0; font-size:12px; line-height:1.5; color:#8a8a95;">This link expires in 7 days.</p>
    `,
  });
}

interface ReadyEmailContext {
  workspaceName: string;
  planName: string;
  appUrl: string;
  brandName: string;
}

function renderReadyText({
  workspaceName,
  planName,
  appUrl,
  brandName,
}: ReadyEmailContext): string {
  return [
    `Thanks for subscribing to ${planName} on ${brandName}!`,
    "",
    `Your new workspace "${workspaceName}" is ready. You already have an account, so there's nothing to activate — just sign in and it'll be in your workspace switcher.`,
    ...(appUrl ? ["", `Open ${brandName}:`, appUrl] : []),
  ].join("\n");
}

function renderReadyHtml({
  workspaceName,
  planName,
  appUrl,
  brandName,
}: ReadyEmailContext): string {
  const ws = escapeHtml(workspaceName);
  const plan = escapeHtml(planName);
  const url = escapeHtml(appUrl);
  const brand = escapeHtml(brandName);
  const cta = appUrl
    ? `<table role="presentation" cellpadding="0" cellspacing="0">
        <tr><td>
          <a href="${url}" style="display:inline-block; background:#7c3aed; color:#ffffff; text-decoration:none; padding:12px 24px; border-radius:8px; font-size:14px; font-weight:600;">Open ${brand}</a>
        </td></tr>
      </table>`
    : "";
  return emailShell({
    brandName: brand,
    title: "Your new workspace is ready",
    bodyHtml: `
      <p style="margin:0 0 8px 0; font-size:15px; line-height:1.5; color:#4a4a55;">Thanks for subscribing to <strong style="color:#0a0a0f;">${plan}</strong> on ${brand}!</p>
      <p style="margin:0 0 24px 0; font-size:15px; line-height:1.5; color:#4a4a55;">Your new workspace <strong style="color:#0a0a0f;">${ws}</strong> is ready. You already have an account, so there's nothing to activate — just sign in and it'll be in your workspace switcher.</p>
      ${cta}
    `,
  });
}

/** Shared card/logo shell — same visual pattern as the invite email. */
function emailShell({
  brandName,
  title,
  bodyHtml,
}: {
  brandName: string;
  title: string;
  bodyHtml: string;
}): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
</head>
<body style="margin:0; padding:0; background:#f6f6f9; font-family:-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif; color:#0a0a0f;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f9; padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="520" cellpadding="0" cellspacing="0" style="max-width:520px; background:#ffffff; border-radius:16px; padding:32px; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
          <tr>
            <td style="padding-bottom:20px;">
              <span style="font-size:18px; font-weight:700; color:#0a0a0f; letter-spacing:-0.01em;">${brandName}</span>
            </td>
          </tr>
          <tr>
            <td>
              <h1 style="margin:0 0 12px 0; font-size:22px; font-weight:600; color:#0a0a0f; letter-spacing:-0.01em;">${title}</h1>
              ${bodyHtml}
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
