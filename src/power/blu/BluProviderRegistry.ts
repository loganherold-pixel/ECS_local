/**
 * BluProviderRegistry — metadata and status for all supported power ecosystems.
 *
 * Phase 1A: EcoFlow is the first active provider path.
 * Phase 2A: Bluetti promoted to active (BLE integration).
 * Phase 3A: Anker SOLIX promoted to active (BLE integration).
 * Phase 4A: Jackery promoted to active (BLE integration).
 * Phase 5A: Goal Zero promoted to active (BLE integration).
 * Phase 6A: Renogy promoted to active (BLE integration).
 *
 * This registry is read-only at runtime. Provider status transitions
 * (planned → active) happen via code updates, not user actions.
 */


import type { BluProviderMeta, BluProviderId } from './BluTypes';

// ── Provider Metadata ───────────────────────────────────────────────────

const PROVIDER_REGISTRY: BluProviderMeta[] = [
  {
    id: 'ecoflow',
    displayName: 'EcoFlow',
    status: 'active',
    icon: 'flash',
    accentColor: '#00A6FF',
    statusNote: 'Cloud API integration active',
  },
  {
    id: 'bluetti',
    displayName: 'Bluetti',
    status: 'active',
    icon: 'cube',
    accentColor: '#2196F3',
    statusNote: 'BLE integration active',
  },
  {
    id: 'anker_solix',
    displayName: 'Anker SOLIX',
    status: 'active',
    icon: 'battery-charging',
    accentColor: '#00C4B4',
    statusNote: 'BLE integration active',
  },
  {
    id: 'jackery',
    displayName: 'Jackery',
    status: 'active',
    icon: 'sunny',
    accentColor: '#FF8C00',
    statusNote: 'BLE integration active',
  },

  {
    id: 'goal_zero',
    displayName: 'Goal Zero',
    status: 'active',
    icon: 'compass',
    accentColor: '#4CAF50',
    statusNote: 'BLE integration active',
  },

  {
    id: 'renogy',
    displayName: 'Renogy',
    status: 'active',
    icon: 'hardware-chip',
    accentColor: '#FF5722',
    statusNote: 'BLE integration active (Modbus RTU)',
  },
  {
    id: 'victron',
    displayName: 'Victron Energy',
    status: 'planned',
    icon: 'git-network',
    accentColor: '#1976D2',
    statusNote: 'VE.Direct / BLE integration planned',
  },
];

// ── Public API ──────────────────────────────────────────────────────────

export function getAllProviders(): readonly BluProviderMeta[] {
  return PROVIDER_REGISTRY;
}

export function getActiveProviders(): BluProviderMeta[] {
  return PROVIDER_REGISTRY.filter((p) => p.status === 'active');
}

export function getPlannedProviders(): BluProviderMeta[] {
  return PROVIDER_REGISTRY.filter((p) => p.status === 'planned');
}

export function getProviderMeta(id: BluProviderId): BluProviderMeta | undefined {
  return PROVIDER_REGISTRY.find((p) => p.id === id);
}

export function isProviderActive(id: BluProviderId): boolean {
  const meta = getProviderMeta(id);
  return meta?.status === 'active';
}

export function getProviderCount(): number {
  return PROVIDER_REGISTRY.length;
}

export function getActiveProviderCount(): number {
  return PROVIDER_REGISTRY.filter((p) => p.status === 'active').length;
}

