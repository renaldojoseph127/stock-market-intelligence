import { Badge } from "@/components/ui";
import {
  resolveSocialCoverageState,
  socialCoverageCopy,
  type SocialCoverageState as State,
} from "@/lib/social/coverage";

export function SocialCoverageState({
  state,
  coverageStatus,
  queueStatus,
  compact = false,
}: {
  state?: State;
  coverageStatus?: string | null;
  queueStatus?: string | null;
  compact?: boolean;
}) {
  const resolved =
    state ?? resolveSocialCoverageState({ coverageStatus, queueStatus });
  const content = socialCoverageCopy(resolved);
  const tone =
    resolved === "complete_for_provider_window"
      ? "positive"
      : resolved === "failed"
        ? "negative"
        : "warning";
  if (compact)
    return <Badge tone={tone}>{content.label}</Badge>;
  return (
    <div className="panel p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={tone}>{content.label}</Badge>
        <span className="muted">{resolved}</span>
      </div>
      <p className="mt-2 muted">{content.explanation}</p>
    </div>
  );
}
