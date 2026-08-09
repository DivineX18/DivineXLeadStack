import { resolveShellContextForLayout } from "@/lib/shell/shell-context-wrappers";
import { AscendSectionPlaceholder } from "@/components/shell/ascend-section-placeholder";
import { WorkflowBuilderLoader } from "@/components/workflows/workflow-builder-loader";
import type { BuilderReadiness } from "@/components/workflows/workflow-builder";
import { getAdminDb } from "@/lib/firebase/admin";
import { agencyAllowsSharedSms } from "@/lib/agency/policy";
import { emailIsConfigured, tenantFrom } from "@/lib/comms/resend";
import {
  smsIsConfigured,
  subAccountTwilioIsConfigured,
  subAccountWhatsappIsConfigured,
} from "@/lib/comms/twilio";
import type { SubAccountDoc } from "@/types";

export const dynamic = "force-dynamic";

/**
 * Ascend OS launch pass, Task E — the workflow editor, native to the
 * Ascend shell. WorkflowBuilderLoader (the actual builder UI) is reused
 * as-is. The send-readiness probe here is the SAME logic the legacy
 * /sa/[id]/workflows/[workflowId]/page.tsx computes server-side (every
 * input is deployment env vars + this sub-account's own config, so it's
 * deterministic regardless of which route resolved subAccountId) — kept
 * as a small duplicated glue block rather than importing the legacy page
 * itself, since that page derives its id from a Next.js [subAccountId]
 * route param this route doesn't have; the actual engine-parity logic it
 * computes is not owned by this file, just re-run here with saId sourced
 * from the Ascend shell context instead.
 */
export default async function AscendLaunchWorkflowEditorPage({
  params,
}: {
  params: Promise<{ workflowId: string }>;
}) {
  const { workflowId } = await params;
  const shell = await resolveShellContextForLayout();
  const saId = shell?.workspace?.workspaceId ?? null;

  if (!saId) {
    return <AscendSectionPlaceholder title="Workflow" description="No active workspace yet." links={[]} />;
  }

  const db = getAdminDb();
  const [snap, approvedWhatsapp] = await Promise.all([
    db.doc(`subAccounts/${saId}`).get(),
    db
      .collection(`subAccounts/${saId}/whatsappTemplates`)
      .where("status", "==", "approved")
      .limit(1)
      .get(),
  ]);
  const sub = snap.data() as SubAccountDoc | undefined;
  const tc = sub?.twilioConfig ?? null;

  const smsSub = subAccountTwilioIsConfigured(tc);
  const smsAgency = smsIsConfigured() && (await agencyAllowsSharedSms(sub?.agencyId));
  const emailSub = tenantFrom(sub) !== undefined;
  const emailAgency = emailIsConfigured();
  const whatsappGate = sub?.whatsappEnabledByAgency === true;
  const whatsappSender = subAccountWhatsappIsConfigured(tc);
  const whatsappTemplate = !approvedWhatsapp.empty;

  const readiness: BuilderReadiness = {
    emailReady: emailAgency,
    smsReady: smsSub || smsAgency,
    whatsappReady: whatsappGate && whatsappSender && whatsappTemplate,
    detail: { smsSub, smsAgency, emailSub, emailAgency, whatsappGate, whatsappSender, whatsappTemplate },
  };

  return (
    <div className="mx-auto w-full max-w-5xl rounded-2xl bg-white p-6 text-foreground shadow-sm">
      <WorkflowBuilderLoader saId={saId} workflowId={workflowId} readiness={readiness} />
    </div>
  );
}
