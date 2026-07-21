export type SmartResupplySelectionValidationStatus =
  | 'verified'
  | 'refreshing'
  | 'incomplete'
  | 'restored'
  | 'invalidated';

export type SmartResupplySelectionContext = {
  routeId: string | null;
  approachFingerprint: string | null;
  category: string;
  physicalIdentity: string;
};

export function normalizeSmartResupplySemanticFingerprint(value: string | null | undefined): string | null {
  const normalized = String(value ?? '').trim().replace(/\s+/g, ' ');
  return normalized || null;
}

export function reconcileCommittedSmartResupplySelection<T>(args: {
  selected: T | null;
  availableOptions: T[];
  identity: (option: T) => string;
}): T | null {
  if (!args.selected) return null;
  const selectedIdentity = args.identity(args.selected);
  return args.availableOptions.find((option) => args.identity(option) === selectedIdentity) ?? args.selected;
}

export function shouldInvalidateSmartResupplySelection(args: {
  context: SmartResupplySelectionContext;
  routeId: string | null;
  approachFingerprint: string | null;
  category: string;
}): boolean {
  if (args.context.routeId !== args.routeId || args.context.category !== args.category) return true;
  const previous = normalizeSmartResupplySemanticFingerprint(args.context.approachFingerprint);
  const next = normalizeSmartResupplySemanticFingerprint(args.approachFingerprint);
  return previous != null && next != null && previous !== next;
}

export function selectionValidationAfterProviderResult(args: {
  selectedPresent: boolean;
  selectedReturned: boolean;
  providerStatus: 'idle' | 'deferred' | 'loading' | 'ready' | 'empty' | 'error';
  providerPartial: boolean;
}): SmartResupplySelectionValidationStatus {
  if (!args.selectedPresent) return 'invalidated';
  if (args.providerStatus === 'loading' || args.providerStatus === 'deferred') return 'refreshing';
  if (args.providerPartial || args.providerStatus === 'error' || !args.selectedReturned) return 'incomplete';
  return 'verified';
}
