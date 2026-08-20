import { RedditSocialProvider } from "./adapters/reddit";
import { redditConfiguration, socialResearchConfig } from "./config";
import type {
  AdapterPage,
  AdapterStatus,
  ConfigurationResult,
  ProviderRecord,
} from "./types";

export type ProviderRegistryState =
  | "not_implemented"
  | "disabled"
  | "configured"
  | "approval_required"
  | "available";

export interface ProviderCapabilityMatrix {
  search_posts: boolean;
  comments: boolean;
  historical_search: boolean;
  exact_date_filter: boolean;
  account_lookup: boolean;
  rate_limit_known: boolean;
  external_approval_required: boolean;
}

export interface NormalizedSocialAccount {
  externalId?: string;
  username?: string;
  displayName?: string;
  profileUrl?: string;
  rawPayload: unknown;
}

export interface SocialResearchProvider {
  getProviderName(): string;
  getProviderHealth(): Promise<ConfigurationResult>;
  supportsSearch(): boolean;
  supportsComments(): boolean;
  supportsHistoricalWindow(): boolean;
  searchPosts(input: {
    community: string;
    query: string;
    after?: string;
    limit?: number;
  }): Promise<AdapterPage>;
  getComments(externalId: string, limit?: number): Promise<AdapterPage>;
  normalizePost(input: unknown): ProviderRecord;
  normalizeAccount(input: unknown): NormalizedSocialAccount;
  getCoverageLimitations(): string[];
  healthCheck(): Promise<ConfigurationResult>;
}

class RedditResearchProvider implements SocialResearchProvider {
  constructor(private readonly adapter = new RedditSocialProvider()) {}
  getProviderName() {
    return "Reddit";
  }
  getProviderHealth() {
    return this.adapter.validateConfiguration();
  }
  supportsSearch() {
    return true;
  }
  supportsComments() {
    return true;
  }
  supportsHistoricalWindow() {
    return true;
  }
  searchPosts(input: {
    community: string;
    query: string;
    after?: string;
    limit?: number;
  }) {
    return this.adapter.searchTicker(input);
  }
  getComments(externalId: string, limit = 100) {
    return this.adapter.fetchComments(externalId, limit);
  }
  normalizePost(input: unknown) {
    return this.adapter.normalizeRecord(input);
  }
  normalizeAccount(input: unknown): NormalizedSocialAccount {
    const value = input as Record<string, unknown>;
    return {
      externalId:
        typeof value.id === "string" ? value.id : undefined,
      username:
        typeof value.username === "string"
          ? value.username
          : typeof value.authorName === "string"
            ? value.authorName
            : undefined,
      displayName:
        typeof value.displayName === "string" ? value.displayName : undefined,
      profileUrl:
        typeof value.profileUrl === "string" ? value.profileUrl : undefined,
      rawPayload: input,
    };
  }
  getCoverageLimitations() {
    return [
      "Devvit search does not document exhaustive historical completeness.",
      "Exact provider-side date filtering is unavailable; returned records are filtered locally.",
      "Only explicitly recorded communities, queries, pages, and cursors are covered.",
      "Deleted or removed Reddit content may be unavailable.",
    ];
  }
  async healthCheck() {
    const configuration = redditConfiguration();
    if (!configuration.ready)
      return { status: configuration.status, message: configuration.message };
    return this.adapter.healthCheck();
  }
}

const unavailableCapabilities: ProviderCapabilityMatrix = {
  search_posts: false,
  comments: false,
  historical_search: false,
  exact_date_filter: false,
  account_lookup: false,
  rate_limit_known: false,
  external_approval_required: false,
};

export interface ProviderRegistryEntry {
  key: string;
  name: string;
  state: ProviderRegistryState;
  status: AdapterStatus | "not_implemented";
  capabilities: ProviderCapabilityMatrix;
  limitations: string[];
  provider?: SocialResearchProvider;
}

export function socialProviderRegistry(): ProviderRegistryEntry[] {
  const reddit = redditConfiguration();
  const redditState: ProviderRegistryState = reddit.ready
    ? "available"
    : reddit.status === "authorization_required"
      ? "approval_required"
      : socialResearchConfig.redditProviderMode === "disabled"
        ? "disabled"
        : "configured";
  const provider = new RedditResearchProvider();
  const future = [
    ["stocktwits", "Stocktwits"],
    ["yahoo_finance_community", "Yahoo Finance Community"],
    ["investorshub", "InvestorsHub"],
    ["seeking_alpha", "Seeking Alpha Community"],
    ["motley_fool_community", "Motley Fool Community"],
    ["other_forum", "Other Forum"],
  ];
  return [
    {
      key: "reddit",
      name: "Reddit",
      state: redditState,
      status: reddit.status,
      capabilities: {
        search_posts: true,
        comments: true,
        historical_search: true,
        exact_date_filter: false,
        account_lookup: false,
        rate_limit_known: true,
        external_approval_required: true,
      },
      limitations: provider.getCoverageLimitations(),
      provider,
    },
    ...future.map(([key, name]) => ({
      key,
      name,
      state: "not_implemented" as const,
      status: "not_implemented" as const,
      capabilities: { ...unavailableCapabilities },
      limitations: [
        "No permitted adapter has been researched or implemented for this provider.",
      ],
    })),
  ];
}

export function getSocialResearchProvider(key: string) {
  return socialProviderRegistry().find((entry) => entry.key === key)?.provider;
}
