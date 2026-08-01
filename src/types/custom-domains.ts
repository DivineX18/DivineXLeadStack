import type { Timestamp, FieldValue } from "firebase/firestore";

/**
 * A client's own domain pointed at exactly one published funnel's root —
 * deliberately narrow (not a general path-based reverse proxy) so the
 * middleware lookup stays a single doc read. Doc id = the lowercased
 * domain itself, for O(1) lookup from middleware.
 */

export type CustomDomainStatus = "pending" | "verified" | "failed";

export interface CustomDomainDoc {
  /** Lowercased domain, also the Firestore doc id. */
  domain: string;
  subAccountId: string;
  agencyId: string;
  funnelId: string;
  status: CustomDomainStatus;
  misconfigured: boolean;
  /** Verbatim DNS records Vercel says are required, shown to the operator. */
  verificationRecords: { type: string; name: string; value: string }[];
  createdAt: Timestamp | FieldValue | null;
  updatedAt: Timestamp | FieldValue | null;
}
