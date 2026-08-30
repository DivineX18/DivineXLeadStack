import { redirect } from "next/navigation";

/** Legacy methodology route → the customer-facing CRM section. */
export default function LegacyGrowPage() {
  redirect("/app/crm");
}
