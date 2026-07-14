import {
  ECS_PERFORMANCE_BUDGETS,
  ECS_PERFORMANCE_WORKFLOW_IDS,
  type ECSPerformanceBudget,
  type ECSPerformanceWorkflowId,
} from './performanceBudgets';
import type { ECSPerformanceSnapshot } from './ecsPerformanceDiagnostics';

export type ECSPerformanceBaselineEntry = {
  workflowId: ECSPerformanceWorkflowId;
  p95Ms: number | null;
  sampleCount: number;
  measuredAt: string | null;
  platform: 'android' | 'ios' | 'web' | 'ci' | 'unmeasured';
  buildKind: 'development' | 'preview' | 'release' | 'ci' | 'unmeasured';
  evidence: 'measured' | 'instrumentation_only' | 'device_required';
};

export type ECSPerformanceBaseline = {
  schemaVersion: number;
  generatedAt: string;
  notes?: string;
  workflows: ECSPerformanceBaselineEntry[];
};

export type ECSPerformanceWorkflowResult = {
  workflowId: ECSPerformanceWorkflowId;
  label: string;
  status: 'passed' | 'warning' | 'failed' | 'unmeasured';
  sampleCount: number;
  p95Ms: number | null;
  targetMs: number;
  hardLimitMs: number;
  baselineP95Ms: number | null;
  relativeChangePct: number | null;
  repeatedRequests: number;
  duplicateSubscriptions: number;
  reasons: string[];
};

export type ECSPerformanceReport = {
  schemaVersion: number;
  generatedAt: string;
  status: 'passed' | 'warning' | 'failed' | 'unmeasured';
  measuredWorkflowCount: number;
  workflowCount: number;
  peakOutstandingAsyncJobs: number;
  workflows: ECSPerformanceWorkflowResult[];
};

function percentile95(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (sorted.length === 0) return null;
  return Math.round(sorted[Math.max(0, Math.ceil(sorted.length * 0.95) - 1)] * 10) / 10;
}

function counterValue(snapshot: ECSPerformanceSnapshot, workflowId: ECSPerformanceWorkflowId, counter: string): number {
  return snapshot.counters
    .filter(entry => entry.workflowId === workflowId && entry.counter === counter)
    .reduce((sum, entry) => sum + entry.value, 0);
}

function evaluateWorkflow(
  snapshot: ECSPerformanceSnapshot,
  budget: ECSPerformanceBudget,
  baseline: ECSPerformanceBaselineEntry | null,
): ECSPerformanceWorkflowResult {
  const samples = snapshot.spans
    .filter(span => (
      span.workflowId === budget.workflowId &&
      span.operation === budget.primaryOperation &&
      span.status === 'completed'
    ))
    .map(span => span.durationMs);
  const p95Ms = percentile95(samples);
  const repeatedRequests = counterValue(snapshot, budget.workflowId, 'repeated_requests');
  const duplicateSubscriptions = counterValue(snapshot, budget.workflowId, 'duplicate_subscriptions');
  const reasons: string[] = [];
  let status: ECSPerformanceWorkflowResult['status'] = p95Ms == null ? 'unmeasured' : 'passed';

  if (p95Ms != null && p95Ms > budget.hardLimitMs) {
    status = 'failed';
    reasons.push(`p95 ${p95Ms}ms exceeds hard limit ${budget.hardLimitMs}ms.`);
  } else if (p95Ms != null && p95Ms > budget.targetMs) {
    status = 'warning';
    reasons.push(`p95 ${p95Ms}ms exceeds target ${budget.targetMs}ms.`);
  }

  const baselineP95Ms = baseline?.p95Ms ?? null;
  const relativeChangePct = p95Ms != null && baselineP95Ms != null && baselineP95Ms > 0
    ? Math.round(((p95Ms - baselineP95Ms) / baselineP95Ms) * 1_000) / 10
    : null;
  if (
    relativeChangePct != null &&
    samples.length >= budget.minSamplesForRelativeGate &&
    relativeChangePct > budget.maxRelativeRegressionPct
  ) {
    status = 'failed';
    reasons.push(`Relative regression ${relativeChangePct}% exceeds ${budget.maxRelativeRegressionPct}%.`);
  }

  if (budget.maxRepeatedRequests != null && repeatedRequests > budget.maxRepeatedRequests) {
    status = 'failed';
    reasons.push(`Repeated requests ${repeatedRequests} exceed ${budget.maxRepeatedRequests}.`);
  }
  if (budget.maxDuplicateSubscriptions != null && duplicateSubscriptions > budget.maxDuplicateSubscriptions) {
    status = 'failed';
    reasons.push(`Duplicate subscriptions ${duplicateSubscriptions} exceed ${budget.maxDuplicateSubscriptions}.`);
  }
  if (status === 'unmeasured') reasons.push('No completed runtime samples in this capture.');

  return {
    workflowId: budget.workflowId,
    label: budget.label,
    status,
    sampleCount: samples.length,
    p95Ms,
    targetMs: budget.targetMs,
    hardLimitMs: budget.hardLimitMs,
    baselineP95Ms,
    relativeChangePct,
    repeatedRequests,
    duplicateSubscriptions,
    reasons,
  };
}

export function buildECSPerformanceReport(
  snapshot: ECSPerformanceSnapshot,
  baseline?: ECSPerformanceBaseline | null,
): ECSPerformanceReport {
  const baselineByWorkflow = new Map(
    (baseline?.workflows ?? []).map(entry => [entry.workflowId, entry]),
  );
  const workflows = ECS_PERFORMANCE_WORKFLOW_IDS.map(workflowId => evaluateWorkflow(
    snapshot,
    ECS_PERFORMANCE_BUDGETS[workflowId],
    baselineByWorkflow.get(workflowId) ?? null,
  ));
  const measuredWorkflowCount = workflows.filter(entry => entry.status !== 'unmeasured').length;
  const status = workflows.some(entry => entry.status === 'failed')
    ? 'failed'
    : workflows.some(entry => entry.status === 'warning')
      ? 'warning'
      : measuredWorkflowCount === 0
        ? 'unmeasured'
        : 'passed';
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    status,
    measuredWorkflowCount,
    workflowCount: workflows.length,
    peakOutstandingAsyncJobs: snapshot.peakOutstandingAsyncJobs,
    workflows,
  };
}
