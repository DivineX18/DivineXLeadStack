import type { OnboardingPlatformRequirement } from "@/types/client-onboarding";

/**
 * The platforms a client can invite DIVINEX into, and how.
 *
 * NO PASSWORDS, EVER. Every entry below is an official invitation or
 * delegated-access mechanism. Asking a client for their WordPress password is
 * both a security problem and a trust problem, and it is also unnecessary:
 * every one of these platforms has a proper way to add a collaborator.
 *
 * PERMISSION LEVELS ARE LEAST-PRIVILEGE AND PLATFORM-SPECIFIC. They are not
 * interchangeable. GA4 grants per-property roles, Search Console has full
 * versus restricted, WordPress has its own role ladder, Meta grants partner
 * access on an asset. Treating them as one "admin" concept is how an agency
 * ends up with more access than the work needs.
 */
export interface PlatformDefinition {
  key: string;
  label: string;
  /** Written for the client, who may never have done this before. */
  instructions: string;
  /** The least privilege that still lets the work happen. */
  defaultPermission: string;
}

export const PLATFORM_CATALOG: PlatformDefinition[] = [
  {
    key: "wordpress",
    label: "WordPress",
    defaultPermission: "Administrator",
    instructions:
      "In your WordPress dashboard go to Users, then Add New. Enter our access email, set the role, and send the invitation. Administrator is needed to install and configure the theme and plugins.",
  },
  {
    key: "hosting",
    label: "Hosting provider",
    defaultPermission: "Collaborator",
    instructions:
      "Most hosts have a Users, Team or Collaborators section. Add our access email as a collaborator so we can manage staging, backups and SSL. If your host has no collaborator feature, tell us and we will work out another way rather than asking for your password.",
  },
  {
    key: "ga4",
    label: "Google Analytics 4",
    defaultPermission: "Editor",
    instructions:
      "In Google Analytics open Admin, then Property access management, then the plus button, then Add users. Enter our access email and choose Editor.",
  },
  {
    key: "search_console",
    label: "Google Search Console",
    defaultPermission: "Full user",
    instructions:
      "In Search Console open Settings, then Users and permissions, then Add user. Enter our access email and choose Full. Full is needed to submit sitemaps and handle indexing.",
  },
  {
    key: "tag_manager",
    label: "Google Tag Manager",
    defaultPermission: "Publish",
    instructions:
      "In Tag Manager open Admin, then User Management, then the plus button. Enter our access email and grant container Publish rights.",
  },
  {
    key: "business_profile",
    label: "Google Business Profile",
    defaultPermission: "Manager",
    instructions:
      "In your Business Profile open Settings, then People and access, then Add. Enter our access email and choose Manager. Manager can post and reply to reviews without being able to remove you as owner.",
  },
  {
    key: "meta_business",
    label: "Meta Business Suite",
    defaultPermission: "Partner access",
    instructions:
      "In Business Settings open Partners, then Add, then Give a partner access to your assets. Use our Business ID, which we will send you, and grant access to the Page and ad account you want us to work on.",
  },
  {
    key: "google_ads",
    label: "Google Ads",
    defaultPermission: "Standard",
    instructions:
      "In Google Ads open Admin, then Access and security, then the plus button. Enter our access email and choose Standard.",
  },
  {
    key: "email_platform",
    label: "Email marketing platform",
    defaultPermission: "Team member",
    instructions:
      "Most platforms have an Account, Team or Users area. Invite our access email as a team member with permission to create and send campaigns.",
  },
  {
    key: "other",
    label: "Other platform",
    defaultPermission: "As discussed",
    instructions:
      "Invite our access email using whatever team or collaborator feature the platform offers, and add a note telling us which platform it is.",
  },
];

export function platformByKey(key: string): PlatformDefinition | null {
  return PLATFORM_CATALOG.find((p) => p.key === key) ?? null;
}

/**
 * The address clients invite. Configurable rather than hardcoded, so it can
 * change without a deploy and so this can later become per-agency when the
 * feature is productised.
 */
export function divinexAccessEmail(): string {
  return process.env.DIVINEX_ACCESS_EMAIL?.trim() || "access@divinex.io";
}

export function defaultPlatformRequirements(
  keys: string[],
): OnboardingPlatformRequirement[] {
  return keys
    .map((key) => platformByKey(key))
    .filter((p): p is PlatformDefinition => !!p)
    .map((p) => ({ key: p.key, permissionLevel: p.defaultPermission, required: true }));
}
