import type { EcsIssueReportInput } from './ecsIssueIntelligence';

type DeferredReportEventType =
  | 'degraded_state'
  | 'recoverable_failure'
  | 'layout_failure'
  | 'data_integrity_failure';

type DeferredReportInput = Omit<EcsIssueReportInput, 'eventType'>;

function deferIssueReport(eventType: DeferredReportEventType, input: DeferredReportInput): void {
  void import('./ecsIssueIntelligence')
    .then((mod) => {
      switch (eventType) {
        case 'degraded_state':
          mod.reportDegradedState(input);
          break;
        case 'recoverable_failure':
          mod.reportRecoverableFailure(input);
          break;
        case 'layout_failure':
          mod.reportLayoutFailure(input);
          break;
        case 'data_integrity_failure':
          mod.reportDataIntegrityFailure(input);
          break;
      }
    })
    .catch(() => {
      // Issue reporting must never interfere with runtime flows.
    });
}

export function reportDegradedState(input: DeferredReportInput): void {
  deferIssueReport('degraded_state', input);
}

export function reportRecoverableFailure(input: DeferredReportInput): void {
  deferIssueReport('recoverable_failure', input);
}

export function reportLayoutFailure(input: DeferredReportInput): void {
  deferIssueReport('layout_failure', input);
}

export function reportDataIntegrityFailure(input: DeferredReportInput): void {
  deferIssueReport('data_integrity_failure', input);
}
