import { redirect } from "next/navigation";

/** P0.3 — "Campaigns" is no longer a top-level concept. Everything Ascend
 *  builds lives in Create. Old links keep working. */
export default function LegacyCampaignsPage() {
  redirect("/app/create");
}
