import { redirect } from "next/navigation";

/** P0.3 — "CRM" resolves into Leads, which answers "who should I talk to?" */
export default function LegacyCrmPage() {
  redirect("/app/leads");
}
