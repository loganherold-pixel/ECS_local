type OverlayStackBehavior = 'replace' | 'allow-stack';

type OverlayRegistration = {
  id: string;
  stackBehavior: OverlayStackBehavior;
  onDismiss?: () => void;
  order: number;
};

type OverlayListener = () => void;

const overlayRegistry = new Map<string, OverlayRegistration>();
const listeners = new Set<OverlayListener>();

let overlayOrder = 0;

function notifyListeners() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch (error) {
      console.warn('[overlayCoordinator] listener failed', error);
    }
  });
}

function getReplaceStack() {
  return Array.from(overlayRegistry.values())
    .filter((entry) => entry.stackBehavior === 'replace')
    .sort((left, right) => left.order - right.order);
}

export function registerOverlay(config: {
  id: string;
  stackBehavior: OverlayStackBehavior;
  onDismiss?: () => void;
}) {
  const nextEntry: OverlayRegistration = {
    ...config,
    order: ++overlayOrder,
  };

  overlayRegistry.set(config.id, nextEntry);

  if (config.stackBehavior === 'replace') {
    const replaceStack = getReplaceStack();
    replaceStack
      .filter((entry) => entry.id !== config.id)
      .forEach((entry) => {
        entry.onDismiss?.();
      });
  }

  notifyListeners();

  return () => {
    overlayRegistry.delete(config.id);
    notifyListeners();
  };
}

export function subscribeOverlayChanges(listener: OverlayListener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function isOverlayActive(id: string, stackBehavior: OverlayStackBehavior) {
  if (stackBehavior === 'allow-stack') {
    return true;
  }

  const replaceStack = getReplaceStack();
  const activeEntry = replaceStack[replaceStack.length - 1];
  return activeEntry?.id === id;
}

export type { OverlayStackBehavior };
