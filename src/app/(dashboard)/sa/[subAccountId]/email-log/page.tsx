"use client";

import { EmailActivityLog } from "@/components/email/email-activity-log";

/**
 * Flow's Email log. The implementation lives in EmailActivityLog, which the
 * Ascend shell mounts too (/app/performance/email) — one component, so the
 * two shells can never show different numbers.
 */
export default function EmailLogPage() {
  return <EmailActivityLog />;
}
