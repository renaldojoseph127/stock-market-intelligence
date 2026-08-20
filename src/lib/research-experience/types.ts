export type ResearchDataMode = "raw" | "effective";
export type WorkspaceStatus = "active" | "follow_up" | "complete" | "archived";

export interface PriorityInput {
  changePercent: number | null;
  repeatCount: number;
  catalystStatus: string;
  socialCoverageStatus: string;
  qualityStatus: string;
  savedResearch: boolean;
  importedWithin30Days: boolean;
}

export interface PriorityResult {
  score: number;
  version: typeof RESEARCH_PRIORITY_VERSION;
  reasons: string[];
  components: Record<string, number>;
}

export interface SimilarityObservation {
  id: string;
  exchange: string | null;
  categoryId: string;
  changePercent: number | null;
  price: number | null;
  volume: number | null;
  repeatMover: boolean;
  catalystStatus: string;
  qualityStatus: string;
  validChange: boolean;
  validPrice: boolean;
  validVolume: boolean;
}

export interface SimilarityResult {
  score: number;
  reasons: string[];
  version: typeof SIMILARITY_ALGORITHM_VERSION;
  availableWeight: number;
}

export interface ResearchBriefSection {
  heading: string;
  paragraphs?: string[];
  rows?: Array<Record<string, unknown>>;
}

export interface ResearchBrief {
  title: string;
  briefType: "ticker" | "mover";
  researchBriefVersion: string;
  generatedAt: string;
  dataMode: ResearchDataMode;
  executiveSummary: string;
  sections: ResearchBriefSection[];
  provenance: {
    tickerId: string;
    sourceReportIds: string[];
    moverIds: string[];
    eventIds: string[];
    qualityState: string;
    catalystCoverageState: string;
    socialCoverageState: string;
    applicationReportVersion: string;
  };
  limitations: string[];
}

export const RESEARCH_PRIORITY_VERSION = "historical-research-priority-v1";
export const SIMILARITY_ALGORITHM_VERSION = "historical-mover-similarity-v1";
export const TICKER_BRIEF_VERSION = "ticker-research-brief-v1";
export const MOVER_BRIEF_VERSION = "mover-research-brief-v1";

