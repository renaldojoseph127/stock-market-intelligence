import { redditConfiguration, socialResearchConfig } from "./config";

export const SOCIAL_COVERAGE_STATES = [
  "not_configured",
  "awaiting_provider_approval",
  "not_researched",
  "queued",
  "partial",
  "provider_limited",
  "complete_for_provider_window",
  "failed",
] as const;

export type SocialCoverageState = (typeof SOCIAL_COVERAGE_STATES)[number];

const copy: Record<
  SocialCoverageState,
  { label: string; explanation: string }
> = {
  not_configured: {
    label: "Not configured",
    explanation:
      "No approved social provider transport is configured for this research window.",
  },
  awaiting_provider_approval: {
    label: "Provider approval pending",
    explanation:
      "Reddit research infrastructure is ready. Live collection is awaiting provider approval.",
  },
  not_researched: {
    label: "Not researched",
    explanation:
      "This provider, community, and date window has not been researched; no absence claim is available.",
  },
  queued: {
    label: "Research queued",
    explanation:
      "A bounded research plan is queued. Existing evidence remains available while the request is pending.",
  },
  partial: {
    label: "Partial coverage",
    explanation:
      "Some provider pages or requested scope were researched, but the recorded window is incomplete.",
  },
  provider_limited: {
    label: "Provider-limited coverage",
    explanation:
      "The configured provider returned bounded evidence but cannot support an exhaustive historical absence claim.",
  },
  complete_for_provider_window: {
    label: "Complete for configured provider window",
    explanation:
      "The recorded provider, community, query, and date window completed. This does not imply internet-wide coverage.",
  },
  failed: {
    label: "Research failed",
    explanation:
      "The bounded provider request failed. Existing stored evidence remains available and no absence claim is made.",
  },
};

export function socialCoverageCopy(state: SocialCoverageState) {
  return copy[state];
}

export function configuredSocialCoverageState(): SocialCoverageState {
  const configuration = redditConfiguration();
  if (
    socialResearchConfig.redditProviderMode === "disabled" ||
    (socialResearchConfig.redditProviderMode === "devvit_bridge" &&
      !socialResearchConfig.devvitAccessApproved)
  )
    return "awaiting_provider_approval";
  if (!configuration.ready) return "not_configured";
  return "not_researched";
}

export function resolveSocialCoverageState(input?: {
  coverageStatus?: string | null;
  queueStatus?: string | null;
}): SocialCoverageState {
  if (input?.queueStatus === "pending" || input?.queueStatus === "processing")
    return "queued";
  if (input?.queueStatus === "approval_blocked")
    return "awaiting_provider_approval";
  const status = input?.coverageStatus;
  if (status === "complete_for_provider_window")
    return "complete_for_provider_window";
  if (status === "provider_limited" || status === "rate_limited")
    return "provider_limited";
  if (status === "partial") return "partial";
  if (status === "failed" || status === "not_available") return "failed";
  if (status === "not_researched") return "not_researched";
  return configuredSocialCoverageState();
}

export function redditProviderStatusForDisplay() {
  const configuration = redditConfiguration();
  const mode = socialResearchConfig.redditProviderMode;
  return {
    mode,
    approval:
      mode === "devvit_bridge"
        ? socialResearchConfig.devvitAccessApproved
        : mode === "legacy_oauth"
          ? socialResearchConfig.redditAuthorized
          : false,
    devvitBridgeStatus:
      mode !== "devvit_bridge"
        ? "not_selected"
        : configuration.ready
          ? "ready"
          : configuration.status,
    endpointConfigured: Boolean(socialResearchConfig.devvitBridgeUrl),
    managedTokenConfigured: Boolean(socialResearchConfig.devvitBridgeToken),
    providerEnabled: configuration.ready,
    state: configuredSocialCoverageState(),
    message: configuration.message,
  };
}
