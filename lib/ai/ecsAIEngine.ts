import type { ECSAIContext } from '../aiContextBuilder';
import { buildECSAIAdvisoryContext } from './ecsAIContext';
import { generateECSAIAdvisoriesFromContext } from './ecsAIAdvisories';
import {
  applyECSAIAdvisorySuppression,
  type ECSAISuppressionResult,
  type ECSAISuppressionState,
} from './ecsAISuppression';
import type { ECSAIAdvisory, ECSAIAdvisorySurface } from './ecsAITypes';

export type ECSAIEngineResult = {
  advisories: ECSAIAdvisory[];
  suppressedAdvisories: ECSAIAdvisory[];
  suppressionState: ECSAISuppressionState;
};

export function runECSAIAdvisoryEngine(args: {
  context: ECSAIContext | null;
  surface?: ECSAIAdvisorySurface | 'unknown';
  previousSuppressionState?: ECSAISuppressionState;
  now?: number;
}): ECSAIEngineResult {
  if (!args.context) {
    return {
      advisories: [],
      suppressedAdvisories: [],
      suppressionState: args.previousSuppressionState ?? {},
    };
  }

  const advisoryContext = buildECSAIAdvisoryContext(args.context, args.surface ?? 'unknown');
  const generated = generateECSAIAdvisoriesFromContext(advisoryContext, args.now ?? Date.now());
  const suppression: ECSAISuppressionResult = applyECSAIAdvisorySuppression(
    generated,
    args.previousSuppressionState ?? {},
    undefined,
    args.now ?? Date.now(),
  );

  return {
    advisories: suppression.active,
    suppressedAdvisories: suppression.suppressed,
    suppressionState: suppression.state,
  };
}
