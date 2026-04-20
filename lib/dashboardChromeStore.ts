type DashboardChromeState = {
  expanded: boolean;
};

type Listener = (state: DashboardChromeState) => void;

let state: DashboardChromeState = {
  expanded: false,
};

const listeners = new Set<Listener>();

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
  state = { ...state, expanded };
  emit();
}

export function resetDashboardChromeState() {
  setDashboardExpanded(false);
}

export function subscribeDashboardChrome(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
