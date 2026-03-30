/**
 * WizardStateContext — Shared Wizard State Controller
 *
 * Single source of truth for wizard progression across:
 *   - Vehicle Configuration Wizard
 *   - Expedition Builder Wizard
 *   - Any future multi-step wizard flows
 *
 * STATE:
 *   currentStepIndex       — Active step index
 *   steps[]                — Step definitions for the active wizard
 *   stepCompletionFlags    — Map of stepId → completed boolean
 *   vehicleTypeSelected    — Whether a vehicle type has been chosen
 *   vehicleFrameworkComplete — Whether all framework steps are done
 *   configurationDeployed  — Whether config has been deployed
 *   loadoutReady           — Whether loadout is marked ready
 *   expeditionReady        — Whether expedition is ready to launch
 *
 * Each step screen computes canGoNext based on its own validation rules.
 */
import React, { createContext, useContext, useState, useCallback, useMemo } from 'react';

// ── Step Definition ─────────────────────────────────────────
export interface WizardStepDef {
  id: string;
  title: string;
  /** Whether this step requires a selection to proceed */
  required: boolean;
}

// ── Wizard State ────────────────────────────────────────────
export interface WizardState {
  /** Which wizard is active */
  activeWizard: 'vehicle' | 'expedition' | null;
  /** Current step index */
  currentStepIndex: number;
  /** Step definitions for the active wizard */
  steps: WizardStepDef[];
  /** Map of stepId → completed */
  stepCompletionFlags: Record<string, boolean>;
  /** Vehicle type selected (step 1 of vehicle wizard) */
  vehicleTypeSelected: boolean;
  /** All vehicle framework steps completed */
  vehicleFrameworkComplete: boolean;
  /** Configuration has been deployed */
  configurationDeployed: boolean;
  /** Loadout marked as ready */
  loadoutReady: boolean;
  /** Expedition is ready (auto-collapse builder) */
  expeditionReady: boolean;
}

// ── Context Actions ─────────────────────────────────────────
export interface WizardActions {
  /** Initialize a wizard flow with step definitions */
  initWizard: (wizard: 'vehicle' | 'expedition', steps: WizardStepDef[]) => void;
  /** Set current step index */
  setStep: (index: number) => void;
  /** Mark a step as complete */
  completeStep: (stepId: string) => void;
  /** Uncomplete a step (e.g., when selection changes) */
  uncompleteStep: (stepId: string) => void;
  /** Set vehicle type selected flag */
  setVehicleTypeSelected: (selected: boolean) => void;
  /** Set vehicle framework complete flag */
  setVehicleFrameworkComplete: (complete: boolean) => void;
  /** Set configuration deployed flag */
  setConfigurationDeployed: (deployed: boolean) => void;
  /** Set loadout ready flag */
  setLoadoutReady: (ready: boolean) => void;
  /** Set expedition ready flag */
  setExpeditionReady: (ready: boolean) => void;
  /** Reset all wizard state */
  resetWizard: () => void;
  /** Check if a specific step is completed */
  isStepComplete: (stepId: string) => boolean;
  /** Get completion percentage (0–100) */
  completionPercent: number;
}

// ── Default State ───────────────────────────────────────────
const DEFAULT_STATE: WizardState = {
  activeWizard: null,
  currentStepIndex: 0,
  steps: [],
  stepCompletionFlags: {},
  vehicleTypeSelected: false,
  vehicleFrameworkComplete: false,
  configurationDeployed: false,
  loadoutReady: false,
  expeditionReady: false,
};

// ── Context ─────────────────────────────────────────────────
const WizardStateContext = createContext<(WizardState & WizardActions) | null>(null);

// ── Provider ────────────────────────────────────────────────
export function WizardStateProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<WizardState>({ ...DEFAULT_STATE });

  const initWizard = useCallback((wizard: 'vehicle' | 'expedition', steps: WizardStepDef[]) => {
    setState({
      ...DEFAULT_STATE,
      activeWizard: wizard,
      steps,
      stepCompletionFlags: {},
    });
  }, []);

  const setStep = useCallback((index: number) => {
    setState(prev => ({ ...prev, currentStepIndex: index }));
  }, []);

  const completeStep = useCallback((stepId: string) => {
    setState(prev => ({
      ...prev,
      stepCompletionFlags: { ...prev.stepCompletionFlags, [stepId]: true },
    }));
  }, []);

  const uncompleteStep = useCallback((stepId: string) => {
    setState(prev => {
      const flags = { ...prev.stepCompletionFlags };
      delete flags[stepId];
      return { ...prev, stepCompletionFlags: flags };
    });
  }, []);

  const setVehicleTypeSelected = useCallback((selected: boolean) => {
    setState(prev => ({ ...prev, vehicleTypeSelected: selected }));
  }, []);

  const setVehicleFrameworkComplete = useCallback((complete: boolean) => {
    setState(prev => ({ ...prev, vehicleFrameworkComplete: complete }));
  }, []);

  const setConfigurationDeployed = useCallback((deployed: boolean) => {
    setState(prev => ({ ...prev, configurationDeployed: deployed }));
  }, []);

  const setLoadoutReady = useCallback((ready: boolean) => {
    setState(prev => ({ ...prev, loadoutReady: ready }));
  }, []);

  const setExpeditionReady = useCallback((ready: boolean) => {
    setState(prev => ({ ...prev, expeditionReady: ready }));
  }, []);

  const resetWizard = useCallback(() => {
    setState({ ...DEFAULT_STATE });
  }, []);

  const isStepComplete = useCallback((stepId: string) => {
    return !!state.stepCompletionFlags[stepId];
  }, [state.stepCompletionFlags]);

  const completionPercent = useMemo(() => {
    if (state.steps.length === 0) return 0;
    const completed = Object.values(state.stepCompletionFlags).filter(Boolean).length;
    return Math.round((completed / state.steps.length) * 100);
  }, [state.steps, state.stepCompletionFlags]);

  const value = useMemo(() => ({
    ...state,
    initWizard,
    setStep,
    completeStep,
    uncompleteStep,
    setVehicleTypeSelected,
    setVehicleFrameworkComplete,
    setConfigurationDeployed,
    setLoadoutReady,
    setExpeditionReady,
    resetWizard,
    isStepComplete,
    completionPercent,
  }), [
    state,
    initWizard, setStep, completeStep, uncompleteStep,
    setVehicleTypeSelected, setVehicleFrameworkComplete,
    setConfigurationDeployed, setLoadoutReady, setExpeditionReady,
    resetWizard, isStepComplete, completionPercent,
  ]);

  return (
    <WizardStateContext.Provider value={value}>
      {children}
    </WizardStateContext.Provider>
  );
}

// ── Hook ────────────────────────────────────────────────────
export function useWizardState(): WizardState & WizardActions {
  const ctx = useContext(WizardStateContext);
  if (!ctx) {
    // Return a safe fallback instead of throwing — allows usage
    // in screens that may not be wrapped in the provider
    return {
      ...DEFAULT_STATE,
      initWizard: () => {},
      setStep: () => {},
      completeStep: () => {},
      uncompleteStep: () => {},
      setVehicleTypeSelected: () => {},
      setVehicleFrameworkComplete: () => {},
      setConfigurationDeployed: () => {},
      setLoadoutReady: () => {},
      setExpeditionReady: () => {},
      resetWizard: () => {},
      isStepComplete: () => false,
      completionPercent: 0,
    };
  }
  return ctx;
}

