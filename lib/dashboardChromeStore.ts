type DashboardChromeState = {
  expanded: boolean;
  dockRevealed: boolean;
};

type Listener = (state: DashboardChromeState) => void;

let state: DashboardChromeState = {
  expanded: false,
  dockRevealed: false,
};

const listeners = new Set<Listener>();
let dockRevealTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  for (const listener of listeners) {
    listener(state);
  }
}

export function getDashboardChromeState(): DashboardChromeState {
  return state;
}

export function setDashboardExpanded(expanded: boolean) {
  if (state.expanded === expanded) return;
  state = {
    ...state,
    expanded,
    dockRevealed: expanded ? state.dockRevealed : false,
  };
  emit();
}

export function hideDashboardDockReveal() {
  if (dockRevealTimer) {
    clearTimeout(dockRevealTimer);
    dockRevealTimer = null;
  }
  if (!state.dockRevealed) return;
  state = { ...state, dockRevealed: false };
  emit();
}

export function revealDashboardDock(durationMs = 5000) {
  if (dockRevealTimer) {
    clearTimeout(dockRevealTimer);
    dockRevealTimer = null;
  }

  if (!state.dockRevealed) {
    state = { ...state, dockRevealed: true };
    emit();
  }

  dockRevealTimer = setTimeout(() => {
    dockRevealTimer = null;
    if (!state.dockRevealed) return;
    state = { ...state, dockRevealed: false };
    emit();
  }, durationMs);
}

export function resetDashboardChromeState() {
  setDashboardExpanded(false);
  hideDashboardDockReveal();
}

export function subscribeDashboardChrome(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
