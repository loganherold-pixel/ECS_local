import { buildAdminFeedbackSummary } from './adminFeedbackSelectors';
import type {
  EcsFieldFeedbackEvent,
  EcsIssueAdminSummary,
} from './fieldFeedbackTypes';
import { enrichIssueEvent } from './issueGroupingResolver';

export function captureFieldFeedbackEvent(
  event: Omit<EcsFieldFeedbackEvent, 'issueFamily' | 'rootConditionKey' | 'groupingSignature' | 'issueClass' | 'affectedSurfaces' | 'providerFamily' | 'confidenceHint'>,
): EcsFieldFeedbackEvent {
  return enrichIssueEvent(event);
}

export function emitAdminFacingIssueSummaries(
  events: EcsFieldFeedbackEvent[],
  latestVersion: string | null,
): EcsIssueAdminSummary {
  return buildAdminFeedbackSummary(events, latestVersion);
}
