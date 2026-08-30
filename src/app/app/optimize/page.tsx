import { redirect } from "next/navigation";

/**
 * DivineX Production Experience 2.0 — the methodology routes
 * (Identify/Create/Launch/Grow/Optimize/Scale) are no longer the customer
 * information architecture. Old links keep working via this redirect
 * rather than 404ing.
 */
export default function LegacySectionPage() {
  redirect("/app/intelligence");
}
